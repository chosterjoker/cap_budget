"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";

export async function createVenmoIncome(data: {
  semesterId: string;
  amount: number;
  date: string;
  description: string;
  eventName?: string;
  weekId?: string;
}) {
  await requireTreasurer();
  await prisma.venmoIncome.create({
    data: {
      semesterId: data.semesterId,
      amount: data.amount,
      date: new Date(data.date),
      description: data.description,
      eventName: data.eventName,
      weekId: data.weekId || null,
    },
  });
  revalidatePath("/venmo");
  revalidatePath("/");
}

export async function updateVenmoIncome(
  id: string,
  data: Partial<{
    amount: number;
    date: string;
    description: string;
    eventName: string | null;
    weekId: string | null;
  }>
) {
  await requireTreasurer();
  await prisma.venmoIncome.update({
    where: { id },
    data: { ...data, date: data.date ? new Date(data.date) : undefined },
  });
  revalidatePath("/venmo");
  revalidatePath("/");
}

export async function deleteVenmoIncome(id: string) {
  await requireTreasurer();
  await prisma.venmoIncome.delete({ where: { id } });
  revalidatePath("/venmo");
  revalidatePath("/");
}
