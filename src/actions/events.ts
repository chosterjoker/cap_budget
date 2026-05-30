"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";
import { parseSocialCalendarCsv } from "@/lib/csv";
import { findWeekForDate } from "@/lib/weeks";

export async function importSocialCalendarCsv(formData: FormData) {
  await requireTreasurer();
  const semesterId = formData.get("semesterId") as string;
  const file = formData.get("file") as File | null;
  if (!semesterId || !file || file.size === 0) {
    throw new Error("Semester and CSV file required");
  }

  const text = await file.text();
  const rows = parseSocialCalendarCsv(text);
  if (!rows.length) throw new Error("No event rows found in CSV");

  const weeks = await prisma.week.findMany({ where: { semesterId } });

  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const weekId = findWeekForDate(r.date, weeks);
    const isInformational = r.notes === "informational";
    const result = await prisma.event.upsert({
      where: {
        semesterId_date_name: {
          semesterId,
          date: r.date,
          name: r.name,
        },
      },
      create: {
        semesterId,
        weekId,
        name: r.name,
        date: r.date,
        time: r.time,
        eventType: r.eventType,
        audience: r.audience,
        isInformational,
      },
      update: {
        weekId,
        time: r.time,
        eventType: r.eventType,
        audience: r.audience,
        isInformational,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;
  }

  revalidatePath("/calendar");
  return { created, updated, total: rows.length };
}

export async function createEvent(data: {
  semesterId: string;
  name: string;
  date: string;
  time?: string;
  eventType?: string;
  audience?: string;
  isInformational?: boolean;
}) {
  await requireTreasurer();
  const date = new Date(data.date);
  const weeks = await prisma.week.findMany({ where: { semesterId: data.semesterId } });
  const weekId = findWeekForDate(date, weeks);
  await prisma.event.create({
    data: {
      semesterId: data.semesterId,
      weekId,
      name: data.name,
      date,
      time: data.time,
      eventType: data.eventType,
      audience: data.audience,
      isInformational: data.isInformational ?? false,
    },
  });
  revalidatePath("/calendar");
}

export async function updateEvent(
  id: string,
  data: Partial<{
    name: string;
    date: string;
    time: string | null;
    eventType: string | null;
    audience: string | null;
    notes: string | null;
    isInformational: boolean;
  }>
) {
  await requireTreasurer();
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new Error("Not found");
  let weekId = existing.weekId;
  if (data.date) {
    const weeks = await prisma.week.findMany({ where: { semesterId: existing.semesterId } });
    weekId = findWeekForDate(new Date(data.date), weeks);
  }
  await prisma.event.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
      weekId,
    },
  });
  revalidatePath("/calendar");
  revalidatePath("/budget");
}

export async function deleteEvent(id: string) {
  await requireTreasurer();
  await prisma.event.delete({ where: { id } });
  revalidatePath("/calendar");
}
