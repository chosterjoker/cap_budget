-- The treasurer can pay a member's reimbursement out of pocket, then settle
-- several of those with one check to themselves. FRONTED is the in-between
-- state: the member has been paid, the treasurer has not. Slotted before PAID
-- so the enum keeps its lifecycle order.

-- AlterEnum
ALTER TYPE "ReimbursementStatus" ADD VALUE 'FRONTED' BEFORE 'PAID';

-- AlterTable
ALTER TABLE "Reimbursement" ADD COLUMN "frontedById" TEXT,
ADD COLUMN "frontedAt" TIMESTAMP(3),
ADD COLUMN "frontedMethod" "PaymentMethod";

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_frontedById_fkey" FOREIGN KEY ("frontedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
