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

## Loading and failure states (IMPORTANT)
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
