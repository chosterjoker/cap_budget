import type { BankCheckRow } from "@/lib/csv";

// A register date can trail the real one — a check entered late defaults to
// "today" — so its bank row may post a little *before* the recorded date.
// Anything older than this is an earlier check that happened to share the
// number, not this one.
const DATE_SLACK_MS = 60 * 24 * 60 * 60 * 1000;

export type RegisterCheck = {
  id: string;
  checkNumber: string;
  amount: number;
  date: Date;
  cleared: boolean;
};

export type BankDebit = { checkNumber: string; amount: number; postDate: Date };

export type ClearingReview = {
  check: RegisterCheck;
  // "amount": the bank paid this check number for a different amount.
  // "returned": the bank bounced it and it hasn't been paid since.
  // "number": nothing posted under this number, but a check one digit away paid
  //   the same amount and isn't in the register — likely a misread number.
  reason: "amount" | "returned" | "number";
  bankCheckNumber: string;
  bankAmount: number;
  bankDate: Date;
};

export type ClearingResult = {
  toClear: { check: RegisterCheck; postDate: Date }[];
  // Already marked cleared here *and* confirmed by the bank file.
  alreadyCleared: number;
  review: ClearingReview[];
  // Bank debits no register check accounts for.
  unmatched: BankDebit[];
};

const cents = (n: number) => Math.round(n * 100);

/** Same length, exactly one digit different — "2723" vs "2728". */
const oneDigitOff = (a: string, b: string) =>
  a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;

/** "#02740 " → "2740". Null for refs that aren't check numbers (e.g. "R-123456"). */
export function normalizeCheckNumber(raw: string | null | undefined): string | null {
  const digits = raw?.trim().replace(/^#\s*/, "") ?? "";
  if (!/^\d+$/.test(digits)) return null;
  return digits.replace(/^0+(?=\d)/, "");
}

/**
 * Cancels each bank "return" against the debit it reversed, leaving the debits
 * that actually stuck. A check that bounced and was later re-presented nets out
 * to one debit (the second); one that bounced for good nets out to none.
 */
function netReturns(rows: BankCheckRow[]) {
  const groups = new Map<string, BankCheckRow[]>();
  for (const row of rows) {
    const num = normalizeCheckNumber(row.checkNumber);
    if (!num) continue;
    const key = `${num}|${cents(row.amount)}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const debits: BankDebit[] = [];
  const returned: (BankDebit & { returnDate: Date })[] = [];
  for (const group of groups.values()) {
    // Oldest first; on a shared day the debit precedes the return that undoes it.
    group.sort(
      (a, b) =>
        a.postDate.getTime() - b.postDate.getTime() ||
        Number(a.kind === "return") - Number(b.kind === "return")
    );
    const open: BankDebit[] = [];
    for (const row of group) {
      const checkNumber = normalizeCheckNumber(row.checkNumber)!;
      if (row.kind === "debit") {
        open.push({ checkNumber, amount: row.amount, postDate: row.postDate });
      } else {
        const reversed = open.pop();
        if (reversed) returned.push({ ...reversed, returnDate: row.postDate });
      }
    }
    debits.push(...open);
  }
  return { debits, returned };
}

/**
 * Works out which register checks the bank file proves have cleared.
 *
 * Check numbers are NOT unique over time — the club runs several checkbooks and
 * the bank's history repeats numbers a year or so apart — so a number alone is
 * not a match. A check clears only when the number AND the amount agree, on a
 * bank row posted no earlier than the check could have been written. A number
 * that matches with a different amount is surfaced for review, never cleared.
 *
 * Each bank row (debit or bounce) is claimed by at most one register check, so
 * a check entered twice by mistake is not cleared — or flagged — twice off a
 * single bank event.
 *
 * The passes below run in order of certainty, and the order is load-bearing:
 * every check gets first refusal on its exact match before ANY guesswork runs.
 * Interleaving them let an older check with the wrong amount grab the debit a
 * later same-numbered check matched exactly, leaving the real one outstanding
 * with nothing on screen to say why.
 */
export function matchClearedChecks(
  register: RegisterCheck[],
  bankRows: BankCheckRow[]
): ClearingResult {
  const netted = netReturns(bankRows);
  // `claimed` = some register check already accounts for this bank row.
  const pool: (BankDebit & { claimed?: boolean })[] = netted.debits;
  const returned: ((typeof netted.returned)[number] & { claimed?: boolean })[] =
    netted.returned;

  const byNumber = new Map<string, typeof pool>();
  for (const d of pool) {
    const list = byNumber.get(d.checkNumber);
    if (list) list.push(d);
    else byNumber.set(d.checkNumber, [d]);
  }
  for (const list of byNumber.values()) {
    list.sort((a, b) => a.postDate.getTime() - b.postDate.getTime());
  }

  const result: ClearingResult = { toClear: [], alreadyCleared: 0, review: [], unmatched: [] };

  // Already-cleared checks claim their bank row first, so re-uploading the same
  // file never hands that row to a different check with the same number.
  const ordered = [...register]
    .sort(
      (a, b) =>
        Number(b.cleared) - Number(a.cleared) || a.date.getTime() - b.date.getTime()
    )
    .flatMap((check) => {
      const num = normalizeCheckNumber(check.checkNumber);
      return num
        ? [{ check, num, earliest: check.date.getTime() - DATE_SLACK_MS }]
        : [];
    });

  // Pass 1 — proof: same number, same amount, inside the date window.
  const unproven: typeof ordered = [];
  for (const entry of ordered) {
    const { check, num, earliest } = entry;
    const exact = (byNumber.get(num) ?? []).find(
      (d) =>
        !d.claimed &&
        d.postDate.getTime() >= earliest &&
        cents(d.amount) === cents(check.amount)
    );
    if (!exact) {
      unproven.push(entry);
      continue;
    }
    exact.claimed = true;
    if (check.cleared) result.alreadyCleared++;
    else result.toClear.push({ check, postDate: exact.postDate });
  }

  // Pass 2 — explanations for the rest, drawn only from rows pass 1 left over.
  const unexplained: typeof ordered = [];
  for (const entry of unproven) {
    const { check, num, earliest } = entry;

    const bounced = returned.find(
      (r) =>
        !r.claimed &&
        r.checkNumber === num &&
        cents(r.amount) === cents(check.amount) &&
        r.returnDate.getTime() >= earliest
    );
    if (bounced) {
      bounced.claimed = true;
      result.review.push({
        check,
        reason: "returned",
        bankCheckNumber: bounced.checkNumber,
        bankAmount: bounced.amount,
        bankDate: bounced.returnDate,
      });
      continue;
    }

    // Same number, different amount: a typo on one side or the other. Leave the
    // check alone and let the treasurer decide. (A check already cleared by hand
    // isn't second-guessed.)
    const mismatch = check.cleared
      ? undefined
      : (byNumber.get(num) ?? []).find(
          (d) => !d.claimed && d.postDate.getTime() >= earliest
        );
    if (mismatch) {
      mismatch.claimed = true;
      result.review.push({
        check,
        reason: "amount",
        bankCheckNumber: mismatch.checkNumber,
        bankAmount: mismatch.amount,
        bankDate: mismatch.postDate,
      });
      continue;
    }

    if (!check.cleared) unexplained.push(entry);
  }

  // Pass 3 — a hunch. Check numbers are mostly read off handwriting, so a single
  // wrong digit is the likeliest reason a check never finds its bank row. If a
  // still-open check and an unclaimed debit agree on the amount and differ by
  // one digit, point the treasurer at the pair — but never clear on a guess,
  // and stay quiet when more than one debit fits.
  for (const { check, num, earliest } of unexplained) {
    const near = pool.filter(
      (d) =>
        !d.claimed &&
        cents(d.amount) === cents(check.amount) &&
        oneDigitOff(d.checkNumber, num) &&
        d.postDate.getTime() >= earliest
    );
    if (near.length !== 1) continue;
    near[0].claimed = true;
    result.review.push({
      check,
      reason: "number",
      bankCheckNumber: near[0].checkNumber,
      bankAmount: near[0].amount,
      bankDate: near[0].postDate,
    });
  }

  for (const d of pool) {
    if (!d.claimed) {
      result.unmatched.push({ checkNumber: d.checkNumber, amount: d.amount, postDate: d.postDate });
    }
  }
  result.unmatched.sort((a, b) => b.postDate.getTime() - a.postDate.getTime());
  return result;
}
