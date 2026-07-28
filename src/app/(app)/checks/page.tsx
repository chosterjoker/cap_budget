import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { CheckManager } from "@/components/checks/check-manager";
import { isOcrEnabled } from "@/lib/ocr";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarPlus, Download } from "lucide-react";

export default async function ChecksPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="Checks and payments are recorded against an active semester."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }

  const [checks, categories, events, reimbursements] = await Promise.all([
    prisma.check.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "desc" },
      include: {
        category: true,
        event: true,
        // Used to flag checks that settle reimbursements vs. manual payments.
        _count: { select: { reimbursements: true } },
      },
    }),
    prisma.budgetCategory.findMany({
      where: { semesterId: semester.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.event.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "asc" },
    }),
    prisma.reimbursement.findMany({
      where: { semesterId: semester.id, status: { not: "PAID" } },
      orderBy: { date: "desc" },
      include: { officer: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check register"
        description="Checks, wire transfers, and other payments"
        actions={
          <a
            href={`/api/export/checks?semesterId=${semester.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
      />
      <CheckManager
        semesterId={semester.id}
        checks={checks}
        categories={categories}
        events={events}
        reimbursements={reimbursements.map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          memberName: r.memberName ?? r.officer.name ?? r.officer.email,
        }))}
        isTreasurer={session?.user.role === "TREASURER"}
        ocrEnabled={isOcrEnabled()}
      />
    </div>
  );
}
