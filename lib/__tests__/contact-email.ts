/**
 * THE ADDRESS THE APP INVENTED FOR SOMEBODY WHO HAS NONE.
 *
 * REPORTED in QA: a sub with no email address was listed on BOTH schedule
 * review screens as an emailable recipient - showing
 * "noemail+1790111215769@placeholder.com" - with no "no address on file"
 * warning. Pressing Notify would have recorded them as TOLD while the letter
 * went to a dead domain. A line with no sub AT ALL was correctly flagged
 * inline; only the no-address case was silent, which is the half that leaves
 * a false record rather than an error.
 *
 * WHY IT EXISTED: `companies.contact_email` is NOT NULL, so five separate
 * forms wrote `noemail+<timestamp>@placeholder.com` rather than leave it out.
 * It is a WELL-FORMED address, so `isEmailAddress` says yes - and that is the
 * function every screen was asking. 26 of 137 live company rows carry one; 4
 * of them are on a live subcontract.
 *
 * AND THE RULE ALREADY EXISTED ON EXACTLY ONE DOOR. The quote-award route had
 * `isEmailAddress(to) && !to.startsWith('noemail+')` written inline, which is
 * this repo's most expensive recurring shape: one door knows, the others do
 * not. `reachableEmail` is that rule with one home.
 */
import { ok, done, code, read, walk } from './_helpers'
import { isEmailAddress, isPlaceholderEmail, reachableEmail } from '../contact-email'

console.log('\n\x1b[1mcontact-email\x1b[0m')

const FAKE = 'noemail+1790111215769@placeholder.com'

// ── the reported address ────────────────────────────────────────────────────
{
  ok(isEmailAddress(FAKE) === true,
    'THE TRAP: the invented address IS well-formed, which is why every screen said yes')
  ok(isPlaceholderEmail(FAKE) === true, '...and it is recognised as invented')
  ok(reachableEmail(FAKE) === null,
    'THE FIX: it is not an address anybody can be reached at')
}

// ── a real address still works ──────────────────────────────────────────────
{
  ok(reachableEmail('paul@qatile.com') === 'paul@qatile.com', 'a real address comes back')
  ok(reachableEmail('  paul@qatile.com  ') === 'paul@qatile.com', '...trimmed')
  ok(isPlaceholderEmail('paul@qatile.com') === false, '...and is not mistaken for an invented one')
  // The word appearing inside a real address must not disqualify it.
  ok(reachableEmail('noemailmarketing@realco.com') === 'noemailmarketing@realco.com',
    'a real address that merely starts with those letters is still real')
}

// ── absent is absent ────────────────────────────────────────────────────────
{
  ok(reachableEmail('') === null, 'empty is no address')
  ok(reachableEmail(null) === null, 'null is no address')
  ok(reachableEmail(undefined) === null, 'undefined is no address')
  ok(reachableEmail('not an address') === null, 'a non-address is no address')
  ok(isPlaceholderEmail('') === false, 'blank is not "invented" - it is honestly empty')
}

// ── the domain half, whatever the local part ────────────────────────────────
{
  ok(isPlaceholderEmail('anything@placeholder.com') === true,
    'the placeholder DOMAIN is enough on its own - the local part has changed shape before')
  ok(reachableEmail('NoEmail+99@PLACEHOLDER.COM') === null, '...case does not rescue it')
}

// ── EVERY DOOR ASKS IT, not just the one that knew ──────────────────────────
{
  const doors = [
    'app/api/projects/[id]/schedule/unblocked/route.ts',
    'app/api/projects/[id]/schedule/[itemId]/cascade/route.ts',
    'app/api/projects/[id]/quotes/[compId]/award/route.ts',
    'app/(dashboard)/projects/[id]/schedule/page.tsx',
  ]
  for (const d of doors) {
    ok(/reachableEmail\(/.test(code(d)),
      `${d.split('/').slice(-2).join('/')} asks reachableEmail`)
  }
  ok(!/startsWith\('noemail\+'\)/.test(code('app/api/projects/[id]/quotes/[compId]/award/route.ts')),
    'THE ONE DOOR THAT KNEW no longer carries its own inline copy of the rule')
}

// ── the send itself refuses, for the rows already stored ────────────────────
{
  const email = code('lib/email.ts')
  ok(/isPlaceholderEmail\(email\.to\)/.test(email),
    'THE LAST GATE: sendEmail refuses an invented address rather than reporting it sent')
}

// ── NOTHING MINTS ONE ANY MORE ──────────────────────────────────────────────
{
  // The root cause, not the symptom. A value that is present and WRONG is
  // worse than one that is missing, and this one was minted in five places.
  const offenders: string[] = []
  for (const f of [...walk('app'), ...walk('components'), ...walk('lib')]) {
    if (f.includes('__tests__')) continue
    if (/`noemail\+\$\{/.test(code(f))) offenders.push(f)
  }
  ok(offenders.length === 0,
    `THE ROOT CAUSE: no form invents an address any more (found ${offenders.length}${offenders.length ? ': ' + offenders.join(', ') : ''})`)
}

// ── and the rows it already made are cleaned up ─────────────────────────────
{
  const sql = read('supabase/migrations/115_clear_invented_contact_emails.sql')
  ok(/UPDATE companies/i.test(sql) && /contact_email\s*=\s*''/.test(sql),
    'migration 115 clears the addresses the old behaviour already wrote')
  ok(/ILIKE 'noemail\+%@placeholder\.com'/i.test(sql),
    '...matching the exact shape the forms produced, never a real address that mentions the word')
}

done()
