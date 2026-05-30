import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: "Social", allocatedAmount: 21135 },
  { name: "Cap In The City", allocatedAmount: 5000 },
  { name: "Beverages", allocatedAmount: 8000 },
  { name: "Security", allocatedAmount: 6000 },
  { name: "Gear", allocatedAmount: 3000 },
  { name: "House", allocatedAmount: 4000 },
  { name: "Affinity Groups", allocatedAmount: 2500 },
  { name: "Snacks", allocatedAmount: 1500 },
  { name: "Staff Bonus", allocatedAmount: 2000 },
  { name: "Community Outreach", allocatedAmount: 1500 },
  { name: "Culturally Cap", allocatedAmount: 2000 },
  { name: "Misc.", allocatedAmount: 2000 },
  { name: "Fall Reimbursements", allocatedAmount: 3000 },
  { name: "Bartenders", allocatedAmount: 4251 },
];

const WEEK_LABELS = [
  "Week 1",
  "V-day Semis",
  "C&Y, 90s",
  "B&G, Afrobeats",
  "Kosher, RnB",
  "Spring Break",
  "C&B, Affinity Night",
  "L&G, Latin Night",
  "Q&G, Pride Night",
  "C&G, Capchella",
  "CITC, HOCO",
];

async function main() {
  await prisma.semester.deleteMany();

  const startDate = new Date("2026-02-01");
  const totalBudget = CATEGORIES.reduce((s, c) => s + c.allocatedAmount, 0);

  const semester = await prisma.semester.create({
    data: {
      name: "Spring 2026",
      startDate,
      totalBudget,
      isActive: true,
      openingBankBalance: 25000,
      openingUndeposited: 19886,
      categories: {
        create: CATEGORIES.map((c, i) => ({
          name: c.name,
          allocatedAmount: c.allocatedAmount,
          sortOrder: i,
        })),
      },
      weeks: {
        create: WEEK_LABELS.map((label, i) => ({
          weekNumber: i + 1,
          startDate: new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000),
          label: label === `Week ${i + 1}` ? null : label,
        })),
      },
    },
    include: { categories: true, weeks: true },
  });

  const social = semester.categories.find((c) => c.name === "Social")!;
  const beverages = semester.categories.find((c) => c.name === "Beverages")!;
  const security = semester.categories.find((c) => c.name === "Security")!;
  const week2 = semester.weeks.find((w) => w.weekNumber === 2)!;

  await prisma.check.createMany({
    data: [
      {
        semesterId: semester.id,
        checkNumber: "2411",
        description: "Outstanding Alc",
        amount: 1894.57,
        date: new Date("2026-02-12"),
        recipientName: "ShopRite Liquors of Hamilton",
        categoryId: beverages.id,
        paymentMethod: "CHECK",
        cleared: true,
      },
      {
        semesterId: semester.id,
        checkNumber: "2412",
        description: "Valentine Semis",
        amount: 150,
        date: new Date("2026-02-12"),
        recipientName: "Security Staff",
        categoryId: security.id,
        paymentMethod: "CHECK",
        cleared: false,
      },
      // Carried over from the previous semester: still outstanding, draws
      // against cash but not this semester's budget grid.
      {
        semesterId: semester.id,
        checkNumber: "2398",
        description: "Fall formal venue (outstanding)",
        amount: 2200,
        date: new Date("2025-12-10"),
        recipientName: "Prospect House",
        paymentMethod: "CHECK",
        cleared: false,
        isCarryover: true,
      },
    ],
  });

  await prisma.expense.create({
    data: {
      semesterId: semester.id,
      categoryId: social.id,
      weekId: week2.id,
      amount: 150,
      description: "Valentine Semis security",
      date: new Date("2026-02-12"),
      paymentMethod: "CHECK",
    },
  });

  await prisma.deposit.create({
    data: {
      semesterId: semester.id,
      amount: 15000,
      date: new Date("2026-02-01"),
      notes: "Initial spring deposit",
    },
  });

  await prisma.bankReconciliation.create({
    data: {
      semesterId: semester.id,
      actualBalance: 38106.57,
      date: new Date("2026-02-15"),
      notes: "Opening reconciliation from bank statement",
    },
  });

  console.log("Seeded Spring 2026 semester:", semester.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
