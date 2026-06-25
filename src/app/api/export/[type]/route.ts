import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBudgetGridData } from "@/lib/budget-data";
import { getActiveSemester } from "@/lib/semester";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number) {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Allows Google Sheets `=IMPORTDATA()` (which sends no login cookie) to read
// exports via a shared secret token, without granting any write access.
function hasValidSyncToken(provided: string | null): boolean {
  const secret = process.env.SHEETS_SYNC_TOKEN;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const token = req.nextUrl.searchParams.get("token");
  if (!hasValidSyncToken(token)) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { type } = await params;
  // `semesterId=active` (or omitting it) targets the active semester, so a
  // long-lived IMPORTDATA formula keeps working across semester rollovers.
  const requestedSemesterId = req.nextUrl.searchParams.get("semesterId");
  let semesterId = requestedSemesterId;
  if (!semesterId || semesterId === "active") {
    const active = await getActiveSemester();
    if (!active) {
      return NextResponse.json(
        { error: "No active semester" },
        { status: 400 }
      );
    }
    semesterId = active.id;
  }

  let csv = "";
  let filename = "export.csv";

  if (type === "budget") {
    const grid = await getBudgetGridData(semesterId);
    const headers = [
      "Category",
      "Budget",
      "Spent",
      "% Remaining",
      ...grid.weeks.map((w) => `W${w.weekNumber}${w.label ? ` (${w.label})` : ""}`),
    ];
    const lines = [headers.join(",")];
    for (const row of grid.rows) {
      lines.push(
        [
          row.category.name,
          row.category.allocatedAmount,
          row.spent,
          row.percentRemaining.toFixed(1),
          ...row.weekAmounts,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    csv = lines.join("\n");
    filename = "budget-grid.csv";
  } else if (type === "checks") {
    const checks = await prisma.check.findMany({
      where: { semesterId },
      include: { category: true },
      orderBy: { date: "desc" },
    });
    const headers = [
      "Check ID",
      "Description",
      "Amount",
      "Date",
      "Recipient",
      "Category",
      "Method",
      "Cleared",
    ];
    const lines = [headers.join(",")];
    for (const c of checks) {
      lines.push(
        [
          c.checkNumber,
          c.description,
          c.amount,
          c.date.toISOString().slice(0, 10),
          c.recipientName,
          c.category?.name ?? "",
          c.paymentMethod,
          c.cleared ? "Yes" : "No",
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    csv = lines.join("\n");
    filename = "checks.csv";
  } else if (type === "reimbursements") {
    const items = await prisma.reimbursement.findMany({
      where: { semesterId },
      include: { officer: true, category: true },
      orderBy: { date: "desc" },
    });
    const headers = [
      "Name",
      "Member",
      "Amount",
      "Date",
      "Submitted by",
      "Category",
      "Tags",
      "Status",
    ];
    const lines = [headers.join(",")];
    for (const r of items) {
      lines.push(
        [
          r.name,
          r.memberName || r.officer.name || r.officer.email,
          r.amount,
          r.date.toISOString().slice(0, 10),
          r.officer.email,
          r.category?.name ?? "",
          r.tags ?? "",
          r.status,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    csv = lines.join("\n");
    filename = "reimbursements.csv";
  } else if (type === "deposits") {
    const deposits = await prisma.deposit.findMany({
      where: { semesterId },
      orderBy: { date: "desc" },
    });
    const headers = ["Amount", "Date", "Notes"];
    const lines = [headers.join(",")];
    for (const d of deposits) {
      lines.push(
        [d.amount, d.date.toISOString().slice(0, 10), d.notes ?? ""]
          .map(csvEscape)
          .join(",")
      );
    }
    csv = lines.join("\n");
    filename = "deposits.csv";
  } else {
    return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
