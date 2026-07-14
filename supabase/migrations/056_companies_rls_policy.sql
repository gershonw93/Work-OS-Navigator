-- ===== 056_companies_rls_policy.sql =====
-- Security Advisor: "RLS Policy Always True" on public.companies.
--
-- The app authorizes everything in the API layer using the service-role key,
-- which bypasses RLS. Every other table keeps RLS enabled with NO policy, so
-- the public anon key sees zero rows (deny by default). The companies table had
-- a permissive USING(true) policy that opened it to anyone holding the anon key
-- via Supabase's auto REST API. This drops any permissive policies and replaces
-- them with a company-scoped read policy, matching the rest of the schema.

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Drop every existing policy on companies (names may vary, incl. dashboard-made).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON companies', pol.policyname);
  END LOOP;
END $$;

-- A signed-in user may read only their own company row. Writes stay off for the
-- anon/authenticated keys - all writes go through the service-role API layer.
CREATE POLICY "companies_select_own" ON companies
  FOR SELECT
  USING (id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
