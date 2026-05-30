# Architecture

Living doc for the non-obvious parts. Keep terse — code is the source of truth for *what*; this doc is for *why*.

## Stack
- Next.js 16 (App Router, Turbopack, **Proxy** convention — not "middleware")
- Prisma (SQLite dev, Postgres prod) — single `prisma/schema.prisma`
- NextAuth v5 — Google OAuth (production) or Credentials (dev fallback)
- Tailwind v4 + shadcn/ui on base-ui primitives
- Recharts for dashboard charts

## Auth
- `src/lib/auth.ts` — `hd: "princeton.edu"` param on Google OAuth filters at the IdP. `signIn` callback also enforces `ALLOWED_EMAIL_DOMAINS` as defense in depth.
- Session strategy is `database` when Google is configured (revocable), `jwt` in dev.
- `requireSession()` / `requireTreasurer()` are the only authz primitives — call them at the top of every action.

## Route guard
- `src/proxy.ts` (renamed from `middleware.ts` per Next 16) redirects unauthed → `/login`, blocks officers from `/settings`.
- Static assets and `/api/auth/*` are excluded via the `config.matcher` regex.

## Schema (Prisma)
- All entities scope to `Semester` (multi-tenant by semester).
- **Reimbursements** carry `categoryId` + `eventId` + `officerId` and a nullable `checkId` (the settlement check).
- **Checks** carry `categoryId` + `eventId` and a `reimbursements` back-relation. A check with reimbursements is a *settlement* and skips the Expense write.
- **Events** are unique on `(semesterId, date, name)` — this is the CSV upsert key. `isInformational` flags non-spending rows.
- **Weeks** are auto-generated from `semester.startDate` (Sunday-aligned via `previousSunday`), every 7 days, up to `endDate` or 16 weeks by default. Only `label` is human-editable.

## Budget math (the load-bearing part)

`getBudgetGridData(semesterId)` in `src/lib/budget-data.ts` builds a `(categoryId, weekId) → amount` map from two sources:

1. `Expense` rows (`weekId` is explicit on the row)
2. `Reimbursement` rows where `categoryId` is set (week is computed from `date` via `findWeekForDate`, which Sunday-aligns then matches the Week with the same Sunday)

All reimbursement statuses count, including PENDING — the rationale is "you'll eventually cut a check, so plan around it now."

**No-double-count invariant** — enforced in `src/actions/checks.ts::createCheck`:
- `isSettlement = data.reimbursementIds.length > 0`
- If settlement: link the reimbursements to the check + mark them PAID. *Do not write an Expense.*
- If not settlement: write an Expense if `categoryId` is set (vendor payment).

The Expense for a vendor payment lives forever; the reimbursement-side spend is the Reimbursement row itself. Either way, the budget grid sums each unit of spend exactly once.

Per-event spend lives in `getEventSpending(semesterId)` — same idea, grouped by `eventId` instead of `(categoryId, weekId)`.

## CSV import (Social Calendar)

`src/lib/csv.ts::parseSocialCalendarCsv` is hand-rolled (no dep) — it walks the rows looking for a header that contains "date" + "event", then reads `Date / Day of Week / Time / Event / Event Type` columns. It tolerates the Google Sheets leading-empty-columns shape.

The action `importSocialCalendarCsv` upserts each row by `(semesterId, date, name)`. Re-uploading a corrected sheet updates the matching events; manually-deleted events stay deleted unless their name+date matches a fresh row. Auto-links each event to a Week by date.

Known-type detection (`Club Night`, `WW Movie Night`, etc.) is by prefix match on the event name — not authoritative, just informational tags.

## Frontend conventions
- **Edit-then-Save**: list managers render rows as read-only; an Edit button opens a `Dialog` with a form containing all editable fields (including sensitive ones like `cleared`). No inline toggles.
- **Filters + sort + search**: implemented as `useMemo` chains over the in-page dataset (no server-side pagination yet — the semester scoping keeps row counts small). `SortHeader` is a local component in CheckManager / ReimbursementManager; if a third table needs it, lift to `src/components/ui/sort-header.tsx`.
- **Forms**: native HTML forms with `FormData` parsing, no react-hook-form. Server actions take a `Partial<>` for updates.

## Fonts
- Three Google fonts loaded in `src/app/layout.tsx`: Inter (`--font-sans`), Bricolage Grotesque (`--font-heading`), JetBrains Mono (`--font-mono`).
- The `font-heading` utility is applied globally to `h1–h4` via `globals.css @layer base`.
- If you change a font, also update the corresponding CSS var name in `globals.css @theme inline`.

## Things that bite
- Base-UI's `Select` `onValueChange` can emit `null` (when the user clears) — typed setters need a wrapper: `(v) => set(v ?? "all")`.
- `MenuPrimitive.GroupLabel` requires a `Menu.Group` ancestor. `DropdownMenuLabel` is a plain `div` for that reason — see `src/components/ui/dropdown-menu.tsx`.
- Prisma `User.emailVerified` is required by `@auth/prisma-adapter`. Don't remove it.
- The `Cap & Gown Spring 2026 Social Calendar - Sheet1.csv` has two empty leading columns from Google Sheets export. The parser handles this; if you change the CSV source, re-verify column detection still works.
