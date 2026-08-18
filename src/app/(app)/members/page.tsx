import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { MemberManager } from "@/components/members/member-manager";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarPlus, Download } from "lucide-react";

export default async function MembersPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="The roster and dues are tracked against an active semester."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }

  const members = await prisma.member.findMany({
    where: { semesterId: semester.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membership"
        description="Club roster and where each member stands on semester dues"
        actions={
          <a
            href={`/api/export/members?semesterId=${semester.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
      />
      <MemberManager
        semesterId={semester.id}
        members={members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          classYear: m.classYear,
          status: m.status,
          amountPaid: m.amountPaid,
          notes: m.notes,
        }))}
        duesAmount={semester.duesAmount}
        isTreasurer={session?.user.role === "TREASURER"}
      />
    </div>
  );
}
