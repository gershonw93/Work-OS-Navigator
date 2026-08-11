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

## 📣 Notifications & comms
- **Transactional email (Resend/SendGrid)** - biggest "feels unfinished" gap. Quote/compliance/inspection flows already produce messages; today they're in-app + mailto. Make them real emails.
- **SMS reminders (Twilio)** - "text a receipt" for Materials, "inspection ready" to the scheduler, payment receipts to clients. Universal alternative to Ramp's receipt-texts. Smaller build, works for everyone.
- **Slack / WhatsApp** - pipe project activity to a crew channel.

## 📐 Plans
- **Pin-to-task on plans** - drop a pin on the plan and create a task for an employee from it; pins color-coded per assignee; pins anchor to the plan coordinates so they stay put through zoom/pan; read the plan's title-block scale first ("every plan has a size in the corner") to know real-world dimensions. ⚠️ Design note: build our own take on this (differentiate from Raken/PlanGrid-style implementations - avoid copying UI/flows wholesale).

## 🧮 Estimating (light - NOT full takeoff)
- **Estimate → Proposal (phase 1 shipped, PR #194):** the Budget sheet is the estimate. Added a Markup % on it (reuses the project contractor_fee_pct so markup = billed fee), a live Client price, and a "Generate Proposal" client-facing PDF (`/projects/[id]/proposal/print`) with Lump sum / By section / Itemized detail levels, branding, valid-until, terms, signature. Raw cost/margin never shown. On win, the same budget is already the baseline. **Next:** per-line markup override, editable scope/inclusions-exclusions text, "pull from leveled quotes → estimate" for bigger GCs, save/track proposal versions + accepted status.
- **Do NOT build true takeoff** (measuring quantities off PDF/CAD plans) - that's Accubid/PlanSwift/STACK territory, years of work. Contractors keep naming estimating as a *separate* cost, so even a light builder is a differentiator.
- Maybe later: AI "upload the plan → rough room/fixture counts" helper (approximate, not surveyor-grade).

## 💰 Money
- **Approving a change order optionally bumps the client contract** (we did sub-side; consider explicit client-revenue side too).
- **Forecasting / cash-flow projections** beyond the current budget × (1+fee).
- **Bank-facing budget & sellout** *(tester request)*. Abe: "when you create a bank budget and bank sellout they might be presented in a different way." The working budget and the version a lender wants are formatted differently. Needs a lender report format - probably an extension of the proposal PDF rather than a new thing.
- **Full development pro-forma** *(tester request - partially addressed)*. A tester who develops (not just builds) wanted the spreadsheet they use as step one: land purchase, design, approvals, soft costs, then a return projection. We shipped the piece every GC needs - hard/soft cost split on the budget + a planning-stage menu (see Recently shipped). **Not built, deliberately:** land acquisition as its own record, debt/equity stack and draw schedule, carrying-cost-over-time modeling, and ROI / profit-on-cost / IRR outputs. That is a developer pro-forma tool, a different product from a GC's job budget - revisit only if more than one customer asks.

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

## ✅ Recently shipped (for reference)
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
