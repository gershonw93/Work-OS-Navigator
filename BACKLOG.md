# SyteNav - Back Burner (future updates)

Parked ideas and future work. Not committed to a timeline. When we pick one up,
move it to **In progress**, and when it ships, move it to **Done** with the PR #.

> Keep this current: when we defer an idea, add it here; when we ship one, mark it done.

---

## 🔌 Integrations
- **QuickBooks Online sync** - *phase 1 shipped (PR #185, #187):* per-company OAuth connect + one-way push from Settings > Integrations of customers, subs (vendors), sub bills (approved/paid invoices -> QBO Bill), and client payments (-> QBO Sales Receipt). Entity id mapping (no dupes), auto-creates the referenced vendor/customer, sync log. Bills post to a default expense/COGS account, payments to a default service item. **Next:** account/item mapping UI, GC->owner invoices (pay apps -> QBO Invoice), pull-back and two-way. Desktop is a separate, larger track. Live against the Intuit sandbox; production needs Intuit app review.
- **Budget/proposal -> QuickBooks** *(requested)* - push a proposal/estimate straight into QBO as an **Estimate**, so accepting it can convert to a QBO Invoice on their side. Same for a sub's quote line items. Needs the item/account mapping UI first (each line needs an Item), which is why it sits behind the mapping work above.
- **Stripe / Plaid (collect payments in-app)** - turn Payments from a ledger into a money-mover; auto-reconcile escrow. Possible revenue line.
- **Ramp** *(back burner - discussed)* - corporate cards + auto receipt capture (texts the crew for a photo). Link via their developer API (OAuth) → pull transactions + receipt images into Materials; user tags job + budget line. Caveats: only helps customers on Ramp; **API access needs partner approval (start that clock early)**. Competitors: Brex, BILL/Divvy - build the "card feed → materials" pipe generic.
- **Xero** - accounting sync for non-QuickBooks shops.
- **Public API + Zapier/Make** - one clean API + a Zapier app instead of 30 point integrations; lets users wire the long tail themselves.
- **Google Calendar / Outlook two-way OAuth** - full sync (events appear with no confirmation + editable). We shipped the read-only iCal feed (#99/#100); this is the heavier upgrade.
- **DocuSign / e-signature** - sign subcontracts and change orders (numbers already generated).
- **Google Drive / Dropbox / OneDrive** - mirror project files and daily-log PDFs.
- **CompanyCam** - jobsite photos.
- **Procore / Autodesk Construction Cloud** - for GCs who also run Procore.

## 🧰 Settings that do not do anything
- **Settings > Preferences > "Default Project Type"** *(found while consolidating the project form, PR #294)*. The dropdown offers Residential / Commercial / **Renovation** / Mixed Use, but the string `default_project_type` appears nowhere else in the codebase and the new-project form applies no default type at all. It also offers **Renovation**, which is not one of the three types the project form or the database actually use - so even if it were wired up, picking it could not be represented. Same shape as the notification toggles that saved nothing (fixed in #290): a control that looks like a setting and is not one. Either wire it into `ProjectForm`'s defaults fetch alongside `default_billing_mode` and `default_contract_type`, or remove it.

## 📣 Notifications & comms
- **Sub-side bidding UI needs a pass** *(after the bid merge, PR #297)*. `/my-bids` renders a tabbed section fed by `invitations`, which the API now returns EMPTY on purpose - it was built on bids-table concepts ("revision requested", "awarded") that were statuses on a table nothing writes to any more. The page renders correctly because it guards its empty state on both lists, but that tabbed block is unreachable code and should be removed. **Also missing as a result:** a sub can no longer see that a revision was requested or that they won, from this page. Both states exist in the new system (`bid_invites.status`, `quote_comparisons.awarded_subcontract_id`) and need wiring.
- **Ask a sub HOW LONG and WHEN THEY CAN START.** The old `bids` table had `duration_days`, `crew_size`, `earliest_start_date`, `payment_terms` and `scope_categories`; `/bid/<token>` collects none of them, so they were not carried across in migration 081 - they were aspirational columns on four stale rows. But they are good questions, and a GC comparing three quotes on price alone is missing half the decision.
- **Retire the legacy bid tables and routes.** `bid_packages`, `bid_invitations` and `bids` still hold their rows (nothing was dropped - 081 copied). The six `api/projects/[id]/bids/*` routes and `api/my-bids/[packageId]` are unreachable from the UI but still exist. Drop both once the merge has been live long enough to trust. Note `invoices/[invoiceId]/print` still fetches `/api/projects/[id]/bids` without using the result - clean that up first.

- **BIMI: the brand logo in the Gmail sender circle** *(researched, blocked - not a budget problem)*. Gated on three things: DMARC at `p=quarantine` or `p=reject` (we are deliberately at `p=none` while gathering reports); an SVG Tiny PS logo, square, under 32KB, on HTTPS; and a certificate. A **VMC** (~$749-1,750/yr) requires a REGISTERED TRADEMARK. A **CMC** needs no trademark but requires the logo to have been in continuous public use on the domain for **12+ months** - `sytenav.com` is far too new, and Gmail shows no verified checkmark for CMC anyway. **Unblocks when** the domain has a year of history (CMC) or the mark is registered (VMC), and DMARC has been moved to enforcement. Do not buy a certificate before then; it will fail validation.
- **Notification digest** *(deliberately deferred, see PR #290)*. Per-type email toggles with mostly-off defaults make immediate sends safe at current scale. Once several Category B emails are live, a daily digest is the right answer - one mail listing what happened rather than eight.
- **Four notifications that have a switch but no sender** - RFI answered, daily log posted, change order raised/decided, invoice approved-or-rejected notifying the *submitter*. Each is listed in `lib/notifications.ts` with `status: 'planned'` and shows as "Coming soon" in Settings. Building one is: emit `notify({ type })` from the right route, then flip `status` to `'live'`.
- **`invoices` POST notifies the person who just created the invoice** (`app/api/projects/[id]/invoices/route.ts`) - "Invoice X is pending your approval" goes to the GC who raised it. Preserved as-found during the notify() migration rather than quietly changed. Probably wants to notify approvers instead; worth confirming the intent before touching.
- **Transactional email - DONE for every flow that had a Send button** (#287 plumbing, #290 notifications, #295 client portal, #296 quote requests / compliance requests / shared files / client invoices). `lib/email.ts` sends via SendGrid and never throws; `lib/send-link.ts` + `components/ui/send-link-box.tsx` are the shared path for "email somebody a token link". **What is left:** inspection notifications, which are in-app only by design until somebody asks. All of it degrades correctly when `SENDGRID_API_KEY` is unset - every button reports "not set up yet" and falls back to Copy Link.
- **SMS reminders (Twilio)** - "text a receipt" for Materials, "inspection ready" to the scheduler, payment receipts to clients. Universal alternative to Ramp's receipt-texts. Smaller build, works for everyone.
- **Slack / WhatsApp** - pipe project activity to a crew channel.

## 📐 Plans
- **Pin-to-task on plans** - drop a pin on the plan and create a task for an employee from it; pins color-coded per assignee; pins anchor to the plan coordinates so they stay put through zoom/pan; read the plan's title-block scale first ("every plan has a size in the corner") to know real-world dimensions. ⚠️ Design note: build our own take on this (differentiate from Raken/PlanGrid-style implementations - avoid copying UI/flows wholesale).

## 🧮 Estimating (light - NOT full takeoff)
- **Estimate → Proposal (phase 1 shipped, PR #194):** the Budget sheet is the estimate. Added a Markup % on it (reuses the project contractor_fee_pct so markup = billed fee), a live Client price, and a "Generate Proposal" client-facing PDF (`/projects/[id]/proposal/print`) with Lump sum / By section / Itemized detail levels, branding, valid-until, terms, signature. Raw cost/margin never shown. On win, the same budget is already the baseline. **Next:** per-line markup override, editable scope/inclusions-exclusions text, "pull from leveled quotes → estimate" for bigger GCs, save/track proposal versions + accepted status.
- **Do NOT build true takeoff** (measuring quantities off PDF/CAD plans) - that's Accubid/PlanSwift/STACK territory, years of work. Contractors keep naming estimating as a *separate* cost, so even a light builder is a differentiator.
- Maybe later: AI "upload the plan → rough room/fixture counts" helper (approximate, not surveyor-grade).

## 📝 Documents
- **E-signature** *(discussed and deliberately not built)*. Fill-in-text shipped without any signature affordance on purpose. A real signature feature is not the drawing - it is identity/authentication, provable intent, consent to transact electronically, tamper-evident sealing, and a Certificate of Completion that survives being contested. Building it half-way is worse than not having it, because people rely on an audit trail that isn't there. **Blocked anyway** on transactional email (see Notifications), since a signature request you can't deliver, remind on, or evidence delivery of isn't an e-signature product. **Preferred route: the DocuSign integration already listed under Integrations** - it brings the legal weight with it. Never home-roll lien waivers; several states have statutory forms with notarization requirements.
- **Fill-in on a share link** - let an expeditor or sub fill a form you sent and send it back. The upload-back half already works, so it's a small add, but it's near-useless until transactional email lands.
- **Rotated pages in the PDF filler** - pages saved with a /Rotate of 90/180/270 are detected and refused rather than placed wrong. Needs the coordinate mapping through the rotation.

## 💰 Money
- **Client invoice: token link + emailed delivery** *(the shipped invoice prints and saves as PDF; sending it is still manual)*. Built in PR #264 off recorded costs with a show-markup toggle. **Next:** a `/bill/<token>` page so a client with no account can open it on a phone, and delivery once transactional email lands. Also worth having: billing a deposit or a % of contract rather than only actual costs, and reconciling recorded client payments against specific invoices instead of the project as a whole.
- **Split one invoice across budget lines** *(deferred from PR for invoice→budget visibility)*. A supplier bill that covers two trades - lumber and hardware, say - can only land on one line today, because an invoice inherits its line from its subcontract. Wanted: split the amount across several lines on one invoice. **Explicitly NOT wanted: a per-invoice line override.** The single-line-per-contract rule is what keeps a contract's invoices adding up against one line; splitting adds detail within that rule, overriding breaks it.
- **Approving a change order optionally bumps the client contract** (we did sub-side; consider explicit client-revenue side too).
- **Forecasting / cash-flow projections** beyond the current budget × (1+fee).
- **Bank-facing budget & sellout** *(tester request)*. Abe: "when you create a bank budget and bank sellout they might be presented in a different way." The working budget and the version a lender wants are formatted differently. Needs a lender report format - probably an extension of the proposal PDF rather than a new thing.
- **Full development pro-forma** *(tester request - partially addressed)*. A tester who develops (not just builds) wanted the spreadsheet they use as step one: land purchase, design, approvals, soft costs, then a return projection. We shipped the piece every GC needs - hard/soft cost split on the budget + a planning-stage menu (see Recently shipped). **Not built, deliberately:** land acquisition as its own record, debt/equity stack and draw schedule, carrying-cost-over-time modeling, and ROI / profit-on-cost / IRR outputs. That is a developer pro-forma tool, a different product from a GC's job budget - revisit only if more than one customer asks.

## 💼 QuickBooks
- **Two-way sync** - pulling payments/bills recorded directly in QBO back into SyteNav is not built; today is push-only, which means QBO-side edits drift silently.
- **Partial and over-payments against an invoice** - a payment applies to the OLDEST open invoice for the project, whole. Splitting one cheque across several invoices, or a payment larger than the invoice it settles, is not modelled.
- **Voiding/deleting a sent invoice** does not retract the QBO Invoice; it stays as an open receivable until someone voids it in QuickBooks.
- **Detect orphaned QBO records** - a QuickBooks invoice/receipt no SyteNav row points at (from a pre-fix duplicate, or an invoice deleted here). Surface them on the Settings card with a void action, rather than leaving them to inflate A/R silently.
- **Connection-expiry warning**: the refresh token dies after ~100 days unused; auto-push keeps it warm on active companies, but a dormant company still lapses silently. Surface "connection expired - reconnect" in the bell, not just the Settings card.

## 🧾 Materials
- **Edit existing receipts** - change the job or attach a budget line to a receipt after the fact (currently set at creation).
- **Auto-suggest job/budget line** from the merchant name on the receipt.

## 🏢 Sites (multi-unit / multi-floor jobs)
Shipped in #218: bulk creation makes a site + a job per unit/floor/house, with a Jobs tab that rolls up budget vs actual. Deferred from that work:
- **Attach an existing project to a site** (and move one between sites) - today grouping only happens at bulk-create time.
- **Push down from the site**: apply a budget template, a schedule, or a team assignment to every unit at once. Biggest real time-saver once someone runs a real building through it.
- **Roll-up beyond budget**: schedule/progress across units, and one client-facing report for the whole building.
- **Per-unit variations** - unit types (2BR/3BR) with their own budget template, rather than every unit starting identical.

## 🗓️ Calendar
- **Week / agenda view** and **filter by project** on the Master Calendar.
- **Per-project calendar tab** (not just Master).

## ✍️ Work signoffs (planned - next up)
- **Signature-based approval of completed work** (distinct from percent-done tracking and button approvals). Reuses the existing signature pad (daily logs already collect one).
- **Frontend placement:**
  - *Tasks tab* - "Request signoff" on a completed task → assignee/sub signs → GC countersigns; signed badge on the task card.
  - *Progress lines* (quote line items) - a "Sign off" action when a line hits 100%, so payment-linked milestones carry a signature.
  - *Daily logs* - rename the existing signature step to "Signoff" for consistent wording.
- Notifications: requester notified when signed; signoff stored with name + timestamp + signature image.

## 🏗️ Field / Inspections
- **Email/SMS for inspection notifications** (currently in-app bell only).
- **Inspections on the per-project Schedule tab** (currently on Master Calendar).

## 📱 Misc
- **Screenshots in the Help Center** - schema already supports image blocks; drop them in per step when captured.
- **Mobile app polish** (Capacitor remote-URL build already prepped).

---

## ⚡ Performance
- **Audit what else middleware does per-request.** Removing `supabase.auth.getUser()` from `/api/*` cut a network auth round trip off every API call. The remaining page requests still pay for it; consider whether the routing decisions could use a cheap cookie presence check and leave real verification to the page.
- **The 3s auth timeout in middleware fails OPEN** - on timeout `user` is null, so the convenience redirects do not fire and the page renders. Fine because pages and API routes verify independently, but worth revisiting if middleware ever becomes a real gate.
- **Other pages with bare `await fetch()` and no catch** will hang their save buttons the same way the schedule page did. `saveRequest` in `app/(dashboard)/projects/[id]/schedule/page.tsx` is the pattern; it should move to `lib/` and be applied broadly.

## 🧹 Error handling
- **54 `alert()` calls across the app.** There is no toast component, so every failure that is not hand-rolled into a form shows a grey browser box with whatever the server said. `lib/db-error.ts` fixes the message quality server-side and the Add Subcontractor modal now renders its own error, but the other call sites are unchanged. Needs one toast/inline-error pattern, then a sweep.
- **`friendlyDbError` is only wired into the subcontracts route.** Every route that returns `error: err.message` straight from Postgres should go through it.
- **Audit remaining NOT NULL columns for the same trap** as `subcontracts.contract_amount` - a column that is required by the schema but optional in real life produces exactly this failure. `scope` and `trade` on `subcontracts` are both NOT NULL and both are things you might not know on day one.

## 🔔 Notifications
- **Retire the legacy bid tree** - `app/api/projects/[id]/bids/[packageId]/{award,invite,remind,revise}`, `app/api/projects/[id]/bids/packages/*`, and `app/(dashboard)/my-bids/[packageId]` are unreachable: the Bids tab that linked to them went in #297, and `/api/my-bids` returns `invitations: []`. The dead-switch check has to explicitly EXCLUDE that tree (`UNREACHABLE` in `dead-switch.mjs`) so an emitter nobody can trigger doesn't count as an emitter. Delete the tree and the exclusion together.
- **"Milestone reached" needs a milestone event.** Marked COMING SOON because nothing raises one - the only milestones in the app are payment-schedule line types on a subcontract, which is a billing shape, not a moment in a job. Wire it to the schedule when the schedule has real milestones.
- **"Bid revision requested" needs a revise flow.** Marked COMING SOON. Today a sub revises by re-opening their link and re-submitting, which replaces their quote; there is no GC-side "ask for a revision" action to notify about.
- **Notification digest** - a daily/weekly roll-up instead of one email per event.
- **Run `dead-switch.mjs` in CI.** It lives in the scratchpad and has already caught two dead switches nobody had noticed. It belongs in the repo next to a real test runner.

---

## ✅ Recently shipped (for reference)
- QuickBooks records are matchable: project name in the memo/line description, SN-<id8> in DocNumber, same ref in the SyteNav chip tooltip. "Update formatting" on the Settings card refreshes already-synced records in place (chunked 25/call under the 60s route ceiling), sharing the same composers as the push (#313, #314)
- Customers push on create AND edit (migration 086 adds `customers.qbo_claimed_at`); an existing QBO Customer is updated in place via fetch-modify-post rather than duplicated. Vendors are still created lazily on first bill approval - same treatment is the obvious next step (#319)
- "Mark paid" on a client invoice opens the real Record a client payment dialog (same treatment deposits got in #305) - it was a bare status flip that recorded no money and left the QBO invoice open; payment is recorded BEFORE the status flips so the applied-payment lookup still finds the invoice as 'sent' (#318)
- Atomic push claim (migration 085 `qbo_claimed_at` on client_invoices/client_payments/invoices): a conditional UPDATE replaces the check-then-act guard that let a double-press create QBO invoices 291 AND 292 for one record; stale claims expire after 2 min so a crashed push self-heals; invoices adopt an existing QBO invoice with the same DocNumber rather than duplicating (#317)
- Payment method (Check/ACH/Wire/...) maps to a QBO PaymentMethod, creating any the company lacks, cached per sync run; Update formatting backfills it onto already-synced receipts without ever blanking one set inside QuickBooks (#316)
- Accrual model (migration 084): sent client invoices push as QBO Invoices (A/R) with the user's own invoice number; payments apply against the oldest open invoice via LinkedTxn, falling back to a Sales Receipt when nothing is outstanding (deposits). `client_payments.qbo_txn_type` labels which model wrote each row; the 104 legacy receipts are backfilled and left untouched (#315)
- QuickBooks auto-push: client payments on record and sub bills on approval push themselves via shared pushers (lib/quickbooks-push.ts) that the manual Settings sync also uses - never throws, 8s cap, sync-log on miss; payments chip reads the real qbo_id with the hand-tick kept for manual entry; Settings card shows the unsynced backlog (#312)
- Portal Payments card: the client_payments ledger rendered client-side-safe (date, memo, amount, deposit chip, total) - the asks vanish once answered and nothing acknowledged the money moved (#311)
- Client portal lists sent/paid invoices with an outstanding total, each linking to its /bill page - they only ever existed inside the send email before; drafts excluded on the same never-surprise rule as payment requests (#310)
- Job Overview as the landing page for a job (was a redirect to Plans, a file list): money position + "waiting on you" / "waiting on someone else" + next three weeks, all linking through. GC-side only; subs and sites are sent on to Plans. Deliberately NOT a checklist - an active job is a loop with no finish line, and a list that is never complete becomes noise (#306)
- "Mark paid" on a deposit request opens the real Record a client payment dialog (prefilled, fully editable) and settles the request against the payment it creates, instead of flipping a status with no money behind it (#305)
- One-off deposit requests take a percentage as well as a dollar figure, resolved server-side against the estimate; `useClientEmail` hook so the Send box prefill has one reader instead of two disagreeing about the response key (#304)
- Request a deposit / stage payment (migration 083 `client_payment_requests`): amounts resolved from the estimate's `payment_stages`, emailed via the existing token-link send, shown on the client portal once sent, and reflected in the go-live checklist. Deliberately NOT an invoice row - an invoice means approved costs plus markup, and filing a deposit as one would double-count it when the real costs arrive (#303)
- AIA jobs could not record a client payment at all - `payments` was hidden on AIA, and it is the only writer of `client_payments`; the page now hides just its invoice-raising half and points at Pay Apps, and the tab-redirect guard checks the same predicate as tab visibility so a hidden tab can never render as an orphan (#302)
- Preconstruction deadlock: the go-live checklist gated on a deposit while hiding the tab that records one, so the link bounced to Plans; `payments` removed from `PLANNING_HIDDEN`, with a check cross-referencing every readiness href against the tab list (#301)
- Middleware no longer runs a Supabase auth round trip on `/api/*` (it was never used there) - the cause of 504 MIDDLEWARE_INVOCATION_TIMEOUT and stuck "Saving…" buttons; auth check bounded at 3s; schedule saves get a 20s abort and real errors, and add/edit milestone stopped ignoring failures entirely (#300)
- Subcontractor contract amount is optional (migration 082): add a sub before their price is agreed, shown as "Not set" rather than $0; failed saves no longer orphan a company in the Directory; Postgres constraint errors mapped to plain English inside the form instead of a raw alert(); removing a bid invite now confirms first (#299)
- Quote notifications made real: submitting or declining through `/bid/<token>` notifies the GC (it notified nobody before, on the only path most quotes arrive by); awarding notifies the winner, or emails them if they have no account; re-sending an invite goes out as a reminder and emits `bid_reminder`. Plus a generalised check that every `status: 'live'` notification type has an emitter (#298)
- Task board: per-card Open/In Progress/Completed buttons (always visible, one tap to any stage), per-column `+` actually adds to that column (all three used to create in Open), and the status icon is now an indicator rather than a hidden control (#298, #299)
- Contract type on projects (cost-plus / fixed price / building to sell): the Budget tab stops showing a contract-value box AND a markup box with "leave it empty on cost-plus" under them; real profit on cost-plus from the fee actually earned; per-invoice markup controls no longer hidden when the project rate is 0 (#267)
- Cost-plus proposal PDF: on a cost-plus job the proposal now prints estimated cost of work + contractor's fee at its stated percent + an estimated total, plainly labelled an estimate rather than a fixed price, with cost-plus terms (#268)
- Selections board: homeowner choices with allowances and lead-time-driven decide-by dates, a 21-category starter board, options with prices, client picks on the existing portal link, over-allowance → one-click change order (#232)
- Item lists: priced line items on an RFQ - takeoff/paste/manual entry, header-scoring importer verified against two real takeoffs, sub prices each line on their link, GC compares line by line (#231)
- Architecture map: interactive `docs/architecture/architecture.html` + machine-readable `architecture.json` (nodes/edges/25 flows) for AI agents, with a validating build step (#207)
- Equipment tracking + history (#76, #78)
- Compliance doc requests by email + AI scan + partial uploads (#79, #80)
- Money fixes: change orders wired to Financials, single budget number, payments UX, vendor invoice uploads (#81, #82)
- Help Center with search (#83–#85)
- Materials: snap receipt → assign job → budget line, project tab (#86, #87, #89, #90)
- Inspections: request → schedule → notify → result, card-after workflow (#91, #93)
- Calendar: read-only iCal feed + one-click Connect + day detail view (#99–#101)
- Sellout → projected profit on the budget, and total sellout vs total cost across a site's units (#221)
- Status badge is a switch, with a data-driven pre-flight before a job goes Active; project PATCH/DELETE permission-gated (#219)
- Bulk project creation rebuilt: sites (parent/child projects), unit + floor as real fields, floor-by-floor mode for commercial, server-side geocoding so batches reach the map, entry point on the Projects page (#218)
- Budget categories: 49 trades in build order + custom categories that persist across jobs (#217)
- Project Settings: address-dropdown fix, billing method + square footage editable after setup (#216)
- Preconstruction: hard/soft cost split on the budget (own section + subtotals + standard soft-cost starter list) and a planning-stage project menu that hides the site/billing tabs until the job goes Active
