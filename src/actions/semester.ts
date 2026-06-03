"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTreasurer } from "@/lib/auth";
import { generateWeeks } from "@/lib/weeks";
import { formatCurrency } from "@/lib/format";

/** Sum of all category allocations for a semester. */
async function allocatedTotal(semesterId: string) {
  const agg = await prisma.budgetCategory.aggregate({
    where: { semesterId },
    _sum: { allocatedAmount: true },
  });
  return agg._sum.allocatedAmount ?? 0;
}

export async function createSemester(data: {
  name: string;
  startDate: string;
  endDate?: string;
  totalBudget: number;
  openingBankBalance?: number;
  openingUndeposited?: number;
  cloneFromPrevious?: boolean;
}) {
  await requireTreasurer();

  // Atomic: deactivating the old semester and creating the new one (plus its
  // carried-over checks, cloned categories, and weeks) must all commit together.
  // A partial failure could otherwise leave *no* active semester, breaking the
  // app for every user until fixed by hand.
  const semester = await prisma.$transaction(async (tx) => {
    await tx.semester.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const previous = await tx.semester.findFirst({
      where: { isActive: false },
      orderBy: { createdAt: "desc" },
      include: {
        categories: true,
        weeks: true,
        // Checks still outstanding (uncleared) at transition time can still be
        // drawn from the bank, so they carry forward into the new semester.
        checks: { where: { cleared: false } },
      },
    });

    const created = await tx.semester.create({
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        totalBudget: data.totalBudget,
        openingBankBalance: data.openingBankBalance ?? 0,
        openingUndeposited: data.openingUndeposited ?? 0,
        isActive: true,
        previousSemesterId: previous?.id,
      },
    });

    // Carry forward outstanding checks as cash-only rows. `isCarryover` keeps them
    // out of this semester's budget grid (they were last semester's spend) while
    // still drawing down the computed bank balance until manually cleared.
    if (previous?.checks.length) {
      await tx.check.createMany({
        data: previous.checks.map((c) => ({
          semesterId: created.id,
          checkNumber: c.checkNumber,
          description: c.description,
          amount: c.amount,
          date: c.date,
          recipientName: c.recipientName,
          paymentMethod: c.paymentMethod,
          cleared: false,
          isCarryover: true,
          memo: c.memo,
        })),
      });
    }

    if (data.cloneFromPrevious && previous) {
      await tx.budgetCategory.createMany({
        data: previous.categories.map((c) => ({
          semesterId: created.id,
          name: c.name,
          allocatedAmount: c.allocatedAmount,
          sortOrder: c.sortOrder,
        })),
      });
    }

    const cloneLabels = data.cloneFromPrevious
      ? previous?.weeks.sort((a, b) => a.weekNumber - b.weekNumber).map((w) => w.label) ?? []
      : [];
    const weeks = generateWeeks(
      new Date(data.startDate),
      data.endDate ? new Date(data.endDate) : null,
      { labels: cloneLabels }
    );
    await tx.week.createMany({
      data: weeks.map((w) => ({
        semesterId: created.id,
        weekNumber: w.weekNumber,
        startDate: w.startDate,
        label: w.label,
      })),
    });

    return created;
  });

  revalidatePath("/");
  revalidatePath("/budget");
  revalidatePath("/settings");
  return semester;
}

/** Update the fixed total budget (e.g. the number set by leadership). */
export async function updateSemesterBudget(
  semesterId: string,
  totalBudget: number
) {
  await requireTreasurer();
  if (!Number.isFinite(totalBudget) || totalBudget < 0) {
    throw new Error("Budget must be a non-negative number");
  }
  const current = await allocatedTotal(semesterId);
  if (totalBudget < current) {
    throw new Error(
      `Budget too low: ${formatCurrency(current)} is already allocated across ` +
        `categories. Reduce category allocations before lowering the budget below ` +
        `${formatCurrency(current)}.`
    );
  }
  await prisma.semester.update({
    where: { id: semesterId },
    data: { totalBudget },
  });
  revalidatePath("/");
  revalidatePath("/budget");
  revalidatePath("/settings");
}

/** Update the carried-over opening balances for a semester. */
export async function updateOpeningBalances(
  semesterId: string,
  data: { openingBankBalance: number; openingUndeposited: number }
) {
  await requireTreasurer();
  if (
    !Number.isFinite(data.openingBankBalance) ||
    !Number.isFinite(data.openingUndeposited)
  ) {
    throw new Error("Opening balances must be numbers");
  }
  await prisma.semester.update({
    where: { id: semesterId },
    data: {
      openingBankBalance: data.openingBankBalance,
      openingUndeposited: data.openingUndeposited,
    },
  });
  revalidatePath("/");
  revalidatePath("/settings");
}

/** Delete a semester and all of its data. */
export async function deleteSemester(semesterId: string) {
  await requireTreasurer();
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { id: true, isActive: true },
  });
  if (!semester) throw new Error("Semester not found");

  await prisma.$transaction(async (tx) => {
    // Reimbursements carry a semesterId but have no cascading FK to Semester,
    // so remove them explicitly to avoid orphans.
    await tx.reimbursement.deleteMany({ where: { semesterId } });
    // Categories, weeks, expenses, checks, deposits, bank reconciliations,
    // venmo income, and events all cascade via onDelete: Cascade.
    await tx.semester.delete({ where: { id: semesterId } });

    // If the deleted semester was active, promote the most recent remaining one.
    if (semester.isActive) {
      const next = await tx.semester.findFirst({
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await tx.semester.update({
          where: { id: next.id },
          data: { isActive: true },
        });
      }
    }
  });

  revalidatePath("/");
  revalidatePath("/budget");
  revalidatePath("/settings");
}

export async function updateWeekLabel(weekId: string, label: string) {
  await requireTreasurer();
  await prisma.week.update({
    where: { id: weekId },
    data: { label: label || null },
  });
  revalidatePath("/budget");
}

export async function addCategory(
  semesterId: string,
  name: string,
  allocatedAmount: number
) {
  await requireTreasurer();
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { totalBudget: true },
  });
  if (!semester) throw new Error("Semester not found");
  const current = await allocatedTotal(semesterId);
  if (current + allocatedAmount > semester.totalBudget) {
    throw new Error(
      `Over budget: allocations would total ${formatCurrency(current + allocatedAmount)}, ` +
        `but the budget is ${formatCurrency(semester.totalBudget)}. Only ` +
        `${formatCurrency(semester.totalBudget - current)} left to allocate.`
    );
  }
  const maxOrder = await prisma.budgetCategory.aggregate({
    where: { semesterId },
    _max: { sortOrder: true },
  });
  await prisma.budgetCategory.create({
    data: {
      semesterId,
      name,
      allocatedAmount,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath("/budget");
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function updateCategory(
  id: string,
  data: { name?: string; allocatedAmount?: number }
) {
  await requireTreasurer();
  const existing = await prisma.budgetCategory.findUnique({
    where: { id },
    select: { semesterId: true, allocatedAmount: true },
  });
  if (!existing) throw new Error("Category not found");

  if (data.allocatedAmount !== undefined) {
    const semester = await prisma.semester.findUnique({
      where: { id: existing.semesterId },
      select: { totalBudget: true },
    });
    const current = await allocatedTotal(existing.semesterId);
    const newSum = current - existing.allocatedAmount + data.allocatedAmount;
    // Block increases that push over budget; always allow changes that reduce
    // the allocated total (so an over-allocated state can be corrected).
    if (newSum > (semester?.totalBudget ?? 0) && newSum > current) {
      throw new Error(
        `Over budget: allocations would total ${formatCurrency(newSum)}, but the ` +
          `budget is ${formatCurrency(semester?.totalBudget ?? 0)}.`
      );
    }
  }

  await prisma.budgetCategory.update({ where: { id }, data });
  revalidatePath("/budget");
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function deleteCategory(id: string) {
  await requireTreasurer();
  const cat = await prisma.budgetCategory.findUnique({
    where: { id },
    include: { _count: { select: { expenses: true, reimbursements: true, checks: true } } },
  });
  if (!cat) throw new Error("Category not found");
  const used = cat._count.expenses + cat._count.reimbursements + cat._count.checks;
  if (used > 0) {
    throw new Error(
      `Cannot delete "${cat.name}" — ${used} expense/reimbursement/check rows reference it. Reassign or delete those first.`
    );
  }
  await prisma.budgetCategory.delete({ where: { id } });
  revalidatePath("/budget");
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function addWeek(semesterId: string, startDate: string, label?: string) {
  await requireTreasurer();
  const maxWeek = await prisma.week.aggregate({
    where: { semesterId },
    _max: { weekNumber: true },
  });
  await prisma.week.create({
    data: {
      semesterId,
      weekNumber: (maxWeek._max.weekNumber ?? 0) + 1,
      startDate: new Date(startDate),
      label: label || null,
    },
  });
  revalidatePath("/budget");
}

export async function updateUserRole(userId: string, role: "TREASURER" | "OFFICER") {
  await requireTreasurer();
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings");
}
