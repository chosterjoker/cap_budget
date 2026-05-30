import { prisma } from "@/lib/prisma";

export async function getActiveSemester() {
  return prisma.semester.findFirst({
    where: { isActive: true },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      weeks: { orderBy: { weekNumber: "asc" } },
    },
  });
}

export async function getActiveSemesterOrThrow() {
  const semester = await getActiveSemester();
  if (!semester) {
    throw new Error("No active semester. Create one in Settings.");
  }
  return semester;
}
