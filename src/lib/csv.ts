export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

export type SocialCalendarRow = {
  date: Date;
  time: string | null;
  name: string;
  eventType: string | null;
  audience: string | null;
  notes: string | null;
};

function parseMdy(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, rawYy] = m;
  const yy = rawYy.length === 2 ? `20${rawYy}` : rawYy;
  const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}

export function parseSocialCalendarCsv(text: string): SocialCalendarRow[] {
  const rows = parseCsv(text);
  const out: SocialCalendarRow[] = [];

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map((c) => c.trim().toLowerCase());
    if (row.includes("date") && row.includes("event")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return out;

  const header = rows[headerIdx].map((c) => c.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col("date");
  const iTime = col("time");
  const iName = col("event");
  const iAudience = col("event type");

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawDate = row[iDate]?.trim();
    const rawName = row[iName]?.trim();
    if (!rawDate || !rawName) continue;
    const date = parseMdy(rawDate);
    if (!date) continue;
    const rawTime = row[iTime]?.trim() || "";
    const rawAudience = iAudience >= 0 ? row[iAudience]?.trim() || "" : "";
    const colonIdx = rawName.indexOf(":");
    const eventType = colonIdx > 0 ? rawName.slice(0, colonIdx).trim() : null;
    const isInformational =
      rawTime.toUpperCase() === "N/A" && rawAudience.toUpperCase() === "N/A";
    out.push({
      date,
      time: rawTime && rawTime.toUpperCase() !== "N/A" ? rawTime : null,
      name: rawName,
      eventType,
      audience: rawAudience && rawAudience.toUpperCase() !== "N/A" ? rawAudience : null,
      notes: null,
    });
    if (isInformational) out[out.length - 1].notes = "informational";
  }
  return out;
}
