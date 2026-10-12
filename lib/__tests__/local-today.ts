// "Daily log and bulk-create pre-filled tomorrow's date (Oct 12) while it was
// still Oct 11 local."
//
// `new Date().toISOString().split('T')[0]` is TODAY IN UTC. For anybody west of
// Greenwich that is tomorrow from 8pm (EDT) onward; for anybody east of it, a
// local-midnight Date run through toISOString is YESTERDAY all day long. A form
// field is filled in by a person standing in their own day, so a browser asks
// `todayDateInput()` / `toDateInput()` (lib/dates.ts), which read the local
// calendar. Server routes are not in scope here - they have no "local".
//
// Before this fix seven client files did it; the daily-log page did it twice.

import { ok, done, read, walk } from './_helpers'
import { toDateInput } from '../dates'

const client = [...walk('app'), ...walk('components'), ...walk('lib')]
  .filter(f => !f.includes('__tests__'))
  .filter(f => /^\s*['"]use client['"]/.test(read(f)))

const offenders = client.filter(f => /\.toISOString\(\)\s*\.\s*(?:split\(\s*'T'\s*\)|slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\))/.test(read(f)))
ok(client.length > 100, `the scan reads the client components (${client.length} files)`)
ok(offenders.length === 0,
  `no client file turns a Date into YYYY-MM-DD through UTC${offenders.length ? ` - ${offenders.join(', ')}` : ''}`)

for (const f of ['app/(dashboard)/projects/[id]/daily-logs/page.tsx', 'components/projects/bulk-add-modal.tsx']) {
  ok(/todayDateInput\(\)/.test(read(f)), `${f.split('/').slice(-2).join('/')} defaults to the LOCAL today`)
}

// The arithmetic itself: 9pm on Oct 11 is still Oct 11, whatever UTC thinks.
ok(toDateInput(new Date(2026, 9, 11, 21, 30)) === '2026-10-11', 'a late-evening Date is still that day')
ok(toDateInput(new Date(2026, 9, 11, 0, 5)) === '2026-10-11', '...and so is just after midnight')

done()
