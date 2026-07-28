import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { SettingsManager } from "@/components/settings/settings-manager";
import { PageHeader } from "@/components/common/page-header";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user.role !== "TREASURER") {
    redirect("/");
  }

  const activeSemester = await getActiveSemester();
  const [semesters, categories, weeks, users] = await Promise.all([
    prisma.semester.findMany({ orderBy: { startDate: "desc" } }),
    activeSemester
      ? prisma.budgetCategory.findMany({
          where: { semesterId: activeSemester.id },
          orderBy: { sortOrder: "asc" },
        })
      : Promise.resolve([]),
    activeSemester
      ? prisma.week.findMany({
          where: { semesterId: activeSemester.id },
          orderBy: { weekNumber: "asc" },
        })
      : Promise.resolve([]),
    prisma.user.findMany({ orderBy: { email: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Semesters, categories, weeks, and user roles"
      />
      <SettingsManager
        semesters={semesters}
        activeSemester={activeSemester}
        categories={categories}
        weeks={weeks}
        users={users}
      />
    </div>
  );
}
