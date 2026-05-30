import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { CheckManager } from "@/components/checks/check-manager";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function ChecksPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return <p className="text-muted-foreground">No active semester.</p>;
  }

  const [checks, categories, events, reimbursements] = await Promise.all([
    prisma.check.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "desc" },
      include: { category: true, event: true },
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Check Register</h2>
          <p className="text-muted-foreground">
            Checks, wire transfers, and credit card payments
          </p>
        </div>
        <a
          href={`/api/export/checks?semesterId=${semester.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Export CSV
        </a>
      </div>
      <CheckManager
        semesterId={semester.id}
        checks={checks}
        categories={categories}
        events={events}
        reimbursements={reimbursements.map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          officerName: r.officer.name ?? r.officer.email,
        }))}
        isTreasurer={session?.user.role === "TREASURER"}
      />
    </div>
  );
}
