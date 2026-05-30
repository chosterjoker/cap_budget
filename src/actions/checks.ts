"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";
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

  const check = await prisma.check.create({
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
    await prisma.reimbursement.updateMany({
      where: { id: { in: data.reimbursementIds! } },
      data: { checkId: check.id, status: "PAID" },
    });
    // Carryover checks track cash only — they were a previous semester's spend,
    // so they never create an Expense against this semester's budget grid.
  } else if (data.categoryId && !data.isCarryover) {
    await prisma.expense.create({
      data: {
        semesterId: data.semesterId,
        categoryId: data.categoryId,
        eventId: data.eventId || null,
        amount: data.amount,
        description: data.description,
        date: new Date(data.date),
        paymentMethod: data.paymentMethod,
        checkId: check.id,
      },
    });
  }

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

  const updated = await prisma.check.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
      clearedDate:
        data.clearedDate === null
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
  const isSettlement = existing.reimbursements.length > 0;
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
        await prisma.expense.update({ where: { id: linked.id }, data: expenseData });
      } else {
        await prisma.expense.create({ data: expenseData });
      }
    } else if (linked) {
      // Category removed → no longer a budgeted expense.
      await prisma.expense.delete({ where: { id: linked.id } });
    }
  }

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
