"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";

export async function createReconciliation(data: {
  semesterId: string;
  actualBalance: number;
  date?: string;
  notes?: string;
}) {
  await requireTreasurer();
  await prisma.bankReconciliation.create({
    data: {
      semesterId: data.semesterId,
      actualBalance: data.actualBalance,
      date: data.date ? new Date(data.date) : new Date(),
      notes: data.notes || null,
    },
  });
  revalidatePath("/");
}

export async function updateReconciliation(
  id: string,
  data: Partial<{
    actualBalance: number;
    date: string;
    notes: string | null;
  }>
) {
  await requireTreasurer();
  await prisma.bankReconciliation.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
    },
  });
  revalidatePath("/");
}

export async function deleteReconciliation(id: string) {
  await requireTreasurer();
  await prisma.bankReconciliation.delete({ where: { id } });
  revalidatePath("/");
}
