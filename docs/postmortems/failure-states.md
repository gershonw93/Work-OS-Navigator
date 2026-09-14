# Failure state post-mortems

Auth outcomes, loading vs failed, native dialogs, geolocation and time.

*Evidence for rules in [`CLAUDE.md`](../../CLAUDE.md). Every rule there that cites
this file is summarised to one line; the reasoning, the report that produced it and
the arithmetic live here. Read the matching section before arguing with a rule —
each one was written the day something shipped broken.*

---

## Loading and failure states
- **AND ONE LAYER DOWN IT IS NOT A BUTTON, IT IS THE SESSION.** Every gate in
  the app was `const { data: { user } } = await getUser(); if (!user)
  redirect('/login')`. `user` is null when nobody is signed in AND when the
  question could not be asked, the `error` beside it was dropped, and the
  answer to both was the login screen. Reported as "I'm having a hard time
  logging in now - it's blank or just loading forever", and the password was
  never wrong: `POST /auth/v1/token` 200, `GET /dashboard` **307 back to
  /login**, three times in ninety seconds, then the password reset page -
  twice. Supabase's auth server was answering `/user` in 2-4ms throughout; the
  502s and 504s came off the gateway in front of it and never reached it. The
  middleware's own comment claimed a timeout only meant "the convenience
  redirects do not fire - the page still renders", but `!user &&
  isProtectedRoute` IS one of those redirects, so the bound that was supposed
  to degrade gracefully signed people out instead. Three answers now
  (`lib/auth-outcome.ts`): a 4xx is a verdict about the token and may be
  believed; a 5xx, a status of 0, an `AuthRetryableFetchError` or a timeout is
  a failure to ask and says NOTHING. **When it says nothing, guess signed IN** -
  a wrong "signed in" is corrected by the page asking again a moment later,
  while a wrong "signed out" has already thrown away the only thing that could
  correct it. Middleware asks once and carries an `unknown` to the page; a
  layout asks twice (the blips are a few hundred ms in front of a 3ms server)
  and then renders `AuthUnavailable`, which says it is not your password,
  because the trace shows the reset page being opened twice.
- A permissions check that FAILED answers exactly like being denied - `can()`
  is `!!perms?.[r]?.[a]` and `perms` is null either way - so a bad minute of
  signal took the Upload button off the Plans tab with nothing to say why
  ("where do I upload files"). Seven screens still destructure only `can`, so
  the fact is announced ONCE for the session by `PermissionsBanner` in the
  dashboard chrome, beside `ViewAsBanner`. A screen may add "Checking access…"
  for the in-flight case, but the failure belongs to the session, not the page.
- A plan's bytes are fetched through `/api/projects/[id]/plans/[planId]/file`,
  never `plan.file_url` directly. pdf.js reads them in the BROWSER, so a file
  on another server is a cross-origin read - the demo rows point at w3.org,
  which allows none, and every plan failed on every device. The route signs
  `storage_path` fresh per request (a stored signed URL is only as good as the
  key that signed it) and streams anything else from our origin. The URL comes
  off the ROW, never the request.
- **A POSTGRES MESSAGE IS NOT A USER-FACING MESSAGE.** `null value in column
  "status" of relation "project_selections" violates not-null constraint` is
  every word true and none of it usable, and it reads as "the app is broken".
  `friendlyDbError` (`lib/db-error.ts`) names the FIELD; a route hands it back
  and `console.error`s the raw text so the log still has it. A route that ends
  `NextResponse.json({ error: error.message })` is one report away from putting
  that sentence in front of somebody choosing bathroom tile.
- **NEVER `alert()` or `confirm()` - and `confirm()` is the one that got proved.**
  Delete on a Directory contact did nothing three times and took the tab blank.
  Three hours of production logs after those three attempts: the DELETE endpoint
  had never been called ONCE, and there was no 5xx in the window - so the
  handler died before the fetch, on `window.confirm`. The evidence for this
  class of bug is an ABSENT request, which is why it reads as "the page died"
  rather than as an error. Both are now ratcheted at zero in
  `layout-overflow.ts`, with no exemption: `delete-guard.tsx` renamed its own
  local `confirm()` rather than being excused, and its `window.confirm` fallback
  is gone because the provider is mounted at the ROOT layout beside
  `NoticeProvider`. `useDeleteGuard` takes `title`/`body`/`confirmLabel`, so a
  confirmation that is NOT a delete - voiding an invoice, disconnecting
  QuickBooks, handing over ownership - has somewhere to go other than the
  native dialog.
- A FOREIGN KEY WITH NO `ON DELETE` RULE IS A DELETE THAT FAILS ON EXACTLY ONE
  ROW. `company_invites.company_id` had none, so a contact could be deleted
  right up until somebody invited them to the platform - which is why it looked
  contact-specific rather than broken. When adding a table that points at
  `companies`, decide CASCADE (the row is a fact about that company alone) or
  SET NULL (a record of work that outlives the attribution), and never leave it
  at the default.
- **NEVER `alert()` or `confirm()`.** In the native shell this app is a remote
  WKWebView, so a JS dialog is a native UIAlertController presented by the
  Capacitor bridge and WebKit BLOCKS THE JS THREAD until it is dismissed. One
  that fails to present - fired from a `blur` handler while the keyboard is
  dismissing, say - is a page that never runs another line, which from the
  outside is a crash. Two reports in a row said "it killed the page"; both were
  an ordinary 400 and 409 whose only output was `alert(...)`. Use
  `useNotice()` (`components/ui/notice.tsx`), mounted at the ROOT layout so the
  portal and share links are covered too. It is deliberately NOT an overlay: no
  `data-overlay`, `pointer-events: none` on the dock, sized off `--vv-h` so it
  is above the keyboard - a message about a field must leave you able to fix
  the field. `confirm()` already had its answer in `useDeleteGuard`; the 18
  handlers still calling the native one are in BACKLOG.md. Ratcheted at zero
  `alert` in `layout-overflow.ts`, with no exemption for `notice.tsx` itself.
- ONE EVENT, ONE EMAIL. `notify()` sends email as well as ringing the bell, so a
  route that has already emailed somebody itself must pass `inAppOnly: true` -
  inviting a sub who had an account sent them the quote request AND a generic
  notification about it. The bell is a different channel and is never the
  duplicate; a second letter is. Only a caller that KNOWS it emailed may set it,
  and where the send failed the notification email is the fallback.
- A ROUTE THAT COMPUTES A REASON MUST NOT BE THE ONLY PLACE IT EXISTS. The
  Directory invite answered 200 with `emailSent: false` and SendGrid's own
  words in `note`; the screen read neither and ticked "Invited", and the route
  logged nothing - so when an invite never arrived, the answer was recoverable
  from nowhere. Read it in the UI AND `console.error` it.
- ONE REQUEST MUST NOT CARRY TWO THINGS THAT CAN BE REFUSED SEPARATELY. "What
  they chose" sent the name and `status: 'chosen'` together; the route refuses
  an accepted status on a row with no budget line, BEFORE the update runs, so
  typing a choice threw the choice away with the status. Recording a fact is
  not the same act as accepting it. And ask the refusable question at the FIELD
  before sending (`missingFor` in the selections page uses the same
  `ACCEPTED_STATUSES` the route does): a server's answer can only ever arrive
  as a message about a whole request that did not happen.
- A loading state must have a WAY TO END. `setLoading(false)` as the last
  statement of an async function ends only on the happy path - use
  try/catch/finally, always.
- "Loading" and "failed" are different facts. Collapsing them into one falsy
  value is how a failed permissions call rendered a menu with four links and no
  explanation. Callers need `error` as well as `loading`.
- One Supabase server client per request (`lib/supabase/current-user.ts` caches
  the client, not only the answers). `server.ts` swallows cookie writes because
  a Server Component may not set them, so a second client can present a
  refresh token the first one just rotated away.

## Location and time

- **TWO COORDINATES ARE NEEDED FOR ONE COMPARISON, AND ONLY ONE OF THEM IS THE
  WORKER'S.** The punch route computed the geofence with
  `if (lat && lng && siteLat && siteLng) {...} else { flagged = true }`,
  commented "no GPS available" - so a worker whose phone gave a perfect fix was
  told "your location is unavailable" and had the punch flagged whenever the
  JOB had no coordinates. Reported as "clock in and out says no GPS, but I
  allowed location while using the app", and the row it wrote at that moment
  held `clock_in_lat 40.6701718866206`. The job's address was "1 Test Lane,
  Testville, NY 10001", which no geocoder resolves. A flag is a mark against
  the WORKER; this one was for an address only the office can fix.
  `lib/punch-location.ts` answers with four outcomes - `ok` / `far` / `no_fix`
  / `no_site` - stored on the row (`clock_in_fix`) so a review months later
  still knows which, and is the ONE place each sentence is written, because the
  punch response, the entry row and the review list each used to compose their
  own (which is how " · no GPS" came to print beside a stored latitude). When
  NEITHER is known it reports `no_fix`: the phone is the half the person
  holding it can act on.
- AND THE REASON THE PHONE GAVE IS PART OF THE ANSWER. Both punch screens had
  their own `getCurrentPosition(ok, () => resolve(null), …)` - so "location is
  off", "no fix indoors" and "ten seconds was not enough" were one value.
  `lib/geo-position.ts` is the one reader and keeps the `code`. It also asks
  TWICE: `enableHighAccuracy: true` with no `maximumAge` refuses a perfectly
  good fix from thirty seconds ago, which is exactly the request that runs out
  the clock in a building, so a failure is re-asked coarsely - except `denied`,
  which no second prompt can change.
- A RELATIVE TIME CARRIES THE ABSOLUTE ONE ON HOVER. A notification read "6d
  ago" minutes after it was created. `notifications.created_at` is
  `timestamptz DEFAULT now()`, `notify()` is the only writer and never sets it,
  and the arithmetic is shared - so the stored value and the rendering were both
  right, which leaves the READER's clock, and nothing server-side can see that.
  `absoluteTime` (`lib/time-ago.ts`) is on every relative time, so the next one
  answers itself in one hover. `timeAgo` is that module and only that module: a
  future timestamp prints the date rather than "just now", and four private
  copies had already drifted in the branch nobody looks at - past a week they
  printed three different things. `equipment/page.tsx` keeps its own on purpose
  ("today"/"yesterday", 30 days), which is different wording, not a copy.

