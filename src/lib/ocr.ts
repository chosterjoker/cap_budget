export type ParsedReceipt = {
  amount?: number;
  date?: string;
  vendor?: string;
  description?: string;
  raw?: string;
};

export type ParsedCheck = {
  checkNumber?: string;
  recipientName?: string;
  amount?: number;
  date?: string;
  memo?: string;
  // The reads of this check disagreed or came up short, so it needs a human look.
  needsReview?: boolean;
};

// One read of one check, before the reads are merged by check number.
type CheckRead = ParsedCheck & { selfConsistent: boolean };

type VisionOptions = {
  model: string;
  maxTokens: number;
  detail?: "high";
  reasoningEffort?: "medium";
};

const CHECK_MODEL = "gpt-5.5";
const VISION_TIMEOUT_MS = 50_000;
const MAX_CHECKS = 30;
const CHECK_READS = 3; // independent reads of the photo, voted on per check

const PROMPT = `You are a receipt parser. Read the receipt image and return ONLY a JSON object with these keys:
- "amount": the final grand total actually paid, as a number with no currency symbol (include tax and tip).
- "date": the purchase date as an ISO string "YYYY-MM-DD".
- "vendor": the store or merchant name.
- "description": a short human summary (max ~6 words) of what was bought, e.g. "Pizza and drinks" or "Cleaning supplies".
Omit any key you cannot confidently determine. Return only the JSON object, nothing else.`;

const CHECKS_PROMPT = `You are reading one photo of US bank checks laid out together, possibly a dozen or more, at any angle. Today is {{TODAY}}. Find every distinct physical check, including any lying apart from the rest, on top of other objects, or only partly filled in.

Return ONLY a JSON object of this exact shape:
{ "checks": [ { "checkNumber": "string", "recipientName": "string", "amountInWords": "string", "courtesyAmount": number, "date": "YYYY-MM-DD", "memo": "string" } ] }

Work through the checks one at a time and read each field off that check alone. Never copy a value from a neighbouring check, and never assume checks share an amount. Use null for a field you can't read, except where noted.

For each check:
- "checkNumber": the number printed in the top-right corner. It is often repeated at the bottom right; use that to confirm it. Do not guess from the numbers around it.
- "recipientName": the handwritten payee on the "Pay to the order of" line. Names are hard to read, so give your best guess rather than null, unless the line is empty.
- "amountInWords": the written-out amount on the long line above "Dollars", copied exactly as written, e.g. "Eighty seven and 00/100".
- "courtesyAmount": the number in the box after the "$", as a plain number with no "$" or commas.
- "date": the handwritten date, as "YYYY-MM-DD". Numeric dates are month/day/year. A two-digit year means 20YY, and checks are recent, so resolve an ambiguous year to the one closest to today.
- "memo": the "For" line, or null if it's empty.

The image may instead be a screenshot or photo of a table or list of checks (for example a spreadsheet, a bank page, or a chat message) rather than the checks themselves. If so, return one entry per row, copying each value exactly as shown, and ignore any row-counter column such as "#":
- "checkNumber": the check number column.
- "recipientName": the payee, without notes such as "(uncertain)" or "(unclear)". Drop a trailing "...".
- "courtesyAmount": the amount column. "amountInWords" is null unless the table has that text.
- "date" and "memo": only if the table has them.
Use null for a value marked "Unclear", "Unknown", "N/A" or similar, and still include the row.

Order entries by check number. If the image contains no checks, return { "checks": [] }. Return only the JSON object, nothing else.`;

/** Low-level: POST an image + prompt to OpenAI Vision, return the parsed JSON object. */
async function callVision(
  imageUrl: string,
  prompt: string,
  { model, maxTokens, detail, reasoningEffort }: VisionOptions
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl, detail } },
            ],
          },
        ],
        max_completion_tokens: maxTokens,
        reasoning_effort: reasoningEffort,
      }),
    });

    if (!res.ok) {
      console.error(
        `[ocr] OpenAI ${model} HTTP ${res.status}: ${await res
          .text()
          .catch(() => "<no body>")}`
      );
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content as string | undefined;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (err) {
    console.error("[ocr] vision request failed:", err);
    return null;
  }
}

/** Send an image (data URL or public URL) to OpenAI Vision and parse the receipt JSON. */
async function requestParse(imageUrl: string): Promise<ParsedReceipt | null> {
  // Printed receipts read fine on the cheaper model.
  const parsed = await callVision(imageUrl, PROMPT, { model: "gpt-4o-mini", maxTokens: 300 });
  if (!parsed) return null;
  return normalize(parsed as ParsedReceipt);
}

/** Coerce model output into clean types; drop fields that didn't parse. */
function normalize(parsed: ParsedReceipt): ParsedReceipt {
  const out: ParsedReceipt = {};
  if (parsed.amount != null) {
    const n =
      typeof parsed.amount === "number"
        ? parsed.amount
        : parseFloat(String(parsed.amount).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) out.amount = n;
  }
  if (typeof parsed.date === "string" && /\d{4}-\d{2}-\d{2}/.test(parsed.date)) {
    out.date = parsed.date.slice(0, 10);
  }
  if (typeof parsed.vendor === "string" && parsed.vendor.trim()) {
    out.vendor = parsed.vendor.trim();
  }
  if (typeof parsed.description === "string" && parsed.description.trim()) {
    out.description = parsed.description.trim();
  }
  return out;
}

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** "Eighty seven and 00/100" → 87. Null if any word isn't part of a number. */
export function amountFromWords(words: string): number | null {
  const text = words.toLowerCase().replace(/dollars?/g, " ");
  const cents = text.match(/(\d{1,2})\s*\/\s*100/);
  const dollarWords = text
    .replace(/\d{1,2}\s*\/\s*100/, " ")
    .replace(/\bno\b.*$/, " ")
    .split(/[^a-z]+/)
    .filter((w) => w && w !== "and");
  if (!dollarWords.length) return null;

  let total = 0;
  let group = 0;
  for (const word of dollarWords) {
    if (word === "hundred") group = (group || 1) * 100;
    else if (word === "thousand") {
      total += (group || 1) * 1000;
      group = 0;
    } else if (word in SMALL_NUMBERS) group += SMALL_NUMBERS[word];
    else return null;
  }
  return total + group + (cents ? parseInt(cents[1], 10) / 100 : 0);
}

/** A model reading more than a year from today is a misread year, not a real date. */
function plausibleCheckDate(date: string): boolean {
  const days = Math.abs(Date.now() - new Date(date).getTime()) / 86_400_000;
  return days <= 366;
}

/** Coerce one model-emitted check row into clean types; null if it's effectively blank. */
function normalizeCheckRead(raw: unknown): CheckRead | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: CheckRead = { selfConsistent: false };

  const courtesy =
    r.courtesyAmount == null
      ? null
      : typeof r.courtesyAmount === "number"
        ? r.courtesyAmount
        : parseFloat(String(r.courtesyAmount).replace(/[^0-9.]/g, ""));
  const written = typeof r.amountInWords === "string" ? amountFromWords(r.amountInWords) : null;
  // The written-out line is the legal amount, and is easier to tell apart in
  // handwriting than a lone digit — so it wins when the two differ.
  const amount = written ?? courtesy;
  if (amount != null && Number.isFinite(amount) && amount > 0) {
    out.amount = amount;
    out.selfConsistent = written != null && courtesy != null && written === courtesy;
  }
  if (typeof r.date === "string" && /\d{4}-\d{2}-\d{2}/.test(r.date)) {
    const date = r.date.slice(0, 10);
    if (plausibleCheckDate(date)) out.date = date;
  }
  if (typeof r.checkNumber === "string" && r.checkNumber.trim()) {
    out.checkNumber = r.checkNumber.trim();
  } else if (typeof r.checkNumber === "number") {
    out.checkNumber = String(r.checkNumber);
  }
  if (typeof r.recipientName === "string" && r.recipientName.trim()) {
    out.recipientName = r.recipientName.trim();
  }
  if (typeof r.memo === "string" && r.memo.trim()) {
    out.memo = r.memo.trim();
  }

  // Drop hallucinated/blank rows: a real check has at least an amount, a payee,
  // or a number.
  if (out.amount == null && !out.recipientName && !out.checkNumber) return null;
  return out;
}

/** The value most reads gave, with `weigh` breaking ties. Undefined if none did. */
function mostCommon<T>(
  reads: CheckRead[],
  pick: (r: CheckRead) => T | undefined,
  weigh: (r: CheckRead) => number = () => 1
): T | undefined {
  const scores = new Map<T, number>();
  for (const read of reads) {
    const value = pick(read);
    if (value !== undefined) scores.set(value, (scores.get(value) ?? 0) + weigh(read));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Combine every read of one check; reads whose two amounts agreed count double. */
function mergeReads(reads: CheckRead[]): ParsedCheck {
  const amount = mostCommon(
    reads,
    (r) => r.amount,
    (r) => (r.selfConsistent ? 2 : 1)
  );
  const out: ParsedCheck = {
    checkNumber: reads[0].checkNumber,
    recipientName: mostCommon(reads, (r) => r.recipientName),
    amount,
    date: mostCommon(reads, (r) => r.date),
    memo: mostCommon(reads, (r) => r.memo),
  };
  const backing = reads.filter((r) => r.amount === amount).length;
  if (amount == null || backing < reads.length) out.needsReview = true;
  return out;
}

/**
 * Group reads by check number and merge them, in check-number order. A number
 * most reads didn't see is flagged, since it may be a misread with no check
 * behind it. Numberless rows can't be lined up across reads, so they come from
 * one read only.
 */
export function mergeCheckReads(reads: CheckRead[][]): ParsedCheck[] {
  const byNumber = new Map<string, CheckRead[]>();
  for (const read of reads.flat()) {
    if (!read.checkNumber) continue;
    byNumber.set(read.checkNumber, [...(byNumber.get(read.checkNumber) ?? []), read]);
  }
  const numbered = [...byNumber.values()]
    .map((group) => {
      const merged = mergeReads(group);
      return group.length * 2 > reads.length ? merged : { ...merged, needsReview: true };
    })
    .sort((a, b) => Number(a.checkNumber) - Number(b.checkNumber));

  const numberless = reads
    .find((read) => read.some((r) => !r.checkNumber))
    ?.filter((r) => !r.checkNumber)
    .map((r) => ({ ...mergeReads([r]), needsReview: true }));
  return [...numbered, ...(numberless ?? [])];
}

/** Run the photo through the check prompt once. A failed read comes back empty. */
async function readChecks(imageUrl: string): Promise<CheckRead[]> {
  const today = new Date().toISOString().slice(0, 10);
  const parsed = await callVision(imageUrl, CHECKS_PROMPT.replace("{{TODAY}}", today), {
    model: CHECK_MODEL,
    maxTokens: 12000,
    detail: "high",
    reasoningEffort: "medium",
  });
  const rows = parsed?.checks;
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeCheckRead).filter((c): c is CheckRead => c !== null);
}

/**
 * Parse a receipt from raw file bytes by sending a base64 data URL. Works
 * without the file being publicly hosted — needed for interactive scanning
 * before upload, and for local-disk storage that OpenAI can't reach.
 */
export async function parseReceiptFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ParsedReceipt | null> {
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  return requestParse(dataUrl);
}

/**
 * Parse every check in a single photo (raw bytes → base64 data URL). A dozen
 * handwritten checks in one shot get only a couple hundred pixels each, and any
 * single read misreads some amounts, so the photo is read several times and the
 * reads are voted on per check. Returns [] when OCR is off or unreadable.
 */
export async function parseChecksFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ParsedCheck[]> {
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  const reads = await Promise.all(
    Array.from({ length: CHECK_READS }, () => readChecks(dataUrl))
  );
  return mergeCheckReads(reads).slice(0, MAX_CHECKS);
}

/** Parse a receipt from an already-hosted (publicly reachable) image URL. */
export async function parseReceiptFromImage(
  imageUrl: string
): Promise<ParsedReceipt | null> {
  const absoluteUrl = imageUrl.startsWith("http")
    ? imageUrl
    : `${process.env.AUTH_URL || "http://localhost:3000"}${imageUrl}`;
  return requestParse(absoluteUrl);
}

/** Whether receipt OCR is configured (used to gate the UI affordance). */
export function isOcrEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
