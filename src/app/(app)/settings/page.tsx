import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { SettingsManager } from "@/components/settings/settings-manager";

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
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground">
          Semesters, categories, weeks, and user roles
        </p>
      </div>
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
