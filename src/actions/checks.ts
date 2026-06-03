"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";
import { parseChecksFromBuffer, type ParsedCheck } from "@/lib/ocr";
import type { PaymentMethod } from "@prisma/client";

export async function createCheck(data: {
  semesterId: string;
  checkNumber: string;
  description: string;
  amount: number;
  date: string;
  recipientName: string;
  categoryId?: string;
  eventId?: string;
  paymentMethod: PaymentMethod;
  cleared?: boolean;
  isCarryover?: boolean;
  memo?: string;
  reimbursementIds?: string[];
}) {
  await requireTreasurer();

  const isSettlement = Boolean(data.reimbursementIds?.length);

  // Every spend must be tagged to a budget category so it lands in the grid and
  // counts toward "Total Spent". Settlement checks are exempt because the
  // reimbursements they pay each carry their own (required) category, and
  // carryover checks are previous-semester spend tracked for cash only.
  if (!isSettlement && !data.isCarryover && !data.categoryId) {
    throw new Error("Select a budget category for this payment.");
  }

  // Atomic: the check and its settlement/expense side-effect must commit
  // together. Otherwise a failure between them leaves a check with no linked
  // expense, and the budget grid (which reads expenses, not checks) silently
  // under-counts that spend.
  const check = await prisma.$transaction(async (tx) => {
    const created = await tx.check.create({
      data: {
        semesterId: data.semesterId,
        checkNumber: data.checkNumber,
        description: data.description,
        amount: data.amount,
        date: new Date(data.date),
        recipientName: data.recipientName,
        categoryId: data.categoryId || null,
        eventId: data.eventId || null,
        paymentMethod: data.paymentMethod,
        cleared: data.cleared ?? false,
        isCarryover: data.isCarryover ?? false,
        memo: data.memo,
      },
    });

    if (isSettlement) {
      await tx.reimbursement.updateMany({
        where: { id: { in: data.reimbursementIds! } },
        data: { checkId: created.id, status: "PAID" },
      });
      // Carryover checks track cash only — they were a previous semester's spend,
      // so they never create an Expense against this semester's budget grid.
    } else if (data.categoryId && !data.isCarryover) {
      await tx.expense.create({
        data: {
          semesterId: data.semesterId,
          categoryId: data.categoryId,
          eventId: data.eventId || null,
          amount: data.amount,
          description: data.description,
          date: new Date(data.date),
          paymentMethod: data.paymentMethod,
          checkId: created.id,
        },
      });
    }

    return created;
  });

  revalidatePath("/checks");
  revalidatePath("/reimbursements");
  revalidatePath("/budget");
  revalidatePath("/");
  return check;
}

export async function updateCheck(
  id: string,
  data: Partial<{
    checkNumber: string;
    description: string;
    amount: number;
    date: string;
    recipientName: string;
    categoryId: string | null;
    eventId: string | null;
    paymentMethod: PaymentMethod;
    cleared: boolean;
    clearedDate: string | null;
    memo: string | null;
  }>
) {
  await requireTreasurer();
  const existing = await prisma.check.findUnique({
    where: { id },
    include: { expenses: true, reimbursements: { select: { id: true } } },
  });
  if (!existing) throw new Error("Check not found");

  // Mirror createCheck: a non-settlement, non-carryover check must keep a
  // category so it stays in the budget grid. `categoryId === undefined` means
  // the caller left it unchanged, so fall back to the existing value.
  const isSettlement = existing.reimbursements.length > 0;
  const resultingCategoryId =
    data.categoryId !== undefined ? data.categoryId : existing.categoryId;
  if (!isSettlement && !existing.isCarryover && !resultingCategoryId) {
    throw new Error("Select a budget category for this payment.");
  }

  // Atomic: the check edit and its mirrored budget expense must move together,
  // or the grid drifts out of sync with the check ledger.
  await prisma.$transaction(async (tx) => {
    const updated = await tx.check.update({
      where: { id },
      data: {
        ...data,
        date: data.date ? new Date(data.date) : undefined,
        clearedDate:
          // Un-checking "cleared" always wipes the date, so a not-cleared check
          // can never keep a stale clearedDate.
          data.cleared === false
            ? null
            : data.clearedDate === null
              ? null
              : data.clearedDate
                ? new Date(data.clearedDate)
                : data.cleared === true
                  ? new Date()
                  : undefined,
      },
    });

    // Keep the auto-created budget expense in sync so "spent" reflects edits.
    // Settlement checks (those paying out reimbursements) and carryover checks
    // (previous-semester spend, cash-only) never own an expense.
    if (!isSettlement && !updated.isCarryover) {
      const linked = existing.expenses[0];
      if (updated.categoryId) {
        const expenseData = {
          semesterId: updated.semesterId,
          categoryId: updated.categoryId,
          eventId: updated.eventId,
          amount: updated.amount,
          description: updated.description,
          date: updated.date,
          paymentMethod: updated.paymentMethod,
          checkId: updated.id,
        };
        if (linked) {
          await tx.expense.update({ where: { id: linked.id }, data: expenseData });
        } else {
          await tx.expense.create({ data: expenseData });
        }
      } else if (linked) {
        // Category removed → no longer a budgeted expense.
        await tx.expense.delete({ where: { id: linked.id } });
      }
    }
  });

  revalidatePath("/checks");
  revalidatePath("/budget");
  revalidatePath("/");
}

export async function deleteCheck(id: string) {
  await requireTreasurer();
  await prisma.$transaction([
    // Remove the auto-created expense so "spent" drops back down.
    prisma.expense.deleteMany({ where: { checkId: id } }),
    // Un-settle any reimbursements this check paid out — they're owed again.
    prisma.reimbursement.updateMany({
      where: { checkId: id },
      data: { checkId: null, status: "APPROVED" },
    }),
    prisma.check.delete({ where: { id } }),
  ]);
  revalidatePath("/checks");
  revalidatePath("/reimbursements");
  revalidatePath("/budget");
  revalidatePath("/");
}

/**
 * OCR a single photo containing one or more checks, returning a pre-fill draft
 * per check. Persists nothing — the client reviews/edits, then calls
 * `createChecks`. Category is never returned (it's not on a check).
 */
export async function scanChecks(formData: FormData): Promise<ParsedCheck[]> {
  await requireTreasurer();
  const image = formData.get("image") as File | null;
  if (!image || image.size === 0 || !image.type.startsWith("image/")) {
    return [];
  }
  const buffer = Buffer.from(await image.arrayBuffer());
  return parseChecksFromBuffer(buffer, image.type);
}

export type NewCheckInput = {
  checkNumber: string;
  description: string;
  amount: number;
  date: string;
  recipientName: string;
  categoryId: string;
  eventId?: string;
  paymentMethod: PaymentMethod;
  memo?: string;
};

/**
 * Bulk-create reviewed scanned checks in ONE transaction. Each is a vendor
 * payment (never a settlement), so — mirroring `createCheck` — every check gets
 * a category-required mirrored Expense. All-or-nothing: a bad row fails the whole
 * batch rather than leaving a partial save.
 */
export async function createChecks(semesterId: string, items: NewCheckInput[]) {
  await requireTreasurer();
  if (!items.length) throw new Error("No checks to save.");

  items.forEach((it, i) => {
    const where = `Check ${i + 1}`;
    if (!it.checkNumber?.trim()) throw new Error(`${where}: missing check / ref #.`);
    if (!it.recipientName?.trim()) throw new Error(`${where}: missing recipient.`);
    if (!it.description?.trim()) throw new Error(`${where}: missing description.`);
    if (!it.categoryId) throw new Error(`${where}: select a budget category.`);
    if (!Number.isFinite(it.amount) || it.amount <= 0) {
      throw new Error(`${where}: amount must be greater than 0.`);
    }
    if (!it.date || Number.isNaN(new Date(it.date).getTime())) {
      throw new Error(`${where}: invalid or missing date.`);
    }
  });

  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const check = await tx.check.create({
        data: {
          semesterId,
          checkNumber: it.checkNumber,
          description: it.description,
          amount: it.amount,
          date: new Date(it.date),
          recipientName: it.recipientName,
          categoryId: it.categoryId,
          eventId: it.eventId || null,
          paymentMethod: it.paymentMethod,
          cleared: false,
          isCarryover: false,
          memo: it.memo,
        },
      });
      await tx.expense.create({
        data: {
          semesterId,
          categoryId: it.categoryId,
          eventId: it.eventId || null,
          amount: it.amount,
          description: it.description,
          date: new Date(it.date),
          paymentMethod: it.paymentMethod,
          checkId: check.id,
        },
      });
    }
  });

  revalidatePath("/checks");
  revalidatePath("/budget");
  revalidatePath("/");
}
