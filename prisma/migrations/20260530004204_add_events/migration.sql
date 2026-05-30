-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "semesterId" TEXT NOT NULL,
    "weekId" TEXT,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "time" TEXT,
    "eventType" TEXT,
    "audience" TEXT,
    "notes" TEXT,
    "isInformational" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Check_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Check_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Check_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Check" ("amount", "categoryId", "checkNumber", "cleared", "clearedDate", "createdAt", "date", "description", "id", "memo", "paymentMethod", "recipientName", "semesterId", "updatedAt") SELECT "amount", "categoryId", "checkNumber", "cleared", "clearedDate", "createdAt", "date", "description", "id", "memo", "paymentMethod", "recipientName", "semesterId", "updatedAt" FROM "Check";
DROP TABLE "Check";
ALTER TABLE "new_Check" RENAME TO "Check";
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "semesterId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "weekId" TEXT,
    "eventId" TEXT,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CHECK',
    "checkId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "categoryId", "checkId", "createdAt", "date", "description", "id", "paymentMethod", "semesterId", "updatedAt", "weekId") SELECT "amount", "categoryId", "checkId", "createdAt", "date", "description", "id", "paymentMethod", "semesterId", "updatedAt", "weekId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE TABLE "new_Reimbursement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officerId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "categoryId" TEXT,
    "eventId" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "parsedData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "checkId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reimbursement_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reimbursement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reimbursement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reimbursement_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reimbursement" ("amount", "categoryId", "checkId", "createdAt", "date", "id", "name", "notes", "officerId", "parsedData", "receiptUrl", "semesterId", "status", "tags", "updatedAt") SELECT "amount", "categoryId", "checkId", "createdAt", "date", "id", "name", "notes", "officerId", "parsedData", "receiptUrl", "semesterId", "status", "tags", "updatedAt" FROM "Reimbursement";
DROP TABLE "Reimbursement";
ALTER TABLE "new_Reimbursement" RENAME TO "Reimbursement";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Event_semesterId_date_name_key" ON "Event"("semesterId", "date", "name");
