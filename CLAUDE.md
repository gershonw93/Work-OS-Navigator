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
  `supabase/migrations/_combined_008-120.sql` (bump the suffix as you add
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
  `lib/project-site.ts` is the one reader. **AND THAT RULE IS NOT ONLY ABOUT
  COLUMNS.** The address SyteNav tells a person to write to was FOUR addresses
  hardcoded in FOURTEEN places - `sytenav@gmail.com` on the in-app Help card,
  `hello@` on the contact page, in the contact form twice, as the reply-to on
  every email the app sends and in the Organization JSON-LD (the copy Google
  prints), `legal@` in four legal documents plus the shared legal footer, and
  `security@` on the security page. The ask was three words - "change all to
  info@sytenav.com" - and "all" was the whole job. `lib/support-email.ts` is
  the one home; `supportMailto()` builds the link, because with four inboxes
  collapsed into one the SUBJECT is all that separates a security report from a
  cookie question. `EMAIL_FROM` stays `noreply@`: that is the envelope sender,
  not somewhere to write. Pinned in `support-email.ts`, which scans every .ts
  and .tsx under app/, components/ and lib/ for a literal `@sytenav.com` or
  `@gmail.com` - a scan of the marketing pages alone reported clean while the
  Gmail address sat on the Help page, and vice versa.
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
- **AND A `NUMERIC` COLUMN COMES BACK AS A STRING.** PostgREST serialises
  `numeric` QUOTED - `"80.00"`, not `80` - and **`Number.isFinite` DOES NOT
  COERCE**, so `Number.isFinite(row.progress_pct)` is false for every real row
  while being true for every hand-written fixture. It cost four bugs at once in
  `lib/schedule-dependencies.ts`: a typed percent never beat the budget
  roll-up, the roll-up filtered every row out and answered `unknown`,
  `blockedBy` never blocked a single progress gate, and the review printed
  "waits on Sheetrock" for an 80% link. ONLY THE LAST WAS VISIBLE, and it was
  reported as a nit - a gate that never fires looks exactly like a gate whose
  condition is met. Read every `numeric` through `toPct` / `toAmount`, print it
  through `pctLabel` (or "80.00" reaches the screen), and declare the field
  `number | string | null` so the next reader is forced through them. Pinned in
  `schedule-dependencies.ts`, which RATCHETS the count of `Number.isFinite`
  calls in that module. Same family as the rules above: check the shape against
  the migration, never against what you would have typed.
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
- **AND THE BAR IS HIGHER THAN "a user could observe it".** Reported in six
  words - "Not everything needs to be public for what's new! This is
  irrelevant" - over an entry announcing that the support address had changed
  to `info@sytenav.com`. True, observable, and of no interest to anybody: it is
  housekeeping, and it went in past a rule that already said so.
  TWO QUESTIONS BEFORE AN ENTRY:
  (1) Would somebody who never reported this have NOTICED the old behaviour and
  been bothered by it? A contact address nobody had written to, a column read
  the wrong way, a panel that was briefly wrong - no.
  (2) Is it news to anybody OUTSIDE the conversation that produced it? Fixing
  what a tester told you about yesterday is a REPLY to them, not an
  announcement to everybody.
  **AND A FEATURE'S TEETHING FIXES ARE THE FEATURE'S ENTRY, NOT FOUR MORE.**
  Three entries and nine items landed the day after schedule dependencies
  shipped, each describing a way that feature had been broken in the twenty-four
  hours nobody but the tester had used it. That is a commit log wearing release
  notes. One entry saying what the feature does now, and the rest is a git
  history somebody can read if they want one. A changelog nobody trusts to be
  worth reading gets read by nobody, which costs the entries that WERE worth
  publishing.
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
  crawler the library was rewritten because a dependency changed. **AND THAT
  RULE IS ABOUT `app/sitemap.ts` TOO**, which is where it was being broken for
  every URL at once: `lastModified: new Date()` told Google the privacy policy,
  the pricing page and all ten guides had changed on every deploy. Google
  ignores `lastmod` once it stops matching reality, and it does not go back to
  trusting the honest ones. A guide sends `updated ?? published`; a page with no
  real date sends NO lastmod at all, because "we are not telling you" is a fact
  a crawler handles and an invented date is not. Pinned in `site-name.ts`.
- **THE SITE NAME GOOGLE PRINTS COMES FROM FOUR SIGNALS ON THE HOMEPAGE**, and
  nothing else: the `WebSite` node's `name`, `og:site_name`, the homepage
  `<title>`, and its `h1`. With none of them Google guesses from what it has
  crawled - it had crawled `work-os-navigator.vercel.app`, so it printed
  "Vercel" beside the favicon. All four are set, and pinned in `site-name.ts`
  along with the half that made the guess possible: the canonical origin cannot
  fall back to a deployment URL, robots refuses every non-canonical host, and
  the permanent production alias 301s rather than merely carrying a noindex -
  with `/google<hex>.html` exempt, because a redirect on the verification file
  makes it impossible to prove the duplicate is yours. `application-name` is NOT
  one of the four, whatever a checklist says; it is set because the app is
  installable. AND NONE OF IT IS INSTANT - the name changes when Google
  re-crawls the homepage, days to weeks later, so the fix and the result are
  separated by long enough that somebody will be tempted to "fix" it twice.
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

## The demo control board (IMPORTANT)
- `/admin/demo` sends ANY live notification to ANY user, with sample copy dated
  from today. Asked for to run live demos: waiting for a real inspection to fall
  two business days out is not a demo, it is a stakeout.
- **IT SENDS A REAL EMAIL AND A REAL BELL TO A REAL PERSON**, with wording
  written to look genuine. So: SUPER ADMIN ONLY, gated BEFORE the body is read
  (no field in it is a permission), and every send is written to
  `demo_notification_log` with the sender's name against it - six weeks later
  somebody can ask why they got mail about a change order that never existed,
  and that table is the only thing that can answer. `ON DELETE SET NULL`, because
  the record has to outlive the account that sent it, which is exactly when the
  question arrives. The SCREEN says what it is in red; the copy is meant to be
  convincing and the console must not be.
- **IT GOES THROUGH `notify()`**, never its own insert - a demo that bypassed
  preferences would be demonstrating a product that does not exist. Which means
  a recipient with email off for that type gets the bell and nothing else, so
  the route REPORTS what actually went out and names the reason when the email
  did not: a silent missing email on a stage is the worst place to find that out.
- **THE PICKER IS THE CATALOG** (`NOTIFICATION_TYPES`, filtered to `live`), not
  a second list that drifts the first time somebody adds a type, and
  `lib/demo-notification.ts` has copy for every one of them - pinned, so a new
  live type fails the suite until it has a sample.
- **AND IT NAMES THE INBOX.** The picker read "Admin User (admin)", which on a
  stage does not tell you which mailbox to have open on the other screen - and
  two people called Admin User are one company apart, so the name alone cannot
  tell them apart either. The address is in the option, under the picker once
  chosen, and on the confirmation. A profile with NO address says so BEFORE the
  send: that is the difference between "the email is slow" and "there was never
  going to be one".
- **THE DATES ARE COMPUTED, NOT TYPED.** "makeshift text that looks real based
  on the current date" - a sample reading "due Sep 12" in November is the one
  detail an audience notices. The pin re-renders every sample on a second date
  and demands the text change, per sample rather than in aggregate: one frozen
  date passes an aggregate check as long as something else moved.

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

## Billing, the trial, and the meter (IMPORTANT)
- **`lib/plans.ts` IS THE ONE HOME FOR A PRICE, A CAP AND `TRIAL_DAYS`.** A plan
  carries `projectLimit` as a NUMBER and the sentence is derived
  (`projectLimitLabel`) - it used to be the string `'3 active projects'`, which
  reads perfectly and cannot be compared with anything, while the screen that
  was supposed to be counting printed a hardcoded `0 / 10` under a tier called
  "Starter" that no plan has ever had. `key` is the stable id every stored row
  and Stripe price names; `name` is marketing's to reword.
- **A COMPANY WITH NO `company_billing` ROW IS UNMETERED, NOT LOCKED.**
  `companies` holds our customers AND every sub and inspector in a Directory, and
  a sub writes to jobs it does not own. "No row means no writing" closes a small
  hole by breaking every sub in the product - the same reasoning that keeps
  `requirePermission` out of the ownership question.
- **A SUBCONTRACTOR IS NOT A TENANT, SO THE PUBLIC DOOR MUST NOT METER ONE.**
  `complete-signup` created a trial for every new company regardless of type. A
  sub owns no projects - they can never use the thing the plans meter - so the
  fifteen days simply ran out underneath them and `billingLock` turned the
  account read-only on day sixteen, leaving them unable to submit a bid or a
  bill to the GC waiting on it. A customer of ours locked out of helping a
  customer of ours. Subs invited through `/api/invite` have always been born
  with no billing row, which IS the designed meaning of unmetered; the public
  door was the one place that disagreed. **AND THE DECISION READS THE COMPANY
  ROW, never `companyType` off the request body** - one fact then decides both
  which product somebody gets and whether they are metered, so the two cannot
  drift, and claiming to be a sub to dodge billing hands you the sub product.
  A billing decision taken from a client's claim about itself is the same shape
  as a role out of a request body. A company that later changes type is a
  platform-console job, deliberately not a trigger. Pinned in `billing-trial.ts`.
- **AN INVITE LINK IS GOOD ONCE, AND ONLY FOR THE ADDRESS IT WAS SENT TO.** The
  invite email has said exactly that since it was written - "The link is
  personal to you and only works once" - and neither half was true: nothing
  consumed `invite_token`, and the email box on the create-account form was
  editable, so one forwarded link minted unlimited accounts under any address,
  each a new company with its own free trial. COPY IS A SPEC, and the sentence
  was the spec nobody had implemented. `access_requests.invite_used_at` is the
  stamp, written only AFTER the profile exists (stamp it where the token is READ
  and a signup that dies on the company insert burns the link, so the way back
  from our own error is to ask us for another one). The address is compared
  against the AUTHENTICATED user, never the body - the body is the claim being
  checked. Every branch that touches the token clears the stamp with it, or a
  fresh token beside an old stamp is a link born dead. And the route refuses a
  resend as well as the screen hiding it: a second tab goes round a hidden
  button. Pinned in `admin-invite.ts`.
- **EVERY AMBIGUITY RESOLVES TOWARDS WRITABLE.** A wrong "locked" takes a crew's
  screen away mid-job; a wrong "open" costs a few dollars and is corrected the
  moment somebody looks. So a trial with no end date, an `active` row with a
  stale period end, and a status we do not recognise all stay open. Same
  asymmetry as `lib/auth-outcome.ts`, settled the same way: when the evidence
  does not say, guess the mistake you can take back.
- **THE LOCK GOES AT `requirePermission`, FOR WRITE ACTIONS ONLY** - the one door
  all 152 write routes already share. `middleware.ts` returns early for `/api/`,
  so it cannot. The seven routes that gate by hand with `actorCan` call
  `billingLock` themselves, **and two of them are the ones that decide how many
  jobs are open**, which is the thing the plans meter. 402, never 403: 403 sends
  somebody to their admin for a permission nobody can grant.
- **A READ-ONLY ACCOUNT IS STILL FULLY READABLE.** Nothing is hidden and nothing
  is deleted for non-payment; what stops is writing. And it is announced ONCE
  for the session (`BillingBanner`, beside `PermissionsBanner`) - learning your
  trial ended from a failed save is learning it after doing the work.
- **A FAILED CARD IS NOT A CANCELLATION.** Stripe retries `past_due` for weeks;
  locking on the first decline takes the job screen away over a card the office
  has not noticed. It stays writable and says so loudly. The lock arrives with
  `canceled`.
- **THE CAP IS ENFORCED ON EVERY DOOR THAT OPENS A SLOT**, which is two: creating
  a project and moving one back INTO a counted status. Metering only the create
  route leaves the eleventh job one status change away, and a status change is
  how a finished job comes back.
- **THE SCAN ROW IS WRITTEN BEFORE THE MODEL IS CALLED, MARKED FAILED**, and
  flipped to `succeeded` when an answer comes back. Written the other way round
  a route that times out records nothing and `succeeded` is true on every row -
  a column that lies by omission. Only successful scans count: a customer who
  got nothing has not spent anything. And a meter that cannot write must never
  refuse the scan.
- **EVERY ROUTE THAT CALLS THE MODEL IS METERED**, pinned by walking `app/api`
  for the call itself rather than against a typed list - the allowance was
  printed on a pricing page for months while nothing in the product counted one.
- **A COMP CARRIES WHO AND WHY, ASKED AT THE DOOR.** `comped` with nothing
  against it cannot answer "why has this company never been charged" six weeks
  later, which is when it is asked. Same rule as `demo_notification_log`. Ending
  one drops them onto a trial, never straight into a read-only app.
- **STRIPE IS OURS, NOT A CUSTOMER'S** - the opposite direction from QuickBooks,
  which is per company and takes their data out to their own file. The secret is
  an env var; the PRICE IDS are in `billing_plan_prices` and pasted in the
  platform console, because the person making prices in Stripe should not need a
  deploy. The app NEVER marks itself paid - a checkout returning to a success URL
  proves the browser came back, not that money moved. Only the signed webhook
  writes, and with no signing secret it refuses everything.
- **A TRIAL LENGTH NAMED ON A PUBLIC PAGE IS READ FROM `TRIAL_DAYS`.** Pinned by
  scanning every trial CLAIM ("N days free", "N-day trial") across the pricing
  page, the cards, Help and the guides, plus a ban on spelling it out in words -
  a digit can be interpolated, a word cannot, which is how one sentence drifted
  past the first version of that check. The public BUTTON still says Request
  access: the door is still a waitlist, so "Start free trial" is still a verb the
  product cannot honour.

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
- **AND A FOURTH PERSON APPEARED: a stranger the OWNER invites, who never
  asked.** The admin console can now start an invite (first name, last name,
  email) instead of only approving one. It is the same machinery as the waitlist
  - one `access_requests` row, one token, the same `/signup?invite=` unlock -
  and reusing the machinery quietly reuses the SENTENCE, which is the trap.
  `inviteEmail` says "your access request is approved", true of somebody who
  applied and false of somebody who did not. So `platformInviteEmail` is the
  fourth template, `access_requests.source` ('request' | 'invite') is what the
  row remembers, and `deliverInvite` picks off the ROW rather than off the
  caller - so a RESEND cannot change its story either. The invite IS the
  approval: the row is born `approved` with a token and a `reviewed_at`, because
  there is nothing left to review. First and last name are composed into the one
  `name` column at the edge (`lib/invite-person.ts`), never stored as a second
  pair. Pinned in `admin-invite.ts`.
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
- **A MENU THAT COVERS THE PAGE IS AN OVERLAY, WHATEVER IT IS CALLED.**
  Reported against the marketing nav: "when the menu is open, I can still
  scroll on mobile". It is not a dialog, so it used neither `.overlay` nor
  `.overlay-full` - and the overlay scan could not see it, because that scan
  asks which panels DECLARE themselves overlays and then checks those carry
  `data-overlay`. A panel that declares nothing is invisible to it. The CSS is
  not so fussy: `html:has([data-overlay])` only cares that a panel says it is
  one. AND THE TWO SURFACES FAIL DIFFERENTLY - inside the app the document
  never scrolls (`h-app` + `overflow-hidden`, only `[data-app-scroll]` moves),
  so the `[data-app-scroll]` line does the work; marketing is an ordinary
  scrolling document, so the `html` line is its ONLY lock and a missing
  attribute is the whole bug. `layout-overflow.ts` now also scans for a panel
  rendered from an `open` state that hides at a breakpoint - a phone menu -
  and demands `data-overlay` on it.
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
- **PULL DOWN AT THE TOP TO RELOAD, AND IT SHARES THE BACK GESTURE'S AXIS
  RULE.** Asked for because a permit gets submitted on somebody else's phone and
  the screen in your hand is a minute old, with no browser bar in the installed
  app. `lib/pull-refresh.ts` is pure (`canStartPull`, `pullTravel`, `pullState`)
  and `lib/use-pull-refresh.ts` holds the DOM; mounted ONCE from `NativeShell`
  beside `SwipeBack`, never in a layout - two listeners on one scroller doubles
  every reading. THE AXIS COMES FROM `swipeAxis`, not from a second rule of its
  own: a sideways drag is the back gesture's, a downward one is this, and two
  modules with two ideas of "horizontal" is how one fires during the other. It
  starts ONLY at `scrollTop <= 0` (a pixel down the page that drag is a scroll),
  never with a `[data-overlay]` open (a reload takes a half-typed note with it),
  and never at `lg`. `touchmove` is NOT passive - it stands in for the scroll,
  so it has to be able to preventDefault it. AND IT RELOADS rather than calling
  `router.refresh()`: eighteen of the twenty project screens are client
  components fetching in a `useEffect`, which `router.refresh()` does not re-run,
  so the cheap call would be a refresh gesture that refreshes nothing almost
  everywhere it is offered. Pinned in `pull-refresh.ts` and `pull-to-refresh.ts`.
- The overlay scroll lock is `overflow-y: hidden`, NEVER the `overflow`
  shorthand - the shorthand replaces the `clip` on html/body with `hidden`, and
  clip cannot be scrolled while hidden can.
- **WEBKIT PAINTS AN AUTOFILLED FIELD ITSELF, AND `background-color` LOSES.**
  Reported as "the login screen looks like it's fake": two white boxes with
  dark text on the dark sign-in card, every other pixel correct. A field the
  password manager filled matches `:-webkit-autofill` and WebKit paints its
  background in the UA-shadow layer, where an author background does not reach
  - only a huge inset `box-shadow` covers it and only `-webkit-text-fill-color`
  recolours the text. The rule is in `globals.css`, painted from `--panel` /
  `--ink` so it follows the theme, and it is NOT inside the touch media query:
  a desktop autofills too. It looked fake BECAUSE the credentials had been
  remembered, so an account with nothing saved never sees it.
- **AND A FIELD PAINTED FROM THE TOKENS NEEDS A CARD PAINTED FROM THEM TOO.**
  The auth card hardcoded the dark palette as hex while everything inside it
  followed the DOCUMENT theme, so `<Input>`'s `bg-panel` resolved light on a
  light-theme phone and each of the four auth pages patched its own fields with
  raw `slate`. No single autofill rule can be the right colour against that.
  `.dark` is a bare class in globals.css, so it goes on the auth wrapper and the
  whole subtree flips - card and fields then read the same tokens. The card is
  `bg-muted`, one step LIGHTER than its `bg-panel` fields, because a card on
  `panel` makes both #1F2227 and the fields vanish into it. Pinned and MEASURED
  in `auth-screen.ts`, whose fixture is built from the layout's own class
  strings: the first version hardcoded them and its colour assertions went on
  passing against the reverted, broken layout.
- **THE SIGN-IN IDENTIFIER IS `autocomplete="username"`, NOT `"email"`.** That
  is the token a password manager keys on to pair a field with the password
  below it; `email` is a contact-details token, and with it iOS fills the
  password and leaves the address on its placeholder - which is what the same
  screenshot showed.
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
- **AN INLINE ROW OF BARE INPUTS IS NOT A FORM, IT IS A FORM'S SILHOUETTE.**
  Reported as "still get this basic date picker": setting a vendor's dates was
  two `h-8 text-xs` date boxes wedged into the "not yet scheduled" strip - 32px
  against the 44px rule, 12px against the 16px one, NO `<Label>` on either with
  "to" as the only clue which was which, and `required` doing the validating so
  the only message anybody saw was the browser's grey bubble pointing at an
  unlabelled box. It is the same dialog as Add Milestone now, with marked
  labels and `missingSchedule` beside `missingMilestone` - one shape for every
  way a line reaches the schedule. Pinned in `schedule-cascade.ts`.
- **ONE DIALOG, ONE SAVE - AND A NUMBER CARRIES ITS UNIT.** Reported in three
  parts, all fair. "Why is it a 2 step": the dependency picker's Link button
  wrote through its own route while Save Changes wrote the label and dates, so
  one dialog had two buttons each saving a different half and Cancel after Link
  left something behind. NOTHING in an embedded panel saves on its own now -
  links are STAGED and Save Changes commits them, removals included, or the
  dialog is honest in one direction and not the other. They commit BEFORE the
  cascade preview, which would otherwise compute against links that do not
  exist yet. "It doesn't say %": a number box labelled "How far along?" is a
  number with no unit - the sign sits in the row, right after the field.
  "Needs an or between the 2 options": two bare optional boxes side by side
  state nothing about how they relate, so each FINISHES ITS OWN SENTENCE ("Do
  not start until they are [80] % done", "Then wait [0] days before starting")
  under a heading saying what leaving both alone means. Pinned in
  `schedule-cascade.ts`.
- **WRITE IT THE WAY A GC SAYS IT, AND PUT THE RARE ANSWER BEHIND A TAP.**
  The dependency picker was correct English and the wrong language: "Depends on
  another trade?", "Waits for", "Do not start until they are 80% done". It says
  "Can't start till another trade finishes?", "After:", "Wait till they're __%
  done", "Plus __ extra days" - and a saved link reads back as "After Framing
  hits 80%, plus 2 days". Structure follows the same rule: ninety percent of
  the answer is "after the sheetrock guy", so the percent gate and the extra
  days sit behind "More options", COLLAPSED, with the tap naming what is inside
  so nobody opens it to find out. Two boxes on the main path for a question
  almost nobody asks is a tax on everybody else. Pinned in
  `schedule-cascade.ts`, whose "does not say the old phrase" half reads the
  COMMENT-STRIPPED source - a file explaining why a phrase was replaced
  contains that phrase, and a raw scan finds its own explanation.
- A VALUE THE APP WRITES, SUBMITS AND READS BACK MUST HAVE A CONTROL SOMEWHERE.
  A field with no box is not a hidden implementation detail; it is a fact about
  the job that only a machine may write.
- **AND REPLACE IS NOT REMOVE.** An upload that can only be overwritten cannot
  be undone: Finance -> Estimate scanned a quote into budget line items and
  offered nothing but Replace, so a quote uploaded to the wrong job stayed on
  it for ever, feeding Budget and Progress. The route had `GET`/`POST`/`PATCH`
  and no `DELETE`, and `projects.quote_file_url` was written in one place and
  cleared in none. A destructive rewrite offered as the only control is not a
  control - it is the same act with no way back. Clearing the column is not
  enough either: the file's URL is signed for ten years, so the object goes
  too. Story in `docs/postmortems/derived-state.md`, pinned in
  `estimate-remove.ts`.
- WHAT A DELETE CASCADES INTO DECIDES WHETHER IT MAY RUN AT ALL. Removing those
  line items detaches five things harmlessly (`ON DELETE SET NULL`) and
  DESTROYS one: `invoice_allocations` is `ON DELETE CASCADE`, so money off a
  sub's bill that somebody mapped to a line would go with it, silently.
  `estimateRemovalProblem` (`lib/estimate-removal.ts`) refuses and NAMES the
  line and the amount - and the screen asks it too, so the refusal is on the
  control rather than arriving as a failed request. Check the `ON DELETE` rule
  of everything pointing at a row before writing the delete that removes it.
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
  **AND A WARNING COUNTS BUSINESS DAYS, ARRIVES IN THE MORNING, AND REACHES THE
  PEOPLE WHO CAN ACT ON IT.** All three were wrong at once on the not-ready
  reminder. `READY_REMINDER_DAYS` counted plain days, so a MONDAY inspection
  warned on SATURDAY - unread, and too late by Monday to finish the work or ring
  the jurisdiction. `addBusinessDaysIso` is the counter now, and THE SQL WINDOW
  IN THE ROUTE MUST USE THE SAME FUNCTION: a calendar horizon filters the Monday
  row out of the query before `needsReadyReminder` is ever asked, so the fix
  would look right and do nothing. The cron ran at 07:22 UTC, which is 3:22am
  where the crews are; Vercel cron is UTC and does NOT follow daylight saving,
  so `30 11` is 7:30am Eastern in summer and drifts to 6:30 in winter - a
  one-character change in November, not a bug to rediscover. And the audience
  was `inspections: edit`, the OFFICE permission for booking a visit: `mark-ready`
  was split out of it precisely because saying the work is finished is a report
  from the SITE, so routing "nobody has marked it ready" on `inspections` told
  everyone except the field supervisor and the worker - the only people who
  could do anything about it. **A NOTIFICATION'S AUDIENCE IS THE PERMISSION FOR
  THE ACTION IT IS ASKING FOR, not the permission for the record it is about.**
  Every one of these passed sixty-five suites: the fixture's `TODAY` was a
  Monday, where two business days and two plain days are the same Wednesday.
  Pinned in `inspection-reminders.ts`, anchored on the days the two rules
  DISAGREE.
  **AND THE SCREEN SAYS WHAT THE LETTER WILL SAY.** A date on a row is a
  lookup; "In 4 days" is an answer. `inspectionCountdown` puts it there and its
  `tone` comes from the SAME rule the 7:30am email fires on, so a row cannot be
  amber while the reminder stays silent, or quiet while it sends. Null past a
  fortnight, where the printed date says it better than "in 96 days". A colour
  that means "soon" on every row means nothing on any of them.
  **AND A DATE THAT HAS PASSED IS OVERDUE, NOT SILENCE.** The first version
  returned null for a past date, reasoning that a visit which has been and gone
  is a result waiting to be recorded rather than a plan. True, and it made the
  screen say NOTHING - reported one release later as "booked sep 11 for march
  24 - 6 months ago, doesnt make sense", a Foundation inspection under PENDING
  wearing a calm blue "Scheduled" badge six months after the day. A REASON FOR
  SAYING NOTHING IS NOT A REASON THE READER CAN SEE. Three tones now, and
  "Overdue" is the word rather than "In -177 days".
  **AND HALF THAT CONFUSION WAS A LABEL.** `booked_at` was printed under
  "Booked", which beside a date reads as a second appointment; it is the day the
  booking was WRITTEN DOWN, and it says "Booking recorded".
  **AND NINE FACTS OF EQUAL LOUDNESS HIDE THE ONE SOMEBODY CAME FOR.**
  "Confirmed for" is `text-base font-semibold text-ink` and every sibling in
  that grid stays `ink-soft` - the second half is what makes the first work.
  **AND A LIST WITH A COUNTDOWN ON IT HAS TO BE IN ORDER.** The pending list
  was a bare `filter` with no sort, so it rendered Sep 21, Sep 16, MARCH, Sep
  23 - tolerable as four dates to read, nonsense beside "In 4 days". `bySoonest`
  sorts it, and an undated row goes LAST: an empty string sorts before every
  real date, so the naive comparator puts "no date yet" at the top.
- **A CASCADE IS ARITHMETIC; TELLING SOMEBODY IS A DECISION.** Schedule
  dependencies live in `lib/schedule-dependencies.ts` (pure: `cascade`,
  `findCycle`, `lineProgress`, `blockedBy`) and the routes under
  `schedule/[itemId]/`. THE RULES THAT COST SOMETHING IF BROKEN:
  the preview (`POST .../cascade`) writes NOTHING and the apply (`PUT`) takes a
  `notify` boolean with NO DEFAULT - false would make an un-updated caller stop
  telling anybody, true would make one start emailing, and both halves are
  computed by the same `plan()` so the screen somebody approved and the thing
  that happens cannot drift. ONE EMAIL PER SUB, not per line: `scheduleShiftEmail`
  takes a LIST. A line whose dates a human edited carries
  `dates_overridden_at` and is SKIPPED and REPORTED, never moved silently, and
  the cascade stops there rather than computing off dates the line no longer
  has. A diamond takes the LARGEST push and each line keeps its LENGTH - the
  second push measures from where the line already moved to, not from where it
  started, which is the bug a start-only assertion cannot see.
  **A DEPENDENT SHIFTS BY THE SAME DELTA, AND THE DELTA IS THE PREDECESSOR'S
  FINISH.** The first version snapped a dependent to `predecessorEnd + lag + 1`,
  so Sheetrock moving 3 days (Oct 12 -> Oct 15) moved a line sitting back on
  Sep 16 by THIRTY-FOUR, landing exactly on the new boundary. Every fixture had
  the dependent starting the day after its predecessor ended, where the snap and
  the shift are the same number: A FIXTURE THAT ONLY EXERCISES THE CASE WHERE
  TWO RULES AGREE CANNOT TELL YOU WHICH ONE YOU IMPLEMENTED. `lag_days` takes no
  part - shifting by the delta PRESERVES the gap, lag included, and a lag
  re-applied per cascade is a floor. The delta is measured on the END date,
  because the screen says "can't start till another trade finishes": a line that
  starts on time and runs three days long HAS taken three days.
  **AND EVERY LINKED LINE IS IN ONE BUCKET OR THE OTHER.** A linked row missing
  from the review reads as a row that was never linked, which is the one thing
  that screen exists to disprove. `cascade` walks twice: pass one computes what
  moves, pass two reports EVERY line the links reach - `manually_overridden`,
  `no_shift` (nothing pushed it) or `chain_stopped` (something between it and
  the edit was left alone, so where it lands is not worked out). Reporting off
  pass one alone is how the rows behind a hand-dated line vanished. Each row
  carries `direct` or `downstream`, and a link whose two ends are not both on
  the board reports NOTHING - a row the reader cannot find is worse than one
  left out.
  **AND A REVIEW WITH NOTHING TO *SAY* IS NOT A STEP** - which is NOT the same
  as nothing to move, and reading it that way was the bug. The screen must
  never ask whether to tell people when there is nobody to tell (`notify: false`
  is a fact there, not a guess), and it never renders over the editor; two
  overlays at once left Cancel dropping you back into a form whose dates had
  been decided elsewhere. But a change that moves NOBODY is itself the thing
  worth saying, and gating the skip on `!moves.length` meant the commonest
  outcome of moving a date was a save in total silence - 121 schedule lines
  across 26 jobs carry FIVE links between them, so on 23 of those jobs nothing
  was ever going to move, and a silent save is indistinguishable from a feature
  that never deployed. Reported as exactly that: "will it actually push off
  anyone dependent?". The skip is gated on `changeWarning(...).silent`
  (`lib/schedule-change-warning.ts`), which is false whenever there is
  something to state: nothing is linked, a follower was hand-dated after it was
  linked, the FINISH did not move (which is the date a follower watches), or
  **this line is dropping out of its own chain** - the invisible one, because
  typing dates sets the very flag `handEditWins` reads, permanently, and
  nothing had ever said so. With no moves the footer is one button that saves
  and one that cancels, never the two about emailing nobody. Pinned in
  `schedule-warning.ts`.
  **`dates_overridden_at` TAKES A LINE OUT OF THE CASCADE FOR EVER, so what
  SETS it matters more than what reads it.** Two bugs, one flag: every dialog
  posts both dates whether or not they were edited, so a save that moved nothing
  was marking the line hand-dated - it is only set when a date ACTUALLY changes.
  And LINKING A LINE CLEARS IT: setting a vendor's dates is how a line gets
  dates at all, and a date typed before the link was never a decision to ignore
  the trade ahead. Nothing else clears it, so without that the only way back was
  to re-type the dates.
  **AND CLEARING IT AT WRITE TIME WAS HALF A FIX - THE RULE HAS TO BE READ AT
  CASCADE TIME.** Reported again a day later: a row on an explicit 80% link sat
  still while two rows linked the same afternoon moved. A clear that happens AS
  a link is written can only ever help a link written after it ships; every row
  already linked stayed stuck for ever, with no way out but to unlink and link
  again, which nobody would think of. So `handEditWins(line, dep)` weighs the
  two statements - LINKING SAYS "FOLLOW", DATING SAYS "LEAVE IT", THE ONE SAID
  LAST WINS - and covers every row already in the table. A link with no
  `created_at` is taken as the later word: re-asserting the flag is one date
  edit away, and un-sticking a row nothing will ever move again is not. THE
  PERCENT ROWS FAILED FIRST BECAUSE OF WHAT A GATE IMPLIES: setting one is when
  somebody also fixes that line's dates, so `saveEdit` committed the link and
  then the cascade PUT stamped the flag a second later - one dialog saying both
  things, the second winning. The apply takes an explicit `dates_overridden`
  (default TRUE, the protective answer) and the one caller that knows it just
  linked sends false. Migration 109 clears the rows the contradiction already
  made, and only those: a flag stamped within two minutes of one of that line's
  own links.
  **AND A LINK'S CONDITIONS TRAVEL WITH THE ROW THAT REPORTS IT.** The review
  printed "waits on Sheetrock" for an 80% link and for a plain one, so two rows
  under different conditions read identically and the screen could not be used
  to check what it was showing. `gateOf(dep)` is that fact and every move and
  skip carries it. `findCycle` names
  the loop ("Drywall waits for Paint waits for Drywall"), because "circular
  dependency" tells nobody which link to cut. Pinned in
  `schedule-dependencies.ts` and `schedule-cascade.ts`.
- **AND A FEATURE REACHABLE FROM ONE DOOR IS UNREACHABLE FROM THE JOB THAT HAS
  NOT STARTED.** Reported as "i just see this / nothing republished", over the
  "vendors not yet scheduled" strip. The deploy was correct; the dependency
  picker rendered only inside the EDIT dialog, and a project whose lines are all
  still unscheduled has nothing to edit - so the whole feature was invisible,
  which is indistinguishable from a deploy that never happened. The spec said
  creating OR editing and only editing was built. Every path that CREATES a
  schedule line now hands straight to the prompt. And it opens the LOADED row,
  never the one the POST returns: that row carries no `subcontracts` join, and
  `scheduleLabel` reads the join, so the dialog would have said "Untitled".
  Pinned in `schedule-cascade.ts`, which asserts every creator reaches it.
- **AND PROGRESS IS THREE ANSWERS, NOT A NUMBER.** `lineProgress` returns a
  percent AND its source: `entered` (somebody typed it), `budget` (rolled up
  from the subcontract's budget lines, weighted by AMOUNT - $90k at 10% beside
  $10k at 100% is 19%, not 55%), or `unknown`. `schedule_items.progress_pct` is
  NULLABLE on purpose, unlike `budget_line_items.progress_pct`: an unknown
  compared against a gate as zero leaves the gate shut for ever while looking
  like it works. An unknown predecessor BLOCKS and says it is blocking because
  nobody has said - a wrong "go" puts a crew on a site.
- A RETRACTION IS AN EVENT TOO. An audit trail that records a claim and not its
  withdrawal is half a record.
- A VIEW THAT GATHERS A DAY MUST BE OPENABLE BY THE PEOPLE LIVING IT.
  `lib/today.ts` (pure) answers the day and `TodayStrip` shows it on the project
  Overview and My Jobs. A REQUESTED inspection appears there under its own kind
  - "needs booking" - never among the day's appointments.
- An activity feed row links to the record it is ABOUT (`lib/activity-href.ts`).
  The tab is not derivable from the type string, so it is a table pinned against
  the icon table it mirrors.
- **A NAME IS NOT A KEY, SO A LINK BUILT ON ONE IS EXACT OR IT IS NOTHING.**
  "inspector should link to the inspectors contact card" - except
  `inspections.inspector_name` is FREE TEXT and the real rows read "TW", "Paul
  Klink", "City Inspections Bureau". There is no foreign key to follow, so
  `lib/inspector-link.ts` asks whether that exact name IS a Directory contact:
  trimmed, case-folded, whitespace-collapsed, and NULL for a partial match, for
  initials, and for two contacts sharing one name. Same rule as
  `lib/geocode-match.ts` refusing a question too vague to have one answer - a
  link to the WRONG card is worse than no link, and the fuzzy version is the one
  that fires. The id has to survive the trip: `callTargets` is a list of numbers
  and drops it, so the route sends the contacts separately. **AND THE PAGE AT
  THE OTHER END HAS TO READ THE LINK** - `/directory?contact=<id>` opens that
  card, guarded by a REF so it opens once and can still be closed. A link that
  lands somebody at the top of a list to find the thing themselves is the
  failure the setup checklist's "Share the portal" already demonstrated.

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
- **AND A PLACEHOLDER NOTHING EVER REPLACES IS THE SAME CLAIM.** "Upload quote
  doesn't do anything" was a PDF read perfectly - vendor, $317,750, scope,
  exclusions - shown as a COLLAPSED row called "Untitled comparison". The
  client hardcoded that string at create time and nothing wrote over it, though
  the route pulls a vendor name out of the document seconds later. Name a record
  from what was read as soon as it is known, on the ROUTE so every caller gets
  it, and only while the placeholder is still there - a name somebody typed is
  theirs. `lib/quote-comparison.ts` is the one home for the string and the
  naming rule; the award route used to carry a second spelling of it. AND THE
  RESULT OF PRESSING A BUTTON BELONGS ON THE SCREEN: the row rendered collapsed,
  which is indistinguishable from nothing having happened. Pinned in
  `quote-upload.ts`. **AND THE SECOND REPORT WAS THE NAMER READING A COLUMN THAT
  DOES NOT EXIST**: `comparisonTitle` took `trade` off each QUOTE, and `quotes`
  has never had one - it is on `quote_comparisons`, one table over. Undefined
  every time, so the single-file path looked perfect while every bulk upload
  fell through to "2 quotes". The TEST asserted the same wrong shape as the
  code and went green: a test written from the same misunderstanding confirms
  the misunderstanding. The trade is now an ARGUMENT the route reads off the
  comparison, and several quotes are named after their vendors, because a title
  that counts the rows describes what the reader can already see.
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
- **AND AN EMPTY LIST IS A THIRD FACT, WHICH IS WHY IT MUST NOT BE THE DEFAULT.**
  Reported as intermittent: opening a linked row's Edit Item showed "Nothing -
  it can start whenever it is scheduled." over a link that existed. The dialog
  fetches the links on open and `existing` is `[]` until they land, so ONE empty
  array meant "still asking" and "there are none" - and the panel stated the
  second. Pressing Add appeared to fix it, because Add hides that sentence and
  by then the fetch had landed; a fast request makes the window a blink, which
  is the whole reason it reads as intermittent. The picker takes
  `existingState: 'loading' | 'ready' | 'failed'` and only says "nothing" on
  `ready`. A FAILED read is the worse half: rendering the same sentence lets a
  stale token tell somebody their links are gone. **AND A RESPONSE THAT IS NO
  LONGER WANTED IS DROPPED** - open one row, close it, open another, and the
  first response lands last and paints the wrong line's links. `depsFor` holds
  the id being waited for and every `setState` after an await checks it. Pinned
  in `schedule-cascade.ts`.
- A loading state must have a WAY TO END. `setLoading(false)` as the last
  statement of an async function ends only on the happy path - use
  try/catch/finally, always.
- A plan's bytes are fetched through `/api/projects/[id]/plans/[planId]/file`,
  never `plan.file_url` directly - pdf.js reads them in the BROWSER, so a file
  on another server is a cross-origin read. The route signs `storage_path` fresh
  per request (a stored signed URL is only as good as the key that signed it)
  and streams anything else from our origin. The URL comes off the ROW, never
  the request.
- **AND NEITHER IS THE BROWSER'S. A REQUEST THAT DID NOT COME BACK IS NOT A
  VERDICT.** Three red "Failed to fetch" bubbles over a Compare Responses panel
  that was, underneath them, completely correct - both quotes read, both totals
  right, the recommendation written. Sent as "cosmetic I think"; neither half
  of that was true. The quote-upload route reads a PDF with the model and
  declared no `maxDuration`, so the platform cut the request off mid-read while
  the invoice scan NEXT DOOR - the same work, reported once already - has
  carried 60 the whole time. Eleven of the twelve routes calling the model were
  in the first group: a rule that exists on one door has to exist on the others.
  Every one now declares `runtime = 'nodejs'` and `maxDuration = 60`, ratcheted
  in `scan-timeout.ts`. The second half is the wording: a `catch` handing
  `e.message` to a user makes Chrome's string the app's string, and WebKit - the
  native shell - says "Load failed" for the identical event, so matching one
  spelling shows a phone something different from a laptop. `lib/fetch-error.ts`
  (`isNetworkError`, `fetchProblem`) is the one reader, and it MUST NOT announce
  a failure it did not observe: the bubble said the upload had failed while the
  quote it produced was on screen behind it. Same rule as `lib/auth-outcome.ts`
  - a failure to ASK says nothing - so the sentence says we do not know and to
  reload before retrying, and the caller refreshes in `finally`.
- **AND A BATCH THAT PRODUCED NOTHING MUST NOT LEAVE A RECORD SAYING IT DID.**
  Reported as "bulk upload creates two separate Untitled comparison cards". The
  batch never split: a comparison has to EXIST before files can be posted into
  it, so a batch where every file died left an empty one behind, and the natural
  next move - pressing the button again - left a second beside it. Two cards,
  neither of them a thing anybody made on purpose. The batch deletes the
  comparison it created when nothing landed in it, and SAYS that no comparison
  was made. Pinned in `quote-upload.ts`.
- **A LOOP THAT THROWS ABANDONS THE REST IN SILENCE.** `uploadOne` returned a
  reason instead of throwing, because one bad file used to take every file after
  it down with no message. Fixed on the Request Quotes page one change and left
  in `comparison-block.tsx`, one file over, which is the pattern this repo keeps
  paying for. Both doors now collect every file's answer, say whether it was all
  of them or some, and log each.
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
- **A DATE IN A LETTER IS WORDS, AND THE SERVER MUST NOT ASK ITS OWN MACHINE
  WHAT DAY IT IS.** `formatDate` asks `toLocaleDateString`, which is right in a
  browser - the reader's own machine answering - and wrong on a server, where
  the same date could reach two subs spelled two ways and a test would pass or
  fail on the runner's TZ. `dateWords()` / `dayDelta()` in `lib/dates.ts` are
  built from fixed tables and parsed as UTC. A sub reads "Tue Oct 24", not
  `2026-10-24`: THE WEEKDAY IS LOAD-BEARING, it is how a day gets checked
  against a diary, and the delta is SIGNED because a crew three days early has
  the same wasted morning as one three days late. The shift email's subject is
  the project and the new date and nothing else - it arrived as "...moved to
  2026-10-24" and clipped in the inbox to "2026 moved to 2026-10-24", two
  numbers, neither of them the one that matters. Old date struck and grey, new
  date bold in the accent: ONE thing on the card has to be remembered. The
  block is TYPED (`EmailDateChange`), never HTML passed through data - same
  rule as a guide's inline links. `<s>`/`<strong>` are elements on purpose:
  Outlook renders through Word, where a CSS-only line-through is unreliable.
  Pinned in `shift-email.ts`.
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
- **A VERIFICATION SCOPED TO WHERE YOU EXPECT THE PROBLEM CANNOT FIND IT
  ANYWHERE ELSE.** Git conflict markers shipped to main and to production,
  sitting in THIS FILE. The resolution was right; the check was
  `grep -rn "<<<<<<<" app components lib` - three directories, and CLAUDE.md is
  at the repo ROOT. It reported clean, and the markers went out past a green
  tsc, a green build and sixty passing suites, none of which read markdown.
  `merge-markers.ts` now walks the WHOLE repo, every extension, and names
  CLAUDE.md explicitly so a future narrowing of the walk cannot quietly stop
  covering the root. After resolving any conflict, run `npm test` - not a grep
  you typed from memory over the directories you happened to touch.
- **Tests live in `lib/__tests__/` and run with `npm test`.** They used to be
  written into a session scratch directory, which meant nobody but the agent
  could run them, they were never in CI, and sixty-five of them vanished the
  moment the container reset - silently, while the code they guarded carried on
  working. A test that only one process can run is not a test. See
  `lib/__tests__/README.md` for the convention, of which the important half is:
  reintroduce the bug and confirm the test goes red, because a test that has
  never failed is a guess about what it covers.
