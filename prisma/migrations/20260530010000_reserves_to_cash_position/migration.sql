-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ReserveSnapshot";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "semesterId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualBalance" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankReconciliation_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Check" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "semesterId" TEXT NOT NULL,
    "checkNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "recipientName" TEXT NOT NULL,
    "categoryId" TEXT,
    "eventId" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CHECK',
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "clearedDate" DATETIME,
    "isCarryover" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Check_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Check_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Check_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Check" ("amount", "categoryId", "checkNumber", "cleared", "clearedDate", "createdAt", "date", "description", "eventId", "id", "memo", "paymentMethod", "recipientName", "semesterId", "updatedAt") SELECT "amount", "categoryId", "checkNumber", "cleared", "clearedDate", "createdAt", "date", "description", "eventId", "id", "memo", "paymentMethod", "recipientName", "semesterId", "updatedAt" FROM "Check";
DROP TABLE "Check";
ALTER TABLE "new_Check" RENAME TO "Check";
CREATE TABLE "new_Semester" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "totalBudget" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "openingBankBalance" REAL NOT NULL DEFAULT 0,
    "openingUndeposited" REAL NOT NULL DEFAULT 0,
    "previousSemesterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Semester_previousSemesterId_fkey" FOREIGN KEY ("previousSemesterId") REFERENCES "Semester" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Semester" ("createdAt", "endDate", "id", "isActive", "name", "previousSemesterId", "startDate", "totalBudget", "updatedAt") SELECT "createdAt", "endDate", "id", "isActive", "name", "previousSemesterId", "startDate", "totalBudget", "updatedAt" FROM "Semester";
DROP TABLE "Semester";
ALTER TABLE "new_Semester" RENAME TO "Semester";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

