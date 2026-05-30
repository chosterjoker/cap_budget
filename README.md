# Budget & Tracking

Semester budget management for **Cap & Gown** — budgets, checks, reimbursements, deposits, reserves, and Venmo income in one place.

## Features

- **Dashboard** — budget utilization, charts, recent activity
- **Budget grid** — categories × weeks (like your Google Sheet)
- **Check register** — checks, wire transfers, credit card; cleared status
- **Reimbursements** — per-officer tabs, receipt upload, approval, bundle to check
- **Deposits** — partial bank deposits vs spent vs balance
- **Reserves** — undeposited / unused / owed snapshots
- **Venmo** — event income tracked separately
- **Settings** — new semesters (with carryover + clone), categories, roles
- **Export** — CSV for budget, checks, reimbursements
- **Receipt OCR** — optional OpenAI Vision parsing when `OPENAI_API_KEY` is set

## Quick start

```bash
npm install
cp .env.example .env   # if needed
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Dev login (no Google OAuth yet)

Leave `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` empty. Use **Dev sign in** with any `@gmail.com` email.

Set `INITIAL_TREASURER_EMAIL=you@gmail.com` in `.env` for treasurer access on first login.

### Production (Google OAuth)

1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/)
2. Set redirect URI: `{AUTH_URL}/api/auth/callback/google`
3. Add to `.env`:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
   - `AUTH_SECRET` (run `openssl rand -base64 32`)
   - `AUTH_URL` (your deployed URL)

### Database

- **Local**: SQLite (`DATABASE_URL="file:./dev.db"`) — default
- **Production**: PostgreSQL (e.g. Supabase) — change `provider` in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL`

## Deploy (Vercel)

1. Push to GitHub and import in Vercel
2. Add environment variables from `.env.example`
3. Run migrations against your production DB: `npx prisma migrate deploy`

## Tech stack

Next.js 16 · Prisma · NextAuth v5 · Tailwind · shadcn/ui · Recharts
