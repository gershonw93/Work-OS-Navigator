# SyteNav: Complete Product Context

> Purpose of this file: give an AI agent (support bot, sales assistant, onboarding helper) full context on what SyteNav is, who it serves, and every feature in the product. Written to be self-contained; no codebase access needed to use it.

---

## What SyteNav is

SyteNav is construction management software that runs a job from the first lead to the final invoice in one system. It connects the office and the field: quotes, budgets, schedules, daily logs, time tracking, invoices, payments/escrow, compliance paperwork, and reporting all share the same data, so nothing is retyped between tools.

The core promise: **you do one thing, SyteNav does the next five.** Snap a photo of a quote and the AI builds the budget and payment schedule. Award a bid and the subcontract, budget lines, and payment stages create themselves. The crew clocks in from a phone and the office sees it instantly.

- Web app (Next.js) at app.sytenav.com, fully responsive; the field uses it from phones. Light and dark themes.
- Built on Supabase (Postgres + file storage), deployed on Vercel.
- Marketing site lives under `/homepage` (features, how-it-works workflow walkthrough, AI, pricing, security, GC and sub audience pages, why-switch comparison).

## Who uses it

Two company types, each with a tailored experience:

1. **General contractors (GCs)**: run projects, hire subs, manage budgets, client money, compliance, and the field.
2. **Subcontractors**: receive bid invites, submit quotes, see awarded work under "My Jobs", track their own jobs, get paid. Subs can also run their own standalone jobs where their quote line items ARE the budget.

Within a company, the people involved: owner/admin, office staff, project managers, field supervisors / site managers, field workers, and read-only viewers. Clients (customers) and subs without accounts interact through secure token links (portals, compliance upload links, quote submissions) with no login required.

---

## Roles & permissions

- **Built-in roles**: Admin, Manager (both always full access, cannot be edited, prevents lockout), Project Manager, Office Staff, Field Supervisor, Worker, Field Worker (read_only).
- **Per-screen permission grid**: every resource (see list below) has view / create / edit / delete flags. Role defaults are editable company-wide, and admins can create entirely **custom roles ("classes")** with their own grid, assignable via invite or role change. Custom classes can be deleted once no members hold them.
- **Per-user overrides**: fine-tune an individual on top of their role's defaults.
- **Assigned-only scoping**: field roles (field supervisor, worker, read-only) only see projects they're assigned to via the project Team tab.
- **View as role / view as user**: admins can preview the app exactly as another role or a specific teammate would see it.
- **Delete protection**: optional secret key required before deleting protected items (money, files, budget lines, etc.).

Permission resources, by group:
- Field: Plans, Schedule, Tasks, Progress, Daily Logs, Time Clock
- People: Team, Bids, RFIs
- Money: Invoices, Pay Applications, Payments & Escrow, Budget, Request Quotes, Compare Quotes, Financials, Change Orders
- Compliance: Permits, Inspections, Submittals, Compliance, Reports
- Workspace: Dashboard, Projects, Customers, Directory, Files, Equipment, Materials, Approvals
- Settings: Company Settings, Team & Users, Billing

---

## The AI layer

AI reads construction paperwork so nobody retypes it. Everything the AI extracts is **reviewed by the user before saving** (first draft, not autopilot).

- **Quote scanning**: upload a PDF or phone photo of a quote/estimate. AI extracts sections, line items, quantities, unit rates, totals, and the payment schedule, and stages a draft job.
- **Bid comparison with gap analysis**: multiple quotes for the same scope line up side by side; AI flags totals, scope coverage (who excluded permit fees or the panel upgrade), payment terms, and recommends a pick with the true-cost difference.
- **Invoice & receipt reading**: vendor invoices and material receipts scanned for store, amounts, tax, line items, dates.
- **Permit and compliance document scanning**: AI reads permit numbers, dates, insurance certificate details, expirations.
- **Estimate/budget sheet import**: upload .xlsx/.csv; rows become budget lines (with merge logic; see Budget).

---

## Feature catalog

### Projects
- Create a project with name, address (autocomplete + geocoding for map pins), owner/client (picked from existing customers or "+ New client"), type (residential / commercial / mixed use), start & target end dates, optional **interior sq ft (under A/C)** and **exterior sq ft (under roof)** for cost-per-square-foot breakdowns, and a **billing method** choice (Simple invoicing vs. AIA progress billing, pre-filled from the company default).
- Projects page: grid, list, and **map view** (every job pinned by location, color-coded by status). Search by name, address, or client; filter by status/type; sort options. Cards show live progress %, contract value, and what's due next.
- Edit project details (including sq ft) from the list; delete with confirmation.
- Project statuses: planning, active, on hold, completed, cancelled.

### Project tabs (inside a job), grouped:
- **Field**: Plans, Schedule, Tasks, Progress, Daily Logs, Time Clock
- **People**: Team, Bids, RFIs
- **Money**: Budget, Invoices, Pay Apps, Payments, Request Quotes, Compare Quotes, Financials, Change Orders (which money tabs show depends on the project's billing mode; see Money)
- **Compliance**: Permits, Inspections, Submittals, Compliance, Reports
Which tabs a user sees depends on their role/permissions.

### Plans & blueprint pins
- Upload plans (architectural, structural, MEP, civil, landscape, other); viewer with zoom.
- **Pin a task right on the drawing**: click the exact spot, describe the work, assign a teammate, set a due date. The pin drops, the task is created, the assignee is notified. Pins are color-coded per assignee, stay anchored while zooming, and link both ways (task ↔ spot on plan). Pin list jumps the viewer to each spot. Removing a pin keeps its task. Full-screen mode on phones.

### Quotes & bidding (GC side)
- **Request quotes by email**: build a bid package (scope, description, due date, attachments) and invite subs from the Directory. Subs get a link; no account needed to submit.
- Track invitations, responses, reminders ("remind" nudges), and revision requests.
- **Compare quotes**: side-by-side with AI gap analysis and recommendation.
- **Award a quote**: one click creates the subcontract, turns quote line items into budget lines (link to existing lines or create new), and stages the payment schedule from the quote's terms. Losing bids stay on file.

### Bidding (sub side)
- **My Bids**: incoming bid invites across all GCs; view package details and attachments, submit or revise a quote with line items, quantities, unit prices, sections, and payment terms.
- **My Jobs**: awarded work. Subs see their scope, schedule, payment stages, can **Mark work Ready for Inspection**, and track what they're owed.

### Budget
- Line items with cost code, category (30+ trade categories), description, budgeted / committed / actual amounts, notes, and **space type (Interior / Exterior / unassigned)**.
- **Interior vs. exterior breakdown**: totals per space plus cost per sq ft (when project sq ft is set) and grand total.
- Link a line to a subcontract: Committed auto-fills from the contract amount and Actual accrues from approved invoices plus assigned material receipts.
- Stat cards: Total Budget, Committed, Actual Spent, Remaining/Over Budget; spend progress bar; per-line variance with over-budget and over-committed warnings.
- "Unbudgeted subcontracts" helper: one click creates a linked budget line for any subcontract not yet covered.
- Search, sort (category, description, amounts, variance), category grouping with subtotals.
- **Bulk delete**: checkboxes per line, per category, or select-all, with a confirmation (and secret key if delete protection is on).
- **Import Estimate** (.xlsx/.csv): rows become lines. If descriptions match existing lines you choose **"skip duplicates, add new"** or **"update matching + add new"**; imports never delete anything.
- **Budget templates**: save any budget as a reusable template, apply templates (amounts optional), copy another project's budget, manage templates from Settings.
- Progress tracking per line (percent, status, notes) feeding the Progress tab; work sign-offs on budget lines (signature + timestamp).

### Schedule & tasks
- Project schedule with milestones and subcontract date ranges; sub's week view spans all their jobs across GCs.
- **Crew-overlap warnings**: booking a crew already committed elsewhere gets flagged before saving.
- Tasks: create/assign with due dates, statuses, notes; tasks from plan pins land on the schedule automatically; task sign-off flow (request sign-off → signed off, logged).
- **Master Calendar** (admin): every date across every job in one calendar.
- **Calendar subscription**: feed SyteNav dates into Google / Apple / Outlook calendars.

### Daily logs & field
- Daily log from a phone: weather, crew count, work performed, photos (stored in project storage, searchable later), delays, visitors. Follow-up **updates/comments** on a log. Attachments. **Export a daily log as a PDF**.
- **Time Clock**: clock in/out with **selfie + GPS geofence check** (250 m radius; off-site or no-GPS punches flagged for review, not rejected). Weekly totals per worker, timesheet approval flow, and hours export for payroll.
- RFIs from the field with photos; see RFIs below.

### RFIs & communication
- Submit RFIs (subs can submit via portal without an account), number them, track open/answered, attach photos/files; RFIs can carry change-order proposals (description, items, amount) that route to approval.
- **Approvals inbox**: one place for everything awaiting a decision (invoices, change orders, RFIs with CO requests, etc.).
- **Work sign-offs**: request a signature on completed work (task or budget line); signer gets a link, signs on screen, record is time-stamped.
- Notifications system (in-app) for assignments, RFIs, invites, approvals.

### Money
- **Billing mode per project**, chosen at setup (with a company-wide account default in Settings → Company): **Simple invoicing** (Invoices + Payments/escrow; residential and smaller jobs) or **Progress billing (AIA)** (Pay Apps with retainage; commercial and bank-funded jobs). Only the matching money tabs show; the mode is changeable later from the Projects list edit.
- **How simple mode fits together**: client money in → escrow → your fee → vendor payments out, all per project and rolled up company-wide.
- **Pay Applications (AIA G702/G703)**, on progress-billing jobs: monthly draws against the schedule of values (the budget lines). Each application carries "previously billed" forward automatically; enter this period's work and stored materials per line; retainage % held per draw (default from project/company settings). G702 summary computes completed & stored to date, retainage, earned less retainage, less previous certificates, current payment due, and balance to finish. Status flow Draft → Submitted → Certified → Funded, and a printable G702 + G703 PDF for the architect/bank. Works in both directions: the GC bills the owner/bank for the whole contract, or a sub bills the GC for their scope.
- **Invoices**: create for a subcontract (even if the sub has no account), or generated from line-item progress. Status flow: draft → approved → sent → paid. **Approving an invoice (not just paying) moves the budget's Actual column.** Client-paid vs. escrow-paid split per invoice. Printable invoice view. **Lien waiver attachments** on invoices.
- **Client payments & escrow** (Payments tab): record client payments (date, amount, method, memo, retainer flag, QuickBooks-entered flag), set the contractor fee %, and see received, fee earned, available after fee, vendor billed/paid, escrow balance, outstanding to vendors, and forward projections (projected cost vs. invoiced, projected remaining).
- **"Can I pay my vendors" guidance**: the summary shows what is safe to release based on escrow and outstanding balances.
- **Change orders**: create, describe, price, approve/reject; change orders can add to a sub's contract (bumping Committed); tracked per project and visible in Financials.
- **Financials tab**: project-level rollup of contract, invoices, payments, change orders, and materials (with customer paid vs. owed tags).
- **Master Money** (admin): company-wide money across all jobs: cash in vs. out, escrow, outstanding, per-project breakdowns.
- **Materials**: snap a receipt (AI reads store, amount, tax, line items), assign to a job, optionally link to a budget line **or create a new budget line on the spot** (same UX as awarding a quote). **"Customer already paid" checkbox** per receipt splits totals into customer-paid vs. owed-by-customer on the Materials page, Financials, and Budget. Expandable receipt rows show full detail (store, date, category, tax, notes, budget line, receipt image, line items) with a mark-paid toggle. Stores can be saved to the Directory as suppliers. Stat tiles: receipts, total cost, customer paid, owed.

### Compliance, permits, inspections, submittals
- **Compliance documents** per sub per project (or company-wide): insurance (COI), licenses, W-9s, etc., with status (active/expired/missing) and expiry tracking; expiring docs surface ahead of time; automated reminder emails (cron).
- **Request docs by email**: sub gets a secure one-time upload link, no account needed; AI can scan the uploaded document to fill in details.
- **Permits**: numbers, types, statuses, dates, AI scan of permit documents.
- **Inspections**: request, schedule, record pass/fail; subs can **Mark Ready for Inspection** from their job view, which notifies the GC to book the inspector; a pass can gate the next payment stage.
- **Submittals**: submit, route for approval, track status, keep the paper trail (stored in the `submittals` bucket).
- **Reports tab**: project reports/exports.

### Equipment
- Track tools and machines company-wide: name, category, identifiers, status (available / checked out).
- **Check-out / check-in**: one item, one holder at a time; assign to a teammate or typed name/crew and a project or the shop/yard; history timeline of who had what, where, and for how long.

### Directory, customers & files
- **Directory**: companies and contacts (subs, suppliers, inspectors...), with trade, contact info, insurance status; used for bid invites and compliance.
- **Customers**: client records with their jobs, linked to projects (Owner/Client dropdown at project creation); customer detail pages.
- **Files**: company file storage, file packets, sharing; project plans and photos live with their projects.

### Cross-project (admin) views
- **Dashboard**: greeting, stat cards (active projects, under contract $, open tasks, due this week), cash in vs. out chart, "this week" agenda, recent projects with progress, and **Recent Activity feed**.
- **Recent Activity**: explicit event log (project_activity table) covering: RFIs submitted/answered, change orders, plan uploads, invoices (created/approved/sent/paid), tasks (created/updated/sign-offs), quote awards, permits, inspections, submittals, daily logs + updates, subcontracts, bid packages (created, invited, reminded, revised, awarded), material receipts, client payments, equipment check-out/in, time clock in/out (with flags), team member add/remove, compliance document adds, budget line add/remove. Non-admins see their own actions; admins see everything.
- **Master Calendar** and **Master Money** (described above).

### Settings
- Company profile (name, contact, phone, address, license, type, default payment terms), logo upload.
- Team: invite by email with role, pending invites, change roles, remove members.
- **Permissions panel**: edit role defaults, create/delete custom classes, per-user overrides, view-as previews.
- Delete protection secret key.
- Budget template management.

### Client & no-account experiences
- **Client portal** (token link): clients see their job's progress and payment stages without an account.
- **Compliance upload links**: subs upload COIs/licenses via one-time links.
- **Quote submission links**: invited subs submit bids without an account.
- **Sign-off links**: signature capture for completed work.

### Help Center
- In-app at `/help`: 40+ searchable articles (client-side search over rich keywords) covering every flow above, organized by category (Getting Started, Projects & Plans, Quotes & Bidding, Money, People & Communication, Permits/Inspections/Submittals, Compliance, Field & Daily Logs, Equipment, Materials, Directory/Customers/Files, Cross-Project, Settings & Team). Kept current with every feature change.

---

## Positioning (what SyteNav replaces)

The pitch is "you already have a system, it's just five systems": the spreadsheet stack, the group text, a generic PM tool, a standalone invoicing app, and a filing cabinet. SyteNav replaces them with one live system where the quote, the money, the schedule, and the field share the same data. Switching = upload one job's quote and the AI builds it; no migration project.

Key differentiators to emphasize:
1. AI reads the paperwork (quotes, receipts, invoices, permits, COIs); numbers are born correct, never retyped.
2. One click cascades: award a bid → subcontract + budget + payment schedule; approve an invoice → budget actuals + escrow math.
3. The field actually uses it: two-tap phone flows (clock in with selfie/GPS, snap receipts, file logs/photos).
4. Money is first-class: escrow, fee, draws, retainage, client-paid vs. owed, lien waivers.
5. Everyone connected seamlessly: office, site managers, field crew, subs, and clients each see what they need automatically; no forwarding.
6. Free to start, no credit card; bring one job or all of them.

## Tone guidance for the agent

- Speak like a contractor's sharp friend, not a SaaS brochure: plain, direct, second person ("your crew", "your Sunday").
- Lead with the problem and the two-click fix; lists over paragraphs for anything procedural.
- Never use the em-dash character (-) in user-facing copy.
- Don't overpromise: AI output is always user-reviewed before saving; flagged time punches are for review, not auto-rejected.
