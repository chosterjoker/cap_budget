# Budget & Tracking — Requirements

## Overview
Web app for Cap & Gown (Princeton) semester budget management, replacing Google Sheets + Notion.

## Users
- **Treasurer**: Full access — budgets, checks, approvals, deposits, bank reconciliation, settings, event management, CSV import
- **Officer**: Submit reimbursements (with receipts), view budget/dashboards, edit own pending reimbursements

## Auth
- Google OAuth restricted to `princeton.edu` (Princeton's IdP enforces CAS + Duo)
- Dev mode: Credentials provider when `AUTH_GOOGLE_ID` is empty

## Core Entities
- **Semester** — name, dates, totalBudget, `openingBankBalance` + `openingUndeposited` (carried over from previous), isActive
- **BudgetCategory** — name × allocated amount, scoped to semester
- **Week** — auto-generated every 7 days from semester start (Sunday-aligned); only `label` is editable
- **Event** — entries in the Social Calendar, optionally linked to a Week by date; `isInformational` for non-spending dates
- **Expense** — category × week × optional event, payment method
- **Check** — number/ref, description, amount, recipient, optional category + event, cleared status, `isCarryover` (prior-semester outstanding check — affects cash only, not the budget grid)
- **Reimbursement** — officer-submitted, receipt upload, status (PENDING/APPROVED/PAID), optional category + event, linked to settlement Check when paid
- **Deposit** — partial bank deposits
- **BankReconciliation** — point-in-time record of the *actual* bank-site balance, compared against the computed expected balance
- **VenmoIncome** — separate from checks, optional week + event name

## Budget math (P0 — important)
Budget spending per (category, week) is the **sum of**:
- `Expense` rows (direct), and
- `Reimbursement` rows (all statuses — PENDING, APPROVED, PAID — because a check will eventually settle them)

**No-double-count rule**: when a `Check` has linked reimbursement IDs (i.e. it's a *settlement* check), it does **not** also create an `Expense` row. The reimbursements themselves represent the spend; the check is the payment.

A check with a category but no linked reimbursements creates an `Expense` (standalone payment to a vendor).

**Carryover checks** (`isCarryover`) never create an `Expense` — they were a previous semester's spend. They draw down the computed cash position only, until manually cleared.

## Cash position (P0 — important)
Derived live from opening balances + ledgers, never stored as a snapshot:
- `Undeposited = openingUndeposited − Σ deposits` — funds in hand not yet at the bank
- `Expected bank balance = openingBankBalance + Σ deposits − Σ cleared checks`
- `Outstanding checks = Σ uncleared checks` (includes carryover checks)
- `True available cash = Expected bank balance − Outstanding checks`

`cleared` is toggled manually from the Check register after verifying on the bank site. A **BankReconciliation** records the actual bank-site balance for comparison against the expected balance.

## P0 Features
1. **Budget grid** — categories × weeks, color-coded, click cell to add expense
2. **Check register** — read-only rows + Edit modal (cleared toggle inside modal, not inline); filter by date range / category / event / method / status / search; column sort
3. **Reimbursements** — submit with receipt + optional category + optional event; treasurer approve → bundle approved into settlement Check; same Edit-modal pattern; filter by officer / category / event / status / date / search; column sort
4. **Deposits & bank balance** — running deposit log, Edit modal
5. **Cash position & bank reconciliation** — computed Undeposited / Expected bank balance / Outstanding checks / True available cash (on the Dashboard); treasurer records actual bank-site balance, app shows computed-vs-actual delta + history
6. **Dashboard** — budget stat cards + Cash Position cards + reconciliation panel + Spending by Category chart + Weekly Spending chart (adaptive `$X / $X.Xk / $XM` y-axis)
7. **Social Calendar (`/calendar`)** — events grouped by Week, treasurer can CSV-import / add / edit / delete; informational events filtered separately; each event shows its cumulative spend pulled from tagged Expenses + Reimbursements
8. **Role-based access** — treasurer-only routes / actions enforced by `requireTreasurer()` in actions; proxy guards page routes
9. **CSV import (Social Calendar)** — upserts by `(semester, date, name)`; re-uploading preserves existing rows that match
10. **Settings** — semester management (auto-generate weeks every 7 days from start date), category management, week label management, user role management

## P1 Features
- Venmo income tracking (separate ledger)
- **Receipt OCR** via OpenAI Vision (gated on `OPENAI_API_KEY`): when an officer attaches a receipt image, it's scanned client-side-on-upload and **pre-fills date / amount / description** for review before submitting. Raw parse is stored on the reimbursement (`parsedData`). Falls back to manual entry when unconfigured or unreadable.
- Semester transition (clone categories + labels from previous)
- CSV export (budget grid, checks, reimbursements)

## UI conventions
- **Edit-then-Save everywhere**: list/table rows are read-only. Sensitive fields (cleared status, reimbursement status) live inside the Edit modal; saving is one explicit click.
- **Filters + sort + search** on Checks and Reimbursements only; smaller managers (Deposits, Venmo, bank reconciliation) use simple tables.
- **Typography**: Bricolage Grotesque for headings, Inter for body, JetBrains Mono for monetary figures.
- **Currency**: full `$1,234.56` in tables; adaptive `$1.2k` shorthand in chart axes.

## Out of scope (for now)
- Per-event budget allocation (events are tracking buckets only)
- Manual week add/delete (weeks are deterministic from semester `startDate` + `endDate`)
- Multi-officer invite flow (officers self-create on first Google sign-in)
- Approval workflow notifications
