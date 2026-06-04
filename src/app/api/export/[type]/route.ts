import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBudgetGridData } from "@/lib/budget-data";

function csvEscape(value: string | number) {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type } = await params;
  const semesterId = req.nextUrl.searchParams.get("semesterId");
  if (!semesterId) {
    return NextResponse.json({ error: "semesterId required" }, { status: 400 });
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
  } else {
    return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
