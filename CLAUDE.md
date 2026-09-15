# SyteNav - working agreement

Most rules here were written the day something shipped broken. The incident that
produced each one - the report, the arithmetic, the wrong column - lives in
`docs/postmortems/` and is linked from the rule.

**A rule is not weaker because its story is in another file.** If one looks
arbitrary, expensive, or like it does not apply to your case, read its
post-mortem before working around it: the case you think is an exception is
usually the one that produced the rule.

| Post-mortem | Covers |
| --- | --- |
| [data-access](docs/postmortems/data-access.md) | Wrong column, wrong table, wrong key, stale coordinates |
| [layout](docs/postmortems/layout.md) | App shell, overlays, safe areas, the `--vv-h` saga |
| [mobile](docs/postmortems/mobile.md) | Phone look, unreachable controls, menus and pickers |
| [derived-state](docs/postmortems/derived-state.md) | Facts that lie, defaults that claim, buttons that promise |
| [failure-states](docs/postmortems/failure-states.md) | Auth, loading vs failed, native dialogs, geolocation, time |
| [integrations](docs/postmortems/integrations.md) | QuickBooks, the two registries, invite emails |

New rule? The imperative goes here, the story goes there, and they link to each
other. See `docs/postmortems/README.md`.

## Ship workflow (IMPORTANT)
When work is done: **build → commit → push → merge to `main` → fast-forward the
production branch.** Do NOT ask the user to merge or deploy.
- Work on a `claude/*` branch, then open/merge a PR into `main` via the GitHub MCP tools.
- **Vercel's production branch is `claude/admiring-bohr-DyFVR`, NOT `main`.** Builds
  off `main` are previews only. After merging, fast-forward it or nothing ships:
  `git push origin origin/main:refs/heads/claude/admiring-bohr-DyFVR`
  (Changing this is one setting: Vercel → project → Git → Production Branch.)
- Migrations are applied directly via the Supabase MCP (`apply_migration`) as
  part of shipping - the user does NOT paste SQL by hand. Verify the schema
  landed, then say what ran. Don't nag about deploy.

## Migrations and reading data (IMPORTANT)
Full detail: [`docs/postmortems/data-access.md`](docs/postmortems/data-access.md).
- Numbered files in `supabase/migrations/`. Apply them with the Supabase MCP
  (`apply_migration`, project `rxdqmetqvfninvaqymyl` - "Work OS Navigator").
- Combined, idempotent SQL is still kept current at
  `supabase/migrations/_combined_008-106.sql` (bump the suffix as you add
  migrations) as the fallback for a fresh environment.
- **Verify every column you `.select()` actually exists.** Supabase returns
  `data: null` for an unknown column, so a typo reads as "not found" rather than
  as an error. `projects` has `client`, NOT `client_name`, and has no
  `client_email` at all (the address is on `customers`).
- **Verify the KEY you read back, too** - the wrong key is `undefined`, which a
  truthiness guard swallows. `??` chaining two guesses is the tell: nobody
  chains a fallback for a key they have read. If two places read one endpoint,
  give them ONE reader (`lib/use-client-email.ts`, `lib/compliance-report.ts`),
  and let it take the route's own key names as its argument names.
- **Verify the TABLE, not just the column.** A query against the wrong table
  returns `[]`, which renders exactly like "you have not added any". Directory
  contacts live in `companies` (`type = 'inspector'`), NOT in `contacts`, and
  the address column there is `contact_email`, not `email`. Pinned in
  `contact-picker.ts`. AND AGAIN: the setup checklist's "Give the client their
  link" counted `file_shares`, which is the Sharing TAB - paperwork sent to an
  expeditor or a lender, a different feature entirely - so a shared portal read
  "Not shared yet" for ever and the only way to tick it was to send somebody a
  document. Two names near each other is the smell; ask what WRITES the table
  before you count it. Pinned in `portal-share.ts`.
- **One fact, ONE home.** A second column holding the same fact is not a typo
  you can grep for: both names exist, both compile, and the one you pick decides
  whether the feature has ever worked. Project coordinates are
  `lat`/`lng`/`geocoded_address`, never `latitude`/`longitude` (dropped in 105);
  `lib/project-site.ts` is the one reader.
- **A value that is present and WRONG is worse than one that is missing.**
  `projectSite()` returns `coords: null` for a STALE pin as well as an absent
  one, because a caller handed a number WILL measure against it. Same rule going
  in: `lib/geocode-match.ts` refuses a question too vague to have one answer,
  and refuses an answer whose state or ZIP contradicts the address.
- **A CONTROL THAT LEADS SOMEWHERE MUST LEAD TO THE THING IT NAMES.** The same
  step's `href` was `sharing`, so "Share the portal" opened the document-sending
  page - reported in the same breath as the count being wrong. The client portal
  is a DIALOG in the project header with no URL, so a step can carry an `action`
  instead of an `href` (never both, pinned), and the drawer fires it.
- **A type that describes no table is checked by nothing.** An interface written
  from memory compiles perfectly and is wrong at runtime - check its fields
  against the migration, the same as for a `.select()`.
- **`.order()` IS A COLUMN NAME TOO, and it takes the whole query down with it.**
  `/financials` ordered `payment_schedule_items` by `due_date`, a column that
  table has never had. PostgREST refuses the ENTIRE query for an unknown sort
  key, so `data` came back null, the `?? []` swallowed it, and every caller got
  an empty payment schedule with 211 rows sitting in the table. Same failure as
  a mistyped `.select()`, one method along: it reads as "there aren't any",
  never as an error. Keep the `error` and `console.error` it - a refused query
  that nobody logs is indistinguishable from an empty one. Pinned in
  `invoices-load.ts`.

## What's new (KEEP CURRENT)
- User-facing release notes live in `lib/whats-new.ts`, shown at `/whats-new`.
- IMPORTANT: when you ship something a user would NOTICE, add an entry in the
  SAME change. Internal refactors and build fixes do not belong there.
- **THE ORDER IS DERIVED, AND THE DATE IS THE COMMIT'S.** Entries are authored
  into `AUTHORED` in any order; `RELEASES` is the sorted view and `LATEST_RELEASE`
  reads `[0]` off that. "Newest first" as a convention lasted exactly as long as
  one session shipping at a time: four entries dated two days into the FUTURE sat
  above older ones, so the badge compared against the wrong date and a real entry
  could publish already "read". `date` is the day the change actually ships -
  check `git log` rather than guessing. Pinned in `whats-new-order.ts`, which
  fails on an out-of-order list AND on any entry dated after today.

## Help Center (KEEP CURRENT)
- User-facing support articles live in `lib/help/articles.ts`, shown at `/help`.
- IMPORTANT: whenever you add or change a feature/flow, update the matching
  article (or add a new one) in the SAME change so Help never drifts from the app.
- Search is client-side; keep each article's `keywords` list rich so it's findable.

## Guides, the public article library (KEEP CURRENT)
- Marketing articles live in `lib/guides/` - one file per article under
  `articles/`, listed once in `index.ts` - and are rendered at `/guides` by ONE
  template. The page holds no copy.
- A NEW GUIDE IS ONE IMPORT AND ONE ENTRY. The sitemap, the breadcrumb trail
  and the index all derive from `GUIDES`; a page nobody told a search engine
  about is the failure `/workflow` already demonstrated.
- `lib/hosts.ts` is the one thing that does NOT derive from the registry - it is
  imported by middleware, which runs on the edge, and would carry every article
  body. It matches the `/guides` prefix instead, and `lib/__tests__/guides.ts`
  pins the two together.
- Every guide ends by saying WHAT SYTENAV DOES NOT DO. When a feature lands that
  changes one of those answers, fix the guide in the SAME change - the same rule
  as the Help Center and the product brief, and for the same reason.
- Read time, the contents list and heading anchors are DERIVED (`schema.ts`).
  A stored "6 min read" is a claim that stops being true on the next edit.
- **AN INLINE LINK IS A PHRASE PLUS AN HREF, DECLARED BESIDE THE BODY** (`links`
  on a guide, applied by `linkify`). A block stays a plain string, so nobody has
  to trust HTML in the data. THE FAILURE: a phrase that does not match the prose
  EXACTLY links nothing, silently - the page renders perfectly, minus the link.
  The pin asserts every declared phrase occurs EXACTLY ONCE in its guide, which
  is what catches both a typo and an ambiguous anchor. It has caught one of each
  already.
- **AND IT IS CHECKED AGAINST WHAT THE RENDERER LINKIFIES, NOT THE WHOLE PAGE.**
  Every prose block goes through `Prose` - paragraphs, lists, steps, callouts,
  comparison columns, checklists - plus the FAQ answers, which the PAGE renders
  rather than the body. Headings are excluded on purpose (an h2 is an anchor
  target and a contents entry). `linkableText()` is that set and the pin reads
  it: five cross-links landed in comparison columns, checklists and FAQ answers
  while those three rendered plain text, and a check against "is the phrase in
  the text" passes for every one of them.
- **A CROSS-LINK POINTS AT A GUIDE THAT EXISTS, AND NEVER AT ITSELF.** A dead
  `/guides/...` link is a 404 served from inside our own prose - the same
  failure `related` is checked for, one field over.
- **THREE PAGES SHARE THE CHANGE-ORDER SUBJECT AND SPLIT IT BY INTENT**:
  `how-to-track-change-orders` owns the PROCESS,
  `change-order-management-software` owns BUYING (GC-side), and
  `change-order-documentation` owns the EVIDENCE. They necessarily repeat the
  four leak points and the money-flow model, so the split is only real if each
  links to both others and the anchor text names the other page's job - never
  "learn more". Pinned both ways, along with their descriptions being distinct.
  Deliberately NOT merged or 301'd: one URL cannot hold three intents.
- **THE H1 AND THE `<title>` BOTH CARRY THE TARGET PHRASE**, or the page is
  written for a phrase nobody is searching. An H1 may be long because of that,
  so a card and a breadcrumb print `cardTitle` instead - one short name, capped,
  asked for by `cardLabel()`.
- **A PERSON IS THE AUTHOR, NOT THE ORGANISATION.** `lib/guides/author.ts` is
  the one home for that fact: the byline a reader sees and the Person node in
  the Article JSON-LD are built from it, so the page and the markup cannot name
  different authors. The Organization stays the publisher.
- `dateModified` is CONTENT DATA (`updated ?? published`), never `new Date()`.
  A build-time date restamps all ten articles on every deploy and tells a
  crawler the library was rewritten because a dependency changed.
- A factual claim about another product carries a LINK TO ITS OWN SOURCE and is
  worded as what that source says. If the source cannot be checked, the claim
  does not ship - `with implementation on top` was removed from the Procore
  guide for exactly that reason, including where it had been restated in an FAQ.

## Product brief for non-developers (KEEP CURRENT)
- A prospect/customer-facing brief is published as an Artifact - what SyteNav
  does, how billing works, the QuickBooks answers, and an honest "what it does
  not do yet". It is what gets pasted into a chat to answer customer questions.
- URL: see `docs/product-brief-url.txt`.
- IMPORTANT: republish it in the SAME change as What's New and the Help
  article whenever something a user would notice ships - especially anything
  that changes an answer in the "what it does not do yet" list.

## Back burner (KEEP CURRENT)
- Parked / future ideas live in `BACKLOG.md` at the repo root.
- When we defer an idea, add it there; when we ship one, move it to "Recently shipped" with the PR #.

## QuickBooks (KEEP CURRENT)
Full detail: [`docs/postmortems/integrations.md`](docs/postmortems/integrations.md).
- One-way push, SyteNav -> QuickBooks Online. All of it lives in
  `lib/quickbooks-push.ts`; the manual Settings sync and the automatic push
  call the SAME functions so they cannot drift.
- **The connection is PER COMPANY.** A company only ever pushes to its own
  QuickBooks file, and the sync only sees the company you are signed into.
- ACCRUAL, and the halves must move together: a SENT client invoice becomes a
  QBO Invoice (A/R); a payment becomes a Payment applied against it; a deposit
  with no invoice to settle becomes a Sales Receipt. **A sale must never be
  counted twice** - if an invoice exists, the money settling it can never be
  another receipt.
- BOTH halves, BOTH directions. Money in: Invoice + Payment applied to it.
  Money OUT: a sub bill is a Bill and the money settling it is a BillPayment
  applied to it (`invoices.qbo_payment_id`, separate id and separate claim from
  `qbo_id` - one row, two QBO records).
- A payment settles the invoice NAMED ON IT (`client_payments.client_invoice_id`),
  never "the oldest one still sent". Only unlinked money (a deposit) falls back
  to oldest-open.
- A payment whose invoice has NOT reached QBO yet must book NOTHING - not a
  Sales Receipt. `pushClientPayment` (Sales Receipt) is only for money that
  settles nothing; every other caller goes through `pushPaymentForProject`.
- Keep `Fault.Error[].Detail`, not just `Message`. Errors are `QboError` and
  carry `.code` - branch on `QBO_OBJECT_NOT_FOUND` (610).
- 610 means "a reference you sent is unusable" and names NONE of them. On 610:
  retry once without the optional ref (the payment method, which moves into the
  memo), then `probeReferences` each id we sent and log which one QBO refuses.
  Never fall back to a Sales Receipt on failure - that is the double-count.
- Every QBO lookup filters `Active = true`. PaymentMethod.Type is only
  `CREDIT_CARD` or `NON_CREDIT_CARD` - `OTHER` is not a value QBO defines.
- A cached `qbo_id` for a record QBO does not have fails identically forever:
  clear it so the next push re-creates. Only when MISSING, never when inactive.
- Reference no. is the USER's (`client_payments.reference`), not `SN-<id8>` -
  it is the bank-reconciliation column. `paymentIdentity()` composes ref+memo
  for every payment path. `PaymentRefNum` on a Payment, `DocNumber` on a Sales
  Receipt - the wrong one is accepted and silently ignored.
- A payment row is one of TWO QBO entities. `qbo_txn_type` says which; any path
  that touches an existing payment must branch on it.
- Every push: never throws, capped at 8s, "not connected" is a normal state,
  and misses land in `quickbooks_sync_log` for the backlog sync to pick up.
- Pushes take an atomic claim (`qbo_claimed_at`) via a conditional UPDATE. A
  check-then-act guard is NOT enough.

## Two registries, and why a new thing goes IN them (IMPORTANT)
Full detail: [`docs/postmortems/integrations.md`](docs/postmortems/integrations.md).
- **A NEW NOTIFICATION BELONGS IN THE CATALOG, OR ITS AUDIENCE IS NOT A
  SETTING.** `lib/notifications.ts` is the list of event types; an entry with
  `status: 'live'` appears on its own in Settings -> Notifications AND in Who
  gets told. A cron that sends under a type the catalog has never heard of is a
  notification nobody can turn off or redirect - and borrowing a neighbouring
  type's audience glues a nag to a different event's switch.
- **A NEW ABILITY BELONGS IN `RESOURCES`, for the same reason.**
  `lib/permissions.ts` is resources x actions, with role defaults a company can
  remap and per-user overrides in `profiles.permission_overrides`. Splitting one
  out is the designed move, not a hack (`margin` out of `budget`, `mark-ready`
  out of `inspections`). Give every built-in role an EXPLICIT entry: a resource
  a role never names resolves to nothing, which is a permission silently
  defaulting to "no" for somebody who should have it. Pinned in
  `mark-ready-permission.ts`.
- **AND THE ROUTE HAS TO ASK**, or the setting is decoration. Gate the narrow
  body on the narrow permission and everything else on the broad one.
- **A SCREEN IS ONLY AS USABLE AS THE NARROWEST PERMISSION IT QUIETLY DEPENDS
  ON.** The Invoices page is gated on `invoices`, and loaded its subcontractor
  picker from `/financials` - a resource a Project Manager is DELIBERATELY
  denied, the same split that took `margin` out of `budget`. So a PM opened a
  form they are entitled to use, with a picker holding nothing, under a scan
  banner reading "Matched to QA Concrete Sub.". Nothing errored: the assignment
  fired and the controlled select had no option with that id. A page's own gate
  has to COVER every route it loads from; when it does not, the fix is to move
  the data onto the route the page's gate already covers, never to widen the
  role - widening hands them the screen the split exists to withhold.
  `invoices-load.ts` walks every `/api/` route the page fetches, reads each
  gate, and asserts every role holding `invoices: view` holds that one too.
- **WHOSE JOB IT IS IS A SECOND QUESTION, AND SOME ROUTES MUST ASK IT.**
  `requirePermission` deliberately does not check company ownership - subs
  legitimately write to jobs they do not own - so it is opt-in per route:
  `ownedProject(db, gate.actor, id, cols)` in `lib/api-guard.ts`. Opt in
  wherever the thing being read or written belongs to the GC rather than to the
  job: the whole `portal-token` family does, because the client portal carries
  the GC's invoices to their client and an invited sub is ON that job. 403, not
  404 - they can see the job. Pinned in `portal-gate.ts`.
- **CREATING A THING AND DESTROYING THE ONE THAT EXISTS ARE DIFFERENT POWERS,
  AND ONE ROUTE MUST NOT DO BOTH BY ACCIDENT.** `POST /portal-token` minted
  unconditionally, so the only thing between a client's working link and
  oblivion was a confirm dialog in one of the two callers - which a second tab
  or a double press went round. A destructive replace needs an explicit flag in
  the body AND the heavier permission (`edit`); without the flag the route hands
  back what is already there.

## Who the email is FOR, and who may send it (IMPORTANT)
Full detail: [`docs/postmortems/integrations.md`](docs/postmortems/integrations.md).
- **THERE ARE TWO DOORS INTO SYTENAV AND THEY MEAN DIFFERENT THINGS.** The
  WAITLIST is a stranger asking, approved by a super admin - the only place
  "you're approved" and "beta" are true. An INVITE is somebody already inside
  vouching for a person; the invite IS the approval. One template per audience:
  `inviteEmail` (waitlist, approvals screen only), `teamInviteEmail`,
  `vendorInviteEmail`. `/api/invite` takes an `audience`, defaulting to `team`
  so an un-updated caller cannot silently get the beta text.
- **A ROLE OR A COMPANY OUT OF A REQUEST BODY IS AN ESCALATION.**
  `middleware.ts` returns early for every `/api/` path, so nothing else gates
  it. Use `requirePermission` (`settings_team` for a teammate, `directory` for a
  vendor); the company comes from the ACTOR (a vendor's must carry
  `added_by_company_id` = the inviter's company); a vendor is always
  `read_only`; only an admin may invite an admin. Ratcheted in
  `invite-audience.ts`: routes taking a role from the body with no permission
  check may only go DOWN.

## Server-side data fetching (IMPORTANT)
- Layouts nest: `(dashboard)/layout.tsx` wraps `projects/[id]/layout.tsx` wraps
  every project page. Anything sequential in a layout is paid on EVERY
  navigation, before first paint.
- `auth.getUser()` is a network hop to the auth server, not a local read. Never
  call it in a layout or page - use `currentUser()` / `currentProfile()` from
  `lib/supabase/current-user.ts`, which are React `cache()`d so nested layouts
  share one answer. Next dedupes `fetch`, NOT Supabase client calls.
- Prefer a join over a second round trip (`select('*, customers(name)')`), and
  `Promise.all` anything independent. #325 added three sequential trips for one
  line of header text and made the whole app feel slow.
- One Supabase server client per request (`lib/supabase/current-user.ts` caches
  the client, not only the answers). `server.ts` swallows cookie writes because
  a Server Component may not set them, so a second client can present a
  refresh token the first one just rotated away.

## Layout: the app shell and overlays (IMPORTANT)
Full detail: [`docs/postmortems/layout.md`](docs/postmortems/layout.md) and
`MOBILE.md`. Pinned by `lib/__tests__/layout-overflow.ts` and, for anything that
is a measurement rather than a pattern, `lib/__tests__/overlay-geometry.ts`,
which lays real markup out in headless Chromium.
- The shell is ONE SCREEN TALL - `.h-app` + `overflow-hidden`, and the only
  thing that scrolls is `<main data-app-scroll>`. Never `min-h-screen`: it lets
  the DOCUMENT grow, which carries the top bar off the screen.
- **Every dialog/drawer/sheet uses `.overlay` (or `.overlay-full`), NEVER a
  hand-rolled `fixed inset-0` - and there are NO exemptions.** `.overlay` pads
  by the safe insets and caps its panel at `max-height: 100%`. Do NOT re-add
  `max-h-[90vh]`: vh knows nothing about the notch, and as a utility it beats
  the rule and wins with the wrong answer. The pin reads quoted class strings
  anywhere, not just `className="…"` literals.
- Anything floating over the app carries `data-overlay`, which freezes the
  background (`html:has([data-overlay])` in globals.css). Menus too - a panel
  positioned from `getBoundingClientRect()` detaches if the page moves. A
  tooltip is the exception: `InfoHint` measures, floats as a fixed portal
  (`lib/hint-position.ts`, pure and tested) and CLOSES on scroll. Never hide one
  with `visibility` - hidden is not gone: it still has a width.
- **THE DESKTOP SIDEBAR'S WIDTH IS ONE VARIABLE, NOT TWO CLASSES.** Both the
  aside and the content column read `--sidebar-w` off `.app-shell`
  (globals.css). The collapsed state is a class on `<html>`, set by a pre-paint
  script in `lib/sidebar-collapse.ts` - anything read from localStorage AFTER
  mount is drawn wrong first and then snaps. Every rule is `@media screen and
  (min-width: 1024px)`: `screen` because a print stylesheet is not a narrow one.
  Collapsed labels are CLIPPED, never `display: none` - the label is the link's
  accessible name.
- Wide content gets `overflow-x-auto`, never `overflow-hidden`. Hidden does not
  contain a wide table, it cuts it off with nothing to say so.
- **SAFE AREAS ARE OURS, not iOS's.** `capacitor.config.ts` sets
  `contentInset: 'never'` so `env(safe-area-inset-*)` reports real numbers, and
  EXACTLY ONE element pads each edge - the chrome wrapper at the top of each
  shell, `pb-safe` on each bottom nav. A second `pt-safe` is not
  belt-and-braces, it is a visible band of nothing. `pt-safe` never goes on the
  `h-14` header: border-box takes the padding out of the row and squashes the
  search bar rather than moving it down.
- `overflow-wrap: anywhere` is the default for prose - NOT for `td`/`th`. In a
  table it tells the layout a cell can be one character wide. Cells are
  `break-word`, `th` is `white-space: nowrap`, and a table too wide for the
  screen scrolls in its `overflow-x-auto` wrapper (give it a `min-w-[…]` when
  the columns matter). `.truncate` sets `min-width: 0` - same rule: `break-words`
  and `white-space: nowrap` do not shrink min-content, so a flex/grid child
  refuses to go below the full unbroken line and the CONTAINER blows out.
- **A SIDE DRAWER IS `.overlay-drawer`**, never `fixed top-0 right-0 h-full`:
  `h-full` is 100% of the LAYOUT viewport, which does not shrink for a keyboard
  and knows nothing about the notch. **AND ITS INSETS GO ON THE PANEL, NOT THE
  CONTAINER** - a drawer below `sm` IS the screen, so padding the container
  leaves a bare strip above the drawer instead of the drawer. Always
  `max(0.5rem, env(...))`: `env()` is 0 in a desktop browser, so a declaration
  with only the env() half cannot be measured at all.
- **A COMPONENT DECLARED INSIDE A COMPONENT IS A NEW TYPE ON EVERY RENDER**, so
  React throws the DOM away and builds a new one - the entrance animation
  replays and the state inside the subtree resets, taking a half-typed note with
  it. Hoist it and pass props (derive the type from the props of what it wraps).
  Nine other files still do this - counted and ratcheted in `swipe-dismiss.ts`,
  may only go DOWN.
- A DRAWER CAN BE SLID BACK THE WAY IT CAME IN. `lib/swipe-dismiss.ts` (pure)
  and `lib/use-swipe-dismiss.ts`, on the PANEL not the backdrop. The axis is
  decided ONCE at the slop boundary and kept. Dragging the other way does nothing.
  Dismiss is a fraction of the panel's own width OR a flick. The close is a
  TIMER, never `transitionend`: that never fires under reduced motion.
- **AND SO CAN EVERY OTHER PANEL, AND THE PAGE ITSELF.** One rule set
  (`swipeTravel`, one-way, signed per edge): right-hand drawers leave right,
  the phone navigation leaves LEFT (`useSwipeDismiss(…, 'left')`), a bottom
  sheet leaves DOWN (`lib/use-sheet-dismiss.ts`). A sheet's exit axis is the
  axis its body scrolls on, so it takes a downward drag ONLY when scrolled to
  the top - `sheetTakesGesture`, read ONCE at touch start. Every
  `.overlay-sheet` answers to it (ratcheted), and a sheet that is LAYOUT state
  closes on `pathname`, because the page can now change underneath it. The
  page goes BACK from the left edge (`lib/swipe-back.ts`, mounted once from
  `NativeShell`): never on the first page of the session, never with a
  `[data-overlay]` open, never at `lg`. The native shell has WKWebView's own
  gesture (`SyteNavViewController` in `AppDelegate.swift`,
  `allowsBackForwardNavigationGestures`, instantiated by `Main.storyboard`) -
  a NATIVE setting that reaches a phone only after an iOS rebuild; the JS
  gesture is for everyone else and the system one takes the edge touch first,
  so they never fight. Pinned in `swipe-sheet.ts` and `swipe-back.ts`.
- The overlay scroll lock is `overflow-y: hidden`, NEVER the `overflow`
  shorthand - the shorthand replaces the `clip` on html/body with `hidden`, and
  clip cannot be scrolled while hidden can.
- NEVER `autoFocus` on a touch screen - `autoFocus={autoFocusOnDesktop()}`
  (`lib/auto-focus.ts`). iOS opens the keyboard unasked and scrolls the LAYOUT
  viewport, dragging the fixed dialog off with it.
- **A form control under 16px makes iOS ZOOM THE PAGE on focus**, which hides
  the top bar under the status bar and slides the tab bar off. globals.css
  forces 16px on touch/narrow, with `!important`: **a `@layer base` rule does
  NOT beat a utility class** - Tailwind 3 emits base as plain CSS, so `.text-sm`
  (0,1,0) outranks `input` (0,0,1) whatever the order. Never write a bare
  element rule in base and assume it wins.
- A form control is also 44px tall on a phone. `<Label>` keeps its `text-sm` on
  a phone and shrinks only at `lg` (`lg:text-xs`, never a bare `text-xs`).
- **Overlays are sized from `--vv-h` / `--vv-t`** (`lib/use-visual-viewport.ts`),
  not `inset: 0`. `--vv-h` is NOT `visualViewport.height` - it is the visible
  strip measured against the layout viewport the CSS resolves in, and
  `lib/visible-viewport.ts` (pure, unit-tested) decides which of the two knows.
  Rules that file encodes, each of which cost a bug: trust `innerHeight` when it
  has dropped below the tallest frame seen; learn the `fullFrame` baseline ONLY
  with nothing focused; `raisesKeyboard` asks `document.activeElement`, because a
  stale number with no further event is indistinguishable from a correct one;
  recompute on `focusin`/`focusout`, both DEFERRED; listen for `window.resize`
  as well as `visualViewport`; re-measure after each event a frame AND ~300ms
  later; reset the baseline on `orientationchange`; with NO baseline yet, take
  `innerHeight`.
- **The SHELL follows `--vv-h` too**: `.h-app` is `var(--vv-h, 100dvh)` inside
  `@supports (height: 100dvh)`. The `@supports` is load-bearing - an unset
  `--vv-h` falling back to an unparseable `100dvh` is invalid AT
  COMPUTED-VALUE TIME, which makes `height` `unset` rather than falling back to
  the `100vh` declaration above it.
- `@capacitor/keyboard`, its Podfile line and `resize: 'native'` are pinned in
  `keyboard-resize.ts`. It is a NATIVE dependency, so a config change only
  reaches a phone after an iOS rebuild - and for most of this app's life the
  plugin was simply absent while this file asserted its behaviour as fact.

## Mobile look and feel (IN PROGRESS)
Full detail: [`docs/postmortems/mobile.md`](docs/postmortems/mobile.md).
- **PHONE ONLY. The desktop does not change - that is a decision, not an
  oversight.** The phone look lives BELOW `lg` (1024px). Two ways to write it:
  `lg:` variants where only classes changed (`Card` is `rounded-2xl …
  lg:rounded-lg lg:shadow-sm`), and a SECOND MARKUP where the shape changed -
  the old desktop block under `hidden lg:block` / `hidden lg:grid` / `hidden
  lg:contents`, the phone block under `lg:hidden`. Pinned: every `<StatStrip>`
  is `lg:hidden` with a `hidden lg:` twin in the same file; restored tables sit
  under `hidden lg:block` within 4 lines of `<table`; and `overlay-geometry.ts`
  MEASURES a card at 390 and 1280.
- Target on the phone: clean, quiet, native-feeling. FEWER boxes, fewer
  colours, more whitespace, stronger type. 8px spacing, ~24px screen gutters,
  cards at ~18-22px radius with a 1px `border-line` and no shadow, 44px+
  touch targets.
- Related numbers go in ONE card with hairline dividers - `StatStrip`
  (`components/ui/stat-strip.tsx`), not a coloured pill per metric. Colour only
  when the colour MEANS something (overdue red; a total is just a number). A
  cell can be a link (`href`) or a filter (`onClick` + `active`, a quiet fill,
  no ring). Always `lg:hidden`, always with the desktop's tiles beside it.
- A `<table>` is not a phone layout. Prefer a list of rows; keep a table only
  for genuinely tabular data, and then wrap it in `overflow-x-auto`.
  `layout-overflow.ts` ratchets the count of tables a phone renders - it may
  only go DOWN.
- `Card` is `rounded-2xl border border-line bg-panel` with NO shadow, and the
  page wrapper is `p-6` on every width - not `p-4 sm:p-6`. Both are pinned.
- A badge or a button label NEVER wraps. `Badge` and `Button` set
  `whitespace-nowrap` centrally; a hand-rolled pill must too.
- **A SENTENCE DASH IS ` - `, NEVER AN EM OR EN DASH.** Reported in three words
  looking at the app, and there were 130 of them across 28 files. Every code
  comment and every line of this file already writes a sentence dash as ` - `,
  so the COPY was the only thing disagreeing with the house style, and an em
  dash is the tell that a sentence was written somewhere other than here. The
  en dashes go too, ranges included (`Sep 1 - Sep 7` reads fine), because a
  rule with an exception nobody can see is a rule that comes back. A `-` also
  replaces the one standing in for an empty table cell. Ratcheted at ZERO in
  `layout-overflow.ts`, literal AND `\u2014`-escaped, over a file list of its
  own: the emoji scan's `tsx` is .tsx under app/ and components/, which misses
  `lib/whats-new.ts`, `lib/help/articles.ts` and every API route - 80 of the 130
  lived there, and the first version of the scan reported green without reading
  any of them.
- **AN ICON IS A LUCIDE COMPONENT, NEVER A CHARACTER.** An emoji renders in the
  PLATFORM's emoji font - full colour, at a size and weight nothing here
  controls. Arrows and check marks (`→ ← ↑ ↓ ✓`) are NOT this: they render in
  the text font at the text's size. Ratcheted at zero in `layout-overflow.ts`,
  which also asserts the arrows are still there so the scan cannot be passed by
  banning everything non-ASCII. `lib/weather.ts` is the one table both the app
  and the client portal read, and an unrecognised condition returns NULL rather
  than a default icon - a wrong picture beside the right word is worse than no
  picture.
- **SEVEN COLUMNS AT 390px IS A 55px SQUARE, AND TEXT CANNOT LIVE IN ONE.** A
  month cell on a phone is DOTS (colour only, with the legend under the grid),
  and the DAY is the control: tapping it opens
  `components/calendar/day-detail-sheet.tsx`, which takes an `onOpen` CALLBACK
  rather than an href because different kinds of item open different things.
  Narrower rule, everywhere: a pill's label and its detail are ONE truncating
  box, never two flex children fighting over the width.
- Something that opens INLINE opens where it was tapped - and the better answer
  is usually not to open it inline at all. A detail panel docked under a board
  is under every OTHER column too; rendering it inside the tapped column fixes
  the phone and squeezes the desktop. Use `.overlay-drawer`.
- A list of items is ONE card with `divide-y divide-line-soft` rows, never a
  bordered card per item, and never cards on a tinted column. A
  selected/expanded row is `bg-surface`, not `ring-2`; an overdue row says
  "Overdue" in red and is NOT tinted on top of it.
- A strip that scrolls sideways carries `.scroll-fade` (globals.css) so its
  right edge fades. **AND A STRIP THAT DOES NOT FIT MUST ACTUALLY SCROLL** -
  needs `overflow-x-auto`, or an off-edge tab is not merely cut off, there is
  NO WAY TO REACH IT. Measure with `scrollLeft = scrollWidth` and then ask where
  the last tab is, because a strip that cannot scroll reports the same
  rectangles as one that can.
- **A TITLE IN A FLEX ROW NEEDS `min-w-0` AND SOMEWHERE FOR THE ACTIONS TO GO.**
  `min-w-0` ALONE IS NOT THE FIX: it only trades the shards for "V…". Three
  controls and a title do not share 390px, so below `lg` the actions take their
  own row (`.row-even`) and only the CLOSE button stays beside the title - a
  dialog's exit is the one control that may never move.
- A row of controls REACHES BOTH EDGES: `.row-even` (globals.css), written
  `row-even lg:flex lg:flex-wrap gap-2 …`. Two share the row at equal width and
  an odd last one takes it whole. The child width override uses `:is()` for
  SPECIFICITY, not tidiness: `.row-even > *` is (0,1,0) and loses to a `w-28`
  written for the desktop row. A `.row-even` NEVER contains another - a grid in
  a cell of a grid halves an already-halved cell. Where a wrapper only groups
  the actions for a desktop, the wrapper is the layout and the group inside
  carries the rule; a footer of three is not one row on a phone (the two choices
  share a row, the destructive one goes under them). A heading beside the
  buttons makes it a LAYOUT, not a control row. Nothing restores `display` at
  `lg` - the row's own `lg:flex` does, because Tailwind emits utilities after
  components. Measured in `overlay-geometry.ts`, ratcheted in
  `layout-overflow.ts`.

## Controls a phone cannot reach (IMPORTANT)
Full detail: [`docs/postmortems/mobile.md`](docs/postmortems/mobile.md).
- **THERE IS NO HOVER ON A PHONE.** Invisible is indistinguishable from absent.
  A control may be hover-revealed FROM `lg` UP; below it, it is on screen:
  `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`. Pinned in
  `layout-overflow.ts`; a decorative chevron is not a control.
- An icon-only button carries `aria-label` (and `title`). One with a visible
  word beside the icon does not need one - the scan measures what is left after
  the icons are removed.
- **A DISABLED BUTTON EXPLAINS NOTHING.** Disable only for IN FLIGHT
  (`disabled={saving}`); let it fire and answer with the missing field. Where
  two dialogs validate the same shape, one function answers for both
  (`missingMilestone`, `missingSub`). Adding a REQUIREMENT means writing it into
  that function, never into the `disabled` condition - a rule enforced by a
  greyed-out button is a rule nobody is ever told about.
- **A FIELD THAT TAKES ANYTHING WILL BE GIVEN ANYTHING.** `quickAddProblem`
  (`lib/contact-quick-add.ts`) is asked by the form AND the route, and
  `whoToCall` refuses to make a `tel:` link out of a string with no digit in it
  - the guard on the way in stops the next one, the guard on the way out covers
  the ones already stored. The test is deliberately loose (does it contain a
  digit) because anything stricter refuses `321-638-0808 x2231`.
- A PICKER MUST NOT OFFER TO ADD WHAT IT IS ALREADY SHOWING YOU.
  `alreadyListed` is asked of the FILTERED options, so the offer and what is in
  front of you cannot disagree.
- A FIELD IS MARKED OR IT IS GUESSED AT. Every label in a dialog carries a `*`
  or "(optional)", and a parenthetical that says something ELSE ("(adds to
  schedule)") is a hint under the field, not a stand-in for the marker. Pinned
  in `add-sub-form.ts`.
- A VALUE THE APP WRITES, SUBMITS AND READS BACK MUST HAVE A CONTROL SOMEWHERE.
  A field with no box is not a hidden implementation detail; it is a fact about
  the job that only a machine may write.
- A record that a client will read must not be blank. Guard on the ROUTE as well
  as the form, since the field app posts to the same route, and count evidence
  (a photo, who was there) as a report, not just words.

## Derived facts, not stored ones (IMPORTANT)
Full detail: [`docs/postmortems/derived-state.md`](docs/postmortems/derived-state.md).
- **A WHITELIST WITH A FIELD MISSING FAILS EXACTLY LIKE A REJECTION, and only
  one of them says so** - the route drops the field and answers 200. A whitelist
  is still the right shape; when adding a field to a form, add it to the route's
  list in the same change.
- A TIMESTAMP THAT NOTHING WRITES IS A COLUMN THAT LIES BY OMISSION. Derive it
  from the status move in the route, never take it from the body - a client that
  could set it could date a task finished last year. `lib/task-due.ts`
  (`dueLabel`, pure and tested) is the one answer for what a date on a task
  says, and completed never returns overdue language.
- **Two controls must not answer one question.** `materialByFor(pkg)` derives
  the answer and returns null for the one case that is genuinely open, which is
  the only case still asked. A stored template's pair is overridden by the
  derived answer, because a stored pair can disagree with itself.
- ONE COLUMN MUST NOT HOLD A WISH AND AN AGREEMENT. Two columns
  (`requested_date`, `scheduled_date`), one labeller (`inspectionDate` - "Needed
  by" / "Confirmed for"), and the state that CLAIMS a booking has to carry its
  evidence: `scheduleProblem` demands `booked_with`. Moving back to requested
  CLEARS the booking, or the false appointment stays in the ICS feed. Pinned in
  `inspection-booking.ts`.
- AND SAY WHAT THE APP DOES NOT DO. A workflow that ends in a human picking up a
  phone has to SAY so on the screen, and then hand over the number - gathered
  from the permits and the Directory (`lib/inspection-contacts.ts`), never
  re-asked of the person in the field.
- A RULE THAT ONLY FIRES ON A STATUS MOVE DOES NOT COVER THE OTHER DOORS.
  `clearsCompletion` and `canCarryCompletion` are two halves of one rule and all
  three doors ask both. A date and the state it belongs to move together or
  neither moves - and the state's date comes off the PAPERWORK, not
  `todayDateInput()`.
- COMPLIANCE STATUS IS DATE-DRIVEN: a date that has not run out means current,
  whatever the row says; a date that has passed means expired, whatever the row
  says. The stored status only speaks for a document with NO date.
- A status that is really a DATE must be computed from the date, and the window
  must not stop AT the date. One answer, four states, tested: `lib/expiry.ts`
  (`expiryState`, `daysExpired`), anchored to LOCAL midnight so "expires today"
  is still good today.
- MONEY IN A TOTAL HAS TO BE ON A ROW OR NAMED. `budgetTotals` reports
  `changes_unlinked` beside `committed_unlinked` and `materials_unassigned`, and
  the "Not on a budget line" panel shows each with a way to file it. Any new
  rollup that can drop a row owes the screen the same two things: the total, and
  the list.
- A rule that exists on one door has to exist on the others.
  `ACCEPTED_STATUSES` in `lib/selections.ts` is the one set every door asks.
- **A SCREEN CALLED A CALENDAR THAT QUERIES ONE TABLE ANSWERS A NARROWER
  QUESTION THAN ITS NAME PROMISES, AND THE OMISSION IS INVISIBLE** - an empty
  square looks exactly like a free day and nothing errors.
  `lib/schedule-events.ts` (pure) merges the three kinds, and the CLICK FOLLOWS
  THE KIND, because a control that opens an editor which cannot write is a
  control that lies. Timeline and List stay schedule-only - they are the editor,
  not the view.
- **A DEADLINE WITH NO JOB BEHIND IT WARNS NOBODY.** Writing the route is half
  of it; a job nothing schedules never runs, so the pin reads `vercel.json` too.
  A gate column (`ready_reminder_sent_at`) makes it fire once per BOOKING, not
  once per row - so the PATCH route has to clear it whenever `scheduled_date`
  changes (`BOOKING_DERIVED_COLUMNS`).
- A RETRACTION IS AN EVENT TOO. An audit trail that records a claim and not its
  withdrawal is half a record.
- A VIEW THAT GATHERS A DAY MUST BE OPENABLE BY THE PEOPLE LIVING IT.
  `lib/today.ts` (pure) answers the day and `TodayStrip` shows it on the project
  Overview and My Jobs. A REQUESTED inspection appears there under its own kind
  - "needs booking" - never among the day's appointments.
- An activity feed row links to the record it is ABOUT (`lib/activity-href.ts`).
  The tab is not derivable from the type string, so it is a table pinned against
  the icon table it mirrors.

## A button that claims to have done something (IMPORTANT)
Full detail: [`docs/postmortems/derived-state.md`](docs/postmortems/derived-state.md).
- **A `useState` DEFAULT ON A REQUIRED SELECT IS A CLAIM, AND IT DISARMS THE
  `required` BESIDE IT** - a select that starts on a value cannot fail
  constraint validation, and the record does not LOOK blank in a list. A picker
  starts EMPTY with a `-- Select --` option. Rules are pure and shared
  (`lib/permit-rules.ts`, `requestProblem`/`scheduleProblem` in
  `lib/inspection-status.ts`), the guard sits on the ROUTE as well as the form
  and runs BEFORE `notify`, and a status that CLAIMS something must carry it.
  Pinned in `blank-records.ts`.
- **A DEFAULT IS A CLAIM.** A state that means "we did X" must be written by the
  code that does X, never by a column default. `pending` is the state a row
  starts in; only a confirmed send moves it.
- Sending is what the send BUTTON does. A verb on a button is a promise about
  what happens when it is pressed.
- ONE PRIMARY ACTION PER ROW, and the rest behind `RowMenu`
  (`components/ui/row-menu.tsx`). Where a second screen needs the same thing,
  the pattern becomes a component rather than a third copy.
- **A CONTROL THAT QUIETLY REDIRECTS IS WORSE THAN ONE THAT IS GONE** - a
  redirect teaches the old habit and is one refactor from being the bug again.
  When an action grows a real path, the old path is DELETED, and the pin reads
  the statuses a click can set rather than the classes on the buttons.
- A UNIQUE CONSTRAINT AND THE SEND SHIP TOGETHER. The moment the button really
  sends, a double press is two identical emails to one sub.
- **COPY IS A SPEC, AND IT DESCRIBES A PRODUCT THAT MAY NOT EXIST.** The pricing
  copy arrived carrying "Start free trial - 14 days. No card." four times and
  "Poke around the live demo. No signup." three. There is no trial: `/signup` is
  a Request Access form behind a waitlist. There is no demo: the only thing in
  this repo called one is `/api/dev/seed-demo`, which seeds a database. Shipping
  it verbatim would have put a button on a public, indexed page whose verb the
  product cannot honour - the same bug as "Share the portal" opening the
  document-sending page, but aimed at strangers. CHECK EVERY PROMISE IN SUPPLIED
  COPY AGAINST THE CODE before building it, and when one does not hold, say so
  and offer the door that exists rather than quietly narrowing the ask. Pinned
  in `plans-and-landing.ts`, which forbids the AFFIRMATIVE claims only: the page
  may still say "no card on file and no trial clock running", because that is
  true and is what the draft was reaching for.
- **A PUBLISHED PRICE AND WHAT IT MEANS TODAY TRAVEL TOGETHER.** Prices are in
  `lib/plans.ts` and the product is free in an invite-only beta, so an
  unqualified "$199/month" is a charge nobody is making - `PRICING_STATUS` is
  the one sentence that says which, and every screen printing a number prints
  it. The ANNUAL figures are derived (`annualTotal`, `annualPerMonth`,
  `annualSaving`): "$82.50/month" and "Save $198 a year" are arithmetic, and a
  stored copy of either goes stale silently on the next price change. Help
  articles are plain data with no compiler watching them, so they build their
  prices from `PLANS` too.

## Menus, pickers and the tail of a tap (IMPORTANT)
Full detail: [`docs/postmortems/mobile.md`](docs/postmortems/mobile.md).
- **A state the next interaction reverses is indistinguishable from a control
  that is dead.** A control that toggles must not be re-triggered by the tap
  that just used it - on a phone the panel is hard against the trigger, so the
  tap that picks lands on the trigger the instant the panel unmounts.
  `SearchableSelect` guards with a `pickedAt` timestamp, not a flag on a timer.
- AN "ADD" BUTTON OPENS; IT DOES NOT TOGGLE - after a failed save it IS already
  open, which is exactly when somebody presses it again. Add opens a dialog
  (`.overlay` + `data-overlay`); closing is Cancel, Escape, the backdrop, or a
  save that worked.
- A MENU THAT HOVER OPENS MUST NOT BE A TOGGLE - `mouseenter` opens and the
  `click` that follows shuts it again. Closing is: pick something, Escape, click
  outside, or move the pointer off. The panel sits flush at `top-full` so there
  is no dead space to cross and no timer to leak.
- A PANEL HANGING OFF A ROW CANNOT LIVE INSIDE `overflow-x-auto` - OR INSIDE ANY
  `overflow` THAT IS NOT `visible`. `overflow-x` establishes a clipping box on
  BOTH axes. `overflow-hidden` written on a CARD to round its corners is the
  same trap and worse - a `RowMenu` in the last row is not shortened, it is
  gone. Round the children that touch an edge instead. Measured with
  `elementFromPoint`, because clipping is a PAINT operation: the clipped panel
  still reports its full bounding rect.
- **A POSITIONED PANEL MUST KNOW WHERE THE SCREEN ENDS, AND THE FIXED BOTTOM NAV
  IS PART OF WHERE IT ENDS.** Scrolling cannot help: the bar is pinned to the
  VIEWPORT. `RowMenu` flips to `bottom-full` using `hintPosition`'s verdict,
  counts the strip under `[data-bottom-nav]` as gone, and sits at `z-40` - above
  the tab bar and desktop sidebar, below the phone drawer.
- The controls in a project header are ONE class string
  (`components/layout/header-icon-button.tsx`), icon-only, each with
  `aria-label` and `title`.
- Something a user opens from a ROW opens over the screen, not at the bottom of
  the card - otherwise pressing it on the third row scrolls you away from what
  you tapped, which on a phone reads as a different page.
- A picker that SHOWS a fact in its options fills that fact in.

## Loading and failure states (IMPORTANT)
Full detail: [`docs/postmortems/failure-states.md`](docs/postmortems/failure-states.md).
- **A NULL USER IS TWO DIFFERENT FACTS**: nobody is signed in, and the question
  could not be asked. Three answers (`lib/auth-outcome.ts`): a 4xx is a verdict
  about the token and may be believed; a 5xx, a status of 0, an
  `AuthRetryableFetchError` or a timeout is a failure to ask and says NOTHING.
  **When it says nothing, guess signed IN** - a wrong "signed in" is corrected
  by the page asking again a moment later, while a wrong "signed out" has
  already thrown away the only thing that could correct it. Middleware asks once
  and carries an `unknown` to the page; a layout asks twice and then renders
  `AuthUnavailable`, which says it is not your password.
- A permissions check that FAILED answers exactly like being denied - `can()` is
  `!!perms?.[r]?.[a]` and `perms` is null either way. The fact is announced ONCE
  for the session by `PermissionsBanner` in the dashboard chrome, beside
  `ViewAsBanner`. A screen may add "Checking access…" for the in-flight case,
  but the failure belongs to the session, not the page.
- "Loading" and "failed" are different facts. Collapsing them into one falsy
  value renders a menu with four links and no explanation. Callers need `error`
  as well as `loading`.
- A loading state must have a WAY TO END. `setLoading(false)` as the last
  statement of an async function ends only on the happy path - use
  try/catch/finally, always.
- A plan's bytes are fetched through `/api/projects/[id]/plans/[planId]/file`,
  never `plan.file_url` directly - pdf.js reads them in the BROWSER, so a file
  on another server is a cross-origin read. The route signs `storage_path` fresh
  per request (a stored signed URL is only as good as the key that signed it)
  and streams anything else from our origin. The URL comes off the ROW, never
  the request.
- **A POSTGRES MESSAGE IS NOT A USER-FACING MESSAGE.** `friendlyDbError`
  (`lib/db-error.ts`) names the FIELD; a route hands that back and
  `console.error`s the raw text so the log still has it. A route that ends
  `NextResponse.json({ error: error.message })` is one report away from putting
  a not-null-constraint sentence in front of somebody choosing bathroom tile.
- **NEVER `alert()` or `confirm()`.** In the native shell a JS dialog is a
  native UIAlertController and WebKit BLOCKS THE JS THREAD until it is
  dismissed; one that fails to present is a page that never runs another line.
  `confirm()` is the one that got proved: the evidence for this class of bug is
  an ABSENT request, which reads as "the page died". Use `useNotice()`
  (`components/ui/notice.tsx`) and `useDeleteGuard`, both mounted at the ROOT
  layout. `useDeleteGuard` takes `title`/`body`/`confirmLabel`, so a
  confirmation that is NOT a delete has somewhere to go. Notice is deliberately
  NOT an overlay: no `data-overlay`, `pointer-events: none` on the dock, sized
  off `--vv-h` - a message about a field must leave you able to fix the field.
  Both ratcheted at zero in `layout-overflow.ts`, with no exemption for
  `notice.tsx` or `delete-guard.tsx` themselves. The 18 handlers still calling
  the native `confirm` are in BACKLOG.md.
- A FOREIGN KEY WITH NO `ON DELETE` RULE IS A DELETE THAT FAILS ON EXACTLY ONE
  ROW. When adding a table that points at `companies`, decide CASCADE (the row
  is a fact about that company alone) or SET NULL (a record of work that
  outlives the attribution), and never leave it at the default.
- ONE EVENT, ONE EMAIL. `notify()` sends email as well as ringing the bell, so a
  route that has already emailed somebody must pass `inAppOnly: true`. The bell
  is a different channel and is never the duplicate; a second letter is. Only a
  caller that KNOWS it emailed may set it, and where the send failed the
  notification email is the fallback.
- A ROUTE THAT COMPUTES A REASON MUST NOT BE THE ONLY PLACE IT EXISTS. Read it
  in the UI AND `console.error` it, or an invite that never arrived is
  recoverable from nowhere.
- ONE REQUEST MUST NOT CARRY TWO THINGS THAT CAN BE REFUSED SEPARATELY.
  Recording a fact is not the same act as accepting it. And ask the refusable
  question at the FIELD before sending, using the same set the route does: a
  server's answer can only ever arrive as a message about a whole request that
  did not happen.

## Location and time (IMPORTANT)
Full detail: [`docs/postmortems/failure-states.md`](docs/postmortems/failure-states.md).
- **TWO COORDINATES ARE NEEDED FOR ONE COMPARISON, AND ONLY ONE OF THEM IS THE
  WORKER'S.** A flag is a mark against the WORKER, so never raise one for an
  address only the office can fix. `lib/punch-location.ts` answers with four
  outcomes - `ok` / `far` / `no_fix` / `no_site` - stored on the row
  (`clock_in_fix`) so a review months later still knows which, and is the ONE
  place each sentence is written. When NEITHER is known it reports `no_fix`: the
  phone is the half the person holding it can act on.
- AND THE REASON THE PHONE GAVE IS PART OF THE ANSWER. `lib/geo-position.ts` is
  the one reader and keeps the `code`, so "location is off", "no fix indoors"
  and "ten seconds was not enough" are not one value. It asks TWICE -
  `enableHighAccuracy: true` with no `maximumAge` refuses a perfectly good fix
  from thirty seconds ago - except `denied`, which no second prompt can change.
- A RELATIVE TIME CARRIES THE ABSOLUTE ONE ON HOVER (`absoluteTime`,
  `lib/time-ago.ts`) - when the stored value and the arithmetic are both right,
  what is left is the READER's clock, and nothing server-side can see that.
  `timeAgo` is that module and only that module: a future timestamp prints the
  date rather than "just now". `equipment/page.tsx` keeps its own on purpose
  ("today"/"yesterday", 30 days), which is different wording, not a copy.

## Stack notes
- Next.js 14 App Router, Supabase (Postgres + Storage), Tailwind.
- Theme: SyteNav "Field" - semantic CSS-var tokens (surface/panel/ink/accent…),
  light + dark. Use token classes (bg-panel, text-ink, text-muted-fg, border-line,
  bg-accent/text-accent-fg, success/warn/danger/info), NOT raw slate/white/orange.
- Storage buckets: `daily-log-photos`, `submittals`.
- Always run `npx tsc --noEmit`, `npx next build`, `npm run lint:hooks` AND
  `npm test` before merging. The lint step is not optional and not about style: it is the
  only one of the three that can see React hook order. A conditional `useState`
  shipped past a clean tsc and a clean build and blanked the whole Pay Apps
  screen. The config is deliberately narrow (hooks + jsx-key, everything else
  off) so it never fails for a reason nobody would act on.
- **Tests live in `lib/__tests__/` and run with `npm test`.** They used to be
  written into a session scratch directory, which meant nobody but the agent
  could run them, they were never in CI, and sixty-five of them vanished the
  moment the container reset - silently, while the code they guarded carried on
  working. A test that only one process can run is not a test. See
  `lib/__tests__/README.md` for the convention, of which the important half is:
  reintroduce the bug and confirm the test goes red, because a test that has
  never failed is a guess about what it covers.
