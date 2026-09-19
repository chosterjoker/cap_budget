"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";
import { parseChecksFromBuffer, type ParsedCheck } from "@/lib/ocr";
import { parseBankHistoryCsv } from "@/lib/csv";
import { matchClearedChecks } from "@/lib/check-clearing";
import type { PaymentMethod } from "@prisma/client";

// Thrown inside the `createChecks` transaction to roll it back. Not exported —
// a "use server" module may only export async functions.
class StaleReimbursementError extends Error {
  constructor(public position: number) {
    super("Reimbursement already paid");
  }
}

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
  revalidatePath("/venmo");
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
  revalidatePath("/venmo");
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
  revalidatePath("/venmo");
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
  // Required for a vendor payment. Unused when `reimbursementIds` is set — each
  // reimbursement being paid already carries its own category.
  categoryId?: string;
  eventId?: string;
  paymentMethod: PaymentMethod;
  memo?: string;
  // Set when this check pays out reimbursements instead of being a new spend.
  reimbursementIds?: string[];
};

/**
 * Bulk-create reviewed scanned checks in ONE transaction. Mirroring
 * `createCheck`, each is either a vendor payment (category required, gets a
 * mirrored Expense) or a settlement (marks its reimbursements PAID and creates
 * NO Expense — a reimbursement already counts toward the budget on its own, so
 * an expense here would double-count it). All-or-nothing: a bad row fails the
 * whole batch rather than leaving a partial save.
 *
 * Bad input comes back as `{ ok: false }` rather than a throw, so the message
 * survives to the client — Next masks thrown messages in production.
 */
export async function createChecks(
  semesterId: string,
  items: NewCheckInput[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTreasurer();
  if (!items.length) return { ok: false, error: "No checks to save." };

  const claimed = new Set<string>();
  for (const [i, it] of items.entries()) {
    const where = `Check ${i + 1}`;
    const fail = (msg: string) => ({ ok: false as const, error: `${where}: ${msg}` });
    if (!it.checkNumber?.trim()) return fail("missing check / ref #.");
    if (!it.recipientName?.trim()) return fail("missing recipient.");
    if (!it.description?.trim()) return fail("missing description.");
    if (!it.reimbursementIds?.length && !it.categoryId) {
      return fail("select a budget category or the reimbursements it pays.");
    }
    if (!Number.isFinite(it.amount) || it.amount <= 0) {
      return fail("amount must be greater than 0.");
    }
    if (!it.date || Number.isNaN(new Date(it.date).getTime())) {
      return fail("invalid or missing date.");
    }
    for (const id of it.reimbursementIds ?? []) {
      if (claimed.has(id)) return fail("pays a reimbursement another check already covers.");
      claimed.add(id);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const [i, it] of items.entries()) {
        const isSettlement = Boolean(it.reimbursementIds?.length);
        const check = await tx.check.create({
          data: {
            semesterId,
            checkNumber: it.checkNumber,
            description: it.description,
            amount: it.amount,
            date: new Date(it.date),
            recipientName: it.recipientName,
            categoryId: isSettlement ? null : it.categoryId,
            eventId: isSettlement ? null : it.eventId || null,
            paymentMethod: it.paymentMethod,
            cleared: false,
            isCarryover: false,
            memo: it.memo,
          },
        });
        if (isSettlement) {
          // The list the treasurer picked from may be stale — someone else could
          // have paid one of these in the meantime. Only still-unpaid rows match,
          // so a short count means roll the whole batch back.
          const settled = await tx.reimbursement.updateMany({
            where: {
              id: { in: it.reimbursementIds! },
              semesterId,
              checkId: null,
              status: { not: "PAID" },
            },
            data: { checkId: check.id, status: "PAID" },
          });
          if (settled.count !== it.reimbursementIds!.length) {
            throw new StaleReimbursementError(i + 1);
          }
        } else {
          await tx.expense.create({
            data: {
              semesterId,
              categoryId: it.categoryId!,
              eventId: it.eventId || null,
              amount: it.amount,
              description: it.description,
              date: new Date(it.date),
              paymentMethod: it.paymentMethod,
              checkId: check.id,
            },
          });
        }
      }
    });
  } catch (err) {
    if (err instanceof StaleReimbursementError) {
      return {
        ok: false,
        error: `Check ${err.position}: one of its reimbursements was already paid. Nothing was saved — close this and rescan to pick from the current list.`,
      };
    }
    throw err;
  }

  revalidatePath("/checks");
  revalidatePath("/venmo");
  revalidatePath("/reimbursements");
  revalidatePath("/budget");
  revalidatePath("/");
  return { ok: true };
}

export type ClearedImportResult =
  | { ok: false; error: string }
  | {
      ok: true;
      marked: {
        checkNumber: string;
        recipientName: string;
        amount: number;
        clearedDate: string;
      }[];
      alreadyCleared: number;
      review: {
        checkNumber: string;
        recipientName: string;
        amount: number;
        cleared: boolean;
        reason: "amount" | "returned" | "number";
        bankCheckNumber: string;
        bankAmount: number;
        bankDate: string;
      }[];
      // Posted at the bank during this semester, but not in the register.
      unrecorded: { checkNumber: string; amount: number; postDate: string }[];
    };

/**
 * Marks checks cleared from the bank's account-history CSV, stamping each with
 * the bank's post date.
 *
 * Safe to re-run: exports overlap (each one repeats the history before it), and
 * a check that is already cleared is left exactly as it is. Only real paper
 * checks are considered — a wire or Venmo ref that happens to be numeric must
 * not match a bank check number. See `matchClearedChecks` for the match rules.
 *
 * A bad file is an expected outcome, so it comes back as `{ ok: false }` rather
 * than a throw — Next masks thrown messages in production.
 */
export async function importClearedChecks(
  formData: FormData
): Promise<ClearedImportResult> {
  await requireTreasurer();
  const semesterId = formData.get("semesterId") as string;
  const file = formData.get("file") as File | null;
  if (!semesterId || !file || file.size === 0) {
    return { ok: false, error: "Choose the bank's CSV export first." };
  }

  const bankRows = parseBankHistoryCsv(await file.text());
  if (!bankRows.length) {
    return {
      ok: false,
      error:
        "No posted checks found — expected the bank's account history export, with Post Date, Check and Debit columns.",
    };
  }

  const [semester, checks] = await Promise.all([
    prisma.semester.findUnique({
      where: { id: semesterId },
      select: { startDate: true, endDate: true },
    }),
    prisma.check.findMany({
      where: { semesterId, paymentMethod: "CHECK" },
      select: {
        id: true,
        checkNumber: true,
        recipientName: true,
        amount: true,
        date: true,
        cleared: true,
      },
    }),
  ]);
  if (!semester) return { ok: false, error: "Semester not found." };

  const recipientOf = new Map(checks.map((c) => [c.id, c.recipientName]));
  const result = matchClearedChecks(checks, bankRows);

  // One UPDATE per distinct post date, not per check — a first import can clear
  // a whole semester's worth at once.
  const idsByDate = new Map<number, string[]>();
  for (const { check, postDate } of result.toClear) {
    const ids = idsByDate.get(postDate.getTime());
    if (ids) ids.push(check.id);
    else idsByDate.set(postDate.getTime(), [check.id]);
  }
  if (idsByDate.size) {
    await prisma.$transaction(
      [...idsByDate].map(([ts, ids]) =>
        prisma.check.updateMany({
          where: { id: { in: ids }, cleared: false },
          data: { cleared: true, clearedDate: new Date(ts) },
        })
      )
    );
  }

  // The file reaches back years; only this semester's strays are worth flagging.
  const start = semester.startDate.getTime();
  const end = semester.endDate?.getTime() ?? Infinity;
  const unrecorded = result.unmatched.filter((d) => {
    const ts = d.postDate.getTime();
    return ts >= start && ts <= end;
  });

  revalidatePath("/checks");
  revalidatePath("/deposits");
  revalidatePath("/");
  return {
    ok: true,
    marked: result.toClear
      .map(({ check, postDate }) => ({
        checkNumber: check.checkNumber,
        recipientName: recipientOf.get(check.id) ?? "",
        amount: check.amount,
        clearedDate: postDate.toISOString(),
      }))
      .sort((a, b) => b.clearedDate.localeCompare(a.clearedDate)),
    alreadyCleared: result.alreadyCleared,
    review: result.review.map((v) => ({
      checkNumber: v.check.checkNumber,
      recipientName: recipientOf.get(v.check.id) ?? "",
      amount: v.check.amount,
      cleared: v.check.cleared,
      reason: v.reason,
      bankCheckNumber: v.bankCheckNumber,
      bankAmount: v.bankAmount,
      bankDate: v.bankDate.toISOString(),
    })),
    unrecorded: unrecorded.map((d) => ({
      checkNumber: d.checkNumber,
      amount: d.amount,
      postDate: d.postDate.toISOString(),
    })),
  };
}
