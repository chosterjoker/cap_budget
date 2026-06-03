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
};

const PROMPT = `You are a receipt parser. Read the receipt image and return ONLY a JSON object with these keys:
- "amount": the final grand total actually paid, as a number with no currency symbol (include tax and tip).
- "date": the purchase date as an ISO string "YYYY-MM-DD".
- "vendor": the store or merchant name.
- "description": a short human summary (max ~6 words) of what was bought, e.g. "Pizza and drinks" or "Cleaning supplies".
Omit any key you cannot confidently determine. Return only the JSON object, nothing else.`;

const CHECKS_PROMPT = `You are reading a single photo that may contain MULTIPLE US bank checks laid out together (up to ~10). Identify every distinct physical check.

Return ONLY a JSON object of this exact shape:
{ "checks": [ { "checkNumber": "string", "recipientName": "string", "amount": number, "date": "YYYY-MM-DD", "memo": "string" } ] }

For each check:
- "checkNumber": the check number, usually printed in the top-right corner.
- "recipientName": the payee written on the "Pay to the order of" line (often handwritten).
- "amount": the dollar amount as a plain number, no "$" or commas. Read the numeric courtesy box and cross-check it against the written-out words; if they disagree, prefer the written words.
- "date": the date written on the check as "YYYY-MM-DD", only if legible.
- "memo": the memo / "for" line, if written.

Output one array entry per physical check, ordered top-to-bottom then left-to-right. Omit any single field you cannot read confidently, but still include the check. If the image contains no checks, return { "checks": [] }. Return only the JSON object, nothing else.`;

/** Low-level: POST an image + prompt to OpenAI Vision, return the parsed JSON object. */
async function callVision(
  imageUrl: string,
  prompt: string,
  model: string,
  maxTokens: number
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
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
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content as string | undefined;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Send an image (data URL or public URL) to OpenAI Vision and parse the receipt JSON. */
async function requestParse(imageUrl: string): Promise<ParsedReceipt | null> {
  // Printed receipts read fine on the cheaper model.
  const parsed = await callVision(imageUrl, PROMPT, "gpt-4o-mini", 300);
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

/** Coerce one model-emitted check row into clean types; null if it's effectively blank. */
function normalizeCheck(raw: unknown): ParsedCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: ParsedCheck = {};

  if (r.amount != null) {
    const n =
      typeof r.amount === "number"
        ? r.amount
        : parseFloat(String(r.amount).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) out.amount = n;
  }
  if (typeof r.date === "string" && /\d{4}-\d{2}-\d{2}/.test(r.date)) {
    out.date = r.date.slice(0, 10);
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
 * Parse every check in a single photo (raw bytes → base64 data URL). Uses the
 * stronger `gpt-4o` because checks are mostly handwriting (payee, amount, date),
 * which the mini model reads poorly. Returns [] when OCR is off or unreadable.
 */
export async function parseChecksFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ParsedCheck[]> {
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  const parsed = await callVision(dataUrl, CHECKS_PROMPT, "gpt-4o", 1500);
  const rows = parsed?.checks;
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeCheck)
    .filter((c): c is ParsedCheck => c !== null)
    .slice(0, 12);
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
