"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireTreasurer } from "@/lib/auth";
import type { PaymentMethod } from "@prisma/client";

export async function createExpense(data: {
  semesterId: string;
  categoryId: string;
  weekId?: string;
  amount: number;
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  checkId?: string;
}) {
  await requireSession();

  await prisma.expense.create({
    data: {
      semesterId: data.semesterId,
      categoryId: data.categoryId,
      weekId: data.weekId || null,
      amount: data.amount,
      description: data.description,
      date: new Date(data.date),
      paymentMethod: data.paymentMethod,
      checkId: data.checkId || null,
    },
  });

  revalidatePath("/budget");
  revalidatePath("/");
}

export async function deleteExpense(id: string) {
  await requireTreasurer();
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/budget");
  revalidatePath("/");
}
