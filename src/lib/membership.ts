import type { MembershipStatus } from "@prisma/client";
import type { StatTone } from "@/components/common/stat-tile";

/**
 * Dues lifecycle, ordered "owes everything" → "owes nothing". This is the
 * order the status filter and the status sort both use, and it mirrors the
 * `MembershipStatus` enum in schema.prisma — keep the two in step.
 */
export const MEMBERSHIP_STATUSES: MembershipStatus[] = [
  "NOT_BILLED",
  "BILLED",
  "AWAITING_PAYMENT",
  "PAID_HALF",
  "PAID_FULL",
  "WAIVED",
];

export const MEMBERSHIP_LABELS: Record<MembershipStatus, string> = {
  NOT_BILLED: "Not billed",
  BILLED: "Billed",
  AWAITING_PAYMENT: "Waiting on payment",
  PAID_HALF: "Paid half",
  PAID_FULL: "Paid semester",
  WAIVED: "Waived",
};

/** Badge styling per status, using the semantic status tokens only. */
export const MEMBERSHIP_BADGE: Record<MembershipStatus, string> = {
  NOT_BILLED: "bg-muted text-muted-foreground",
  BILLED: "bg-muted text-muted-foreground",
  AWAITING_PAYMENT: "bg-warning-muted text-warning-fg",
  PAID_HALF: "bg-warning-muted text-warning-fg",
  PAID_FULL: "bg-success-muted text-success-fg",
  WAIVED: "bg-muted text-muted-foreground",
};

export function membershipStatusOrder(status: MembershipStatus) {
  return MEMBERSHIP_STATUSES.indexOf(status);
}

/**
 * What a member is expected to pay this semester. WAIVED members owe nothing;
 * everyone else owes the full semester rate — "paid half" describes what has
 * landed so far, not a reduced obligation.
 */
export function duesOwedFor(status: MembershipStatus, duesAmount: number) {
  return status === "WAIVED" ? 0 : duesAmount;
}

/**
 * The amount a status implies has been paid. Used only to pre-fill the amount
 * field when a treasurer changes status — the stored `amountPaid` is always
 * what counts, so a partial payment can be typed in exactly.
 */
export function impliedAmountPaid(status: MembershipStatus, duesAmount: number) {
  switch (status) {
    case "PAID_FULL":
      return duesAmount;
    case "PAID_HALF":
      return duesAmount / 2;
    default:
      return 0;
  }
}

export function collectionTone(collected: number, expected: number): StatTone {
  if (expected <= 0) return "default";
  const pct = collected / expected;
  if (pct >= 0.95) return "success";
  if (pct >= 0.5) return "warning";
  return "danger";
}

/** "'28" for a class year, or an em dash when the roster didn't carry one. */
export function formatClassYear(year: number | null) {
  return year == null ? "—" : `’${String(year).slice(-2)}`;
}
