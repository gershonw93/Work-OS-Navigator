# SyteNav - working agreement

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

## Migrations
- Numbered files in `supabase/migrations/`. Apply them with the Supabase MCP
  (`apply_migration`, project `rxdqmetqvfninvaqymyl` - "Work OS Navigator").
- Combined, idempotent SQL is still kept current at
  `supabase/migrations/_combined_008-095.sql` (bump the suffix as you add
  migrations) as the fallback for a fresh environment.
- IMPORTANT: verify every column you `.select()` actually exists - Supabase
  returns `data: null` for an unknown column, so a typo reads as "not found"
  rather than an error. `projects` has `client`, NOT `client_name`, and has no
  `client_email` at all (the address is on `customers`).
- The same class of silent failure on the way BACK: read the wrong key off a
  response and you get `undefined`, which a truthiness guard swallows. A Send
  box sat permanently blank because a component read `d.email` from a route
  that answers `{ clientEmail }`. If two places read one endpoint, give them
  one reader (`lib/use-client-email.ts`) rather than two chances to be wrong.

## What's new (KEEP CURRENT)
- User-facing release notes live in `lib/whats-new.ts`, shown at `/whats-new`.
- IMPORTANT: when you ship something a user would NOTICE, add an entry in the
  SAME change. Internal refactors and build fixes do not belong there.
- Newest first; `date` drives the unread badge in the sidebar, so keep it real.

## Help Center (KEEP CURRENT)
- User-facing support articles live in `lib/help/articles.ts`, shown at `/help`.
- IMPORTANT: whenever you add or change a feature/flow, update the matching
  article (or add a new one) in the SAME change so Help never drifts from the app.
- Search is client-side; keep each article's `keywords` list rich so it's findable.

## QuickBooks (KEEP CURRENT)
- One-way push, SyteNav -> QuickBooks Online. All of it lives in
  `lib/quickbooks-push.ts`; the manual Settings sync and the automatic push
  call the SAME functions so they cannot drift.
- **The connection is PER COMPANY.** A company only ever pushes to its own
  QuickBooks file, and the sync only sees the company you are signed into.
  Counting "unsynced" across companies is how you end up telling somebody
  their payment failed to sync when it was never in that company's scope.
- ACCRUAL, and the halves must move together: a SENT client invoice becomes a
  QBO Invoice (A/R); a payment becomes a Payment applied against it; a deposit
  with no invoice to settle becomes a Sales Receipt. **A sale must never be
  counted twice** - a Sales Receipt already means sold AND paid, so if an
  invoice exists, the money settling it can never be another receipt.
- BOTH halves, BOTH directions. Money in: a client invoice is an Invoice and
  the money settling it is a Payment applied to it. Money OUT: a sub bill is a
  Bill and the money settling it is a BillPayment applied to it
  (`invoices.qbo_payment_id`, separate id and separate claim from `qbo_id` -
  one row, two QBO records). Ship a half and the ledger overstates: A/R showed
  money owed that had arrived, A/P showed money owed that had gone out.
- A payment settles the invoice NAMED ON IT (`client_payments.client_invoice_id`),
  never "the oldest one still sent". Same-day invoices share an `issue_date`, so
  "oldest" was whichever row came back first and the money settled a coin toss.
  Only unlinked money (a deposit) falls back to oldest-open.
- A payment whose invoice has NOT reached QBO yet must book NOTHING - not a
  Sales Receipt. Booking one records the sale, then the invoice records it
  again. `pushClientPayment` (Sales Receipt) is only for money that settles
  nothing; every other caller goes through `pushPaymentForProject`. The
  Settings backlog sync called the Sales Receipt pusher directly for a while.
- Keep `Fault.Error[].Detail`, not just `Message`. QBO's Message is a label
  ("Object Not Found"); Detail is the sentence that names the object. Errors
  are `QboError` and carry `.code` - branch on `QBO_OBJECT_NOT_FOUND` (610).
- 610 means "a reference you sent is unusable" and names NONE of them. On 610:
  retry once without the optional ref (the payment method, which moves into the
  memo), then `probeReferences` each id we sent and log which one QBO refuses.
  Never fall back to a Sales Receipt on failure - that is the double-count.
- Every QBO lookup filters `Active = true`. `paymentMethodId` did not, so an
  inactive method came back as a good id. PaymentMethod.Type is only
  `CREDIT_CARD` or `NON_CREDIT_CARD` - `OTHER` is not a value QBO defines.
- A cached `qbo_id` for a record QBO does not have fails identically forever:
  clear it so the next push re-creates. Only when MISSING, never when inactive
  - re-creating an inactive customer leaves two with the same name.
- Reference no. is the USER's (`client_payments.reference`), not `SN-<id8>` -
  it is the bank-reconciliation column. `paymentIdentity()` composes ref+memo
  for every payment path; SN- moves into the memo when the user gave a ref, so
  it appears in exactly one place. `PaymentRefNum` on a Payment, `DocNumber` on
  a Sales Receipt - the wrong one is accepted and silently ignored.
- A payment row is one of TWO QBO entities. `qbo_txn_type` says which; the
  refresh assumed Sales Receipt for everything and reported applied Payments as
  missing. Any path that touches an existing payment must branch on it.
- Every push: never throws, capped at 8s, "not connected" is a normal state,
  and misses land in `quickbooks_sync_log` for the backlog sync to pick up.
- Pushes take an atomic claim (`qbo_claimed_at`) via a conditional UPDATE. A
  check-then-act guard is NOT enough: a double-pressed button created two QBO
  invoices for one record, and the spare became an orphan receivable.

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

## Layout: the app shell and overlays (IMPORTANT)
- The shell is ONE SCREEN TALL - `.h-app` + `overflow-hidden`, and the only
  thing that scrolls is `<main data-app-scroll>`. `min-h-screen` lets the
  DOCUMENT grow, which carries the top bar off the screen and means `<main>`'s
  `overflow-y-auto` never engages.
- Every dialog/drawer/sheet uses `.overlay` (or `.overlay-full`), NEVER a
  hand-rolled `fixed inset-0` - and there are NO exemptions. The plans viewer
  had one ("a fullscreen toggle that IS the scroller, not a dialog over one")
  and being the exception is exactly why it never learned about the notch: its
  title and its own exit button sat under the Dynamic Island. It also hid from
  the scan a second way, by writing the class string as a `cn()` argument on
  its own line, so the pin now reads quoted class strings anywhere rather than
  `className="…"` literals. There were 78 of those and whether a dialog fitted
  on the phone depended on which file it lived in. `.overlay` pads by the safe
  insets and caps its panel at `max-height: 100%`, so a panel cannot be taller
  than the screen. Do NOT re-add `max-h-[90vh]`: vh knows nothing about the
  notch, and as a utility it beats the rule and wins with the wrong answer.
- Anything floating over the app carries `data-overlay`, which is what freezes
  the background (`html:has([data-overlay])` in globals.css). Menus too - a
  panel positioned from `getBoundingClientRect()` detaches if the page moves.
  A tooltip is the exception: `InfoHint` measures, floats as a fixed portal
  (`lib/hint-position.ts`, pure and tested) and CLOSES on scroll instead. It
  used to be an `absolute` child hidden with `visibility` - hidden is not
  gone: it still had a width, made a sheet's scroll body wider than the panel
  (a thumb dragged the sheet sideways), and opened off the edge of a phone.
- Wide content gets `overflow-x-auto`, never `overflow-hidden`. Hidden does not
  contain a wide table, it cuts it off with nothing to say so.
- SAFE AREAS ARE OURS, not iOS's. `capacitor.config.ts` sets
  `contentInset: 'never'` so `env(safe-area-inset-*)` reports real numbers, and
  EXACTLY ONE element pads each edge - the chrome wrapper at the top of each
  shell, `pb-safe` on each bottom nav. When iOS was also insetting, the header
  jumped 59pt whenever a layout event made it recalculate. A second `pt-safe`
  is not belt-and-braces, it is a visible band of nothing.
- `pt-safe` never goes on the `h-14` header: border-box takes the padding out of
  the row and squashes the search bar rather than moving it down.
- `overflow-wrap: anywhere` is the default for prose - NOT for `td`/`th`. In a
  table it tells the layout a cell can be one character wide, so a `w-full`
  table on a phone crushed "Create" to Cr/ea/te and a group name to its first
  letter. Cells are `break-word`, `th` is `white-space: nowrap`, and a table
  too wide for the screen scrolls in its `overflow-x-auto` wrapper (give it a
  `min-w-[…]` when the columns matter). Measured in `overlay-geometry.ts`.
  `.truncate` sets `min-width: 0`. Both are the same rule: `break-words` and `white-space:
  nowrap` do not shrink min-content, so a flex/grid child refuses to go below
  the full unbroken line and the CONTAINER blows out while the text inside
  behaves perfectly.
- The overlay scroll lock is `overflow-y: hidden`, NEVER the `overflow`
  shorthand. The shorthand also sets `overflow-x`, replacing the `clip` on
  html/body with `hidden` - and clip cannot be scrolled while hidden can. That
  turned latent sideways overflow into a pannable viewport, and `position:
  fixed` is pinned to the LAYOUT viewport, so dialogs slid off the screen.
- NEVER `autoFocus` on a touch screen - `autoFocus={autoFocusOnDesktop()}`
  (`lib/auto-focus.ts`). iOS opens the keyboard for it unasked and scrolls the
  LAYOUT viewport to reach the field, dragging the fixed dialog off with it.
- A form control under 16px makes iOS ZOOM THE PAGE on focus. Zoom shrinks and
  pans the visual viewport while `position: fixed` stays on the LAYOUT one, so
  the top bar hides under the status bar and the tab bar slides off the left -
  the "screen goes crazy" that is not a scroll at all. globals.css forces 16px
  on touch/narrow, with `!important`: **a `@layer base` rule does NOT beat a
  utility class.** Tailwind 3 emits base as plain CSS, so `.text-sm` (0,1,0)
  outranks `input` (0,0,1) whatever the order - the rule sat there dead while
  42 controls, `components/ui/input.tsx` included, zoomed every screen.
  Measured in `overlay-geometry.ts`; never write a bare element rule in base
  and assume it wins.
- Overlays are sized from `--vv-h` / `--vv-t` (`lib/use-visual-viewport.ts`),
  not `inset: 0`. The layout viewport does not shrink for a keyboard, so a
  centred dialog puts its own buttons behind one.
- **`--vv-h` is NOT `visualViewport.height`.** It is the visible strip measured
  against the layout viewport the CSS resolves in, and `lib/visible-viewport.ts`
  (pure, unit-tested) decides which of the two knows. Capacitor's default
  keyboard mode shrinks the WKWebView frame, so the layout viewport is ALREADY
  the strip and `visualViewport` subtracts the keyboard a SECOND time - the app
  came out ~121pt tall in a ~516pt space. When `innerHeight` has dropped below
  the tallest frame seen, trust `innerHeight` and set the offset to 0; only an
  unshrunk frame (mobile Safari) defers to `visualViewport`. Rotation resets
  the baseline, or landscape reads as a keyboard forever.
- **The SHELL follows `--vv-h` too**, not just overlays: `.h-app` is
  `var(--vv-h, 100dvh)` inside `@supports (height: 100dvh)`. A document taller
  than the webview's frame is one the webview can scroll, and Capacitor shrinks
  that frame for the keyboard - so it scrolled by a keyboard-height, the
  keyboard closed, and the offset had nothing left to undo it: the app sat too
  high with bare background below and no top bar. The `@supports` is
  load-bearing. An unset `--vv-h` falls back to `100dvh`, and where `dvh` does
  not parse that is invalid AT COMPUTED-VALUE TIME, which makes `height`
  `unset` - it does NOT fall back to the `100vh` declaration above it the way a
  plain bad value would, and the shell collapses to `auto` on exactly the old
  WebKit those declarations exist for.
- A form control is 44px tall on a phone as well as 16px (see above). 16px is
  forced and cannot be lowered, so a `h-8` box put big text in a small frame
  next to a 12px label and read as enormous. Fields grow; `<Label>` keeps its
  `text-sm` on a phone and shrinks only at `lg` (`lg:text-xs`, never a bare
  `text-xs` - pinned). Both measured in `overlay-geometry.ts`.
- Pinned by `lib/__tests__/layout-overflow.ts` and, for anything that is a
  measurement rather than a pattern, `lib/__tests__/overlay-geometry.ts`, which
  lays real markup out in headless Chromium. Full detail in MOBILE.md.

## Mobile look and feel (IN PROGRESS)
- **PHONE ONLY. The desktop does not change - that is a decision, not an
  oversight.** The phone look lives BELOW `lg` (1024px), the breakpoint where
  the tab bar becomes the sidebar: if you see the bottom tab bar you get the
  phone look, and from `lg` up every screen looks exactly as it did before the
  sweep. Passes 1-4 shipped without this gate and a user found their laptop
  changed. Two ways to write it: `lg:` variants where only classes changed
  (`Card` is `rounded-2xl … lg:rounded-lg lg:shadow-sm`), and a SECOND MARKUP
  where the shape changed - the old desktop block under `hidden lg:block` /
  `hidden lg:grid` / `hidden lg:contents`, the phone block under `lg:hidden`.
  Pinned: every `<StatStrip>` is `lg:hidden` with a `hidden lg:` twin in the
  same file; restored tables sit under `hidden lg:block` within 4 lines of
  `<table`; and `overlay-geometry.ts` MEASURES a card at 390 and 1280.
- Target on the phone: clean, quiet, native-feeling. FEWER boxes, fewer
  colours, more whitespace, stronger type. 8px spacing, ~24px screen gutters,
  cards at ~18-22px radius with a 1px `border-line` and no shadow, 44px+
  touch targets.
- Related numbers go in ONE card with hairline dividers - `StatStrip`
  (`components/ui/stat-strip.tsx`), not a coloured pill per metric. Colour only
  when the colour MEANS something (overdue red; a total is just a number). A
  cell can be a link (`href`) or a filter (`onClick` + `active`, a quiet fill,
  no ring). In use on the dashboard, Tasks, Compliance, a customer, a project's
  overview, the Projects list and Master Money - always `lg:hidden`, always
  with the desktop's tiles beside it.
- A `<table>` is not a phone layout. Five columns in 390px gave headings
  running one letter per line down the page. Prefer a list of rows; keep a
  table only for genuinely tabular data, and then wrap it in `overflow-x-auto`.
  `layout-overflow.ts` ratchets the count of tables a phone renders - it may
  only go DOWN.
- `Card` is `rounded-2xl border border-line bg-panel` with NO shadow, and the
  page wrapper is `p-6` on every width - not `p-4 sm:p-6`. Both are pinned.
- A badge or a button label NEVER wraps. `Badge` and `Button` set
  `whitespace-nowrap` centrally; a hand-rolled pill must too, and the test
  scans for it.
- Something that opens INLINE opens where it was tapped. The task board is
  three columns side by side on a desktop, so its detail panel sits under all
  of them; a phone STACKS those columns, so "under the board" is under every
  other column too - tapping a task in Open put its detail below In Progress
  and Completed, off the screen. Below `lg` it renders inside the column, right
  after the card. One definition feeds both places so they cannot drift.
- A list of items is ONE card with `divide-y divide-line-soft` rows, never a
  bordered card per item, and never cards on a tinted column. The Tasks board
  was three coloured boxes each holding a stack of boxes. A selected/expanded
  row is `bg-surface`, not `ring-2`; an overdue row says "Overdue" in red and is
  NOT tinted on top of it.
- A strip that scrolls sideways carries `.scroll-fade` (globals.css) so its
  right edge fades - with the scrollbar hidden that is the only sign there is
  more. Pinned for the Tasks filter row and the Settings tab strip.
- A row of controls REACHES BOTH EDGES: `.row-even` (globals.css), written
  `row-even lg:flex lg:flex-wrap gap-2 …`. `flex flex-wrap` makes each control
  as wide as its own label, so Budget's toolbar came out 2 + 2 + 1 at three
  different widths with none of them meeting the right edge. Two share the row
  at equal width and an odd last one takes it whole - the trick `StatStrip`
  uses for an odd number. The child width override uses `:is()` for
  SPECIFICITY, not tidiness: `.row-even > *` is (0,1,0) and loses to a `w-28`
  written for the desktop row, the same trap that left the 16px rule dead.
  A `.row-even` NEVER contains another: a grid in a cell of a grid halves an
  already-halved cell, so the Edit Item footer gave Cancel and Save a quarter
  of the dialog each and "Save Changes", which may not wrap, ran out of both
  sides of its own button. Where a wrapper only groups the actions for a
  desktop, the wrapper is the layout and the group inside carries the rule -
  and a footer of three is not one row on a phone: the two choices share a
  row and the destructive one goes under them. Both pinned.
  Nothing restores `display` at `lg` - the row's own `lg:flex` does, because
  Tailwind emits utilities after components. Measured in `overlay-geometry.ts`
  and ratcheted in `layout-overflow.ts`: a flex row of two or more `<Button>`s
  must carry it. A heading beside the buttons makes it a LAYOUT, not a control
  row - the button group inside is the row.

## Loading and failure states (IMPORTANT)
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
