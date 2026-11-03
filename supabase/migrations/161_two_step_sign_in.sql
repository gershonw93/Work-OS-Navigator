-- 161: Two-step sign-in (an authenticator-app code after the password).
--
-- Supabase stamps each access token `aal1` (password) or `aal2` (password +
-- code). The app refuses `aal1` for anybody who turned two-step on - in every
-- API route (lib/verified-user.ts), middleware and the layouts. This file is
-- the SAME rule one layer down: the browser holds the public anon key, so a
-- password-only token could otherwise go straight to PostgREST and read
-- whatever the RLS policies allow. A RESTRICTIVE policy is ANDed with every
-- permissive one, so it can only ever take access away.

-- 1. The rule, once. SECURITY DEFINER because auth.mfa_factors is not readable
--    by `authenticated`; search_path pinned so nothing can shadow auth.*.
CREATE OR REPLACE FUNCTION public.two_step_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = auth.uid() AND f.status = 'verified'
      )
$$;
REVOKE ALL ON FUNCTION public.two_step_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.two_step_ok() TO authenticated;

-- 2. Every public table that has a permissive policy for the browser gets the
--    restrictive one beside it. Tables with RLS and NO policy are already
--    closed to the browser and need nothing. Re-runnable.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT DISTINCT tablename FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
      AND (roles && ARRAY['public', 'authenticated']::name[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS two_step_required ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY two_step_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.two_step_ok())) WITH CHECK ((SELECT public.two_step_ok()))', t);
  END LOOP;
END $$;

-- 3. Who has it on, for the platform console's user list. Service role only:
--    it names other people's accounts.
CREATE OR REPLACE FUNCTION public.two_step_users(user_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT f.user_id FROM auth.mfa_factors f
  WHERE f.user_id = ANY(user_ids) AND f.status = 'verified'
$$;
REVOKE ALL ON FUNCTION public.two_step_users(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.two_step_users(uuid[]) TO service_role;

-- 4. A reset is recorded with who did it and why. Somebody will ask, weeks
--    later, how their account lost its lock - same reason as
--    demo_notification_log and impersonation_log. SET NULL on both people: the
--    record has to outlive either account.
CREATE TABLE IF NOT EXISTS public.two_step_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email text NOT NULL,
  reset_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reset_by_email text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  factors_removed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.two_step_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.two_step_resets FROM anon, authenticated;
