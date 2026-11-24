// THE DISPATCH BOARD, DRAWN LIKE A DESK CALENDAR.
//
// Reported over the first board: "the screens are so ugly it hurts my eyes"
// and "make it look better maybe similar to google calendar". The board is now
// time running DOWN, a call a block whose height is how long it runs, and
// overlapping calls side by side. The arithmetic is pure (lib/dispatch-layout.ts)
// and every rule is here, including the ones where two plausible rules would
// disagree - a fixture where they agree cannot tell you which one you built.
//
// Also: the step buttons on a call (`offeredMoves`), the blank-name fallback
// (`personName`), and service calls on the Calendar.

import { ok, done, code } from './_helpers'
import {
  blockGeometry, timeAtOffset, lanes, snap, HOUR_PX, DAY_START_HOUR, DAY_END_HOUR, MIN_BLOCK_MINUTES,
  weekStart, hourLabel,
} from '../dispatch-layout'
import { offeredMoves, personName, isForward, moveLabel, punchWith } from '../service-calls'
import { calendarItems } from '../calendar-items'

const day = new Date(2026, 10, 25) // Wed Nov 25 2026, local
const at = (h: number, m = 0) => new Date(2026, 10, 25, h, m)

function main() {
  // ── geometry ──
  const nine = blockGeometry(at(9), at(10, 30), day)!
  ok(nine.top === (9 - DAY_START_HOUR) * HOUR_PX, `a 9:00 call starts ${(9 - DAY_START_HOUR)} hours down the board`)
  ok(nine.height === 1.5 * HOUR_PX, 'a 90-minute call is an hour and a half tall')
  ok(!nine.clipped, 'a call inside the board is not clipped')

  const noEnd = blockGeometry(at(9), null, day)!
  ok(noEnd.height === HOUR_PX, 'a call with no finish is drawn an hour long (DEFAULT_CALL_MINUTES)')

  const tiny = blockGeometry(at(9), at(9, 10), day)!
  ok(tiny.height === (MIN_BLOCK_MINUTES / 60) * HOUR_PX, 'a 10-minute call is drawn at the minimum height, so it can be read and grabbed')

  const early = blockGeometry(at(5), at(7), day)!
  ok(early.top === 0 && early.clipped, 'a call starting before the board is pinned to the top and marked clipped')
  const late = blockGeometry(at(20, 30), at(23), day)!
  ok(late.top + late.height === (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX && late.clipped, 'a call running past the board stops at the bottom, clipped')
  const veryLate = blockGeometry(at(22), at(23), day)!
  ok(veryLate.top + veryLate.height <= (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX && veryLate.height > 0, 'a call entirely after the board still shows, at the bottom')

  ok(blockGeometry(new Date(2026, 10, 26, 9), null, day) === null, 'a call on another day is not drawn on this one')
  ok(blockGeometry(new Date(2026, 10, 24, 23, 30), new Date(2026, 10, 25, 1), day) === null, 'a call that STARTED yesterday belongs to yesterday')

  // ── a point on the board is a time ──
  const t = timeAtOffset(day, 3 * HOUR_PX + 20) // 3h20m in -> 9:20 -> snaps 9:15
  ok(t.getHours() === 9 && t.getMinutes() === 15, `a drop 20 minutes into 9am snaps to 9:15 (got ${t.getHours()}:${t.getMinutes()})`)
  const t2 = timeAtOffset(day, 3 * HOUR_PX + 25) // 9:25 -> 9:30
  ok(t2.getHours() === 9 && t2.getMinutes() === 30, 'a drop 25 minutes in snaps UP to 9:30 - nearest, not floor')
  ok(timeAtOffset(day, -40).getHours() === DAY_START_HOUR, 'a drop above the board lands at the first hour')
  const bottom = timeAtOffset(day, 99_999)
  ok(bottom.getHours() < DAY_END_HOUR, 'a drop below the board lands inside it, never at closing time')
  ok(snap(7) === 0 && snap(8) === 15 && snap(52) === 45 && snap(53) === 60, 'snap rounds to the nearest quarter hour')

  // ── lanes ──
  const g = (id: string, h: number, len: number) => ({ id, ...blockGeometry(at(h), new Date(at(h).getTime() + len * 60_000), day)! })
  const solo = lanes([g('a', 9, 60)])
  ok(solo.get('a')!.lanes === 1, 'one call takes the full width')
  const pair = lanes([g('a', 9, 60), g('b', 9.5 as any, 60)].map(x => x))
  const ab = lanes([g('a', 9, 90), g('b', 10, 60)])
  ok(ab.get('a')!.lanes === 2 && ab.get('b')!.lanes === 2 && ab.get('a')!.lane !== ab.get('b')!.lane, 'two overlapping calls sit side by side')
  void pair
  const touching = lanes([g('a', 9, 60), g('b', 10, 60)])
  ok(touching.get('a')!.lanes === 1 && touching.get('b')!.lanes === 1, 'a 9-10 and a 10-11 TOUCH - each takes the full width (the double-booking rule agrees)')
  const chain = lanes([g('a', 9, 120), g('b', 9, 30), g('c', 10, 30), g('d', 13, 60)])
  ok(chain.get('b')!.lane === chain.get('c')!.lane, 'a lane freed by an earlier call is reused')
  ok(chain.get('a')!.lanes === 2 && chain.get('c')!.lanes === 2, 'a cluster uses as many lanes as it needs at its widest')
  ok(chain.get('d')!.lanes === 1, 'a call after the cluster ends starts a new cluster at full width')

  // ── small things ──
  ok(weekStart(new Date(2026, 10, 29)).getDate() === 23, 'a Sunday belongs to the week that started on Monday')
  ok(hourLabel(6) === '6 AM' && hourLabel(12) === '12 PM' && hourLabel(13) === '1 PM', 'hour labels read 6 AM, 12 PM, 1 PM')

  // ── the step buttons ──
  ok(!offeredMoves('new', false).includes('scheduled'), 'a NEW call never offers "Back to scheduled" - scheduled comes from somebody plus a time')
  ok(offeredMoves('en_route', false).includes('scheduled'), 'en route can still go back to scheduled')
  ok(offeredMoves('scheduled', false).includes('new'), 'the office can unschedule')
  ok(!offeredMoves('scheduled', true).includes('new'), 'crew cannot unschedule')
  ok(!offeredMoves('done', true).includes('invoiced'), 'crew never mark a call invoiced')
  ok(offeredMoves('invoiced', true).length === 0, 'crew do nothing to an invoiced call')

  // ── which way a step goes, and what it says ──
  ok(isForward('scheduled', 'en_route') && !isForward('on_site', 'en_route'), 'en route is FORWARD from scheduled and BACK from on site - decided by direction, not target')
  ok(moveLabel('scheduled', 'en_route') === 'On my way', 'forward to en route reads On my way')
  ok(moveLabel('on_site', 'en_route') === 'Back to en route', 'back to en route never reads On my way (it showed as the big green next step on site)')
  ok(moveLabel('on_site', 'done') === 'Mark done' && moveLabel('done', 'on_site') === 'Back to on site', 'done forward and back read differently')
  ok(punchWith('en_route', 'on_site') === 'in', 'Arrived clocks the assignee in')
  ok(punchWith('on_site', 'done') === 'out', 'Done clocks them out')
  ok(punchWith('done', 'on_site') === null && punchWith('scheduled', 'en_route') === null, 'no other step punches')
  const detailSrc = code('components/service-calls/call-detail.tsx')
  ok(/isForward\(from, m\)/.test(detailSrc) && !/const FORWARD = new Set/.test(detailSrc), 'the call page splits forward and back by isForward, not by a set of targets')
  ok(/d\.call\.assigned_to === me \? punchWith\(from, to\)/.test(detailSrc), 'the automatic punch is only for the person assigned')

  ok(/untimed=\{d\.time\.length === 0\}/.test(detailSrc) && /untimed && \(/.test(detailSrc), 'closing a call nobody clocked in on says so (and is still allowed)')
  ok(!/max-w-/.test(code('app/(dashboard)/service-calls/[callId]/page.tsx')), 'the call page uses the full width on a computer')

  // ── a name is never blank ──
  ok(personName({ full_name: '', email: 'sub2@x.com' }) === 'sub2@x.com', 'a blank name falls back to the address (it read as an empty option)')
  ok(personName({ full_name: '  ', email: null }) === 'Unnamed', 'no name and no address reads Unnamed, never blank')
  ok(personName({ full_name: 'Dana', email: 'd@x.com' }) === 'Dana', 'a real name wins')

  // ── service calls on the Calendar ──
  const scope = { schedule: true, tasks: true, inspections: true, projectIds: null, taskIds: null } as any
  const items = calendarItems({
    ownProjects: [], awarded: [], schedule: [], tasks: [], inspections: [], companyTaskIds: [], scope,
    calls: [
      { id: 'c1', call_number: 1, issue: 'No power', customer_name: 'Mrs Smith', status: 'scheduled', scheduled_start: '2026-11-26T01:30:00.000Z', scheduled_end: null },
      { id: 'c2', call_number: 2, issue: 'Unbooked', customer_name: 'X', status: 'new', scheduled_start: null, scheduled_end: null },
    ],
  })
  ok(items.length === 1 && items[0].kind === 'service_call', 'a booked call is on the calendar; an unbooked one is not')
  ok(items[0].at === '2026-11-26T01:30:00.000Z', 'the call carries its exact instant, so the BROWSER picks the day (8:30pm Eastern is the 26th in UTC)')
  ok(items[0].href === '/service-calls/c1' && items[0].title.startsWith('SC-0001'), 'it opens the call and reads SC-0001')

  const load = code('lib/calendar-load.ts')
  ok(/actorCan\(actor, 'service-calls', 'view'\)/.test(load) && /ownJobsRefusal/.test(load), 'the loader reads calls only for somebody who may see them, and never for a light account')
  ok(/isAssignedOnly\(actor\.role\)\) q = q\.eq\('assigned_to', profile\.id\)/.test(load), 'crew see only their own calls on the calendar')
  ok(/if \(error\)[\s\S]{0,160}return null/.test(load.slice(load.indexOf("from('service_calls')"))), 'a failed call read fails the calendar, never a shorter one')
  const page = code('app/(dashboard)/master-calendar/page.tsx')
  ok(/if \(it\.at\)[\s\S]{0,80}iso\(new Date\(it\.at\)\)/.test(page), 'the calendar page places a timed item on the reader\'s own day')
  const feed = code('app/api/calendar/[token]/route.ts')
  ok(/DTSTART:\$\{utc\(e\.at\)\}/.test(feed), 'the phone feed writes a call as a TIMED event in UTC, for the calendar app to localise')

  // ── the screens ask these ──
  const detail = code('components/service-calls/call-detail.tsx')
  ok(/offeredMoves\(/.test(detail) && !/MOVE_LABEL\[m\][\s\S]{0,40}d\.moves\.filter/.test(detail), 'the call page offers the buttons offeredMoves allows')
  const dialog = code('components/service-calls/new-call-dialog.tsx')
  ok(/<AddressAutocomplete/.test(dialog), 'a new call\'s address uses the same live address search as a project')
  const board = code('app/(dashboard)/dispatch/page.tsx')
  ok(/blockGeometry\(/.test(board) && /lanes\(/.test(board) && /timeAtOffset\(/.test(board), 'the board draws with the tested arithmetic')
  ok(/dragging\s*=\s*useRef/.test(board), 'the drag is a ref (a setState on drag start remounts the card being dragged)')

  done()
}

main()
