# SyteNav - Back Burner (future updates)

Parked ideas and future work. Not committed to a timeline. When we pick one up,
move it to **In progress**, and when it ships, move it to **Done** with the PR #.

> Keep this current: when we defer an idea, add it here; when we ship one, mark it done.

---

## 📱 On the shelf - the app, then chats (decided 29 Aug 2026, IN THIS ORDER)

**Order agreed: finish QuickBooks → App Store → project chats.** Each needs the
one before it. Chat on a phone nobody has installed is wasted work, and starting
the biggest build yet while the books are half-wired ends with both half-done.

- **1. SyteNav in the App Store (Capacitor) - IN FLIGHT.** The repo side is
  built (#332): Capacitor + the `ios/` project committed, permission strings and
  the push entitlement, icons and splash, an offline screen, safe areas, push
  end to end, and QuickBooks deep-linking back into the app - the one thing this
  entry said needed code. The shell loads the LIVE site rather than a bundled
  copy, so web fixes still ship in two minutes; only changes to the shell itself
  wait on Apple review.
  **Blocked on Apple, not on us**: the Developer Program enrolment (D-U-N-S in
  hand), the two `.p8` keys, and Codemagic. Runbook: `MOBILE.md`.
  Still to do here:
  - **Universal Links** so a password-reset or invite email opens the app. The
    server half ships inert (`/.well-known/apple-app-site-association`, 404
    until `APPLE_TEAM_ID` is set); the entitlement waits until after the first
    successful build, because one the App ID does not carry fails code signing.
  - **A What's New entry and a Help article** - deliberately NOT written yet.
    Nothing about this is visible to a web user, and an article about a phone
    app nobody can install is Help drifting the other way. Due the day it hits
    TestFlight, along with the notifications article.
  - **Per-type push control.** Push follows the in-app switch, and which seven
    types buzz is our call in `lib/notifications.ts`. Right for now - one switch
    beats three columns of toggles - but if somebody wants the bill approvals on
    their phone and the task assignments only in the bell, that is a `push`
    column on `notification_preferences` and a third column in Settings.
  - **A demo account for the reviewer**, and Android (`npx cap add android`).

- **2. Project chats, one per sub, inside the job.** Replaces the dozen WhatsApp
  groups a GC runs per project. **The chat is the small half - a week.** The tall
  half is push notification on an installed app, which is why it comes after the
  store. Today there is NO push, NO service worker, NO PWA manifest and NO use of
  Supabase realtime anywhere in the codebase.
  - Push should be a THIRD channel in the existing plumbing, not a new system:
    `lib/notifications.ts` already has `type Channel = 'inApp' | 'email'` and a
    `wants(prefs, type, channel)` gate, and `lib/notify.ts` is already the one
    way to tell somebody something. Add `'push'` and every existing alert gains
    it, under the same per-type preferences. Needs a `push_subscriptions` table,
    and dead endpoints (410/404) pruned on send or it fills with wiped phones.
  - Tables: `project_channels`, `channel_members`, `channel_messages`,
    `chat_participants` (the sub with no login). Membership is EXPLICIT, never
    "everyone on the project" - that is what makes it safe to have a client
    channel and a sub channel on the same job.
  - Subs join by magic link, same shape as `/bid/[token]` and `/bill/[token]`:
    service-role route keyed on a token, no account. Token belongs to the
    PARTICIPANT not the channel, so it is revocable in one place.
  - Voice notes: `MediaRecorder` to a new bucket. iOS Safari produces mp4 where
    Android produces webm/opus - both must store and play back, and that
    difference is where this usually breaks.
  - **What WhatsApp structurally cannot do, and the whole reason to build it:**
    attach a drawing already in the project instead of photographing a screen;
    turn a message into an RFI or a task in one tap; history stays with the job
    when a foreman leaves; the client cannot see the sub channel.
  - Honest risks: iPhone install rate is the adoption cliff (plan an SMS
    fallback for people who never install); a jobsite chat becomes a legal
    record, so retention/export/deletion need deciding BEFORE launch, not after
    the first dispute; check the Supabase realtime connection ceiling on the
    current plan; and this is the largest thing SyteNav has built.

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
- **Editing the lines of a sent invoice** is not possible by design - void and reissue instead. If a use case appears for correcting a typo without a new number, it needs thought about what the client's copy says.
- **Detect orphaned QBO records** - a QuickBooks invoice/receipt no SyteNav row points at (from a pre-fix duplicate, or a bill deleted here before deletes voided). Surface them on the Settings card with a void action, rather than leaving them to inflate A/R silently.
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
- Who can see the money, and forms that say what is wrong (#342). Three from a tester's role review. **The real leak:** `/api/dashboard/activity` filtered a non-admin to their own actions with `if (!isCompanyAdmin && fullName)` - so anyone whose profile had a blank `full_name` fell straight past the guard and got the WHOLE company's feed, `budget_line_added` entries and their amounts included. A guard that only holds when an optional field happens to be filled in is not a guard. Now fails closed and matches `actor_id`, because a display name is not an identity (two people with one name saw each other; renaming yourself emptied your own feed). **Role preview:** the Master section and both master pages gated on `realRole`, so an admin previewing Field Supervisor kept their own Master Money link - the preview reported the wrong answer to the exact question it exists to answer, and it was the money half it got wrong. Gated on the previewed `role` now; the server was never fooled (`/api/master/money` and `/api/dashboard/overview` both 403 on the real DB role, and `visible.money` on the stats route is already `canSee('financials') || canSee('budget')`, which Field Supervisor fails). **Validation:** every required field on the project form was `required` and nothing else, so a blank Start Date got a browser tooltip and the field's ACCENT ring - lime green, which reads as approval. The tell was Owner / Client: the one field with NO `required`, checked in JS, showing a proper red message. The unvalidated field gave the better error. Rules extracted to `lib/project-rules.ts` and rendered through `Field`, with `noValidate` so the browser stops competing.

## 🔑 Roles - decided and shipped (#343)
- **Costs vs margin split.** `budget` covered both what a job costs and what you make on it, so a project manager could not be given the first without the second. New `margin` resource; `project_manager` and `office_staff` default to N, admin/manager keep it, and it is grantable per person. Withheld by `/api/projects/[id]/budget` (contractor_fee_pct, sellout_amount, markup_earned, fee_basis, contract_type all null without it), not merely hidden - #337's lesson. `contractor_fee_pct` returns **null, not 0**: zero is a real markup, and sending it would state a fact rather than withhold one.
- **Settings now uses the permission map.** It filtered tabs with hardcoded role names and never read `settings_company` / `settings_team` / `settings_billing` - and NOTHING else read them either, so those three switches in the Permissions grid did literally nothing. Tabs are gated by resource + action, with the tiering carried by the action: Company needs `view`, Security `edit`, the Danger Zone `delete`. Role defaults adjusted so every shipped role keeps exactly the tabs it had - asserted by a parity test that replays the old hardcoded matrix, which caught `manager` gaining Security when settings_company was set to VCE. The `?tab=` deep link is checked too; it used to set the active tab straight from the URL with no permission check, so a hidden tab was reachable by typing its name.

## ✅ Second review pass - fixed (#338)
- Client portal 0% on every trade: it read `subcontracts.progress_percent`, a manual billing field only written when a sub bills by percentage, while the Progress tab used amount-weighted `budget_line_items.progress_pct`. New `weightedProgress()` in `lib/invoice-budget.ts` is now the single derivation for both. Returns **null, not 0**, when nothing is marked - a confident 0% in front of a customer was the actual damage.
- Reports header blank: `/api/projects/[id]` exported PATCH and DELETE and **no GET**, so the fetch 405'd silently. Added, guarded. The page's `Project` interface also declared `client_name` and `contract_value`, neither of which exists - a type vouching for a row shape it had never seen.
- Schedule opened on the earliest item; now today, clamped into the schedule's own span.
- "Left to spend" said the subtraction but not why it differs from Committed.

## ✅ Input validation sweep (#339)
- `lib/validate.ts` - `money()`, `percent()`, `email()`, `phone()`, `usState()`, all pure, all returning a value AND a reason. **`money()` keeps the sign and then judges it**, which is the root fix: eight sites did `.replace(/[^0-9.]/g,'')` and then asked `amount <= 0`, so the guard never saw a negative because the clean had eaten it.
- `lib/dates.ts` - one formatter. A bare `YYYY-MM-DD` is a calendar square, not an instant; `new Date()` on one is UTC midnight, which is the evening before in every US zone. Replaced three separate `fmtDate` copies and 20 unguarded parses.
- `components/ui/input.tsx` gains `error`; new `components/ui/field.tsx` puts the message under the field. 251 inputs across 36 forms cannot be made consistent by asking each form to remember.
- State field is a picker; `usState()` normalises a full name and REFUSES the unrecognised rather than truncating.

### Still to do on validation
Inline messages are wired on the money and identity fields. The remaining
free-text fields keep their existing "required" handling - with `Field` and
`lib/validate.ts` in place each is a two-line change, but it is ~160 inputs and
belongs in its own pass rather than buried in this one.

## 📋 Reported and NOT a code bug - data
- `Elecric`, `cm electrical maintenace corp`, companies named `gershon` / `accounting` / `jacob`. **Now confirmed reaching the client portal.**
- Roofing selections linked to wrong budget lines - "Ridge vent" on Concrete/Foundations, "Shingle product and color" on Flooring/LVT. Checked: `matchBudgetLine` returns Roofing correctly and the bulk-apply keys by selection id, so these were set by hand.
- Both fixable in one statement when the user says so.

## 🔒 Still open from the same review (in order)
- **Cross-company scoping on writes.** The guard checks your ROLE, not that your company owns the project. Subs legitimately write to jobs they do not own (bills, daily logs, time), which is why `ownsProject` is a separate question - so this needs a per-route decision about which writes a sub may make, not a blanket rule.
- **The other ~110 unguarded write routes** - everything outside money/project data.
- **Client portal links never expire.** Anyone holding one sees invoices and payment history. Needs expiry + revoke. Now documented honestly in the Help article `data-security` rather than left unsaid.
- **Leaked-password protection is off** (Supabase advisor, WARN). Auth can check new passwords against HaveIBeenPwned; it is a dashboard toggle in Auth settings, not a migration, so it did not ship with #340.
- **RLS is deny-all, with zero policies.** That is deliberate - every read goes through an API route holding the service-role key - but it means the advisor will keep reporting `rls_enabled_no_policy` at INFO for ~60 tables forever. If we ever want the browser to read a table directly, it needs a policy written for it, not RLS switched back off.
- **"Committed" means three different things.** Budget $776,621, Summary $534,101, Master Money $534,101. Also Budget $863,400 revised vs Master Money $855,400 original; Change Orders says $8,050 approved while Budget absorbed $8,000; Reports uses another invoice basis and counts a draft. Each is defensible alone; together they teach a GC not to trust the software. Needs ONE shared derivation, the way `lib/invoice-budget.ts` already gives the budget tab one - then the breakdowns.
- **Smaller, all reported together:** Schedule opens on June 2026 instead of today on an active job; Job History reads "no activity yet" while the dashboard lists plenty; Dashboard says 14 Active vs Projects' 9 Active + 4 Planning + 1 On Hold; bills copy points at "Payments" but the tab is "Billing the client"; QuickBooks has seven sync buttons and wants one Sync All; Dashboard "This week" is empty despite 68 open tasks (either it only counts scheduled work - then say so - or it is not pulling).
- **Typos are in LIVE data, not the seed** - `Elecric` as a trade, `cm electrical maintenace corp`, companies named `gershon` / `accounting` / `jacob`. Not a code fix; either clean the rows or demo from the demo account, which has invented data with none of this.
- Correcting or deleting a sub bill reaches QuickBooks - the last two holes, both on the money-OUT side. `pushBill` opens with "already got a `qbo_id`? nothing to do", so an amount corrected in SyteNav never went across: approve $5,000, correct to $4,000, QBO says $5,000 forever, silently. New `updateBillInQbo` does fetch-modify-post on the existing Bill (never a second one) and **refuses in two cases, both explained on screen**: the bill is already paid (`qbo_payment_id`, or a zero Balance meaning a bookkeeper settled it there) - moving the amount under an applied payment leaves a stray credit; or the expense line is not the single one we wrote, meaning somebody re-split it over there and their split is not ours to overwrite. DELETE had no QBO call at all, against `voidClientInvoiceInQbo` on the receivable side since #320 - new `voidBillInQbo` voids **the payment first, then the bill**, because QBO refuses to void a Bill a BillPayment still references. The row is gone by then, so the ids are captured before the delete (`billQboRefs`, with a `42703` fallback so a database without 089 can still delete). A 610 on the fetch is success, not failure - somebody voided it by hand. Both confirmations and the edit dialog now say whether QBO followed (#331)
- The app can say "that failed". `usePermissions` returned null permissions for BOTH "still loading" and "the call failed", and `sidebar.tsx` filters out every nav item whose `resource` is not permitted - so a failed `/api/me/permissions` rendered four links, no explanation and no way back, permanently. It now has a third state (`error`) plus `reload()`; the sidebar shows a skeleton while loading and an inline retry on failure; no session redirects to `/login` rather than sitting in a shell. Same shape on the dashboard: `load()` ended with `setLoading(false)` as its last statement, no catch and no finally, so anything that threw left the skeletons up forever - now try/catch/finally with an EmptyState + Try again. **The rule: a loading state must have a way to end.** Also `lib/supabase/current-user.ts` now caches the CLIENT, not just the answers - #328 had `currentUser` and `currentProfile` each call `createClient()`, and since `server.ts` swallows cookie writes, a rotation by the first client leaves the second presenting a token that was just rotated away (#329)
- Project pages load fast again. #325's customer-name line put THREE sequential round trips in `app/(dashboard)/projects/[id]/layout.tsx` - the layout wrapping every project page - and two of them (`auth.getUser()`, `profiles`) re-asked what `(dashboard)/layout.tsx` had resolved a moment earlier. Seven sequential trips before first paint, on every navigation. New `lib/supabase/current-user.ts` wraps `currentUser`/`currentProfile` in React `cache()` (Next dedupes `fetch`, not Supabase client calls) and selects every column either caller wants in one read; the customer joins onto the project query as `customers(name)`; what remains runs in `Promise.all`. Seven sequential → two. `usersWhoCan` parallelises its profiles + company_roles reads too. Guarded by a source-level test - no layout may call `auth.getUser()` directly, and the project layout may not query `profiles`/`customers` - because the real `cache()` refuses to run outside Next's runtime and a behavioural test would have been theatre. Also: "Sent for Payment" → "Queued for payment" with the explanation on screen rather than in a tooltip ("sent to who?" was the first question every time); "Bill the client for this" becomes a filled button with the amount; and arriving there from a bill opens the composer focused on that one cost instead of the full checklist (#328)
- Paying a sub reaches QuickBooks (migration 089 `invoices.qbo_payment_id` / `qbo_payment_synced_at` / `qbo_payment_claimed_at`). Approving a bill created the QBO Bill; marking it PAID recorded nothing, so A/P stayed open after the cash left - the exact mirror of the A/R bug fixed in #323. `pushBillPayment` posts a QBO BillPayment with `LinkedTxn` to the Bill, `PayType: Check` + `defaultBankAccountId` (QBO refuses a BillPayment without both), and the sub's own invoice number as DocNumber. One row now holds TWO QBO records, so `claimForPush`/`releaseClaim` take column names and the payment claims `qbo_payment_claimed_at`, not the Bill's. Guards: not paid, no Bill over there, already settled, zero amount - each returns before any network call. **Inert until 089 lands**: a `42703` on the select returns `skipped` and pushes nothing, because with nowhere to record the payment every run would duplicate it. `bill-payments` entity on the sync route + a Sync bill payments button; 610 failures probe the vendor and the bill and clear a vendor id QBO does not have (#327)
- A bill waiting for approval reaches the people who can approve it. The POST notified `[user.id]` - whoever had just created it - so a sub submitting from /my-jobs was told to approve their own bill and the GC was told nothing. New `usersWhoCan(db, companyId, resource, action)` in `lib/server-permissions.ts` resolves role defaults -> company role overrides -> per-user overrides (same chain as `getActor`, so who is told and who is let in cannot disagree) and returns the owning company's invoice-editors. NOT everyone at the GC: a labourer has `invoices: N` and cannot open the page the notification links to. Degrades to role-only if `permission_overrides` is missing rather than returning nobody, which would silently restore the bug (#326)
- A payment's Reference no. in QBO is the user's own (migration 088 `client_payments.reference`): the form asked for "Memo / check #" in ONE box, so a check number landed as the memo and QBO's Reference no. - the bank-reconciliation column - got `SN-<id8>`. Split into two fields; `paymentIdentity()` is the single composer for both (`PaymentRefNum` on a Payment, `DocNumber` on a Sales Receipt), SN- moving into the memo when the user supplied a ref so it is in exactly one place. Existing memos are NOT parsed into references - they are a mix of check numbers and prose ("Deposit"), and guessing puts the word Deposit in a reconciliation column. Also: `refreshPaymentInQbo` assumed every payment row was a Sales Receipt and fetched `salesreceipt/{id}` - since money started applying against invoices some are `payment/{id}`, so Update formatting reported them missing; it now branches on `qbo_txn_type` and shares the same composer, which is what stops it stamping SN- back over a check number. Plus: busy state on Issue & get link / Mark paid (they were `disabled` with no visual change), and the customer name above the project name in the header, gated to the owning company via `lib/project-access.ts` (subs work the same job and see the same header) (#325)
- QuickBooks 610 stops being a dead end: `QboError` carries the fault `code`; a Payment rejected with 610 retries ONCE with `PaymentMethodRef` dropped and the method moved into `PrivateNote` ("... (paid by Check)") so the money lands and the invoice settles; still-610 runs `probeReferences` over every id we sent (customer / invoice / method) and logs which one QuickBooks refuses and why - a zero-balance invoice, an inactive method. A customer id QuickBooks does NOT have is cleared so it stops failing forever; an INACTIVE one is left alone (clearing it would create a duplicate). Also `paymentMethodId` now filters `Active = true` like every other lookup in the file, and creates with a real QBO type (`NON_CREDIT_CARD`/`CREDIT_CARD`) instead of `OTHER`, which is not a value QuickBooks defines. **Never falls back to a Sales Receipt on failure** - that is the double-count (#324)
- A payment settles the invoice it was recorded against, not "the oldest one still sent" (migration 087 `client_payments.client_invoice_id`): three invoices issued the same day share an issue_date, so oldest was whichever row came back first - $37,224 recorded against INV-0004 was on its way to settling INV-0002. Also: the Settings backlog sync called `pushClientPayment` (Sales Receipt) directly, which would have booked a second sale for money settling an invoice already in QBO - it now goes through `pushPaymentForProject` like the auto-push; a payment whose invoice has not reached QBO yet WAITS rather than booking a receipt; `PaymentRefNum` replaces `DocNumber` on the Payment entity (the field QBO actually reads); QBO error `Detail` is kept alongside `Message` so a failure names the object; invoice rows tell the two QuickBooks facts apart (invoice over there vs money over there) via `lib/invoice-qb-state.ts`; client opens are counted (`view_count`/`last_viewed_at`, bumped in one statement); the seven-button invoice row collapses to one action plus a ... menu (#323)
- QuickBooks records are matchable: project name in the memo/line description, SN-<id8> in DocNumber, same ref in the SyteNav chip tooltip. "Update formatting" on the Settings card refreshes already-synced records in place (chunked 25/call under the 60s route ceiling), sharing the same composers as the push (#313, #314)
- `qb_entered` ("Already in QuickBooks - don't sync") is now READ as a guard, not just written by the push - ticking it used to stop nothing, so a hand-entered payment would have been duplicated in the books; also excluded from the backlog sync and the unsynced count so it is not reported as outstanding forever (#322)
- Void a sent client invoice: keeps the record, releases its costs back to billable (the billable query now skips void invoices), and voids the QBO Invoice via `?operation=void` so A/R stops counting it; QB tick added to the invoice list (#320)
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
