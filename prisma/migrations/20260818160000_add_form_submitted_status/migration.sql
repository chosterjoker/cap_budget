-- A member who has turned in the membership form but hasn't been billed yet.
-- Slotted between NOT_BILLED and BILLED so the Postgres enum keeps the same
-- "owes everything" → "owes nothing" order as the schema and
-- `MEMBERSHIP_STATUSES` in src/lib/membership.ts.

-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'FORM_SUBMITTED' BEFORE 'BILLED';
