# Derived state post-mortems

Stored facts that lie, defaults that claim, and buttons that promise.

*Evidence for rules in [`CLAUDE.md`](../../CLAUDE.md). Every rule there that cites
this file is summarised to one line; the reasoning, the report that produced it and
the arithmetic live here. Read the matching section before arguing with a rule —
each one was written the day something shipped broken.*

---

## Derived facts, not stored ones
- **A WHITELIST WITH A FIELD MISSING FAILS EXACTLY LIKE A REJECTION, and only
  one of them says so.** The task PATCH route listed the columns a body may
  write and the three assignment fields were not on it, so the edit form sent
  them, the route dropped them and answered **200** - assigning somebody to an
  existing task has never once worked, silently, while assigning at CREATE did
  (that is the POST, which writes them). A whitelist is still the right shape;
  when adding a field to a form, add it to the route's list in the same change.
- A TIMESTAMP THAT NOTHING WRITES IS A COLUMN THAT LIES BY OMISSION.
  `project_tasks.completed_at` existed from migration 046 and only the demo seed
  ever set it, so a finished task knew it was finished and not WHEN - leaving a
  completed card with only its DUE date to show, which it rendered as "6d
  overdue". It is derived from the status move in the route, never taken from
  the body: a client that could set it could date a task finished last year.
  `lib/task-due.ts` (`dueLabel`, pure and tested) is the one answer for what a
  date on a task says, and completed never returns overdue language.
- **Two controls must not answer one question.** A quote request asked for a
  package AND "who supplies the material", and three of the four packages ARE
  that answer - so a request could go out reading "Labor only" over
  "Subcontractor supplies material", which is two different jobs on one page.
  `materialByFor(pkg)` derives it and returns null for the one case that is
  genuinely open (measure & quote), which is the only case still asked. Picking
  a package writes the derived answer, and a stored template's pair is
  overridden by it, because a stored pair can disagree with itself.
- ONE COLUMN MUST NOT HOLD A WISH AND AN AGREEMENT. `inspections.scheduled_date`
  was written by the REQUEST form with the date the field wanted, and the card
  labelled it "Scheduled Date". So the guard on the one-click Scheduled pill -
  "you cannot be scheduled with no date" - was satisfied by the requester's own
  wish, and one tap turned a preference into a confirmed appointment nobody had
  arranged. Worse one layer out: the Master Calendar and the subscribed ICS feed
  include ANY inspection carrying a `scheduled_date`, whatever its status, so 14
  merely-requested rows were sitting in people's Outlook as booked. Two columns
  now (`requested_date`, `scheduled_date`), one labeller (`inspectionDate` -
  "Needed by" / "Confirmed for"), and the state that CLAIMS a booking has to
  carry its evidence: `scheduleProblem` demands `booked_with`, the same shape as
  failed-needs-a-reason. Moving back to requested CLEARS the booking, or the
  false appointment stays in the feed. Pinned in `inspection-booking.ts`.
- AND SAY WHAT THE APP DOES NOT DO. "Inspector got the notification - now what?"
  was a real report, and the answer was that no inspector was ever contacted:
  the notification goes to whoever books inspections at the company. A workflow
  that ends in a human picking up a phone has to SAY so on the screen, and then
  hand over the number - gathered from the permits and the Directory
  (`lib/inspection-contacts.ts`), never re-asked of the person in the field who
  does not know the township's scheduling line.
- A RULE THAT ONLY FIRES ON A STATUS MOVE DOES NOT COVER THE OTHER DOORS.
  `clearsCompletion` nulls `completed_date` when an inspection goes back to a
  waiting state - and the inspector's-card scan writes that column directly,
  asking about the RESULT separately. So declining "the card looks PASSED, mark
  it passed?" left a `requested` inspection reading "Completed Sep 24, 2026"
  under a Book it button: a record asserting it was both unbooked and finished.
  `canCarryCompletion` is the other half of the same rule and all three doors
  ask it (the scan, the PATCH route, the form). A date and the state it belongs
  to move together or neither moves - and the state's date comes off the
  PAPERWORK, not `todayDateInput()`, which is what the one resolving path used.
- COMPLIANCE STATUS IS DATE-DRIVEN: a date that has not run out means the
  document is current, whatever the row says, and a date that has passed means
  expired, whatever the row says. The stored status only speaks for a document
  with NO date (a W-9, an agreement). A live COI sitting at `pending` because
  nobody clicked Approve made a covered sub read as a problem.
- A status that is really a DATE must be computed from the date. Compliance and
  Permits each asked only "is it expiring soon", and soon was a window BEFORE
  the date (`diff > 0 && diff <= 30 days`) - so the day a certificate lapsed the
  warning went away and an expired COI read as Approved for ever. One answer,
  four states, tested: `lib/expiry.ts` (`expiryState`, `daysExpired`), anchored
  to LOCAL midnight so "expires today" is still good today.
- MONEY IN A TOTAL HAS TO BE ON A ROW OR NAMED. An approved change order that
  names neither a budget line nor a subcontract reached nothing and was silently
  dropped by the Budget page - $70,725 on one job - while the pay-app SOV had
  shown the same `unmapped` figure all along. `budgetTotals` takes it and reports
  it as `changes_unlinked`, beside `committed_unlinked` and `materials_unassigned`,
  and the "Not on a budget line" panel shows each with a way to file it. Any new
  rollup that can drop a row owes the screen the same two things: the total, and
  the list.
- A rule that exists on one door has to exist on the others. The order route
  refused a selection with no `selected_name` from the day it was written; the
  status dropdown and its PATCH beside it did not, so a selection reached
  "Chosen" with nothing chosen. `ACCEPTED_STATUSES` in `lib/selections.ts` is
  the one set both ask.
- **A SCREEN CALLED A CALENDAR THAT QUERIES ONE TABLE ANSWERS A NARROWER
  QUESTION THAN ITS NAME PROMISES, AND THE OMISSION IS INVISIBLE.** The project
  Schedule calendar drew `schedule_items` and nothing else - its route queried
  that table and `projects`, and the page had ZERO references to inspections or
  tasks - so a confirmed, booked inspection was simply not there. Reported
  twice, the second time with the card open beside it ("IT CLEARLY SAYS
  Confirmed for Sep 15 ... what am I missing here??"), because an empty square
  looks exactly like a free day and nothing errors. `lib/schedule-events.ts`
  (pure) merges the three kinds, and the CLICK FOLLOWS THE KIND: a bar opens the
  edit dialog, an inspection and a task go to their own tabs, because nothing in
  that dialog could save either and a control that opens an editor which cannot
  write is a control that lies. Timeline and List stay schedule-only for the
  same reason - they are the editor, not the view.
- **A DEADLINE WITH NO JOB BEHIND IT WARNS NOBODY.** "If the inspection date is
  approaching and it's not ready, who gets notified?" - nobody: the only
  scheduled work in the app was `/api/cron/compliance-reminders`, and
  `vercel.json` listed exactly that one path. Writing the route is half of it;
  a job nothing schedules never runs, so the pin reads `vercel.json` too. The
  gate column (`ready_reminder_sent_at`, like `reminder_sent_at` on a compliance
  doc) makes it fire once per BOOKING, not once per row - which means the PATCH
  route has to clear it whenever `scheduled_date` changes
  (`BOOKING_DERIVED_COLUMNS`), or moving a visit to next month carries a spent
  gate and the warning never comes again.
- A RETRACTION IS AN EVENT TOO. `ready_marked_by` was writable from the day it
  existed and nothing ever sent a null, so a wrong "ready" was permanent - and
  the notify block fires only when it is truthy while the history branch skips
  its generic entry whenever the column is in play, so undoing one would have
  left no trace anywhere. An audit trail that records a claim and not its
  withdrawal is half a record.
- A VIEW THAT GATHERS A DAY MUST BE OPENABLE BY THE PEOPLE LIVING IT. "Whoever
  is on the job site should see what's coming for that day" - and the Master
  Calendar, the only screen that gathers one, is `admin`/`manager` only, so a
  foreman, office staff, a worker or a sub could not open it. It is also a month
  grid with no "what is next", so even an admin had to know which square to look
  in: an inspection booked for the 15th was invisible on the 11th. `lib/today.ts`
  (pure) answers the day and `TodayStrip` shows it on the project Overview and
  My Jobs. A REQUESTED inspection appears there under its own kind - "needs
  booking" - never among the day's appointments, which is the same rule that
  took 14 unbooked ones out of everyone's Outlook.
- An activity feed row links to the record it is ABOUT (`lib/activity-href.ts`).
  All 34 event types linked to `/plans`; the tab is not derivable from the type
  string, so it is a table pinned against the icon table it mirrors.

## A button that claims to have done something
- **A `useState` DEFAULT ON A REQUIRED SELECT IS THE SAME CLAIM, AND IT DISARMS
  THE `required` BESIDE IT.** Add Permit and Request Inspection both accepted a
  fully blank submit and filed "Building / pending" and "Foundation" - names
  nobody typed, both of them `useState('Building')` / `useState('Foundation')`.
  So the records did not LOOK blank in a list, and the `required` already on
  both selects could never fire, because a select that starts on a value cannot
  fail constraint validation. A picker starts EMPTY with a `-- Select --`
  option. The blank inspection also NOTIFIED THREE SCHEDULERS, which is why the
  guard sits on the route as well as the form and runs BEFORE `notify`.
  Rules are pure and shared - `lib/permit-rules.ts` (`permitProblem`),
  `requestProblem` beside `scheduleProblem` in `lib/inspection-status.ts` - and
  a status that CLAIMS something must carry it: `approved`/`active`/`recorded`
  needs the permit number and issued date, the way `scheduled` needs a date.
  Pinned in `blank-records.ts`.
- **A DEFAULT IS A CLAIM.** `bid_invites.status` was `NOT NULL DEFAULT
  'invited'`, so a row asserted the sub had been told the moment it existed -
  while the route that created it sent no email at all. Everything downstream
  believed it: the badge read Invited, and `isReminder` (which reads that
  status) made the FIRST real email come out as "Still need your price", a chase
  for a request nobody had sent. A state that means "we did X" must be written
  by the code that does X, never by a column default. 'pending' is the state a
  row starts in; only a confirmed send moves it.
- Sending is what the send BUTTON does. `+ Invite` inserted a row and fired an
  in-app bell - and only to invitees who already had an account, which is why
  the directory path looked like it worked and the typed-in path looked broken.
  Both were broken. A verb on a button is a promise about what happens when it
  is pressed.
- ONE PRIMARY ACTION PER ROW, and the rest behind `RowMenu`
  (`components/ui/row-menu.tsx`). An invited sub carried Link, Email, Send and
  By hand - two of them copies, and the Send opened a panel containing another
  button with the same word on it. Where a second screen needs the same thing,
  the pattern becomes a component rather than a third copy: it was lifted out of
  `client-invoices.tsx`, which had grown one for the same reason.
- **A CONTROL THAT QUIETLY REDIRECTS IS WORSE THAN ONE THAT IS GONE.** When
  booking moved into its own dialog, the `Scheduled` pill stayed in the
  inspection card's status strip and was rerouted into that dialog. Reported
  immediately: "that pill is a second door to the same room - and if it still
  one-taps, the old bug is still alive." It did not one-tap, and that is not the
  point: a redirect teaches the old habit and is one refactor from being the bug
  again. When an action grows a real path, the old path is DELETED, and the pin
  reads the statuses a click can set rather than the classes on the buttons.
- A UNIQUE CONSTRAINT AND THE SEND SHIP TOGETHER. Duplicate invite rows were
  untidy while nothing sent; the moment the button really sends, the same double
  press is two identical emails to one sub.


## "Newest first" was a convention, and a convention is a claim

`lib/whats-new.ts` said it at the top - *Newest first; `date` drives the unread
badge in the sidebar, so keep it real* - and the badge took it at its word:

```ts
export const LATEST_RELEASE = RELEASES[0]?.date ?? ''
```

That held while one session shipped at a time. In a week where several did, the
top of the list read 09-15, 09-17, 09-17, 09-16, 09-16 - and today was the 15th.
Two separate faults, each enough on its own:

- **The order.** `RELEASES[0]` was not the newest, so `hasUnread` compared the
  reader's last-seen date against a release three entries down. Somebody up to
  date on the 17th would never be shown the 15th's entry; somebody who had seen
  nothing was badged about the wrong batch.
- **The dates.** Every one of those was written ahead of the commit that shipped
  it. #446, #448, #449 and #450 all landed on the 14th and announced themselves
  as the 16th and 17th; #430's entry said the 16th for a change that shipped on
  the 10th. A release dated in the future pins `LATEST_RELEASE` there, so
  everything that really ships in between is published already "read" - the
  badge is quietly off for days, which is the one thing this file exists to do.

Most of those wrong dates were written by the same agent that wrote the rule.
That is the point: a hand-maintained invariant is not kept by restating it, and
an instruction to sort a list is a worse version of sorting the list.

So the order is derived. Entries are authored into `AUTHORED` in whatever order
is convenient; `RELEASES` is a stable sort of it by date descending, and
`LATEST_RELEASE` still reads `[0]` - which is now a fact rather than a promise.
`lib/__tests__/whats-new-order.ts` fails on an out-of-order list and on any entry
dated after today, which is what found #430's. Same shape as the read time on a
guide: a stored "6 min read" is a claim that stops being true on the next edit.

## Copy is a spec, and it described a product that does not exist

The pricing page copy arrived finished - hero, three cards, FAQ, closing block -
and read like a page you could paste straight in. Four of its buttons said:

> **Start free trial** - 14 days. No card.

and three more offered:

> Poke around the live demo - No signup.

Neither exists. `/signup` renders `RequestAccessForm`: SyteNav is an invite-only
beta and the door is a waitlist, so a button carrying that verb opens something
else entirely. And the only thing in this repository called a demo is
`/api/dev/seed-demo`, which seeds a database.

This is the checklist bug - a step labelled "Share the portal" whose `href` was
the document-sending page - pointed at strangers instead of customers, on a
public page a search engine will index. The difference in blast radius is the
whole reason to check: an internal control that lies gets reported by a tester
in an afternoon; a marketing page that lies gets believed, and the person who
finds out is a prospect who has already decided you are careless.

Two further things the copy asserted that the product contradicted, neither of
them visible from the copy itself:

- **The prices.** `lib/plans.ts` existed *because* the website and Settings ->
  Billing had once disagreed about the tiers and the price; its header comment
  said prices were deliberately absent and would "arrive once, in this file".
  Publishing them anywhere else would have recreated the exact bug that file was
  written to end.
- **What they mean today.** The product is free while the beta is on. An
  unqualified "$199/month" printed inside a product nobody is being charged for
  is the $49 bug wearing a different hat, so `PRICING_STATUS` is one sentence,
  in one place, printed wherever a number is.

And the annual figures are arithmetic, not copy. "$82.50/month" and "Save $198 a
year" both fall out of the monthly price and the ten-months-for-twelve rule;
typed in, they are three numbers per tier that stop being true the first time a
price moves, in a file nobody re-reads. `annualTotal`, `annualPerMonth` and
`annualSaving` compute them, and the help article builds its price list from
`PLANS` for the same reason - help text is plain data with no compiler watching
it, which makes it the copy most likely to be quietly wrong.

### The test that could not fail, twice

Worth recording because it happened twice in the same file, in the same hour.

The first version of the no-false-promise check was `!/No card|no card required/`.
It passed. The built page was then rendered and grepped, and it *does* say "no
card" - lower-case, mid-sentence. The assertion had never been able to catch the
string it named, and only rendering the real HTML found that out.

The second version fixed the casing and asked whether "card" appeared within 120
characters of "trial". It went red immediately - on this sentence:

> There is no card on file and no trial clock running.

Which is the honest sentence, denying both claims at once. The check was
measuring adjacency when the rule is about ASSERTION: an offer is forbidden, a
denial is exactly what should be there.

The third version lists the affirmative phrases (`free trial`, `start your
trial`, `14-day`, `live demo`, `no signup`), red-checked one at a time, and is
paired with a positive assertion that the page still says "no card" and
"invite-only beta" - so the suite cannot be passed by deleting every mention of
what the beta costs. Three attempts to write down one rule, and only the last
one says what was actually meant.
