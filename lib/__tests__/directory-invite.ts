// A UX review of four screens, each finding pinned.
//
// Directory: "Invite to Platform" was a button on every card not on SyteNav -
// twenty-two on the demo company's Subs tab. It is one control at the top and
// a row-menu item on the card. Workers was the one tab without a count, the
// tab strip cut "Inspectors 2" off on a phone, and the page called itself
// "Contacts Directory" under a sidebar entry called "Directory".
// Files: "All Files" wrapped onto two lines on a phone.
// Customers: "View Projects" and "View" on every card, two controls for one
// question.

import { ok, done, code } from './_helpers'
import { invitable, inviteBatchSummary } from '../directory-invite'

// ── the pure half ────────────────────────────────────────────────────────────
const people = [
  { id: '1', name: 'On it', contact_email: 'a@x.test', has_account: true },
  { id: '2', name: 'Asked', contact_email: 'b@x.test', has_account: false, invite_pending: true },
  { id: '3', name: 'Ready', contact_email: 'c@x.test', has_account: false },
  { id: '4', name: 'No address', contact_email: '  ', has_account: false },
  { id: '5', name: 'Asked just now', contact_email: 'e@x.test', has_account: false },
]
const r = invitable(people, ['5'])
ok(r.ready.map(c => c.id).join() === '3', 'the aggregate covers only people not on SyteNav and not yet asked')
ok(r.noEmail.map(c => c.id).join() === '4', '...and names the ones with nowhere to send it, rather than dropping them')

ok(inviteBatchSummary([{ id: 'a', name: 'A', status: 'sent' }]).tone === 'success', 'all sent is success')
const mixed = inviteBatchSummary([
  { id: 'a', name: 'A', status: 'sent' },
  { id: 'b', name: 'B', status: 'recorded', reason: 'SendGrid said no' },
  { id: 'c', name: 'C', status: 'failed', reason: 'That company is not in your directory.' },
])
ok(mixed.tone === 'warn' && mixed.problems.length === 2,
  'a batch where some did not go says so, and lists each - an email that did not send is not "sent"')
ok(inviteBatchSummary([{ id: 'c', name: 'C', status: 'failed' }]).tone === 'danger', 'none sent is a failure')

// ── the Directory ────────────────────────────────────────────────────────────
const dir = code('app/(dashboard)/directory/page.tsx')
ok(!/Invite to Platform/.test(dir), 'no card carries its own "Invite to Platform" button any more')
ok(/Invite \{toInvite\.length\} contact/.test(dir), 'ONE control at the top, saying how many it covers')
ok(/canInvite && toInvite\.length > 0/.test(dir), "...shown only to somebody the route would allow, and only when there is anybody left")
ok(/can\('directory', 'edit'\)/.test(dir), "...which is the route's own gate, directory: edit")
ok((dir.match(/audience: 'vendor'/g) ?? []).length === 1,
  'one request builder for both the card and the batch, so they cannot ask for different emails')
ok(/<RowMenu label=/.test(dir) && /openInvite\(company\)/.test(dir),
  "a single contact's invite lives in the card's row menu")
ok(/for \(const c of chosen\) \{\s*try \{/.test(dir),
  'the batch catches each invite on its own - one failure cannot abandon the rest')
ok(/invite_pending/.test(code('app/api/directory/route.ts')),
  'the route says who already has an invite out, so the count survives a reload')

ok(/<h1 className="text-2xl font-bold text-ink">Directory<\/h1>/.test(dir), 'the page is called what the sidebar calls it')
ok(!/count > 0 &&/.test(dir), 'every tab shows its count, zero included - Workers was the one without')
ok(/border-b border-line mb-5 overflow-x-auto scrollbar-hide scroll-fade/.test(dir),
  'the tab strip scrolls on a phone and fades to say so')

// ── Files ────────────────────────────────────────────────────────────────────
const files = code('app/(dashboard)/files/page.tsx')
ok(/border-b border-line overflow-x-auto scrollbar-hide scroll-fade/.test(files), 'the Files tab strip scrolls')
ok(/'shrink-0 whitespace-nowrap flex items-center gap-1\.5 px-4 py-2\.5/.test(files),
  '..."All Files" stays on one line')

// ── Customers ────────────────────────────────────────────────────────────────
const cust = code('app/(dashboard)/customers/page.tsx')
ok(!/View Projects/.test(cust) && !/setExpanded/.test(cust), 'the inline "View Projects" toggle is gone')
ok((cust.match(/href=\{`\/customers\/\$\{customer\.id\}`\}/g) ?? []).length === 1,
  '...leaving ONE way into a customer, their own page')

done()
