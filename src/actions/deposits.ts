"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";

export async function createDeposit(data: {
  semesterId: string;
  amount: number;
  date: string;
  notes?: string;
}) {
  await requireTreasurer();
  await prisma.deposit.create({
    data: {
      semesterId: data.semesterId,
      amount: data.amount,
      date: new Date(data.date),
      notes: data.notes,
    },
  });
  revalidatePath("/deposits");
  revalidatePath("/");
}

export async function updateDeposit(
  id: string,
  data: Partial<{ amount: number; date: string; notes: string | null }>
) {
  await requireTreasurer();
  await prisma.deposit.update({
    where: { id },
    data: { ...data, date: data.date ? new Date(data.date) : undefined },
  });
  revalidatePath("/deposits");
  revalidatePath("/");
}

export async function deleteDeposit(id: string) {
  await requireTreasurer();
  await prisma.deposit.delete({ where: { id } });
  revalidatePath("/deposits");
  revalidatePath("/");
}
