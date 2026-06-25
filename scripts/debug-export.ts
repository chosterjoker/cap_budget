import { prisma } from "@/lib/prisma";
import { getActiveSemester } from "@/lib/semester";
import { getBudgetGridData } from "@/lib/budget-data";

async function main() {
  try {
    console.log("[debug] resolving active semester...");
    const active = await getActiveSemester();
    console.log("[debug] active semester:", active?.id, active?.name);
    if (!active) {
      console.log("[debug] NO ACTIVE SEMESTER");
      return;
    }

    console.log("[debug] running checks query...");
    const checks = await prisma.check.findMany({
      where: { semesterId: active.id },
      include: { category: true },
      orderBy: { date: "desc" },
    });
    console.log("[debug] checks count:", checks.length);

    console.log("[debug] running getBudgetGridData...");
    const grid = await getBudgetGridData(active.id);
    console.log("[debug] budget rows:", grid.rows.length, "weeks:", grid.weeks.length);
    console.log(
      "[debug] week labels:",
      grid.weeks.map((w) => w.label)
    );
  } catch (err) {
    console.error("[debug] CAUGHT ERROR:");
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
