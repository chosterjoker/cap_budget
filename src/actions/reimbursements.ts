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
    status: "PENDING" | "APPROVED" | "PAID";
  }>
) {
  const session = await requireSession();
  const item = await prisma.reimbursement.findUnique({ where: { id } });
  if (!item) throw new Error("Not found");
  const isOwner = item.officerId === session.user.id;
  const isTreasurer = session.user.role === "TREASURER";
  if (!isOwner && !isTreasurer) throw new Error("Forbidden");
  if (data.status && !isTreasurer) throw new Error("Only treasurer can change status");

  // Don't let an edit strip the required category off an existing reimbursement.
  if (data.categoryId !== undefined && !data.categoryId) {
    throw new Error("Select a budget category for this reimbursement.");
  }

  await prisma.reimbursement.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
    },
  });
  revalidatePath("/reimbursements");
  revalidatePath("/budget");
  revalidatePath("/");
}

export async function updateReimbursementStatus(
  id: string,
  status: "PENDING" | "APPROVED" | "PAID"
) {
  await requireTreasurer();
  await prisma.reimbursement.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/reimbursements");
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
  await prisma.reimbursement.delete({ where: { id } });
  revalidatePath("/reimbursements");
}
