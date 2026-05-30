import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { ReimbursementManager } from "@/components/reimbursements/reimbursement-manager";
import { isOcrEnabled } from "@/lib/ocr";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ReimbursementsPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester || !session?.user) {
    return <p className="text-muted-foreground">No active semester.</p>;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Reimbursements</h2>
          <p className="text-muted-foreground">
            Officer purchases awaiting reimbursement
          </p>
        </div>
        <a
          href={`/api/export/reimbursements?semesterId=${semester.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Export CSV
        </a>
      </div>
      <ReimbursementManager
        semesterId={semester.id}
        reimbursements={reimbursements}
        officers={officers}
        categories={categories}
        events={events}
        currentUserId={session.user.id}
        isTreasurer={session.user.role === "TREASURER"}
        ocrEnabled={isOcrEnabled()}
      />
    </div>
  );
}
