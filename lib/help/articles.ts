// ─────────────────────────────────────────────────────────────────────────────
// SyteNav Help Center — article content
//
// IMPORTANT (working agreement): whenever a feature is added or changed, update
// the matching article here in the SAME change so the Help Center never drifts
// from the product. Add a new article for any brand-new screen or flow.
//
// Articles are plain data so search stays instant and offline. Blocks render in
// order; use 'steps' for numbered how-tos, 'tip'/'warn' for callouts, and
// 'image' for an optional screenshot (public path under /public).
// ─────────────────────────────────────────────────────────────────────────────

export type HelpBlock =
  | { type: 'text'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'warn'; text: string }
  | { type: 'image'; src: string; alt: string }

export interface HelpArticle {
  slug: string
  title: string
  category: string
  keywords: string[]
  summary: string
  blocks: HelpBlock[]
  related?: string[]
}

export interface HelpCategory {
  key: string
  label: string
  description: string
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { key: 'getting-started', label: 'Getting Started', description: 'Set up your company and learn the basics.' },
  { key: 'projects', label: 'Projects', description: 'Create and manage jobs.' },
  { key: 'quotes', label: 'Quotes & Bidding', description: 'Request, compare, and award quotes.' },
  { key: 'money', label: 'Money', description: 'Budget, invoices, payments, and change orders.' },
  { key: 'people', label: 'People & Communication', description: 'Team, RFIs, and approvals.' },
  { key: 'docs', label: 'Permits, Inspections & Submittals', description: 'Keep paperwork and reviews on track.' },
  { key: 'compliance', label: 'Compliance', description: 'Insurance, licenses, and required documents.' },
  { key: 'field', label: 'Field & Daily Logs', description: 'Schedule, tasks, time clock, and site logs.' },
  { key: 'equipment', label: 'Equipment', description: 'Track tools and machines.' },
  { key: 'materials', label: 'Materials', description: 'Snap receipts and assign them to jobs.' },
  { key: 'workspace', label: 'Directory, Customers & Files', description: 'Contacts, clients, and documents.' },
  { key: 'cross-project', label: 'Cross-Project (Admin)', description: 'See every job at once.' },
  { key: 'settings', label: 'Settings & Team', description: 'Company profile, users, and permissions.' },
]

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Getting Started ────────────────────────────────────────────────────────
  {
    slug: 'what-is-sytenav',
    title: 'What is SyteNav?',
    category: 'getting-started',
    keywords: ['overview', 'about', 'intro', 'what', 'start'],
    summary: 'A quick tour of what SyteNav does and how the pieces fit together.',
    blocks: [
      { type: 'text', text: 'SyteNav is an all-in-one workspace for general contractors and subcontractors. You run your jobs, request and compare quotes, hire subs, track budgets and invoices, manage client payments, keep compliance documents current, log daily site activity, and track equipment — all in one place.' },
      { type: 'text', text: 'The left sidebar holds your company-wide screens (Dashboard, Projects, Directory, Files, Equipment, Settings). Open a project to find its tabs (Plans, Schedule, Tasks, Budget, Invoices, Payments, Compliance, Daily Logs, and more).' },
      { type: 'tip', text: 'The Dashboard is the fastest way to see what needs attention today: active projects, money under contract, open tasks, and anything due this week.' },
    ],
    related: ['create-first-project', 'set-up-company-profile'],
  },
  {
    slug: 'set-up-company-profile',
    title: 'Set up your company profile',
    category: 'getting-started',
    keywords: ['company', 'profile', 'name', 'address', 'license', 'setup'],
    summary: 'Add your company name, contact info, license, and logo.',
    blocks: [
      { type: 'steps', items: [
        'Open Settings from the sidebar.',
        'In the Company Profile card, fill in your company name, contact email, phone, address, and license number.',
        'Choose your company type (general contractor, subcontractor, supplier, etc.).',
        'Click Save.',
      ] },
      { type: 'tip', text: 'Set a default payment terms value here so new quotes and subcontracts start with your standard terms.' },
    ],
    related: ['upload-company-logo', 'invite-team-member'],
  },
  {
    slug: 'upload-company-logo',
    title: 'Upload your company logo',
    category: 'getting-started',
    keywords: ['logo', 'branding', 'pdf', 'invoice', 'report', 'image'],
    summary: 'Add a logo that appears on your PDFs, invoices, and reports.',
    blocks: [
      { type: 'steps', items: [
        'Open Settings from the sidebar.',
        'In the Company Profile card, find the logo uploader.',
        'Click to upload a PNG or JPG (max 2MB).',
        'The logo saves automatically and is stamped on generated PDFs — daily logs, invoices, and reports.',
      ] },
      { type: 'tip', text: 'Use a logo with a transparent or white background for the cleanest look on printed documents.' },
    ],
    related: ['set-up-company-profile'],
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  {
    slug: 'create-first-project',
    title: 'Create a project',
    category: 'projects',
    keywords: ['project', 'job', 'new', 'create', 'add'],
    summary: 'Start a new job in a few clicks.',
    blocks: [
      { type: 'steps', items: [
        'Click Projects in the sidebar.',
        'Click New Project.',
        'Enter the project name, address, client/customer, and start date.',
        'Save. The project opens to its tabs.',
      ] },
      { type: 'tip', text: 'You can link a project to a customer so all of that client\'s jobs are grouped together.' },
    ],
    related: ['project-tabs-explained', 'add-project-budget'],
  },
  {
    slug: 'project-tabs-explained',
    title: 'Understanding the project tabs',
    category: 'projects',
    keywords: ['tabs', 'navigation', 'plans', 'schedule', 'budget', 'invoices'],
    summary: 'What each tab inside a project is for.',
    blocks: [
      { type: 'text', text: 'Inside a project you\'ll see tabs grouped by purpose:' },
      { type: 'steps', items: [
        'Field: Plans, Schedule, Tasks, Progress, Daily Logs, Time Clock.',
        'People: Team, Bids, RFIs.',
        'Money: Budget, Invoices, Payments, Quotes, Financials, Change Orders.',
        'Compliance: Permits, Inspections, Submittals, Compliance, Reports.',
      ] },
      { type: 'tip', text: 'Which tabs you see depends on your role and permissions. Admins see everything.' },
    ],
  },

  {
    slug: 'plan-pins',
    title: 'Pin a task right on the plan',
    category: 'projects',
    keywords: ['pin', 'plan', 'blueprint', 'task', 'drop', 'marker', 'assign', 'drawing'],
    summary: 'Open a plan, drop a pin where the work is, and assign it as a task.',
    blocks: [
      { type: 'steps', items: [
        'On the Plans tab, click Open on a plan (PDFs and images both work).',
        'Click Add pin, then tap the exact spot on the drawing.',
        'Describe the work, assign a teammate, set a due date, and save — the pin drops and the task is created (the assignee is notified).',
        'Pins are color-coded per assignee and stay anchored to the spot as you zoom in and out. Tap any pin to see its task or jump to the Tasks tab.',
      ] },
      { type: 'tip', text: 'Removing a pin keeps its task — nothing gets lost. Use the legend above the sheet to see whose work is where.' },
    ],
    related: ['tasks-assign', 'project-tabs-explained'],
  },

  // ── Quotes & Bidding ───────────────────────────────────────────────────────
  {
    slug: 'request-quotes',
    title: 'Request quotes from subs by email',
    category: 'quotes',
    keywords: ['quote', 'rfq', 'request', 'bid', 'invite', 'email', 'link'],
    summary: 'Send subs a private link to submit a quote — no account needed.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Quotes (Request Quotes) tab.',
        'Create a quote request with a title, trade, scope, and optional due date. Attach plans if you have them.',
        'Add invitees: pick a sub from your Directory, or type a name and email.',
        'Each invitee gets a private link. Click Email to open a pre-filled message, or Copy the link to send it your own way.',
        'Watch responses come in as subs submit — the status updates from invited to viewed to submitted.',
      ] },
      { type: 'tip', text: 'Subs do not need a SyteNav account. The link opens a simple page where they enter an amount and attach their quote.' },
    ],
    related: ['compare-quotes', 'award-quote'],
  },
  {
    slug: 'compare-quotes',
    title: 'Compare quotes (with AI analysis)',
    category: 'quotes',
    keywords: ['compare', 'analyze', 'ai', 'level', 'quotes', 'quote comparison'],
    summary: 'Line quotes up side by side — the AI checks each against your requirements automatically.',
    blocks: [
      { type: 'steps', items: [
        'On the Quotes tab, open a request and click Compare quotes to pull in the responses.',
        'Or upload quotes you already collected — drag in PDFs/images and the AI reads the vendor, total, line items, inclusions, and exclusions.',
        'Type what you need in the Requirements box (e.g. "200A panel, all permits included").',
        'The AI analyzes automatically and flags what each quote is missing, its strengths, and concerns — and recommends the best value.',
      ] },
      { type: 'tip', text: 'Comparing already runs the analysis — you no longer click a separate "Analyze" button. Use Re-analyze after you change the requirements.' },
    ],
    related: ['request-quotes', 'award-quote'],
  },
  {
    slug: 'award-quote',
    title: 'Award a quote and hire the sub',
    category: 'quotes',
    keywords: ['award', 'winner', 'hire', 'subcontract', 'accept'],
    summary: 'One click turns a winning quote into a subcontract wired into the whole job.',
    blocks: [
      { type: 'steps', items: [
        'In the comparison, mark a winner if you like, then click Award to project on that quote.',
        'Choose whether the vendor is a subcontractor (labor) or supplier (materials).',
        'Choose how to handle the budget: create a new budget line, link to an existing one, or skip.',
        'Confirm. SyteNav adds the vendor to your Directory, creates a subcontract at that amount, and wires it into Financials, Budget, Schedule, and Compliance.',
      ] },
      { type: 'warn', text: 'Awarding is locked once done — a comparison can only be awarded once. Analyze and mark winner are disabled after award.' },
    ],
    related: ['compare-quotes', 'add-project-budget', 'compliance-overview'],
  },

  // ── Money: Budget ──────────────────────────────────────────────────────────
  {
    slug: 'add-project-budget',
    title: 'Build a project budget',
    category: 'money',
    keywords: ['budget', 'line item', 'cost', 'estimate', 'committed', 'actual'],
    summary: 'Add budget lines and track budgeted vs committed vs actual.',
    blocks: [
      { type: 'text', text: 'Each budget line tracks three numbers: Budgeted (what you planned), Committed (what you\'ve promised in signed contracts), and Actual (what\'s actually been billed).' },
      { type: 'steps', items: [
        'Open the project and go to the Budget tab.',
        'Add a line: category, description, and budgeted amount.',
        'Optionally link the line to a subcontract — then Committed and Actual fill in automatically from that sub\'s contract and approved invoices.',
      ] },
      { type: 'tip', text: 'Approving an invoice (not just paying it) moves the Actual amount. This keeps your budget honest the moment costs are accepted.' },
    ],
    related: ['budget-templates', 'money-overview', 'create-invoice'],
  },
  {
    slug: 'budget-templates',
    title: 'Save and reuse a budget template',
    category: 'money',
    keywords: ['template', 'reuse', 'budget', 'apply', 'copy'],
    summary: 'Turn a budget into a reusable starting point for future jobs.',
    blocks: [
      { type: 'steps', items: [
        'Build a budget on a project you want to reuse.',
        'Save it as a template from the Budget tab, or manage your templates from Settings → Budget Templates.',
        'On a new project\'s Budget tab, apply the template to instantly create all its lines.',
        'You can also copy another project\'s budget lines directly.',
      ] },
    ],
    related: ['add-project-budget'],
  },
  {
    slug: 'money-overview',
    title: 'How the money side fits together',
    category: 'money',
    keywords: ['money', 'overview', 'financials', 'escrow', 'fee', 'cost plus', 'how it works'],
    summary: 'The big picture: money in from the client, money out to vendors, and your fee.',
    blocks: [
      { type: 'text', text: 'Money flows two ways. IN from your client (recorded as client payments) and OUT to vendors (subcontracts → invoices → payments). Your profit is a cost-plus fee: a percentage on top of vendor costs.' },
      { type: 'steps', items: [
        'Award a quote → creates a subcontract (Committed) and optionally a budget line.',
        'The sub bills you → you create an invoice; approving it makes it a real cost (Actual/Billed).',
        'Mark the invoice paid → cash actually leaves.',
        'Record client payments → money in. Your fee = billed × fee%. Escrow = received − paid out − fee.',
      ] },
      { type: 'tip', text: 'Master Money (admin only) rolls all of this up across every project in one table.' },
    ],
    related: ['add-project-budget', 'create-invoice', 'record-client-payment', 'change-order-basics'],
  },
  {
    slug: 'create-invoice',
    title: 'Create an invoice (even if the sub has no account)',
    category: 'money',
    keywords: ['invoice', 'bill', 'create', 'sub', 'vendor', 'no account'],
    summary: 'You record the vendor\'s bill yourself and can attach their actual file.',
    blocks: [
      { type: 'text', text: 'Subs never need a SyteNav account. You create the invoice for them on the Invoices tab.' },
      { type: 'steps', items: [
        'Open the project and go to the Invoices tab.',
        'Click Create Invoice and pick the subcontractor.',
        'Bill by a fixed amount, a percent of the contract, or a payment-schedule milestone.',
        'Add a description and due date, then create.',
        'Open the invoice and use Upload invoice to attach the PDF or photo the sub sent you.',
      ] },
      { type: 'tip', text: 'New invoices start as Pending Approval. Approve → Mark Sent → Mark Paid as they move through.' },
    ],
    related: ['approve-invoice', 'lien-waiver', 'money-overview'],
  },
  {
    slug: 'approve-invoice',
    title: 'Approve, send, and pay an invoice',
    category: 'money',
    keywords: ['approve', 'status', 'paid', 'sent', 'invoice', 'workflow'],
    summary: 'Move an invoice through its lifecycle and record how it was paid.',
    blocks: [
      { type: 'steps', items: [
        'On the Invoices tab, open an invoice.',
        'Click Approve — it now counts as a real cost in your Budget and Financials.',
        'Click Mark Sent to Sub when you\'ve sent it on.',
        'Click Mark Paid when the money goes out.',
        'Use Edit to record how it was paid: from escrow vs. paid directly by the client.',
      ] },
      { type: 'warn', text: 'Paying an invoice releases funds — upload an unconditional lien waiver to protect yourself.' },
    ],
    related: ['create-invoice', 'lien-waiver', 'record-client-payment'],
  },
  {
    slug: 'lien-waiver',
    title: 'Attach a lien waiver to an invoice',
    category: 'money',
    keywords: ['lien', 'waiver', 'conditional', 'unconditional', 'release'],
    summary: 'Upload conditional or unconditional lien waivers per invoice.',
    blocks: [
      { type: 'steps', items: [
        'Open the invoice on the Invoices tab.',
        'In the Lien Waiver section, upload a Conditional or Unconditional waiver (PDF, image, or doc).',
        'The waiver is stored on the invoice with the upload date and a view link.',
      ] },
    ],
    related: ['approve-invoice'],
  },
  {
    slug: 'record-client-payment',
    title: 'Record a client payment & set your fee',
    category: 'money',
    keywords: ['payment', 'client', 'received', 'escrow', 'fee', 'quickbooks', 'deposit', 'retainer'],
    summary: 'Log money coming in from the client and track escrow.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Payments tab.',
        'Set your Contractor fee rate (cost-plus %) — click the percentage to edit it.',
        'Click Record Payment. A window pops up.',
        'Enter the date, amount, method, and memo. Mark it a retainer/deposit if applicable, and check Entered in QuickBooks if you\'ve logged it there.',
        'Click Add.',
      ] },
      { type: 'tip', text: 'On the ledger, the QB badge on each row is a one-click toggle — check off "entered in QuickBooks" any day without opening edit.' },
    ],
    related: ['pay-vendors-recommendation', 'money-overview'],
  },
  {
    slug: 'pay-vendors-recommendation',
    title: 'Knowing when you can pay your vendors',
    category: 'money',
    keywords: ['pay', 'vendors', 'escrow', 'enough', 'recommend', 'outstanding'],
    summary: 'SyteNav tells you when you\'re holding enough to pay outstanding bills.',
    blocks: [
      { type: 'text', text: 'On the Payments tab, a banner reads your escrow math automatically.' },
      { type: 'steps', items: [
        'Green banner: you\'re holding enough in escrow to cover what\'s owed to vendors — with a link to go pay them.',
        'Amber banner: you\'re short — it shows exactly how much more to collect from the client first.',
      ] },
      { type: 'tip', text: 'Escrow balance = client funds received − vendor payments made from escrow − your earned fee.' },
    ],
    related: ['record-client-payment', 'approve-invoice'],
  },
  {
    slug: 'change-order-basics',
    title: 'Create and approve a change order',
    category: 'money',
    keywords: ['change order', 'co', 'scope', 'extra', 'approve', 'reject'],
    summary: 'Track scope changes and cost adjustments, and approve them.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Change Orders tab.',
        'Click New Change Order. Enter a title, amount (use negative for a deduction), reason, and who requested it (GC or sub).',
        'Optionally link it to a subcontract.',
        'Save. Then Approve, Reject, or Reset to Pending as needed.',
      ] },
      { type: 'text', text: 'Approved change orders flow into Financials and increase your Revised Contract total.' },
    ],
    related: ['change-order-subcontract', 'money-overview'],
  },
  {
    slug: 'change-order-subcontract',
    title: 'Change orders that add to a sub\'s contract',
    category: 'money',
    keywords: ['change order', 'subcontract', 'contract amount', 'fold', 'increase'],
    summary: 'Link a change order to a sub and approving it grows their contract.',
    blocks: [
      { type: 'text', text: 'When a change order is a cost tied to a specific subcontractor, link it to that sub. Approving it then adds the amount to that sub\'s contract automatically.' },
      { type: 'steps', items: [
        'Create the change order and choose the Subcontract in the form.',
        'Approve it — the amount is folded into that sub\'s contract, shown as "Added to <sub>\'s contract".',
        'Reset to Pending, Reject, or Delete to pull the amount back out (it adjusts exactly once).',
      ] },
      { type: 'tip', text: 'No double-counting: change orders folded into a sub show inside Total Contracted, while standalone ones show "on top" in the Revised Contract total.' },
    ],
    related: ['change-order-basics'],
  },

  // ── Compliance ─────────────────────────────────────────────────────────────
  {
    slug: 'compliance-overview',
    title: 'Track compliance documents for your subs',
    category: 'compliance',
    keywords: ['compliance', 'coi', 'insurance', 'license', 'w9', 'workers comp', 'documents'],
    summary: 'Keep COI, license, W-9, and workers\' comp current for every sub.',
    blocks: [
      { type: 'text', text: 'Each subcontractor on a project gets a compliance card showing which documents are on file, missing, or expiring.' },
      { type: 'steps', items: [
        'Open the project and go to the Compliance tab.',
        'For each sub, upload a document with the Upload/Update button, or scan it with AI to auto-fill expiry and coverage.',
        'Click a document row to expand and see the extracted details on file.',
      ] },
      { type: 'tip', text: 'The summary at the top shows how many subs are fully compliant, expiring soon, or missing documents.' },
    ],
    related: ['request-compliance-docs', 'compliance-scan'],
  },
  {
    slug: 'request-compliance-docs',
    title: 'Request compliance docs by email',
    category: 'compliance',
    keywords: ['request', 'email', 'link', 'coi', 'upload', 'sub', 'compliance'],
    summary: 'Send a sub a one-time link to upload their documents — no account needed.',
    blocks: [
      { type: 'steps', items: [
        'On the Compliance tab, find the sub\'s card and click Request via email.',
        'Pick which documents you need (it defaults to what\'s missing or expired).',
        'Click Create secure link, then Copy it or use the Email button to send a pre-filled message.',
        'The sub uploads their files with no account. They land back on the card as pending for your review.',
      ] },
      { type: 'tip', text: 'If a sub uploads only some of the requested docs, the link stays open — it shows what\'s still needed and they can come back to finish later.' },
    ],
    related: ['compliance-overview', 'compliance-scan'],
  },
  {
    slug: 'compliance-scan',
    title: 'Scan a document with AI',
    category: 'compliance',
    keywords: ['ai', 'scan', 'extract', 'coi', 'expiry', 'coverage', 'ocr'],
    summary: 'Upload a document and let AI pull out the key fields.',
    blocks: [
      { type: 'steps', items: [
        'On a sub\'s compliance card, click Upload/Update for a document type.',
        'Use Scan with AI and choose the PDF or image.',
        'The AI fills in expiry date, status, and coverage details (limits, policy number, license number, etc.).',
        'Review the fields and Save.',
      ] },
      { type: 'text', text: 'Documents uploaded by a sub through a request link are scanned automatically too.' },
    ],
    related: ['compliance-overview', 'request-compliance-docs'],
  },

  // ── Field & Daily Logs ─────────────────────────────────────────────────────
  {
    slug: 'daily-log-create',
    title: 'Write a daily log',
    category: 'field',
    keywords: ['daily log', 'field', 'report', 'weather', 'workers', 'photos', 'jobsite'],
    summary: 'Record what happened on site each day.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Daily Logs tab.',
        'Start a new log for the day. Add weather, worker counts, and which subs were on site.',
        'Answer the daily survey (accidents, delays, visitors, etc.) and add notes.',
        'Attach photos — you can tag them by subcontractor.',
        'Sign the log and save.',
      ] },
      { type: 'tip', text: 'You can post updates through the day; they show as a timeline on the log.' },
    ],
    related: ['daily-log-pdf'],
  },
  {
    slug: 'daily-log-pdf',
    title: 'Export a daily log as a PDF',
    category: 'field',
    keywords: ['pdf', 'export', 'daily log', 'download', 'print', 'share'],
    summary: 'Download a clean PDF of any daily log, with your logo.',
    blocks: [
      { type: 'steps', items: [
        'Open the daily log you want.',
        'Use the export/download option to generate a PDF.',
        'The PDF includes your company logo, the survey, notes, photos grouped by sub, and the signature.',
      ] },
    ],
    related: ['daily-log-create', 'upload-company-logo'],
  },

  // ── Equipment ──────────────────────────────────────────────────────────────
  {
    slug: 'equipment-add',
    title: 'Add equipment to track',
    category: 'equipment',
    keywords: ['equipment', 'tool', 'machine', 'add', 'asset', 'inventory'],
    summary: 'Register a tool or machine so you can track who has it.',
    blocks: [
      { type: 'steps', items: [
        'Click Equipment in the sidebar.',
        'Click Add equipment.',
        'Enter a name, category, and asset tag.',
        'Save. The item shows as Available.',
      ] },
    ],
    related: ['equipment-checkout', 'equipment-history'],
  },
  {
    slug: 'equipment-checkout',
    title: 'Check equipment out and back in',
    category: 'equipment',
    keywords: ['checkout', 'check in', 'who took', 'where', 'assign', 'equipment', '3 clicks'],
    summary: 'A fast 3-click checkout: pick who and where, then confirm.',
    blocks: [
      { type: 'steps', items: [
        'On the Equipment page, click Check out on an item.',
        'Pick who is taking it (a teammate or a typed name/crew) and where it\'s going (a project or the shop/yard).',
        'Click Confirm.',
        'To bring it back, click Check in — one click.',
      ] },
      { type: 'tip', text: 'Each item can only be in one person\'s hands at a time. The list shows the current holder, location, and how long it\'s been out.' },
    ],
    related: ['equipment-add', 'equipment-history'],
  },
  {
    slug: 'equipment-history',
    title: 'See an item\'s checkout history',
    category: 'equipment',
    keywords: ['history', 'log', 'timeline', 'equipment', 'past'],
    summary: 'Expand any item to see everyone who has had it.',
    blocks: [
      { type: 'steps', items: [
        'On the Equipment page, click the history toggle on an item\'s row.',
        'The row expands to a timeline: who had it, where it went, when it left, and when it came back.',
      ] },
    ],
    related: ['equipment-checkout'],
  },

  // ── Settings & Team ────────────────────────────────────────────────────────
  {
    slug: 'invite-team-member',
    title: 'Invite a team member',
    category: 'settings',
    keywords: ['invite', 'team', 'user', 'add', 'member', 'staff'],
    summary: 'Add coworkers and set what they can access.',
    blocks: [
      { type: 'steps', items: [
        'Open Settings from the sidebar.',
        'In the Team section, invite a member by email and choose their role.',
        'They receive an invite; once they log in they join your company automatically.',
      ] },
      { type: 'tip', text: 'Roles set sensible defaults, and you can fine-tune each person\'s permissions per screen.' },
    ],
    related: ['permissions', 'delete-protection'],
  },
  {
    slug: 'permissions',
    title: 'Control who can see and do what',
    category: 'settings',
    keywords: ['permissions', 'roles', 'access', 'restrict', 'view', 'edit'],
    summary: 'Set per-screen permissions for each role or person.',
    blocks: [
      { type: 'text', text: 'Every screen (Budget, Invoices, Compliance, Equipment, etc.) has view/create/edit/delete permissions. Roles come with defaults; overrides let you adjust an individual.' },
      { type: 'steps', items: [
        'Open Settings and go to Team & Users.',
        'Open a member and adjust their access per screen.',
        'Field roles are scoped to only the projects they\'re assigned to.',
      ] },
    ],
    related: ['invite-team-member'],
  },
  {
    slug: 'delete-protection',
    title: 'Protect deletes with a secret key',
    category: 'settings',
    keywords: ['delete', 'protection', 'secret', 'key', 'password', 'safety'],
    summary: 'Require a secret key before anything is deleted.',
    blocks: [
      { type: 'steps', items: [
        'Open Settings.',
        'Turn on delete protection and set a secret key.',
        'From then on, deleting protected items asks for the key first.',
        'You can turn it off any time.',
      ] },
      { type: 'warn', text: 'Keep the key somewhere safe — anyone who deletes protected data will need it.' },
    ],
    related: ['permissions'],
  },

  // ── Field: Schedule / Tasks / Time ─────────────────────────────────────────
  {
    slug: 'schedule-milestones',
    title: 'Build a project schedule',
    category: 'field',
    keywords: ['schedule', 'milestone', 'timeline', 'dates', 'gantt', 'plan'],
    summary: 'Lay out milestones and see when each phase happens.',
    blocks: [
      { type: 'text', text: 'The Schedule tab auto-populates from awarded bids, and you can add milestones by hand.' },
      { type: 'steps', items: [
        'Open the project and go to the Schedule tab.',
        'Click Add Milestone.',
        'Give it a name, start/end dates, and (optionally) tie it to a subcontractor.',
        'Save — it appears on the timeline alongside the auto-generated items.',
      ] },
      { type: 'tip', text: 'Awarding a quote adds that sub\'s work to the schedule automatically, so the plan fills in as you hire.' },
    ],
    related: ['award-quote', 'master-calendar', 'tasks-assign'],
  },
  {
    slug: 'tasks-assign',
    title: 'Create and assign tasks',
    category: 'field',
    keywords: ['task', 'todo', 'assign', 'crew', 'due date', 'priority', 'punch list'],
    summary: 'Assign work to your crew or subs and track it to done.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Tasks tab.',
        'Click New Task.',
        'Add a title and description, set a priority and due date, and assign it to a person.',
        'Attach a photo if it helps, then save.',
        'Move tasks along as they progress and add notes as you go.',
      ] },
      { type: 'tip', text: 'You can create a task straight from a budget/progress line and the two stay linked both ways.' },
    ],
    related: ['schedule-milestones', 'master-calendar'],
  },
  {
    slug: 'time-clock',
    title: 'Clock in and out (Time Clock)',
    category: 'field',
    keywords: ['time', 'clock', 'punch', 'hours', 'gps', 'selfie', 'timesheet', 'attendance'],
    summary: 'Punch in/out with a timestamp, GPS check, and a selfie.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Time Clock tab.',
        'Punch in — it records the time, a GPS location check, and a selfie.',
        'Punch out at the end of the shift the same way.',
      ] },
      { type: 'text', text: 'Managers review timesheets and approve or reject entries, then export hours.' },
    ],
    related: ['time-approve'],
  },
  {
    slug: 'time-approve',
    title: 'Approve timesheets and export hours',
    category: 'field',
    keywords: ['timesheet', 'approve', 'reject', 'export', 'payroll', 'hours'],
    summary: 'Review crew time, approve it, and export for payroll.',
    blocks: [
      { type: 'steps', items: [
        'On the Time Clock tab, review each entry.',
        'Approve or Reject entries as needed.',
        'Export the approved hours for payroll.',
      ] },
    ],
    related: ['time-clock'],
  },

  // ── People: RFIs & Approvals ───────────────────────────────────────────────
  {
    slug: 'rfis',
    title: 'Submit and answer RFIs',
    category: 'people',
    keywords: ['rfi', 'request for information', 'question', 'answer', 'respond'],
    summary: 'Ask and answer formal questions on a project.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the RFIs tab.',
        'Create an RFI with your question and any supporting detail.',
        'When a response comes in, review it and mark it answered.',
      ] },
      { type: 'tip', text: 'RFIs keep a clear record of who asked what and when it was resolved.' },
    ],
    related: ['approvals-inbox'],
  },
  {
    slug: 'approvals-inbox',
    title: 'Use the Approvals inbox',
    category: 'people',
    keywords: ['approvals', 'approve', 'reject', 'pending', 'review', 'inbox'],
    summary: 'One place to approve or reject everything waiting on you.',
    blocks: [
      { type: 'text', text: 'The Approvals screen (in the sidebar) gathers items across your projects that need a decision — invoices, submittals, time entries, and more.' },
      { type: 'steps', items: [
        'Click Approvals in the sidebar.',
        'Review each pending item.',
        'Approve or Reject it right from the list.',
      ] },
    ],
    related: ['approve-invoice', 'time-approve'],
  },

  {
    slug: 'work-signoffs',
    title: 'Sign off completed work',
    category: 'people',
    keywords: ['signoff', 'sign off', 'signature', 'approve', 'completed', 'accept', 'work'],
    summary: 'Get a signature confirming work is done and accepted — on tasks and progress lines.',
    blocks: [
      { type: 'text', text: 'A signoff is a signed approval — different from percent-done, which just tracks progress. Signoffs live in three places:' },
      { type: 'steps', items: [
        'Tasks: open a completed task — use Request signoff to ask the assignee (they get notified), or Sign off to sign right there with the signature pad.',
        'Progress lines (the sub\'s Estimate/Progress view): when a line is marked Done, a Sign off action appears next to it.',
        'Daily logs: the site manager\'s end-of-day signature is the log\'s signoff.',
      ] },
      { type: 'tip', text: 'Every signoff stores who signed, when, and the signature image — tap "View signature" to see it.' },
    ],
    related: ['tasks-assign', 'daily-log-create'],
  },

  // ── Docs: Permits / Inspections / Submittals ───────────────────────────────
  {
    slug: 'permits',
    title: 'Track permits',
    category: 'docs',
    keywords: ['permit', 'building', 'number', 'status', 'jurisdiction', 'add'],
    summary: 'Log permits and keep their status and documents in one place.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Permits tab.',
        'Click Add Permit.',
        'Enter the permit number, type, status, and any contact.',
        'Attach the permit document if you have it, then save.',
      ] },
    ],
    related: ['inspections', 'submittals'],
  },
  {
    slug: 'inspections',
    title: 'Request, schedule, and record inspections',
    category: 'docs',
    keywords: ['inspection', 'inspector', 'pass', 'fail', 'schedule', 'result', 'ready', 'request', 'notify', 'secretary'],
    summary: 'A site manager or sub requests an inspection, the scheduler gets notified, and everyone hears the result.',
    blocks: [
      { type: 'text', text: 'The Inspections tab (under Docs & Legal) runs the whole workflow — request → schedule → pass/fail — with notifications along the way.' },
      { type: 'steps', items: [
        'On the Inspections tab, click Request Inspection (a site manager or sub can do this).',
        'Pick the inspection type, the contact/inspector to schedule with, a preferred date and time, and assign who schedules it. That person gets a notification.',
        'The scheduler books it and marks it Scheduled — the requester is notified back.',
        'After the visit, upload the inspector\'s card/paper on the inspection — AI reads it and fills the details.',
        'Mark it Passed or Failed — the requester (and scheduler) are notified of the result.',
      ] },
      { type: 'tip', text: 'The inspector\'s card is added AFTER, not at request time. Scheduled inspections also show on the Master Calendar timeline, color-coded (purple = upcoming, green = passed, red = failed).' },
    ],
    related: ['permits', 'master-calendar'],
  },
  {
    slug: 'submittals',
    title: 'Manage submittals',
    category: 'docs',
    keywords: ['submittal', 'shop drawing', 'review', 'approve', 'reject', 'spec'],
    summary: 'Route submittals for review and track approvals.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Submittals tab.',
        'Click Add Submittal and upload the document.',
        'Route it for review; reviewers add notes and approve or reject.',
      ] },
      { type: 'tip', text: 'Add review notes for the submitter so revisions are clear.' },
    ],
    related: ['permits', 'inspections'],
  },

  // ── Workspace: Directory / Customers / Files ───────────────────────────────
  {
    slug: 'directory',
    title: 'Add contacts to your Directory',
    category: 'workspace',
    keywords: ['directory', 'contact', 'sub', 'vendor', 'supplier', 'add', 'company'],
    summary: 'Keep your subs, suppliers, and contacts in one address book.',
    blocks: [
      { type: 'steps', items: [
        'Click Directory in the sidebar.',
        'Click Add Contact.',
        'Enter the company/person, trade, email, and phone.',
        'Save — they\'re now available to invite to bids and add to projects.',
      ] },
      { type: 'tip', text: 'Awarding a quote adds the winning vendor to your Directory automatically.' },
    ],
    related: ['request-quotes', 'award-quote'],
  },
  {
    slug: 'customers',
    title: 'Manage customers and their jobs',
    category: 'workspace',
    keywords: ['customer', 'client', 'owner', 'add', 'projects'],
    summary: 'Group a client\'s projects and keep their details together.',
    blocks: [
      { type: 'steps', items: [
        'Click Customers in the sidebar.',
        'Add a customer with their contact and billing details.',
        'Create projects for them, or link existing ones, so all their jobs are grouped.',
      ] },
    ],
    related: ['create-first-project'],
  },
  {
    slug: 'files',
    title: 'Store and share files',
    category: 'workspace',
    keywords: ['files', 'documents', 'upload', 'storage', 'share', 'packet'],
    summary: 'Keep project documents organized and easy to find.',
    blocks: [
      { type: 'steps', items: [
        'Click Files in the sidebar.',
        'Upload documents and organize them.',
        'Open a file to view or share it.',
      ] },
    ],
    related: ['daily-log-pdf'],
  },

  // ── Cross-project (admin) ──────────────────────────────────────────────────
  {
    slug: 'master-calendar',
    title: 'See every job on the Master Calendar',
    category: 'cross-project',
    keywords: ['master calendar', 'all projects', 'schedule', 'due dates', 'overview', 'admin'],
    summary: 'All projects\' schedules and task due dates in one view.',
    blocks: [
      { type: 'text', text: 'Master Calendar (admin only) shows every project\'s schedule and task due dates together.' },
      { type: 'steps', items: [
        'Click Master Calendar in the sidebar (under Master).',
        'Scan across all projects at once.',
        'Click any item to jump straight to its project.',
      ] },
    ],
    related: ['schedule-milestones', 'master-money', 'calendar-subscribe'],
  },
  {
    slug: 'calendar-subscribe',
    title: 'Add SyteNav to your Google / Apple / Outlook calendar',
    category: 'cross-project',
    keywords: ['calendar', 'google', 'apple', 'outlook', 'ical', 'subscribe', 'sync', 'feed'],
    summary: 'Mirror your schedules, tasks, and inspections into your own calendar (optional, read-only).',
    blocks: [
      { type: 'text', text: 'The in-app Master Calendar is always there — this just adds a copy of those events to your personal calendar. It\'s read-only, so it can never change anything in SyteNav.' },
      { type: 'steps', items: [
        'Open Master Calendar and click Connect to Calendar.',
        'Pick your calendar — Google, Apple, or Outlook — and it opens that app with an "add calendar" prompt. Confirm and you\'re done.',
        'Schedule items, task due dates, and scheduled inspections now appear in your calendar and refresh automatically.',
      ] },
      { type: 'tip', text: 'Using a different app? There\'s a "Copy the link instead" option, plus a Reset link button to invalidate the URL and get a new one.' },
      { type: 'warn', text: 'If you never connect a calendar, nothing changes — just keep using the Master Calendar inside SyteNav.' },
    ],
    related: ['master-calendar'],
  },
  {
    slug: 'master-money',
    title: 'Company money across all jobs (Master Money)',
    category: 'cross-project',
    keywords: ['master money', 'all projects', 'budgeted', 'committed', 'billed', 'paid', 'escrow', 'admin', 'rollup'],
    summary: 'Every project\'s budget, commitments, billing, and escrow in one table.',
    blocks: [
      { type: 'text', text: 'Master Money (admin only) rolls up the numbers from every project you run.' },
      { type: 'steps', items: [
        'Click Master Money in the sidebar (under Master).',
        'See per-project Budgeted, Committed, Billed, Paid, Received, and Escrow, plus totals.',
        'Click a row to open that project\'s Payments page.',
      ] },
      { type: 'tip', text: 'A negative escrow shows in red — a fast flag that a job has paid out more than it has collected.' },
    ],
    related: ['money-overview', 'record-client-payment'],
  },

  // ── Materials ──────────────────────────────────────────────────────────────
  {
    slug: 'materials-receipt',
    title: 'Snap a material receipt and assign it to a job',
    category: 'materials',
    keywords: ['material', 'receipt', 'photo', 'store', 'buy', 'purchase', 'supplier', 'cost', 'expense', 'lumber', 'wire'],
    summary: 'Take a photo of a receipt — AI reads the store and total, and it goes into the job\'s costs.',
    blocks: [
      { type: 'text', text: 'When someone buys materials (wire, lumber, lights, hardware), capture the receipt so the cost lands on the right job.' },
      { type: 'steps', items: [
        'Click Materials in the sidebar.',
        'Click Add receipt, then Take photo (or Upload file).',
        'The AI reads the store, date, total, tax, and line items — review and fix anything.',
        'Choose which job it\'s for. Optionally link it to a budget line so the cost rolls into that line\'s actuals, and keep "Save the store to my Directory" checked to add the store as a supplier.',
        'Click Save receipt.',
      ] },
      { type: 'tip', text: 'See a job\'s receipts on that project\'s Financials tab (a Materials section with the total), or filter by job on the Materials page. If you linked a budget line, the amount also shows in that line\'s Actual on the Budget tab.' },
    ],
    related: ['money-overview', 'add-project-budget'],
  },
]

// Flatten an article's text for search matching.
function articleText(a: HelpArticle): string {
  const parts: string[] = [a.title, a.summary, ...a.keywords]
  for (const b of a.blocks) {
    if (b.type === 'text' || b.type === 'tip' || b.type === 'warn') parts.push(b.text)
    else if (b.type === 'steps') parts.push(...b.items)
  }
  return parts.join(' ').toLowerCase()
}

// Rank articles against a query. Title and keyword hits weigh most.
export function searchArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/).filter(Boolean)
  const scored = HELP_ARTICLES.map((a) => {
    const title = a.title.toLowerCase()
    const keywords = a.keywords.join(' ').toLowerCase()
    const summary = a.summary.toLowerCase()
    const body = articleText(a)
    let score = 0
    for (const t of terms) {
      if (title.includes(t)) score += 10
      if (keywords.includes(t)) score += 6
      if (summary.includes(t)) score += 3
      else if (body.includes(t)) score += 1
    }
    // Small boost when the full phrase appears in the title
    if (title.includes(q)) score += 8
    return { a, score }
  })
  return scored.filter((s) => s.score > 0).sort((x, y) => y.score - x.score).map((s) => s.a)
}

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug)
}

export function articlesByCategory(key: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === key)
}
