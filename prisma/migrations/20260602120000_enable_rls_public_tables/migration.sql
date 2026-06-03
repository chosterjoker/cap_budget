-- Enable Row-Level Security (RLS) on every table in the `public` schema.
--
-- WHY: Supabase exposes the entire `public` schema through its Data API
-- (PostgREST) to the project-wide `anon` / `authenticated` keys, which are
-- effectively public. Without RLS, anyone with the project URL + anon key can
-- read / edit / delete every row over REST. The Security Advisor flags this as
-- `rls_disabled_in_public` and `sensitive_columns_exposed` (the `Account` table
-- holds OAuth tokens, `Session` holds session tokens, `User` holds emails).
--
-- WHY THIS IS SAFE FOR THIS APP: no table is ever accessed through the Data
-- API. All table access goes through Prisma (connected as the `postgres` owner
-- role) and the only @supabase/supabase-js usage is Storage with the
-- service-role key. Both of those bypass RLS, so enabling RLS WITH NO POLICIES
-- means "deny-by-default for the API roles" while the app keeps full access.
--
-- IMPORTANT: we ENABLE (not FORCE) RLS. The table owner (`postgres`, used by
-- Prisma) is exempt from non-forced RLS, so migrations and queries keep working.
-- Using FORCE here would lock out Prisma as well.
--
-- NOTE: this covers every table that exists at migration time, including
-- `_prisma_migrations`. If you add a new Prisma model later, add an
-- `ALTER TABLE public."NewModel" ENABLE ROW LEVEL SECURITY;` in that model's
-- migration (or re-run this DO block).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
