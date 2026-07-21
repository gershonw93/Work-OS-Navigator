# SyteNav - Back Burner (future updates)

Parked ideas and future work. Not committed to a timeline. When we pick one up,
move it to **In progress**, and when it ships, move it to **Done** with the PR #.

> Keep this current: when we defer an idea, add it here; when we ship one, mark it done.

---

## 🔌 Integrations
- **QuickBooks Online sync** - *phase 1 shipped (PR #185, #187):* per-company OAuth connect + one-way push from Settings > Integrations of customers, subs (vendors), sub bills (approved/paid invoices -> QBO Bill), and client payments (-> QBO Sales Receipt). Entity id mapping (no dupes), auto-creates the referenced vendor/customer, sync log. Bills post to a default expense/COGS account, payments to a default service item. **Next:** account/item mapping UI, GC->owner invoices (pay apps -> QBO Invoice), pull-back and two-way. Desktop is a separate, larger track. Live against the Intuit sandbox; production needs Intuit app review.
- **Stripe / Plaid (collect payments in-app)** - turn Payments from a ledger into a money-mover; auto-reconcile escrow. Possible revenue line.
- **Ramp** *(back burner - discussed)* - corporate cards + auto receipt capture (texts the crew for a photo). Link via their developer API (OAuth) → pull transactions + receipt images into Materials; user tags job + budget line. Caveats: only helps customers on Ramp; **API access needs partner approval (start that clock early)**. Competitors: Brex, BILL/Divvy - build the "card feed → materials" pipe generic.
- **Xero** - accounting sync for non-QuickBooks shops.
- **Public API + Zapier/Make** - one clean API + a Zapier app instead of 30 point integrations; lets users wire the long tail themselves.
- **Google Calendar / Outlook two-way OAuth** - full sync (events appear with no confirmation + editable). We shipped the read-only iCal feed (#99/#100); this is the heavier upgrade.
- **DocuSign / e-signature** - sign subcontracts and change orders (numbers already generated).
- **Google Drive / Dropbox / OneDrive** - mirror project files and daily-log PDFs.
- **CompanyCam** - jobsite photos.
- **Procore / Autodesk Construction Cloud** - for GCs who also run Procore.

- **LinkedIn company-page posting** - *shipped:* single, platform-wide (owner-only) LinkedIn page connected from `/admin` → LinkedIn (super-admin, behind the PIN gate); compose + Post now / Schedule / Save draft; daily cron (`/api/cron/linkedin-posts`) publishes due scheduled posts; queue + history; in-app notification on publish/fail. Text posts only. Setup in `docs/linkedin-setup.md`. **Next:** image/link attachments, per-project "share this milestone" one-click, richer scheduling UI, other channels (Facebook/Instagram/X). *(Note: deliberately NOT per-company - one page for the whole app.)*

## 📣 Notifications & comms
- **Transactional email (Resend/SendGrid)** - biggest "feels unfinished" gap. Quote/compliance/inspection flows already produce messages; today they're in-app + mailto. Make them real emails.
- **SMS reminders (Twilio)** - "text a receipt" for Materials, "inspection ready" to the scheduler, payment receipts to clients. Universal alternative to Ramp's receipt-texts. Smaller build, works for everyone.
- **Slack / WhatsApp** - pipe project activity to a crew channel.

## 📐 Plans
- **Pin-to-task on plans** - drop a pin on the plan and create a task for an employee from it; pins color-coded per assignee; pins anchor to the plan coordinates so they stay put through zoom/pan; read the plan's title-block scale first ("every plan has a size in the corner") to know real-world dimensions. ⚠️ Design note: build our own take on this (differentiate from Raken/PlanGrid-style implementations - avoid copying UI/flows wholesale).

## 🧮 Estimating (light - NOT full takeoff)
- **Light estimate builder** - reusable cost catalogs / assemblies + unit costs + markup → one click turns an estimate into a client quote and a project budget. We're ~70% there (Budget + Quotes already do line items, qty, unit price, markup).
- **Do NOT build true takeoff** (measuring quantities off PDF/CAD plans) - that's Accubid/PlanSwift/STACK territory, years of work. Contractors keep naming estimating as a *separate* cost, so even a light builder is a differentiator.
- Maybe later: AI "upload the plan → rough room/fixture counts" helper (approximate, not surveyor-grade).

## 💰 Money
- **Approving a change order optionally bumps the client contract** (we did sub-side; consider explicit client-revenue side too).
- **Forecasting / cash-flow projections** beyond the current budget × (1+fee).

## 🧾 Materials
- **Edit existing receipts** - change the job or attach a budget line to a receipt after the fact (currently set at creation).
- **Auto-suggest job/budget line** from the merchant name on the receipt.

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
- Equipment tracking + history (#76, #78)
- Compliance doc requests by email + AI scan + partial uploads (#79, #80)
- Money fixes: change orders wired to Financials, single budget number, payments UX, vendor invoice uploads (#81, #82)
- Help Center with search (#83–#85)
- Materials: snap receipt → assign job → budget line, project tab (#86, #87, #89, #90)
- Inspections: request → schedule → notify → result, card-after workflow (#91, #93)
- Calendar: read-only iCal feed + one-click Connect + day detail view (#99–#101)
