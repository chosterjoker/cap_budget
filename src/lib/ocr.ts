export type ParsedReceipt = {
  amount?: number;
  date?: string;
  vendor?: string;
  description?: string;
  raw?: string;
};

const PROMPT = `You are a receipt parser. Read the receipt image and return ONLY a JSON object with these keys:
- "amount": the final grand total actually paid, as a number with no currency symbol (include tax and tip).
- "date": the purchase date as an ISO string "YYYY-MM-DD".
- "vendor": the store or merchant name.
- "description": a short human summary (max ~6 words) of what was bought, e.g. "Pizza and drinks" or "Cleaning supplies".
Omit any key you cannot confidently determine. Return only the JSON object, nothing else.`;

/** Send an image (data URL or public URL) to OpenAI Vision and parse the JSON. */
async function requestParse(imageUrl: string): Promise<ParsedReceipt | null> {
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
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content as string | undefined;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as ParsedReceipt;
    return normalize(parsed);
  } catch {
    return null;
  }
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
