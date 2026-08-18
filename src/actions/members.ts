"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";
import { parseMembershipCsv } from "@/lib/csv";
import type { MembershipStatus } from "@prisma/client";

/**
 * Imports the roster CSV into the given semester.
 *
 * Upserts on (semesterId, email) so a re-upload of a corrected sheet refreshes
 * names and class years **without** touching `status`, `amountPaid` or `notes`
 * — those are the treasurer's work, not the sheet's. Rows with no email can't
 * be keyed for an upsert, so they're reported as skipped rather than creating a
 * duplicate on every import.
 */
export async function importMembershipCsv(formData: FormData) {
  await requireTreasurer();
  const semesterId = formData.get("semesterId") as string;
  const file = formData.get("file") as File | null;
  if (!semesterId || !file || file.size === 0) {
    throw new Error("Semester and CSV file required");
  }

  const rows = parseMembershipCsv(await file.text());
  if (!rows.length) {
    throw new Error("No member rows found — expected Name and Email columns");
  }

  const withEmail = rows.filter((r) => r.email);
  const skipped = rows.length - withEmail.length;

  const existing = await prisma.member.findMany({
    where: { semesterId, email: { in: withEmail.map((r) => r.email!) } },
    select: { id: true, email: true, name: true, classYear: true },
  });
  const byEmail = new Map(existing.map((m) => [m.email!, m]));

  // A per-row upsert costs one round trip each — ~45s for a 200-person roster,
  // well past the serverless request budget. Instead: one createMany for the
  // new rows, and an UPDATE only for rows whose name or class year actually
  // changed. A re-upload of an unchanged sheet then costs a single SELECT.
  const toCreate = withEmail.filter((r) => !byEmail.has(r.email!));
  const toUpdate = withEmail.filter((r) => {
    const prev = byEmail.get(r.email!);
    return prev && (prev.name !== r.name || prev.classYear !== r.classYear);
  });

  await prisma.$transaction([
    prisma.member.createMany({
      data: toCreate.map((r) => ({
        semesterId,
        name: r.name,
        email: r.email,
        classYear: r.classYear,
      })),
      skipDuplicates: true,
    }),
    ...toUpdate.map((r) =>
      prisma.member.update({
        where: { id: byEmail.get(r.email!)!.id },
        data: { name: r.name, classYear: r.classYear },
      })
    ),
  ]);

  revalidatePath("/members");
  return {
    total: withEmail.length,
    created: toCreate.length,
    updated: toUpdate.length,
    unchanged: withEmail.length - toCreate.length - toUpdate.length,
    skipped,
  };
}

export async function createMember(data: {
  semesterId: string;
  name: string;
  email?: string;
  classYear?: number;
  status?: MembershipStatus;
  amountPaid?: number;
  notes?: string;
}) {
  await requireTreasurer();
  const email = data.email?.trim().toLowerCase() || null;
  if (email) {
    const clash = await prisma.member.findUnique({
      where: { semesterId_email: { semesterId: data.semesterId, email } },
    });
    if (clash) throw new Error(`${email} is already on this semester's roster`);
  }
  await prisma.member.create({
    data: {
      semesterId: data.semesterId,
      name: data.name.trim(),
      email,
      classYear: data.classYear ?? null,
      status: data.status ?? "NOT_BILLED",
      amountPaid: data.amountPaid ?? 0,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath("/members");
}

export async function updateMember(
  id: string,
  data: Partial<{
    name: string;
    email: string | null;
    classYear: number | null;
    status: MembershipStatus;
    amountPaid: number;
    notes: string | null;
  }>
) {
  await requireTreasurer();
  const email =
    data.email === undefined ? undefined : data.email?.trim().toLowerCase() || null;

  if (email) {
    const member = await prisma.member.findUnique({ where: { id } });
    if (!member) throw new Error("Member not found");
    const clash = await prisma.member.findUnique({
      where: { semesterId_email: { semesterId: member.semesterId, email } },
    });
    if (clash && clash.id !== id) {
      throw new Error(`${email} is already on this semester's roster`);
    }
  }

  await prisma.member.update({
    where: { id },
    data: { ...data, email },
  });
  revalidatePath("/members");
}

export async function deleteMember(id: string) {
  await requireTreasurer();
  await prisma.member.delete({ where: { id } });
  revalidatePath("/members");
}

/**
 * Marks a batch of members with one status. `amountPaid` is only rewritten when
 * the caller passes one (the "also set amount" path in the bulk bar), so a
 * status-only sweep never clobbers hand-entered partial payments.
 */
export async function setMemberStatuses(
  ids: string[],
  status: MembershipStatus,
  amountPaid?: number
) {
  await requireTreasurer();
  if (!ids.length) return { count: 0 };
  const result = await prisma.member.updateMany({
    where: { id: { in: ids } },
    data: { status, ...(amountPaid === undefined ? {} : { amountPaid }) },
  });
  revalidatePath("/members");
  return { count: result.count };
}

/** The per-semester dues rate every "owed" figure on the page is derived from. */
export async function setDuesAmount(semesterId: string, duesAmount: number) {
  await requireTreasurer();
  await prisma.semester.update({
    where: { id: semesterId },
    data: { duesAmount },
  });
  revalidatePath("/members");
  revalidatePath("/settings");
}
