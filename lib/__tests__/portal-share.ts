// "I shared the client portal - this page is if you wanna send docs to someone,
// and the final 10/10 is to share a file? It's off."
//
// They had shared it. The job in the report, straight out of the database:
//
//   client_portal_token   set        <- the portal HAS been shared
//   file_shares           0          <- what the checklist step was counting
//
// The last setup step, "Give the client their link", was `file_shares > 0` -
// and `file_shares` is the SHARING TAB: sending this job's paperwork to an
// expeditor, an architect, a lender. A different feature, a different audience,
// a different table. So the only way to tick "give the client their link" was
// to send somebody a document, and a job whose portal really had been shared
// read "Not shared yet" for ever.
//
// A query against the wrong table comes back empty, and empty renders exactly
// like "you have not done this yet". Third time in this repo: `contacts` vs
// `companies`, `latitude` vs `lat`, and now this.
//
// The step's LINK was wrong for the same reason, and that is the half the
// reporter actually walked into: href was 'sharing', so pressing "Share the
// portal" landed them on the document-sending page. The portal share is a
// dialog in the project header and has no URL at all.
//
// AND THE FIX IS NOT "READ THE TOKEN INSTEAD". The share dialog MINTS a token
// when there is not one, on open - so `client_portal_token IS NOT NULL` is true
// the moment somebody looks at the box. That is a default claiming a thing was
// done, one table over from the `bid_invites.status` bug.

import { setupSteps, setupProgress, type SetupFacts } from '../job-setup'
import { ok, done, code } from './_helpers'

const BASE: SetupFacts = {
  hasAddress: true, hasContractType: true, hasClient: true,
  budgetLines: 23, plans: 10, teamMembers: 4, subcontracts: 3,
  complianceDocs: 6, scheduleItems: 15,
  portalShared: false, portalLinkExists: false,
  billingMode: 'simple', contractType: 'cost_plus',
}
const share = (f: SetupFacts) => setupSteps(f).find(s => s.key === 'share')!

// ── the three states, because two were not enough ───────────────────────────
ok(!share(BASE).done, 'a job nobody has shared is not done')
ok(share(BASE).detail === 'Not shared yet', '...and says so plainly')

// The reporter's job: a link exists, and it had been given to the client.
const shared = share({ ...BASE, portalLinkExists: true, portalShared: true })
ok(shared.done, 'THE REPORT: a portal that has been shared ticks the step')
ok(/Shared/.test(shared.detail), '...and the detail agrees with the tick')

// The middle state is real: the dialog mints a token on open, so a link can
// exist without anybody ever having been given it.
const minted = share({ ...BASE, portalLinkExists: true, portalShared: false })
ok(!minted.done,
  'A TOKEN IS NOT A SHARE: opening the dialog mints one, so its existence cannot tick the step')
ok(minted.detail !== 'Not shared yet',
  '...but it does not say "Not shared yet" either - somebody looking at a link they minted last week is being told something they can see is wrong')
ok(/link exists/i.test(minted.detail), '...it names what is actually true')

// ── the step's CTA has to open the right thing ──────────────────────────────
ok(share(BASE).href === null,
  "THE WRONG DOOR: the step no longer points at the Sharing tab - that is sending documents to an expeditor, not the client's portal")
ok(share(BASE).action === 'share-portal',
  '...it asks for the share dialog, which lives in the project header and has no URL')
for (const s of setupSteps(BASE)) {
  ok(!!s.href || !!s.action, `step "${s.key}" has somewhere to send you`)
  ok(!(s.href && s.action), `step "${s.key}" has ONE destination, not two that can disagree`)
}

// The count the user is reading off the chip.
const before = setupProgress({ ...BASE, portalLinkExists: true })
const after = setupProgress({ ...BASE, portalLinkExists: true, portalShared: true })
ok(before.done === 9 && after.done === 10,
  `sharing the portal is what moves 9/10 to 10/10 (${before.done} -> ${after.done})`)
ok(after.complete && !before.complete, '...and 10/10 is what finishes the checklist')

// ── the route that was asking the wrong table ───────────────────────────────
const route = code('app/api/projects/[id]/setup/route.ts')
ok(!/file_shares/.test(route),
  'THE WRONG TABLE: the setup route no longer counts file_shares for the client portal')
ok(/portalShared: !!p\.portal_shared_at/.test(route),
  '...it reads the column written by the code that actually hands the link over')
ok(/portalLinkExists: !!p\.client_portal_token/.test(route),
  '...and keeps "a link exists" as its own separate question')

// ── written by the code that does the thing, never by a default ─────────────
const send = code('app/api/projects/[id]/portal-token/send/route.ts')
ok(/portal_shared_at/.test(send), 'a confirmed email send records the share')
ok(send.indexOf('portal_shared_at') > send.indexOf('if (!result.sent)'),
  'AFTER the send, not before - a stamp written ahead of a send that fails claims something that did not happen')
ok(/console\.error/.test(send),
  'and a stamp that fails to write is logged rather than turning a delivered email into an error')

const copied = code('app/api/projects/[id]/portal-token/shared/route.ts')
ok(/portal_shared_how: 'copy'/.test(copied),
  'copying the link counts as sharing it - that is how most people do it, into a text or their own email')
ok(/client_portal_token/.test(copied) && /no share link on this job yet/.test(copied),
  '...but only when there is a link to have copied')

const mint = code('app/api/projects/[id]/portal-token/route.ts')
ok(!/portal_shared_at/.test(mint),
  'MINTING A TOKEN IS NOT SHARING IT: the route that creates the link must never stamp the share, or opening the dialog would tick the step')

// ── the screens ─────────────────────────────────────────────────────────────
const button = code('components/layout/share-portal-button.tsx')
ok(/portal-token\/shared/.test(button), 'the Copy button records the share')
ok(button.indexOf('portal-token/shared') > button.indexOf('clipboard.writeText'),
  '...after the clipboard write succeeded, not before it')
ok(/sytenav:share-portal/.test(button),
  'and the dialog can be opened by the checklist, which has no URL to link to')

const checklist = code('components/projects/setup-checklist.tsx')
ok(/fireAction\(/.test(checklist), 'a step with an action fires it instead of navigating')
ok(/sytenav:portal-shared/.test(checklist),
  'and the checklist re-reads itself when the share is recorded beside it - otherwise the step stays unticked and the share looks like it did not count')

done()
