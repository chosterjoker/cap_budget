import type { ParsedCheck } from "@/lib/ocr";

// A reimbursement that hasn't been paid yet, so a scanned check can settle it.
export type OpenReimbursement = {
  id: string;
  name: string;
  amount: number;
  memberName: string;
};

export const cents = (n: number) => Math.round(n * 100);

const nameWords = (s: string) =>
  s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Whether the payee read off a check is the member a reimbursement is owed to.
 * Handwriting and habit vary ("Alex Kim" vs "Alex J. Kim"), so it's enough for
 * every word of the shorter name to appear in the longer one. A lone first name
 * proves nothing, so single-word names have to match outright.
 */
export function sameMember(a: string, b: string) {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (!wa.length || !wb.length) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short.length === 1) return long.length === 1 && short[0] === long[0];
  return short.every((w) => long.includes(w));
}

/**
 * Guess which open reimbursements a scanned check pays. `null` means the payee
 * has none (so it's an ordinary payment); `[]` means they have some but the
 * amount doesn't single any out, so the treasurer picks. We only pre-select on
 * an exact amount: all of the payee's reimbursements together, else one alone.
 */
export function suggestReimbursements(
  p: ParsedCheck,
  open: OpenReimbursement[]
): string[] | null {
  const payee = p.recipientName;
  if (!payee) return null;
  const theirs = open.filter((r) => sameMember(r.memberName, payee));
  if (!theirs.length) return null;
  if (p.amount == null) return [];

  const target = cents(p.amount);
  if (theirs.reduce((s, r) => s + cents(r.amount), 0) === target) {
    return theirs.map((r) => r.id);
  }
  // `open` is newest-first, so among equal amounts take the longest-waiting one.
  const single = [...theirs].reverse().find((r) => cents(r.amount) === target);
  return single ? [single.id] : [];
}
