// ANYBODY CAN START DELETING THEIR ACCOUNT FROM INSIDE THE APP.
//
// THE BUG. Settings -> Danger Zone -> "Delete Company Account" sent DELETE to
// /api/settings, which has only ever exported GET and PATCH, so it answered
// "Failed to delete account" every time - and a non-admin had no control at
// all. Apple rule 5.1.1(v) requires one for everybody with a login, and the
// app was in review when this was found. Deletion is a REQUEST we carry out by
// hand; every surface says so from one sentence.

import { deletionProblem, deletionPromise, DELETION_DAYS, isDeletionScope } from '../account-deletion'
import { ok, done, code, read, exists, readCombined } from './_helpers'

// ── the rule ────────────────────────────────────────────────────────────────
ok(deletionProblem('self', false) === null, 'anybody may ask for their own login to go')
ok(deletionProblem('company', true) === null, 'an admin may ask for the whole company')
ok(!!deletionProblem('company', false), 'a non-admin may NOT ask for the whole company')
ok(!!deletionProblem('everything', true) && !isDeletionScope(undefined), 'an unknown scope is refused')
ok(deletionPromise('self').includes(String(DELETION_DAYS)) && deletionPromise('company').includes(String(DELETION_DAYS)),
  'the promise names the number of days, from one constant')

// ── the route ───────────────────────────────────────────────────────────────
const routePath = 'app/api/account/deletion-request/route.ts'
ok(exists(routePath), 'the route exists')
const route = code(routePath)
ok(/export async function POST/.test(route) && /export async function GET/.test(route), 'it records a request and reports an open one')
ok(/deletionProblem\(body\?\.scope, actorCan\(actor, 'settings_company', 'delete'\)\)/.test(route),
  'the ROUTE asks the company permission, not just the screen')
ok(!/requirePermission/.test(route),
  'NOT behind requirePermission - its billing lock would stop a lapsed account asking us to delete its data')
ok(/23505/.test(route), 'a second press is "already asked", not a second email to support')
ok(/sendEmail\(\{ to: SUPPORT_EMAIL/.test(route), 'support is told')
ok(/deletionRequestEmail\(/.test(route), 'the person gets a confirmation')

// ── the dead call is gone ───────────────────────────────────────────────────
const settings = code('app/(dashboard)/settings/page.tsx')
ok(!/fetch\('\/api\/settings',\s*\{\s*method: 'DELETE'/.test(settings), 'nothing sends DELETE to /api/settings any more')
ok(/<DeleteAccountCard scope="self" \/>/.test(settings), 'the Profile tab - which every role can open - offers it')
ok(/<DeleteAccountCard scope="company"/.test(settings), 'the Danger Zone offers the whole company')
ok(/<DeleteAccountCard scope="self" \/>/.test(code('app/field/me/page.tsx')), 'a field worker, who never sees Settings, has it on Me')

// ── the screen says request, and reads the one sentence ─────────────────────
const card = code('components/settings/delete-account-card.tsx')
ok(/deletionPromise\(scope\)/.test(card), 'the card reads deletionPromise rather than its own words')
ok(/'loading' \| 'ready' \| 'failed'/.test(card), 'checking, failed and none are three facts')
ok(!/window\.confirm|[^.]confirm\(/.test(card), 'it confirms through the delete guard, never a native dialog')

// ── the record ──────────────────────────────────────────────────────────────
const mig = read('supabase/migrations/124_account_deletion_requests.sql')
ok(/profile_id uuid REFERENCES profiles \(id\) ON DELETE SET NULL/.test(mig), 'the request outlives the account it deletes')
ok(/idx_account_deletion_open[\s\S]{0,120}WHERE status = 'open'/.test(mig), 'one open request per person per scope')
ok(/124_account_deletion_requests/.test(readCombined()), 'and it is in the combined file')

// ── the public page and Help agree ──────────────────────────────────────────
ok(/Settings &gt; Profile &gt; Delete my account/.test(read('app/(marketing)/delete-account/page.tsx')),
  '/delete-account names the in-app door')
ok(/slug: 'delete-account'/.test(read('lib/help/articles.ts')), 'Help has an article for it')

done()
