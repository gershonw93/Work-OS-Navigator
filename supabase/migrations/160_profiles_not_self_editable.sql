-- 160: A signed-in user can no longer rewrite their own role or company.
--
-- `profiles` carried a policy "Users can manage their profile" (FOR ALL,
-- USING id = auth.uid(), no WITH CHECK) and `authenticated` held UPDATE on
-- every column. So anybody signed in could take the public anon key and their
-- own session and PATCH /rest/v1/profiles?id=eq.<self> with
-- {"role":"admin","company_id":"<any company>"} - and `actorForUser`
-- (lib/server-permissions.ts) reads exactly those columns to decide who a
-- caller is. One request, admin of somebody else's company on every route.
-- "Allow profile insert on signup" was the same hole for an account with no
-- profile yet (a portal client login): insert one, naming any company.
--
-- Nothing in the browser writes `profiles` - signup, invites, team edits and
-- the role editor all go through service-role routes. The browser keeps the
-- one thing it does use: reading its OWN row.

DROP POLICY IF EXISTS "Users can manage their profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow profile insert on signup" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
