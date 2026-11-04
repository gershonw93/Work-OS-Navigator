// A SIGNED-IN USER MUST NOT BE ABLE TO WRITE THEIR OWN PROFILE FROM THE BROWSER.
//
// `actorForUser` (lib/server-permissions.ts) decides who a caller is from
// `profiles.role`, `company_id` and `permission_overrides`. Until migration 160
// the table carried a FOR ALL policy on `id = auth.uid()` and `authenticated`
// held UPDATE on every column, so one PATCH with the public anon key made
// anybody signed in an admin of any company they could name. Every write to
// `profiles` goes through a service-role route; the browser only reads its own
// row. Applied and verified live: an UPDATE as `authenticated` is refused
// with "permission denied for table profiles".

import { ok, done, read, code, walk, migrationFiles } from './_helpers'

const stripSql = (s: string) => s.replace(/--[^\n]*/g, '')
const m160 = stripSql(read('supabase/migrations/160_profiles_not_self_editable.sql'))

ok(/DROP POLICY IF EXISTS "Users can manage their profile" ON public\.profiles/.test(m160),
  '160 drops the self-edit policy')
ok(/DROP POLICY IF EXISTS "Allow profile insert on signup" ON public\.profiles/.test(m160),
  '160 drops the self-insert policy')
ok(/CREATE POLICY profiles_select_own ON public\.profiles\s+FOR SELECT TO authenticated\s+USING \(id = auth\.uid\(\)\)/.test(m160),
  '160 leaves the browser reading its own row only')
ok(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.profiles FROM anon, authenticated/.test(m160),
  '160 revokes writes from anon and authenticated')

// No LATER migration may hand the browser a way back in.
const later = migrationFiles()
  .filter(f => { const n = /^(\d+)_/.exec(f)?.[1]; return !!n && Number(n) > 160 })
const reopens = (sql: string) =>
  /GRANT[^;]*\b(INSERT|UPDATE|DELETE|ALL)\b[^;]*ON\s+(TABLE\s+)?(public\.)?profiles\b[^;]*\b(anon|authenticated|public)\b/i.test(sql) ||
  /CREATE POLICY[^;]*ON\s+(public\.)?profiles\b(?![^;]*FOR\s+SELECT)/i.test(sql)
// The scan must be able to see the fault before a clean run means anything.
ok(reopens('GRANT UPDATE ON public.profiles TO authenticated;'), 'scan sees a re-grant')
ok(reopens('CREATE POLICY p ON public.profiles FOR ALL USING (id = auth.uid());'), 'scan sees a write policy')
ok(!reopens(m160), 'scan passes 160 itself')
for (const f of later) {
  ok(!reopens(stripSql(read(`supabase/migrations/${f}`))), `${f} does not reopen profiles to the browser`)
}

// Nothing client-side writes profiles: those writes would now fail silently.
const writes = /\.from\(['"]profiles['"]\)\s*\.(update|insert|upsert|delete)\(/
ok(writes.test(`db.from('profiles').update({ role })`), 'write scan sees a write')
const clientFiles = [...walk('app'), ...walk('components'), ...walk('lib')]
  .filter(f => !f.includes('__tests__'))
  .filter(f => /^\s*['"]use client['"]/.test(read(f)))
const offenders = clientFiles.filter(f => writes.test(code(f)))
ok(clientFiles.length > 0 && offenders.length === 0,
  `no client component writes profiles${offenders.length ? ': ' + offenders.join(', ') : ''}`)

done()
