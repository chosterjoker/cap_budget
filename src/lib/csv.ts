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

export type MembershipRow = {
  name: string;
  email: string | null;
  classYear: number | null;
};

/**
 * Parses the club membership sheet.
 *
 * The Google Sheets export is *not* a single table — it puts one roster per
 * class year side by side, with a merged banner row above the headers:
 *
 *   Juniors (2028) ,               , Seniors (2027) ,
 *   Name           , Email Address , Name           , Email Address
 *   Abigail Jung   , aj3691@…      , Aaliyah Sayed  , as6787@…
 *
 * So we find the header row, split it into one group per "Name" column, and
 * read the class year from whatever banner cell sits above (or to the left of)
 * that group. A plain one-table CSV is just the single-group case, and an
 * explicit "Class Year" column inside a group wins over the banner.
 */
export function parseMembershipCsv(text: string): MembershipRow[] {
  const rows = parseCsv(text);

  const isName = (c: string) => /\bname\b/.test(c) && !/user|file/.test(c);
  const isEmail = (c: string) => /e-?mail/.test(c);
  const isYear = (c: string) => /class|year|grad/.test(c);

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim().toLowerCase());
    if (cells.some(isName) && cells.some(isEmail)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = rows[headerIdx].map((c) => c.trim().toLowerCase());
  const nameCols = header.map((c, i) => (isName(c) ? i : -1)).filter((i) => i >= 0);
  if (!nameCols.length) return [];

  // Each group runs from its "Name" column up to the next one.
  const groups = nameCols.map((start, g) => {
    const end = g + 1 < nameCols.length ? nameCols[g + 1] : header.length;
    const within = (pred: (c: string) => boolean) => {
      for (let i = start; i < end; i++) if (pred(header[i])) return i;
      return -1;
    };
    return { start, end, nameCol: start, emailCol: within(isEmail), yearCol: within(isYear) };
  });

  // Banner row above the headers, e.g. "Juniors (2028)". Sheets writes a merged
  // cell's value only into its first column, so scan leftwards from the group
  // start for the nearest non-empty label that still belongs to this group.
  const banner = headerIdx > 0 ? rows[headerIdx - 1] : [];
  const yearIn = (cell: string | undefined) => {
    const m = cell?.trim().match(/(20\d{2})/);
    return m ? Number(m[1]) : null;
  };
  const bannerYear = (group: (typeof groups)[number], gIdx: number) => {
    // Within the group's own columns first — that's where a merged banner cell
    // lands. Only the leftmost group may look further left, for the leading
    // empty columns Sheets likes to emit; anything left of that belongs to the
    // previous group.
    for (let i = group.start; i < group.end; i++) {
      const y = yearIn(banner[i]);
      if (y) return y;
    }
    if (gIdx === 0) {
      for (let i = group.start - 1; i >= 0; i--) {
        const y = yearIn(banner[i]);
        if (y) return y;
      }
    }
    return null;
  };
  const groupYears = groups.map(bannerYear);

  const out: MembershipRow[] = [];
  const seen = new Set<string>();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    groups.forEach((group, g) => {
      const name = row[group.nameCol]?.trim();
      if (!name) return;
      // A repeated header (each class year's block can restate it) is not data.
      if (isName(name.toLowerCase())) return;

      const rawEmail = group.emailCol >= 0 ? row[group.emailCol]?.trim() : "";
      const email = rawEmail ? rawEmail.toLowerCase() : null;

      const rawYear = group.yearCol >= 0 ? row[group.yearCol]?.trim() : "";
      const yearMatch = rawYear?.match(/(20\d{2})/);
      const classYear = yearMatch ? Number(yearMatch[1]) : groupYears[g];

      // Two blocks can list the same person; first occurrence wins.
      const key = email ?? `name:${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);

      out.push({ name, email, classYear });
    });
  }
  return out;
}
