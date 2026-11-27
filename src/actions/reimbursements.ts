"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireTreasurer } from "@/lib/auth";
import { uploadReceipt } from "@/lib/upload";
import {
  parseReceiptFromBuffer,
  parseReceiptFromImage,
  type ParsedReceipt,
} from "@/lib/ocr";
import type { PaymentMethod, ReimbursementStatus } from "@prisma/client";

/**
 * Extract date/amount/description from an uploaded receipt image without
 * persisting anything, so the submit form can pre-fill its fields. Returns
 * null when OCR is unconfigured or the image can't be read.
 */
export async function scanReceipt(
  formData: FormData
): Promise<ParsedReceipt | null> {
  await requireSession();
  const receipt = formData.get("receipt") as File | null;
  if (!receipt || receipt.size === 0 || !receipt.type.startsWith("image/")) {
    return null;
  }
  const buffer = Buffer.from(await receipt.arrayBuffer());
  return parseReceiptFromBuffer(buffer, receipt.type);
}

export async function createReimbursement(formData: FormData) {
  const session = await requireSession();
  const semesterId = formData.get("semesterId") as string;
  const name = formData.get("name") as string;
  // Who the money is for. Defaults to the submitting officer, but can name a
  // non-officer member the officer is submitting on behalf of.
  const memberName =
    ((formData.get("memberName") as string) || "").trim() ||
    session.user.name ||
    session.user.email;
  const amount = parseFloat(formData.get("amount") as string);
  const date = formData.get("date") as string;
  const categoryId = (formData.get("categoryId") as string) || undefined;
  const eventId = (formData.get("eventId") as string) || undefined;
  const tags = (formData.get("tags") as string) || undefined;
  const notes = (formData.get("notes") as string) || undefined;

  // A reimbursement is a budget spend, so it must be tagged to a category to
  // count toward "Total Spent" and show up in the grid.
  if (!categoryId) {
    throw new Error("Select a budget category for this reimbursement.");
  }
  const receipt = formData.get("receipt") as File | null;
  // The client may have already scanned the receipt (interactive pre-fill);
  // reuse that to avoid a second OCR call and the hosted-URL round trip.
  const clientParsed = (formData.get("parsedData") as string) || undefined;

  let receiptUrl: string | undefined;
  let parsedData: string | undefined;

  if (receipt && receipt.size > 0) {
    receiptUrl = await uploadReceipt(receipt);
    if (clientParsed) {
      parsedData = clientParsed;
    } else {
      const parsed = await parseReceiptFromImage(receiptUrl);
      if (parsed) parsedData = JSON.stringify(parsed);
    }
  }

  await prisma.reimbursement.create({
    data: {
      officerId: session.user.id,
      semesterId,
      name,
      memberName,
      amount,
      date: new Date(date),
      categoryId: categoryId || null,
      eventId: eventId || null,
      tags,
      notes,
      receiptUrl,
      parsedData,
      status: "PENDING",
    },
  });

  revalidatePath("/reimbursements");
  revalidatePath("/budget");
  revalidatePath("/");
}

export async function updateReimbursement(
  id: string,
  data: Partial<{
    name: string;
    memberName: string;
    amount: number;
    date: string;
    categoryId: string | null;
    eventId: string | null;
    tags: string | null;
    notes: string | null;
    status: ReimbursementStatus;
  }>
) {
  const session = await requireSession();
  const item = await prisma.reimbursement.findUnique({ where: { id } });
  if (!item) throw new Error("Not found");
  const isOwner = item.officerId === session.user.id;
  const isTreasurer = session.user.role === "TREASURER";
  if (!isOwner && !isTreasurer) throw new Error("Forbidden");
  if (data.status && !isTreasurer) throw new Error("Only treasurer can change status");
  // Once the treasurer has paid it out, the amount is settled — only they can change it.
  if (item.status === "FRONTED" && !isTreasurer) {
    throw new Error("The treasurer already paid this — ask them to change it.");
  }

  // Don't let an edit strip the required category off an existing reimbursement.
  if (data.categoryId !== undefined && !data.categoryId) {
    throw new Error("Select a budget category for this reimbursement.");
  }

  await prisma.reimbursement.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
      ...(data.status ? frontedFieldsFor(data.status, item, session.user.id) : {}),
    },
  });
  revalidatePath("/reimbursements");
  revalidatePath("/budget");
  revalidatePath("/");
}

// Keeps the fronted-by fields in step with a hand-set status. Choosing
// "Paid by treasurer" stamps the current treasurer if nobody was recorded;
// moving back to PENDING/APPROVED means nobody has paid the member yet, so the
// record is wiped. PAID keeps it — that's the history of who was repaid.
function frontedFieldsFor(
  status: ReimbursementStatus,
  item: { frontedById: string | null },
  treasurerId: string
) {
  if (status === "FRONTED" && !item.frontedById) {
    return { frontedById: treasurerId, frontedAt: new Date() };
  }
  if (status === "PENDING" || status === "APPROVED") {
    return { frontedById: null, frontedAt: null, frontedMethod: null };
  }
  return {};
}

/**
 * The treasurer paid these members personally (Venmo, cash, …). The members
 * are now whole, but the club owes the treasurer — the reimbursements stay
 * unpaid on the books until a check to the treasurer settles them.
 *
 * Returns a result instead of throwing so the message survives production.
 */
export async function frontReimbursements(
  ids: string[],
  method: PaymentMethod
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const session = await requireTreasurer();
  if (!ids.length) return { ok: false, error: "Pick at least one reimbursement." };
  const { count } = await prisma.reimbursement.updateMany({
    where: {
      id: { in: ids },
      checkId: null,
      status: { in: ["PENDING", "APPROVED"] },
    },
    data: {
      status: "FRONTED",
      frontedById: session.user.id,
      frontedAt: new Date(),
      frontedMethod: method,
    },
  });
  if (count === 0) {
    return { ok: false, error: "Already paid — refresh to see the latest." };
  }
  revalidatePath("/reimbursements");
  revalidatePath("/checks");
  revalidatePath("/");
  return { ok: true, count };
}

export async function deleteReimbursement(id: string) {
  const session = await requireSession();
  const item = await prisma.reimbursement.findUnique({ where: { id } });
  if (!item) return;
  if (
    session.user.role !== "TREASURER" &&
    item.officerId !== session.user.id
  ) {
    throw new Error("Forbidden");
  }
  if (item.status === "PAID") throw new Error("Cannot delete paid reimbursement");
  if (item.status === "FRONTED" && session.user.role !== "TREASURER") {
    throw new Error("The treasurer already paid this — ask them to remove it.");
  }
  await prisma.reimbursement.delete({ where: { id } });
  revalidatePath("/reimbursements");
}

export type BulkResult =
  | { ok: true; count: number; skipped: number }
  | { ok: false; error: string };

// Rows the caller may batch-edit or delete: the treasurer can touch anything
// not yet paid by check; an officer only their own, and only before the
// treasurer has paid it out.
async function bulkScope(ids: string[]) {
  const session = await requireSession();
  const isTreasurer = session.user.role === "TREASURER";
  return {
    session,
    isTreasurer,
    where: {
      id: { in: ids },
      checkId: null,
      status: isTreasurer
        ? { not: "PAID" as const }
        : { in: ["PENDING" as const, "APPROVED" as const] },
      ...(isTreasurer ? {} : { officerId: session.user.id }),
    },
  };
}

/**
 * Apply one change to many reimbursements at once. Rows the caller can't
 * change (paid, or someone else's) are skipped and counted, not failed, so a
 * select-all over a mixed list still does the right thing for the rest.
 *
 * Status here is only PENDING/APPROVED: FRONTED goes through
 * `frontReimbursements` (it needs a method) and PAID through a check.
 */
export async function bulkUpdateReimbursements(
  ids: string[],
  data: {
    status?: "PENDING" | "APPROVED";
    categoryId?: string;
    eventId?: string | null;
  }
): Promise<BulkResult> {
  if (!ids.length) return { ok: false, error: "Nothing selected." };
  const { isTreasurer, where } = await bulkScope(ids);
  if (data.status && !isTreasurer) {
    return { ok: false, error: "Only the treasurer can change status." };
  }
  if (data.categoryId !== undefined && !data.categoryId) {
    return { ok: false, error: "Pick a budget category." };
  }
  const { count } = await prisma.reimbursement.updateMany({
    where,
    data: {
      ...(data.categoryId ? { categoryId: data.categoryId } : {}),
      ...(data.eventId !== undefined ? { eventId: data.eventId } : {}),
      ...(data.status
        ? {
            status: data.status,
            // Back to unpaid: nobody has paid the member, so no fronted record.
            frontedById: null,
            frontedAt: null,
            frontedMethod: null,
          }
        : {}),
    },
  });
  revalidatePath("/reimbursements");
  revalidatePath("/checks");
  revalidatePath("/budget");
  revalidatePath("/");
  return { ok: true, count, skipped: ids.length - count };
}

export async function bulkDeleteReimbursements(ids: string[]): Promise<BulkResult> {
  if (!ids.length) return { ok: false, error: "Nothing selected." };
  const { where } = await bulkScope(ids);
  const { count } = await prisma.reimbursement.deleteMany({ where });
  revalidatePath("/reimbursements");
  revalidatePath("/checks");
  revalidatePath("/budget");
  revalidatePath("/");
  return { ok: true, count, skipped: ids.length - count };
}
