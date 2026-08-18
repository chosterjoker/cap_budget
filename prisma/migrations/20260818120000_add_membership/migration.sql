-- Membership roster + dues tracking.

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('NOT_BILLED', 'BILLED', 'AWAITING_PAYMENT', 'PAID_HALF', 'PAID_FULL', 'WAIVED');

-- AlterTable: the per-semester dues rate, used to derive what a member owes.
ALTER TABLE "Semester" ADD COLUMN "duesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "classYear" INTEGER,
    "status" "MembershipStatus" NOT NULL DEFAULT 'NOT_BILLED',
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_semesterId_idx" ON "Member"("semesterId");

-- CreateIndex: the CSV upsert key. NULL emails stay distinct under Postgres
-- unique semantics, so hand-added members without an email don't collide.
CREATE UNIQUE INDEX "Member_semesterId_email_key" ON "Member"("semesterId", "email");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-by-default for the Supabase Data API roles, per the policy set in
-- 20260602120000_enable_rls_public_tables. Prisma connects as the table owner
-- and is exempt from non-forced RLS, so app access is unaffected.
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
