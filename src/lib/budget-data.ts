import { prisma } from "@/lib/prisma";
import { findWeekForDate } from "@/lib/weeks";

export async function getBudgetGridData(semesterId: string) {
  const [semester, categories, weeks, expenses, reimbursements, venmoTotal] = await Promise.all([
    prisma.semester.findUnique({
      where: { id: semesterId },
      select: { totalBudget: true },
    }),
    prisma.budgetCategory.findMany({
      where: { semesterId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.week.findMany({
      where: { semesterId },
      orderBy: { weekNumber: "asc" },
    }),
    prisma.expense.findMany({ where: { semesterId } }),
    prisma.reimbursement.findMany({
      where: { semesterId, categoryId: { not: null } },
    }),
    prisma.venmoIncome.aggregate({
      where: { semesterId },
      _sum: { amount: true },
    }),
  ]);

  // `cellMap` powers the per-week grid columns; `categoryTotals` tracks the
  // full spend per category. We keep them separate because check-created
  // expenses (and reimbursements that don't fall inside a defined week) have no
  // weekId — they belong to a category's total even though no week column owns
  // them, so summing the columns alone would silently drop that spend.
  const cellMap = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  const bump = (categoryId: string, weekId: string | null, amount: number) => {
    const key = `${categoryId}:${weekId ?? "none"}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + amount);
    categoryTotals.set(categoryId, (categoryTotals.get(categoryId) ?? 0) + amount);
  };
  for (const e of expenses) {
    bump(e.categoryId, e.weekId, e.amount);
  }
  for (const r of reimbursements) {
    if (!r.categoryId) continue;
    bump(r.categoryId, findWeekForDate(r.date, weeks), r.amount);
  }

  const rows = categories.map((cat) => {
    const weekAmounts = weeks.map((w) => {
      return cellMap.get(`${cat.id}:${w.id}`) ?? 0;
    });
    const spent = categoryTotals.get(cat.id) ?? 0;
    const remaining = cat.allocatedAmount - spent;
    const percentRemaining =
      cat.allocatedAmount > 0
        ? (remaining / cat.allocatedAmount) * 100
        : 0;
    return {
      category: cat,
      weekAmounts,
      spent,
      remaining,
      percentRemaining,
    };
  });

  const weekTotals = weeks.map((_, wi) =>
    rows.reduce((sum, r) => sum + r.weekAmounts[wi], 0)
  );

  const totalAllocated = categories.reduce((s, c) => s + c.allocatedAmount, 0);
  const totalBudget = semester?.totalBudget ?? 0;
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  return {
    categories,
    weeks,
    rows,
    weekTotals,
    totalBudget,
    totalAllocated,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
    percentRemaining:
      totalBudget > 0 ? ((totalBudget - totalSpent) / totalBudget) * 100 : 0,
    venmoTotal: venmoTotal._sum.amount ?? 0,
  };
}

export async function getDashboardStats(semesterId: string) {
  const [
    semester,
    budget,
    deposits,
    checks,
    reimbursements,
    reconciliations,
    venmo,
    recentChecks,
    recentReimbursements,
    recentDeposits,
  ] = await Promise.all([
    prisma.semester.findUnique({
      where: { id: semesterId },
      select: { openingBankBalance: true, openingUndeposited: true },
    }),
    getBudgetGridData(semesterId),
    prisma.deposit.aggregate({
      where: { semesterId },
      _sum: { amount: true },
    }),
    prisma.check.findMany({ where: { semesterId } }),
    prisma.reimbursement.findMany({
      where: { semesterId, status: { not: "PAID" } },
      include: { officer: true },
    }),
    prisma.bankReconciliation.findMany({
      where: { semesterId },
      orderBy: { date: "desc" },
    }),
    prisma.venmoIncome.aggregate({
      where: { semesterId },
      _sum: { amount: true },
    }),
    prisma.check.findMany({
      where: { semesterId },
      orderBy: { date: "desc" },
      take: 5,
      include: { category: true },
    }),
    prisma.reimbursement.findMany({
      where: { semesterId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { officer: true },
    }),
    prisma.deposit.findMany({
      where: { semesterId },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  const totalDeposited = deposits._sum.amount ?? 0;
  const unclearedChecks = checks.filter((c) => !c.cleared);
  const unclearedAmount = unclearedChecks.reduce((s, c) => s + c.amount, 0);
  const clearedAmount = checks
    .filter((c) => c.cleared)
    .reduce((s, c) => s + c.amount, 0);
  const pendingReimbursements = reimbursements.reduce((s, r) => s + r.amount, 0);

  // Cash position, fully computed from opening balances + ledgers.
  const openingBankBalance = semester?.openingBankBalance ?? 0;
  const openingUndeposited = semester?.openingUndeposited ?? 0;
  // Money still in hand: opening undeposited funds drawn down as deposits log.
  const undeposited = openingUndeposited - totalDeposited;
  // What the bank account should hold: opening + deposits − cleared checks.
  const expectedBankBalance =
    openingBankBalance + totalDeposited - clearedAmount;
  // True spendable cash once outstanding checks finally clear.
  const trueAvailable = expectedBankBalance - unclearedAmount;

  const latestReconciliation = reconciliations[0] ?? null;
  // Difference between what the bank site says and what we computed.
  const reconciliationDelta = latestReconciliation
    ? latestReconciliation.actualBalance - expectedBankBalance
    : null;

  return {
    ...budget,
    totalDeposited,
    venmoTotal: venmo._sum.amount ?? 0,
    // What's left to spend: budget (+ Venmo income) minus what's been spent.
    availableBudget:
      budget.totalBudget + (venmo._sum.amount ?? 0) - budget.totalSpent,
    unclearedChecks: unclearedChecks.length,
    unclearedAmount,
    pendingReimbursements,
    pendingCount: reimbursements.length,
    // Cash position
    openingBankBalance,
    openingUndeposited,
    undeposited,
    expectedBankBalance,
    trueAvailable,
    reconciliations,
    latestReconciliation,
    reconciliationDelta,
    recentActivity: [
      ...recentChecks.map((c) => ({
        type: "check" as const,
        date: c.date,
        title: `Check #${c.checkNumber} — ${c.description}`,
        amount: c.amount,
      })),
      ...recentReimbursements.map((r) => ({
        type: "reimbursement" as const,
        date: r.date,
        title: `${r.name} (${r.officer.name})`,
        amount: r.amount,
      })),
      ...recentDeposits.map((d) => ({
        type: "deposit" as const,
        date: d.date,
        title: d.notes || "Deposit",
        amount: d.amount,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 10),
    categoryChart: budget.rows.map((r) => ({
      name: r.category.name,
      budget: r.category.allocatedAmount,
      spent: r.spent,
    })),
    weekChart: budget.weeks.map((w, i) => ({
      week: `W${w.weekNumber}`,
      label: w.label,
      spent: budget.weekTotals[i],
    })),
  };
}

export async function getEventSpending(semesterId: string) {
  const [events, expenses, reimbursements] = await Promise.all([
    prisma.event.findMany({
      where: { semesterId },
      orderBy: { date: "asc" },
      include: { week: true },
    }),
    prisma.expense.findMany({
      where: { semesterId, eventId: { not: null } },
      include: { category: true },
    }),
    prisma.reimbursement.findMany({
      where: { semesterId, eventId: { not: null } },
      include: { category: true },
    }),
  ]);

  const byEvent = new Map<
    string,
    { total: number; byCategory: Map<string, { name: string; amount: number }> }
  >();
  const bump = (eventId: string, categoryName: string | undefined, amount: number) => {
    let entry = byEvent.get(eventId);
    if (!entry) {
      entry = { total: 0, byCategory: new Map() };
      byEvent.set(eventId, entry);
    }
    entry.total += amount;
    if (categoryName) {
      const cat = entry.byCategory.get(categoryName) ?? { name: categoryName, amount: 0 };
      cat.amount += amount;
      entry.byCategory.set(categoryName, cat);
    }
  };
  for (const e of expenses) {
    if (e.eventId) bump(e.eventId, e.category?.name, e.amount);
  }
  for (const r of reimbursements) {
    if (r.eventId) bump(r.eventId, r.category?.name, r.amount);
  }

  return events.map((ev) => {
    const entry = byEvent.get(ev.id);
    return {
      event: ev,
      total: entry?.total ?? 0,
      byCategory: entry ? Array.from(entry.byCategory.values()) : [],
    };
  });
}
