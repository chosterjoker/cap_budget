import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { ReimbursementManager } from "@/components/reimbursements/reimbursement-manager";
import { isOcrEnabled } from "@/lib/ocr";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarPlus, Download } from "lucide-react";

export default async function ReimbursementsPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester || !session?.user) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="Reimbursements are filed against an active semester."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }

  const [reimbursements, officers, categories, events] = await Promise.all([
    prisma.reimbursement.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "desc" },
      include: { officer: true, category: true, event: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { role: "OFFICER" },
          { role: "TREASURER" },
          { reimbursements: { some: { semesterId: semester.id } } },
        ],
      },
      orderBy: { name: "asc" },
    }),
    prisma.budgetCategory.findMany({
      where: { semesterId: semester.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.event.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reimbursements"
        description="Officer purchases awaiting reimbursement"
        actions={
          <a
            href={`/api/export/reimbursements?semesterId=${semester.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
      />
      <ReimbursementManager
        semesterId={semester.id}
        reimbursements={reimbursements}
        officers={officers}
        categories={categories}
        events={events}
        currentUserId={session.user.id}
        currentUserName={session.user.name ?? session.user.email}
        isTreasurer={session.user.role === "TREASURER"}
        ocrEnabled={isOcrEnabled()}
      />
    </div>
  );
}
