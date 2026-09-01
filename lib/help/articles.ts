// ─────────────────────────────────────────────────────────────────────────────
// SyteNav Help Center - article content
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
    slug: 'set-up-existing-job',
    title: 'Set up a job that has already started',
    category: 'getting-started',
    keywords: [
      'set up', 'setup', 'checklist', 'onboard', 'onboarding', 'existing job',
      'already started', 'mid job', 'migrate', 'move a job in', 'where do i start',
      'first steps', 'tutorial', 'walkthrough', 'order', 'what comes first',
      'add contacts', 'add people', 'add subs',
    ],
    summary: 'The order to put an in-progress job into SyteNav, and why that order.',
    blocks: [
      { type: 'text', text: 'Open any job and there is a "Setup 4/10" chip in the header, next to the team and share buttons. Click it and a panel slides out from the right with the whole list: what is done, what is next, and a link straight to each one. It disappears on its own once every step is done. You can hide it from inside the panel - there is an Undo, and a switch in Project Settings to bring it back later.' },
      { type: 'text', text: 'THE ORDER MATTERS, because each step makes the ones after it work. Doing the budget before you have said how the job pays means the screen tracks the wrong thing. Adding a sub before there is a budget line gives their bills nowhere to land. Asking for insurance before you have named the sub is asking nobody.' },
      { type: 'steps', items: [
        'JOB DETAILS. Address and dates. The address puts it on the map; the dates drive the schedule and every "is this late" answer.',
        'HOW THE JOB PAYS YOU. Cost-plus, fixed price, or building to sell. Do this before the budget - it decides whether the Budget tab tracks your markup or a contract value.',
        'THE CLIENT. Who the invoices and the portal are for. Adding them now means never retyping the name onto a document later.',
        'THE BUDGET. Import the sheet you already have rather than retyping it. Everything money-related hangs off these lines.',
        'THE DRAWINGS. Drag the whole set onto the Plans tab at once. Subs quote off these and you can attach them to a request without re-uploading.',
        'THE PEOPLE. Your crew and the client contacts. Anyone on the job can be assigned a task, and only people on the job see it.',
        'THE SUBS YOU HAVE ALREADY AWARDED. Usually the biggest catch-up on a job already under way: each sub, their trade, and what they are contracted for. A subcontract is what makes money Committed, and it is what a bill attaches to.',
        'INSURANCE AND W-9s. After the subs exist, because you are requesting from them. One link each, and they upload it themselves with no account.',
        'THE SCHEDULE. Even roughly. It drives what shows as late, what the client sees, and the decide-by dates on selections.',
        'THE CLIENT LINK. Last, once there is something worth looking at. One link covers progress, selections and their invoices.',
      ] },
      { type: 'tip', text: 'Steps marked "needed" are the ones the job genuinely cannot work without - budget, subs, contract type, client, address. The rest are worth doing but nothing breaks while they wait.' },
      { type: 'text', text: 'CATCHING UP ON MONEY ALREADY SPENT. For a job that is part-built, add the subcontracts at their full contract value first, then enter the invoices already received against them and approve the ones you have accepted. The budget then shows the true Committed and Actual straight away rather than reading as though the job has not started. Receipts already paid go on Materials the same way.' },
      { type: 'text', text: 'You do not have to finish in one sitting, and nothing is lost by skipping a step and coming back - the bar keeps count and always points at the next thing.' },
    ],
    related: ['add-project-budget', 'project-settings', 'compliance-overview', 'money-overview'],
  },
  {
    slug: 'what-is-sytenav',
    title: 'What is SyteNav?',
    category: 'getting-started',
    keywords: ['overview', 'about', 'intro', 'what', 'start'],
    summary: 'A quick tour of what SyteNav does and how the pieces fit together.',
    blocks: [
      { type: 'text', text: 'SyteNav is an all-in-one workspace for general contractors and subcontractors. You run your jobs, request and compare quotes, hire subs, track budgets and invoices, manage client payments, keep compliance documents current, log daily site activity, and track equipment - all in one place.' },
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
        'The logo saves automatically and is stamped on generated PDFs - daily logs, invoices, and reports.',
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
        'Optionally enter Interior Sq Ft (under A/C) and Exterior Sq Ft (under roof) - this powers the interior/exterior cost breakdown on the Budget tab.',
        'Choose how you\'ll bill it: Simple invoicing (invoices + client payments, for residential/smaller jobs) or Progress billing (AIA pay applications with retainage, for commercial/bank-funded jobs). This decides which money tabs show, so the job isn\'t cluttered with both. You can change it later.',
        'Save. The project opens to its tabs.',
      ] },
      { type: 'tip', text: 'The address suggests matches as you type, and the Owner/Client dropdown pulls from your existing customers (or pick "New client" and type a name). On the Projects page, use the map toggle to see every job on a map, color-coded by status.' },
      { type: 'text', text: 'Nothing here is locked in. Everything you set at creation can be changed later from Project Settings - the gear icon in the project header. See "Change a project\'s settings".' },
    ],
    related: ['bulk-add-projects', 'project-settings', 'project-tabs-explained', 'add-project-budget'],
  },
  {
    slug: 'project-status-active',
    title: 'What Active means, and how to set a job to it',
    category: 'projects',
    keywords: [
      'active', 'status', 'planning', 'go live', 'start job', 'won the job', 'awarded',
      'deposit', 'under contract', 'on hold', 'completed', 'cancelled', 'checklist',
      'ready to start', 'set to active', 'change status', 'mobilise', 'mobilize', 'start date',
    ],
    summary: 'Active means the job is under contract - won and billable. Set it from the status badge in the project header.',
    blocks: [
      { type: 'text', text: 'Active means you have the job under contract. It does NOT mean crews are on site. Your deposit is the reason: contract signed, money in, nobody on site for three weeks - you still need to record that payment, so the job has to be active.' },
      { type: 'text', text: 'When work actually starts is the project\'s start date, which is a separate field. Use that (and the daily logs) to know whether anyone is on site.' },
      { type: 'steps', items: [
        'Open the project.',
        'Click the status badge at the top, next to the project name.',
        'Choose Active.',
        'Going from Planning to Active shows a short pre-flight - read it, set the start date, and confirm.',
      ] },
      { type: 'text', text: 'The pre-flight is filled in from the job itself: whether the budget has lines, whether a markup or AIA billing is set, whether a deposit has been recorded, whether subs are lined up, whether insurance docs are in, whether permits are filed. Green means done, amber means not yet - and amber never stops you. Plenty of jobs start before the permit lands.' },
      { type: 'tip', text: 'Two things change the moment a job goes Active. The markup on the Budget tab locks, because from then on it is the fee you bill. And the tabs that only matter once work starts - daily logs, time clock, invoices, pay apps, payments, materials, inspections, change orders - all switch on.' },
      { type: 'text', text: 'The other statuses are one click, no pre-flight: On Hold, Completed, Cancelled, or back to Planning. You can also change the status from the Projects list (pencil icon) or in Project Settings.' },
      { type: 'text', text: 'Changing a project\'s status needs edit permission on Projects. Field roles see the badge but cannot change it.' },
    ],
    related: ['project-settings', 'estimate-proposal', 'project-tabs-explained', 'record-client-payment'],
  },
  {
    slug: 'bulk-add-projects',
    title: 'Create a batch of projects at once (units, floors, houses)',
    category: 'projects',
    keywords: [
      'bulk', 'bulk add', 'bulk create', 'batch', 'multiple projects', 'many projects',
      'units', 'unit numbers', 'apartment', 'condo', 'building', 'floors', 'floor by floor',
      'level', 'suite', 'commercial', 'fit out', 'street numbers', 'subdivision', 'development',
      'site', 'parent project', 'folder', 'group projects', 'map', 'gps', 'coordinates',
    ],
    summary: 'Set up a whole building or street in one go, grouped under a single site.',
    blocks: [
      { type: 'text', text: 'A 40-unit building is 40 jobs - each with its own budget, schedule and crew - but it is one address and one client. Bulk Add creates them all at once and groups them under a site, so your Projects list shows one row instead of forty.' },
      { type: 'steps', items: [
        'Go to Projects and click Bulk Add (it is also on the Customers page and inside a customer, if you want the batch tied to that client).',
        'Pick what you are setting up: Units (one building, a job per unit), Floors (one building, a job per floor - the usual shape for a commercial fit-out), or Street numbers (a run of houses on one street).',
        'Enter a name prefix. Every job is named from it, e.g. "95 Edgecomb - Unit 3".',
        'For Units and Floors, enter the building address once - start typing and pick the suggestion so it is a complete address.',
        'For Street numbers, enter the street name plus the city/state/ZIP, then the first house number, the increment (2 for odd or even sides) and how many.',
        'Set the range, project type and start date, check the preview, and create. Up to 100 jobs per batch.',
      ] },
      { type: 'text', text: 'You land on the site\'s Jobs tab: every unit listed with its status, budgeted and actual amounts, and a total across the whole building. Click any one to open it as a normal project with all its own tabs.' },
      { type: 'tip', text: 'The site itself is a container, not a job. It holds the address, client, plans and permits; budgets, schedules and crews live on the units. That is why a site shows a shorter set of tabs and a "Site" badge.' },
      { type: 'text', text: 'On the unit and floor batches the address is geocoded once and shared, because every unit really is the same building - so they all land on the map at the right spot. Street batches look up each house separately. If a job could not be placed you will be told how many, and fixing its address in Project Settings puts it on the map.' },
      { type: 'text', text: 'The unit or floor number is stored as its own field rather than being glued onto the address, which is what keeps the address clean enough to geocode. You can see and change it in Project Settings on any job.' },
      { type: 'tip', text: 'Searching on the Projects page looks inside sites too, so you can jump straight to "Unit 12" without opening the building first.' },
    ],
    related: ['create-first-project', 'project-settings', 'project-tabs-explained'],
  },
  {
    slug: 'project-settings',
    title: 'Change a project\'s settings',
    category: 'projects',
    keywords: [
      'project settings', 'edit project', 'gear', 'rename', 'change address', 'change status',
      'planning', 'active', 'on hold', 'completed', 'billing method', 'billing mode', 'aia',
      'retainage', 'square footage', 'sq ft', 'interior', 'exterior', 'project type',
      'residential', 'commercial', 'mixed use', 'owner', 'client', 'start date', 'end date',
    ],
    summary: 'Edit any project detail after setup - name, address, status, billing method, square footage.',
    blocks: [
      { type: 'text', text: 'Open a project and click the gear icon in the header (next to Team and Share). Everything you set when you created the job can be changed here.' },
      { type: 'steps', items: [
        'Project name, address, and Owner / Client.',
        'Project Type - Residential, Commercial, or Mixed Use.',
        'Status - Planning, Active, On Hold, Completed, Cancelled. (Faster from the status badge in the project header - see "What Active means".)',
        'Start and end dates.',
        'How you bill the job - Simple invoicing or Progress billing (AIA), plus default retainage % on AIA jobs.',
        'Interior and Exterior Sq Ft, which power the cost-per-square-foot breakdown on the Budget tab.',
        'Unit and Floor, on jobs that sit inside a building (created by Bulk Add).',
      ] },
      { type: 'tip', text: 'Two of these change what you see. Status: a job in Planning shows the shorter preconstruction menu. Billing method: AIA jobs get Pay Apps, simple jobs get Invoices and Payments. The tabs update as soon as you save - no need to reload.' },
      { type: 'text', text: 'Switching billing method does not delete anything. Invoices or pay applications already created stay on the job; only which tabs are shown changes.' },
      { type: 'text', text: 'For the address, start typing the street and pick a suggestion - city, state and ZIP fill in for you, and the job gets map coordinates. Typing them by hand works too.' },
    ],
    related: ['create-first-project', 'project-tabs-explained', 'preconstruction-soft-costs', 'pay-applications'],
  },
  {
    slug: 'global-search',
    title: 'Search across everything at once',
    category: 'projects',
    keywords: ['search', 'global', 'find', 'master search', 'quick find', 'jump', 'command', 'line item', 'receipt', 'customer', 'invoice'],
    summary: 'One search box in the top bar finds jobs, line items, receipts, customers, and more.',
    blocks: [
      { type: 'text', text: 'The search box at the top of every page searches your whole account at once, not just the page you\'re on.' },
      { type: 'steps', items: [
        'Click the search box in the top bar, or press Cmd/Ctrl + K from anywhere.',
        'Type at least two letters. Results appear instantly, grouped by type: Projects, Budget lines, Material receipts, Invoices, Subcontracts, RFIs, Tasks, Change orders, Customers, and Directory.',
        'Use the arrow keys and Enter, or just click a result, to jump straight to it.',
      ] },
      { type: 'tip', text: 'It matches on more than names: a receipt\'s store, a budget line\'s cost code, an invoice number, a customer\'s email, and more. You only see records from your own company\'s jobs.' },
    ],
    related: ['project-tabs-explained', 'create-first-project'],
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
      { type: 'text', text: 'A job still in Planning shows a shorter menu with a "Preconstruction" badge. Nobody is on site yet and there is nothing to bill, so Time Clock, Daily Logs, Progress, Materials, Inspections, Invoices, Pay Apps, Payments, Change Orders, Summary and Reports stay out of the way. They all come back the moment you set the project to Active.' },
    ],
    related: ['preconstruction-soft-costs'],
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
        'Describe the work, assign a teammate, set a due date, and save - the pin drops and the task is created (the assignee is notified).',
        'Pins are color-coded per assignee and stay anchored to the spot as you zoom in and out. Tap any pin to see its task or jump to the Tasks tab.',
        'Use the list button to see every pin on the file - tap one and the viewer jumps to its exact spot. On a task created from a pin, "View pinned spot on the plan" links back the other way.',
        'On a phone, use the full-screen button for a bigger canvas while dropping or reading pins.',
      ] },
      { type: 'tip', text: 'Removing a pin keeps its task - nothing gets lost. Very large sheets render at a capped resolution so they stay fast; use the file button to open the raw PDF at native quality.' },
    ],
    related: ['tasks-assign', 'project-tabs-explained'],
  },

  // ── Quotes & Bidding ───────────────────────────────────────────────────────
  {
    slug: 'request-quotes',
    title: 'Request quotes from subs by email',
    category: 'quotes',
    keywords: ['quote', 'rfq', 'request', 'bid', 'invite', 'email', 'link', 'notification', 'my bids', 'quote requests'],
    summary: 'Send subs a private link to submit a quote - no account needed.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Quotes (Request Quotes) tab.',
        'Create a quote request with a title, trade, scope, and optional due date. Attach plans if you have them.',
        'Add invitees: pick a sub from your Directory, or type a name and email.',
        'Each invitee gets a private link. Click Email to open a pre-filled message, or Copy the link to send it your own way.',
        'Watch responses come in as subs submit - the status updates from invited to viewed to submitted.',
      ] },
      { type: 'tip', text: 'Subs do not need a SyteNav account. The link opens a simple page where they enter an amount and attach their quote.' },
      { type: 'tip', text: 'If you picked the sub from your Directory and they DO have a SyteNav account, they also get a notification and the request shows up under Quote requests on their My Bids page - so it does not get lost in an inbox.' },
    ],
    related: ['compare-quotes', 'award-quote'],
  },
  {
    slug: 'scope-what-to-send',
    title: 'What to send each sub when you ask for a price',
    category: 'money',
    keywords: [
      'scope', 'what to send', 'rfq', 'request quote', 'apples to apples', 'compare',
      'takeoff', 'material list', 'who supplies material', 'labor only', 'turnkey',
      'framer', 'lumber', 'electrician', 'plumber', 'measure', 'exclusions', 'included',
    ],
    summary: 'The question is not the trade - it is who supplies the material. Pick the trade and the scope fills itself in.',
    blocks: [
      { type: 'text', text: 'You do not need a takeoff to compare bids fairly. You need every bidder to answer the same questions. That is what the scope section of a quote request does, and it works on a job where all you have is a set of plans.' },
      { type: 'text', text: 'The thing that decides what you send is not the trade - it is who supplies the material. A foundation sub brings his own, so the plans are enough. A framer prices labor and tells you what lumber to order. A lumber yard needs a list to price. A door supplier comes and measures first.' },
      { type: 'steps', items: [
        'Start a quote request and pick the trade.',
        'The scope fills in from that trade: whether it is labor + material, labor only, material only, or measure & quote; who supplies the material; what is included; what is excluded; and what you need back besides a price.',
        'Edit any of it - the defaults are a starting point, not a rule. Click a line to change its wording, or use the move arrows to send it from Included to Not included and back. Trades that work the same way start out looking alike (plumbing and electrical are both priced per point with fixtures on allowance) - that is the trade, not a mistake.',
        'Attach the plans and send. Every bidder sees the same scope on their link.',
      ] },
      { type: 'tip', text: 'On a labor-only package, the most valuable thing you ask for is the material list. That list is what you send the lumber yard to price, so ask for it in writing with the bid.' },
      { type: 'text', text: 'The scope and the item list do NOT overlap. The scope says what work is in and out of the package, and it applies to every job - it needs nothing but a set of plans. The item list says what quantities to price, and it is only for material YOU are buying. On a plumbing package the plumber brings his own rough material, so the item list stays empty; on a lumber package it is the whole point. The item list panel tells you which case you are in.' },
      { type: 'text', text: 'The panel tells you how the bids will compare. Send plans and a scope and you get totals that compare because the questions matched. Send an item list and you get line-by-line pricing that compares exactly. Both are fine - it just should not be a surprise.' },
      { type: 'text', text: 'Excluded lines matter as much as included ones. Most change orders come from something nobody said out loud - rock excavation, deck repair, fixture allowances. The defaults already list the usual suspects per trade.' },
    ],
    related: ['request-quotes', 'item-list', 'compare-quotes', 'award-quote', 'add-project-budget'],
  },
  {
    slug: 'item-list',
    title: 'Item lists - getting quotes priced line by line',
    category: 'money',
    keywords: [
      'item list', 'line items', 'takeoff', 'material list', 'quantities', 'unit price',
      'lumber', 'lumber yard', 'trusses', 'moldings', 'windows', 'supplier', 'material only',
      'import takeoff', 'excel', 'spreadsheet', 'paste', 'compare line by line', 'per line',
      'qty', 'unit', 'bid', 'rfq', 'quote', 'supplier pricing',
    ],
    summary: 'Send the lines and every supplier prices the same ones, so the quotes compare to the penny.',
    blocks: [
      { type: 'text', text: 'Most packages do not need an item list. A foundation sub brings his own material and quotes off the plans; an electrician prices per opening. You need a list only when YOU are buying the material and somebody has to count it - lumber, trusses, moldings, windows, fixtures. That is exactly when a total-only quote tells you nothing.' },
      { type: 'steps', items: [
        'Open a quote request and expand Item list under the scope questions.',
        'Import a takeoff (Excel or CSV), paste rows straight out of a spreadsheet, or add lines one at a time.',
        'Each line is an item, a quantity, a unit, and an optional spec note. Fix anything the import got wrong before you send.',
        'Send as usual. Every bidder gets the same lines on their link.',
      ] },
      { type: 'text', text: 'On their side, the supplier enters a unit price per line and the total adds itself up - no arithmetic, no transcription. They can leave a line blank if they do not carry it and add a note saying so, which is information you want.' },
      { type: 'text', text: 'Back on the quote request, "Compare line by line" opens a table: your items down the side, each bidder across the top, the low price on every line in green. That is where you see the one line that is triple on one bid and missing on another - the thing a total hides.' },
      { type: 'tip', text: 'Importing a takeoff reads the sheet\'s own header row when it has one (Description / Qty / Unit) and falls back to a best guess when it does not. Always skim the lines before sending.' },
      { type: 'tip', text: 'No item list? The quotes still compare - just on totals plus the scope questions every bidder answered. The scope panel on the request tells you which kind of comparison you are setting up.' },
      { type: 'text', text: 'On a labor-only package like framing, ask the framer for his material list with the bid. That list becomes the item list you send the lumber yard.' },
    ],
    related: ['scope-what-to-send', 'request-quotes', 'compare-quotes', 'add-project-budget'],
  },
  {
    slug: 'compare-quotes',
    title: 'Compare quotes (with AI analysis)',
    category: 'quotes',
    keywords: ['compare', 'analyze', 'ai', 'level', 'quotes', 'quote comparison'],
    summary: 'Line quotes up side by side - the AI checks each against your requirements automatically.',
    blocks: [
      { type: 'steps', items: [
        'On the Quotes tab, open a request and click Compare quotes to pull in the responses.',
        'Or upload quotes you already collected - drag in PDFs/images and the AI reads the vendor, total, line items, inclusions, and exclusions.',
        'Type what you need in the Requirements box (e.g. "200A panel, all permits included").',
        'The AI analyzes automatically and flags what each quote is missing, its strengths, and concerns - and recommends the best value.',
      ] },
      { type: 'tip', text: 'Comparing already runs the analysis - you no longer click a separate "Analyze" button. Use Re-analyze after you change the requirements.' },
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
      { type: 'warn', text: 'Awarding is locked once done - a comparison can only be awarded once. Analyze and mark winner are disabled after award.' },
    ],
    related: ['compare-quotes', 'add-project-budget', 'compliance-overview'],
  },

  // ── Money: Budget ──────────────────────────────────────────────────────────
  {
    slug: 'scan-sub-invoice',
    title: 'Entering an invoice a sub emailed you',
    category: 'money',
    keywords: [
      'invoice', 'invoices', 'sub invoice', 'subcontractor invoice', 'scan invoice',
      'upload invoice', 'pdf', 'screenshot', 'photo', 'bill', 'vendor invoice',
      'enter invoice', 'ocr', 'read invoice', 'payment schedule', 'approve invoice',
      'budget line', 'which line', 'what does it go against', 'not on the budget',
      'money out', 'payable', 'what i owe',
    ],
    summary: 'Drop the PDF in and it fills the form - including which budget line it lands on. You check the amount and save.',
    blocks: [
      { type: 'text', text: 'Invoices live on the project, under Financials. If you cannot see the tab, check the job is not still in Planning - invoices, pay apps, payments and change orders are all hidden until a job goes Active, because none of them can happen before then.' },
      { type: 'text', text: 'This tab is money going OUT - what your subs and suppliers are billing you. What the client owes YOU is somewhere else entirely: Pay Apps on a job set to AIA billing, or Payments on a job set to simple invoicing. The two never mix, so a sub\'s bill can never turn up as client billing.' },
      { type: 'steps', items: [
        'Open Invoices on the project and click "Scan an invoice" - or drag the file straight onto that button. A PDF, a photo, or a screenshot all work.',
        'It reads the document and opens the form already filled in: who is billing, the amount, the date, and what the work was. The file is attached at the same time.',
        'It also tries to match the invoice to a subcontract on this job and to a line on that sub\'s payment schedule. Check that it picked the right sub.',
        'Fix anything wrong, then save. Nothing is created until you do.',
      ] },
      { type: 'warn', text: 'Always check the amount before saving. A clean PDF reads accurately; a photo of a crumpled page is a different matter. When the scan is unsure it says so at the top of the form - believe it.' },
      { type: 'tip', text: 'The genuinely useful part is not reading the number, it is comparing it. If the invoice is for more than the payment schedule line it matches, the form says so in red before you save - which is the moment to ask about it, rather than after it has been paid.' },
      { type: 'text', text: 'THE BREAKDOWN. Every invoice keeps what it is charging for, not just the total: each line with its quantity and rate where the vendor printed one, then the lines total, tax, retainage withheld, and the invoice total. Scanning reads all of it off the PDF. Typing an invoice by hand gets the same thing - use "+ Add a line" on the form.' },
      { type: 'text', text: 'It checks that the lines add up to the total and says so, either "Adds up to the total" or exactly how far out it is. That matters because a breakdown that looks like detail but does not reconcile is worse than none - it invites you to trust it, and the difference is where a quiet extra sits. A line with no amount on it is called out too, since it makes the sum incomplete rather than wrong.' },
      { type: 'text', text: 'DOES IT MATCH THEIR QUOTE? When the sub\'s contract has priced lines on it - from an awarded quote or a bid you accepted - the scan checks the invoice against them and says either "Matches their quote" or exactly what does not. Three things get flagged: a line billed for more than it was quoted (with both figures), a line that is not on the quote at all, and an invoice that takes the running total past the contract.' },
      { type: 'text', text: 'The contract total is the check most people already do in their head. The two that cost money are the other ones - a rate nobody agreed to, and work that was never quoted and has no change order behind it. Both look completely ordinary on an invoice whose total is under the contract, which is exactly why they get paid.' },
      { type: 'tip', text: 'It never blocks the invoice. A sub being owed money for genuine extra work is normal, and a hard rule would just push it off the system. The point is that you see it before you approve, not after.' },
      { type: 'text', text: 'If the read fails entirely - a bad fax, a photo at an angle - the document is still uploaded and attached. You fill in the rest by hand and are no worse off than before.' },
      { type: 'text', text: 'You can still create an invoice from scratch: "Create Invoice", pick the subcontractor, and bill against a payment schedule item, a percent of the contract, or a flat amount. Picking a schedule item fills the amount in for you, so there is nothing to type.' },

      { type: 'text', text: 'WHICH BUDGET LINE IT GOES AGAINST. As soon as you pick the sub - or the scan picks one for you - the form says where the money lands: the line, what is budgeted on it, what has already been billed against it, and what is left. Every invoice card shows the same thing, so you can see which line each one hit without opening the Budget tab.' },
      { type: 'text', text: 'An invoice does not carry a budget line of its own. It lands wherever its SUBCONTRACT is pointed, which is why there is no per-invoice override - two invoices from one sub hitting two different lines is how a contract total quietly stops adding up. To send them somewhere else, re-point the subcontract on the Budget tab and every invoice on it moves together.' },
      { type: 'warn', text: 'If the sub has no budget line at all, the invoice says "This won\'t show up on the budget" - and it means it. The invoice would save, the money would go out, and the budget would not move. Use "Add a budget line for this contract" right there on the invoice; it starts the line at the contract amount, which you can change on the Budget tab.' },
      { type: 'tip', text: 'Approving an invoice is what moves the budget - it lands on the committed and actual figures for that line. Uploading the document alone does not.' },
    ],
    related: ['add-project-budget', 'record-client-payment', 'change-order-basics', 'create-invoice'],
  },
  {
    slug: 'selections',
    title: 'Selections - the choices that aren\'t yours to make',
    category: 'money',
    keywords: [
      'selections', 'selection board', 'allowance', 'allowances', 'homeowner', 'client picks',
      'paint color', 'tile', 'flooring', 'cabinets', 'countertops', 'fixtures', 'appliances',
      'windows', 'siding', 'roofing', 'lead time', 'decide by', 'client portal', 'swatch',
      'change order', 'over allowance', 'upgrade', 'showroom', 'finishes', 'photo', 'sample',
      'order', 'supplier', 'budget line', 'brand', 'options', 'fan deck', 'delivery',
    ],
    summary: 'Every choice the client owes you, with an allowance and a date set by lead time - not by when the trade shows up.',
    blocks: [
      { type: 'text', text: 'You do not pick the paint color, and you cannot paint without it. Same for tile, flooring, cabinets, fixtures, windows, siding. Every one of those is a decision somebody else owes you, and none of them lives anywhere - so it surfaces as a phone call the week the trade is standing on site asking what color.' },
      { type: 'text', text: 'The Selections tab is a list of those decisions. Each one carries an allowance - what your budget already assumed - and a decide-by date driven by LEAD TIME rather than the schedule. A six-week window order decided the week framing finishes is already late, even though nobody was late.' },

      { type: 'steps', items: [
        'Open Selections on the project and click "Start the standard board". You get a checklist of the 21 categories, already ticked for the kind of job this is - a commercial fit-out does not get sod, shutters or a bathtub; a house gets everything. Untick what does not apply and it tells you how many selections you are about to add.',
        'Connect each one to a budget line. The board suggests a line for every selection and you change whatever is wrong before it saves - it never links silently, because a wrong link puts a client\'s upgrade on somebody else\'s line. If nothing fits, "Add a line for this" creates one.',
        'Set the decide-by date, backed up from install by the lead time shown on each category.',
        'Add options where you have them - brand, price, a link to the product page, and a photo you drop or upload. Press Enter or click Add to save each one; the row tells you while something is still unsaved. The brand carries to the next row, since you are usually entering one manufacturer line after line.',
        'Copy the client link and send it. Same link as their project portal - no second link to lose, no account needed. If the project has never been shared, the button creates the link.',
      ] },

      { type: 'text', text: 'ALLOWANCES AND THE BUDGET. Link a selection to a line and the allowance fills in with whatever is left on that line, after the other selections already pointing at it, and tells you when you have gone over. Link one to a line with nothing budgeted and it offers to set the LINE to the allowance instead - usually the line is the thing nobody got round to filling in.' },
      { type: 'warn', text: 'You cannot mark a selection chosen, ordered or installed until it has a budget line. An accepted selection is money, and money with nowhere to land is exactly what this board exists to prevent. (The client is never blocked by this on their own link - that would be holding up a homeowner over your bookkeeping.)' },
      { type: 'tip', text: 'When a pick lands over the allowance, the board shows the difference and offers to raise a change order for exactly that amount, against the same budget line. That is the whole reason allowances are tracked here rather than in someone\'s head - the difference is real money and it needs a paper trail, not a conversation.' },

      { type: 'text', text: 'GIVING THEM SOMETHING TO LOOK AT. A selection is a visual decision. Every option takes a photo - drop it on the thumbnail or click to pick one - so a phone shot of the sample board or a screenshot off the supplier site is enough. There is no color picker, because nobody eyeballs Sherwin Williams Alabaster off a color wheel.' },
      { type: 'tip', text: 'Rather than loading forty options, put the manufacturer\'s color chart or product page in "Where they can browse the range". That link shows at the top of the selection on the client\'s side, so they go and look at the real thing and write in what they found.' },
      { type: 'tip', text: 'Got a whole fan deck? "Paste a list" takes one per line and works out which bit is which - a #hex draws a swatch, a link is a link, a number is the price, the rest is the name. Brand carries over from the last option, so you are not retyping it every row.' },
      { type: 'text', text: 'Brand and supplier are different things and are kept apart. The BRAND is the client\'s business - a Kohler faucet is not a Glacier Bay one, and that is the whole reason there is a choice - so it shows on their link. The SUPPLIER is yours, comes from your Directory, and never appears on the client\'s side.' },

      { type: 'text', text: 'WHAT THE CLIENT SEES. Only what is still waiting on them, most urgent first, with the extra cost shown against your allowance before they commit. They pick an option or write in what they chose, and it lands on your board stamped with who decided and when. Everything already decided shows its status in their words: waiting on you, you chose this, ordered, installed.' },
      { type: 'tip', text: 'They can change anything that has not been ordered - it tells them you will be in touch if the change cannot be made. Once you mark something Ordered they can no longer change it outright; instead they send a REQUEST, which shows on your board as "Client asked to change this" for you to answer. At that point it is a change order, not a choice, and the app says so rather than pretending the change happened.' },

      { type: 'text', text: 'ORDERING. When they have chosen and you are ready to buy, "Order it" records the supplier from your Directory, the amount - already priced from what they picked, so nobody retypes it - and the expected delivery. That books the cost against the budget line and the client\'s link shows it as Ordered with the delivery date.' },

      { type: 'tip', text: 'You do not have to decide everything up front. "Add a category" reopens the same checklist, so you can bring in flooring or tile later without starting over - anything already on the board is marked so nothing gets duplicated.' },
      { type: 'text', text: 'The top of the board answers the questions worth asking at a glance: how many decisions are still owed, how many are already past due, how many are connected to the budget, and how far the picks have run over their allowances in total.' },
    ],
    related: ['add-project-budget', 'change-order-basics', 'materials-client-paid'],
  },
  {
    slug: 'add-project-budget',
    title: 'Build a project budget',
    category: 'money',
    keywords: ['budget', 'line item', 'cost', 'estimate', 'committed', 'actual', 'interior', 'exterior', 'square footage', 'sq ft', 'bulk delete', 'select all', 'duplicate', 'hard cost', 'soft cost', 'category', 'categories', 'custom category', 'trade', 'craning', 'trusses', 'waterproofing', 'low voltage', 'sprinklers', 'demolition', 'remaining', 'left to spend', 'revised budget', 'change order', 'over budget', 'committed not billed', 'contract type', 'cost plus', 'fixed price', 'markup', 'how does this job pay', 'materials markup', 'fee on materials', 'at cost', 'reconcile', 'numbers do not add up', 'actual spent', 'bills'],
    summary: 'Add budget lines and track budgeted vs committed vs actual.',
    blocks: [
      { type: 'text', text: 'Each budget line tracks three numbers: Budgeted (what you planned, plus any approved change orders), Committed (what you have promised in signed contracts), and Actual (what has actually been billed).' },
      { type: 'text', text: 'CLICK A LINE\'S NAME to see what is behind the number: its contract, every bill against it, every change order and every receipt - each clickable through to where it lives. Anything not yet approved is listed greyed, with what it is waiting on, so you can see what is coming as well as what has landed. It is also where you set that line\'s markup.' },
      { type: 'text', text: 'ONE BILL CAN COVER SEVERAL LINES. A supplier invoice with lumber and windows on it, or a bill that is only partly this line - open the bill on Bills from subs and use "Split this across budget lines". A split does not have to add up to the invoice total; the remainder is shown as unassigned rather than sent somewhere you did not choose. It can never add up to MORE than the invoice. While a bill carries a split, the split is the whole story - it stops following its subcontract, so nothing is counted twice.' },
      { type: 'text', text: 'THE FIRST THING IT ASKS is how the job pays you - cost-plus, fixed price, or building to sell. That decides whether this screen tracks your markup or a contract value, and it is asked once. See "Track your profit on a job" for what each one does.' },
      { type: 'text', text: 'VARIANCE on a line is budget less whichever is bigger: what you have signed, or what you have already been billed. It is NOT committed minus actual - that is how much of the contract is still to be invoiced, which is a useful number but a different question, and it is on the hover instead. Variance answers "is this line going to beat or blow its budget", so a line with a signed contract it has not billed against yet is already spoken for.' },
      { type: 'text', text: 'LEFT TO SPEND counts your signed contracts, not only the invoices that have arrived. If you budgeted $500,000, have signed $450,000 in contracts, and have been billed $200,000, you do not have $300,000 left - you have $50,000. The tile used to show the larger number. The Committed tile now also says how much of it is signed but not yet billed, which is the money that used to hide.' },
      { type: 'text', text: 'THE TILES NOW SHOW THEIR OWN WORKING. Actual Spent says how it splits - "$207,920 in bills + $12,955 materials" - because two different things were adding into one number and nobody could tell. If it looks bigger than your Bills tab, that tab is usually filtered to one status: Actual Spent counts every bill that is approved, released for payment, OR paid. Left to spend now prints the subtraction it actually did, rather than a total you have to reverse-engineer.' },
      { type: 'text', text: 'DOES YOUR FEE APPLY TO MATERIALS? That depends on your contract, so it is a setting per job - the "Charge this on materials too" tick next to the markup rate. It is OFF unless you turn it on, which is how every job worked before the setting existed, so nothing you have already earned changed. With it on, each receipt can still be overridden: open a receipt on the Materials tab and mark it at cost. The fee line on the Budget tab always names what it was earned on, so the number and the sentence beside it can never describe different money.' },
      { type: 'text', text: 'APPROVED CHANGE ORDERS RAISE THE LINE. Approve a change order and the budget line it belongs to grows by that amount, so a line does not read as over budget at the very moment the overage was approved and funded. The line shows "incl. $X CO" underneath, and the Total Budget tile breaks out original versus approved changes. Your original estimate is never overwritten - it is still there, which is what you want when asking how well the job was estimated.' },
      { type: 'steps', items: [
        'Open the project and go to the Budget tab.',
        'Add a line: cost type (hard or soft), category, description, and budgeted amount.',
        'Pick a Space for the line - Interior or Exterior - to have it roll into that breakdown (leave it unassigned if it doesn\'t apply).',
        'Optionally link the line to a subcontract - then Committed and Actual fill in automatically from that sub\'s contract and approved invoices.',
      ] },
      { type: 'tip', text: 'Approving an invoice (not just paying it) moves the Actual amount. This keeps your budget honest the moment costs are accepted.' },
      { type: 'text', text: 'The category list covers the trades in roughly build order - site prep, excavation, waterproofing, foundation, framing, trusses, craning, roofing, gutters, decking, low voltage, fire sprinklers, soundproofing, finishes, rubbish removal, and so on. It is a long list, so type in the search box at the top of the dropdown to jump to one.' },
      { type: 'text', text: 'Call a trade something else? Click "+ Use my own category" under the Category box and type your own. It saves on the line like any other category, and once you have used it, it appears in the dropdown on every other job - so you only ever type it once.' },
      { type: 'text', text: 'If the project has Interior/Exterior square footage set (from New Project or the Projects list edit), the Budget tab shows an Interior total, Exterior total, cost-per-square-foot for each, and a grand total - so you can see your cost per sq ft at a glance.' },
      { type: 'text', text: 'Already have the budget in a spreadsheet? Use Import Estimate in the header (.xlsx/.csv). It reads amounts written any normal way - $24,000.00, 24,000, plain numbers, or a CSV where everything is text - and takes the line TOTAL rather than the unit price. A leading cost-code column stays a cost code instead of becoming the line-item name.' },
      { type: 'text', text: 'Before anything is added it tells you how many lines it found and how many of them it could read an amount for, so a sheet it could not price is obvious straight away rather than after the fact. Tick "Bring the amounts in too" to keep the prices, or untick it to import just the line items and price them yourself.' },
      { type: 'text', text: 'Then "Add these lines to this budget" puts them straight on the job. If some rows match lines already there you get a choice - update those with the sheet\'s amounts, or skip them and add only the new rows. Neither option deletes anything; lines not in the sheet are left alone. There is also a smaller link to save the sheet as a reusable template at the same time, for a set of lines you use on every job.' },
      { type: 'text', text: 'Loaded the wrong template or made a mess? Check the box next to any line (or the header checkbox to select a whole category or everything visible), then click Delete - you\'ll be asked to confirm before anything is removed.' },
    ],
    related: ['sellout-projected-profit', 'preconstruction-soft-costs', 'budget-templates', 'selections', 'money-overview', 'create-invoice', 'estimate-proposal'],
  },
  {
    slug: 'sellout-projected-profit',
    title: 'Track your profit on a job',
    category: 'money',
    keywords: [
      'sellout', 'sell out', 'profit', 'projected profit', 'margin', 'revenue',
      'sale price', 'contract value', 'spec build', 'spec home', 'developer',
      'making money', 'am i making money', 'gross profit', 'profit per unit',
      'contract type', 'cost plus', 'cost-plus', 'fixed price', 'custom home',
      'how does this job pay', 'markup', 'fee',
    ],
    summary: 'Say how the job pays and profit tracks itself as costs land.',
    blocks: [
      { type: 'text', text: 'FIRST THE BUDGET TAB ASKS HOW THE JOB PAYS YOU. Three answers: COST-PLUS (you bill what it costs plus a percentage - the markup is your pay), FIXED PRICE (one agreed number, and you keep whatever is left after costs), or BUILDING TO SELL (no client - revenue is the sale price). You answer once and the screen settles.' },
      { type: 'text', text: 'WHY IT ASKS. Before this it showed a "what are you charging for this job?" box and a markup box at the same time, with "leave it empty on cost-plus" underneath - because it did not know which kind of job it was and was leaving you to work it out. On a cost-plus custom home that box is asking a question the job has no answer to. Billing method (simple or AIA) does not tell it either: that is how you INVOICE, not how you are PAID.' },
      { type: 'text', text: 'ON COST-PLUS the screen tracks your markup, and there is no contract-value box at all. Your fee is the profit: the panel shows the markup across the whole budget, and once costs land, the fee actually EARNED. That earned figure is worked out invoice by invoice, so anything you billed at cost or gave its own percent is respected - it is not the rate multiplied by your spend. It is the same number the Billing the client tab reports, from the same calculation.' },
      { type: 'text', text: 'ON FIXED PRICE OR BUILDING TO SELL it asks for the figure instead - your CONTRACT VALUE on a job with a client, the SELLOUT on one you are building to sell. Profit is that less what the job is budgeted to cost, and once costs land, against what has actually been spent.' },
      { type: 'text', text: 'PROFIT IS ONLY EVER SHOWN AGAINST A FIGURE YOU ACTUALLY GAVE IT. It used to fall back to cost plus your markup and print that as "projected profit", so a job whose price nobody had entered still showed a confident green number the app had invented. If the figure is missing the panel does not draw at all.' },
      { type: 'text', text: 'It stays on the screen at every stage, not just while planning. "Am I still making money on this" is the question you ask MOST once work has started, and the "against actual spend" figure only means anything once costs have landed.' },
      { type: 'steps', items: [
        'Open the project and go to the Budget tab.',
        'Answer "How does this job pay you?" - once per job.',
        'Cost-plus: set your markup percent. Fixed price or building to sell: enter the contract value or sale price.',
        'Projected profit and margin appear next to it, and profit against actual spend once costs start landing.',
      ] },
      { type: 'tip', text: 'THE RATE AND THE CONTRACT VALUE DO NOT SIT LIVE. They read as plain text with a small pencil beside them - click it to edit, tick to confirm, Escape to abandon. Nothing is saved just because you clicked away mid-edit. These decide what a client is billed, and the Budget tab is a screen people scroll through to read far more often than to change anything.' },
      { type: 'tip', text: 'Change the answer any time in Edit project. If you mostly do one kind of work, set it once in Settings → Company and new jobs start there.' },
      { type: 'text', text: 'MARKUP is the rate, and on a cost-plus job it is the default rather than the last word. Any single invoice can be billed at cost or given its own percent on the Bills from subs tab - a permit fee or a pass-through does not have to follow the job rate. That is set per invoice on purpose: you mark up a real cost, not a budget line, because a budget line is a forecast and nobody bills a forecast.' },
      { type: 'text', text: 'Before a job is won the markup also drives the client price on your proposal. On a cost-plus job that estimate bar reads the rate you set above rather than offering a second box writing the same field.' },
      { type: 'text', text: 'On a multi-unit site, set the figure on each unit. The site\'s Jobs tab then totals it against total cost and shows the projected profit for the whole building, with the margin. Units you have not priced yet are marked, and the total says "partial" so you know the number is not final.' },
      { type: 'text', text: 'This is deliberately just revenue minus cost. SyteNav does not model land acquisition, a loan or equity stack, draw schedules, or an exit - if you run a full development pro-forma, keep doing that in your own model and use this to keep the construction side honest.' },
    ],
    related: ['add-project-budget', 'preconstruction-soft-costs', 'estimate-proposal', 'money-overview', 'bulk-add-projects'],
  },
  {
    slug: 'preconstruction-soft-costs',
    title: 'Preconstruction and soft costs',
    category: 'money',
    keywords: [
      'soft cost', 'soft costs', 'hard cost', 'hard costs', 'preconstruction', 'pre-construction',
      'pro forma', 'proforma', 'land', 'plans', 'design', 'architect', 'permit fees', 'builders risk',
      'insurance', 'survey', 'legal', 'recording', 'broker', 'engineering', 'loan', 'origination',
      'interest', 'carrying cost', 'contingency', 'taxes', 'approvals', 'planning stage', 'development',
    ],
    summary: 'Track the money spent before and around the trades - plans, permits, insurance, loan interest - in the same budget.',
    blocks: [
      { type: 'text', text: 'Not every dollar on a job is a trade. Before anyone swings a hammer you are paying for plans and design, permit fees, a survey, builders risk insurance, legal and recording, loan origination and interest, and you are carrying a contingency. Those are soft costs, and they belong on the same budget as the trades - otherwise your job total is not the real job total.' },
      { type: 'text', text: 'Every budget line is either a Hard cost (the physical construction - framing, concrete, plumbing) or a Soft cost. Existing lines are all hard costs, so nothing changed on jobs you already have.' },
      { type: 'steps', items: [
        'Open the project and go to the Budget tab.',
        'Click "Add preconstruction costs" to drop in the standard soft-cost list (plans, permit fees, builders risk, taxes, loan origination, loan interest, survey, legal, broker fees, engineering, testing, contingency). Uncheck anything that does not apply.',
        'They come in blank - fill in the amounts as your numbers firm up.',
        'To add one by hand, click Add Line and set Cost type to "Soft cost". The category list switches to the soft-cost categories (or use "+ Use my own category" to type your own).',
        'To move an existing line, edit it and change its Cost type.',
      ] },
      { type: 'text', text: 'The Budget tab then shows three numbers up top: hard costs, soft costs (with what share of the budget they are), and the all-in project cost. The line-item table splits into a Construction section and a Preconstruction & soft costs section, each with its own subtotal, so the trade totals stay clean while the job total stays honest.' },
      { type: 'tip', text: 'On a project still in Planning, soft costs are listed first - at that stage they are the work. Once the job goes Active, construction leads.' },
      { type: 'text', text: 'Soft costs behave like any other line everywhere else: they carry into a client proposal with your markup, they are saved and reapplied with budget templates, and they count toward the budget-vs-actual tracking.' },
    ],
    related: ['add-project-budget', 'estimate-proposal', 'budget-templates', 'project-tabs-explained'],
  },
  {
    slug: 'estimate-proposal',
    title: 'Turn a budget into a client proposal (estimate)',
    category: 'money',
    keywords: ['estimate', 'proposal', 'bid', 'quote', 'markup', 'margin', 'client price', 'pdf', 'sell price', 'win', 'contractor fee', 'cost plus', 'cost-plus proposal', 'fixed price', 'not a fixed price', 'estimated total', 'contract type'],
    summary: 'Add a markup to your budget and generate a branded proposal PDF for the client.',
    blocks: [
      { type: 'text', text: 'Your budget is also your estimate: build the line items at your cost, then add a markup to get the price you show the client. The markup you set here is the same percentage used as your contractor fee when you bill - one number, one source of truth.' },
      { type: 'text', text: 'Where it shows up: the Markup box appears on the Budget tab only while a project is still in Planning (before you win it), and only on projects using simple billing. Commercial projects set to AIA pay-application billing bid formally and bill through pay apps instead, so they do not get the markup box. Once a job is Active, the markup is locked (it is your billed fee at that point) and the Budget tab just shows a "View proposal" link so you can reprint what you sent.' },
      { type: 'steps', items: [
        'Build the budget with your internal costs (Budget tab).',
        'In the Markup box, enter your percentage. The Client price updates instantly (cost + markup).',
        'Click Generate Proposal.',
        'On the proposal page, choose how much to show - Lump sum, By section, or Itemized - then Print / Save PDF.',
      ] },
      { type: 'tip', text: 'On a FIXED-PRICE or spec job the proposal shows only client-facing prices (cost + markup). Your raw costs and margin are never printed, so it is safe to hand to the client.' },
      { type: 'text', text: 'ON A COST-PLUS JOB THE PROPOSAL IS A DIFFERENT DOCUMENT, because a proposal is a promise and the two kinds of job promise different things. A fixed price promises a NUMBER - "this job costs you $863,400", and that is what the bold total at the bottom means. Cost-plus promises a METHOD: you bill actual cost, plus your fee. Nobody knows the final total yet, so printing one as if it were a price invites a client to hold you to it.' },
      { type: 'text', text: 'Set the job to Cost-plus and the proposal prints accordingly: a line at the top stating the basis before any figure appears, the ESTIMATED COST OF WORK, your CONTRACTOR\'S FEE on its own line at its stated percent, and an ESTIMATED TOTAL labelled as an estimate. The terms change too - actual cost plus the fee, not a cap, invoices supported by the costs behind them, and scope changes handled the same way. The bottom line is the same number either way; what changes is what the document claims about it.' },
      { type: 'tip', text: 'That means your costs ARE shown to the client on a cost-plus proposal - which is the point, since cost is the basis of the deal. Use the Lump sum detail level if you would rather show the estimated cost as a single figure than line by line.' },
      { type: 'text', text: 'The proposal is branded with your logo and details, includes a valid-until date, terms, and a signature line. When you win the job, the same budget is already your baseline - actual costs track against it automatically.' },
    ],
    related: ['add-project-budget', 'sellout-projected-profit', 'compare-quotes', 'create-invoice'],
  },
  {
    slug: 'pay-applications',
    title: 'Bill by pay application (AIA G702 / G703)',
    category: 'money',
    keywords: ['pay application', 'aia', 'g702', 'g703', 'progress billing', 'draw', 'schedule of values', 'retainage', 'bank', 'commercial', 'application for payment'],
    summary: 'Monthly progress billing against a schedule of values, with retainage and a G702/G703 PDF.',
    blocks: [
      { type: 'text', text: 'On commercial jobs you bill in monthly draws against a schedule of values (SOV), and the bank funds each one. The Pay Apps tab handles that AIA-style, in both directions: you bill the owner/bank, or a sub bills you. The tab only shows when the project\'s billing method is set to Progress billing (AIA) - pick that when you create the job, or change it from the Projects list edit.' },
      { type: 'steps', items: [
        'Open the project and go to the Pay Apps tab (under Financials).',
        'Click New Application. Choose "We bill the owner" (uses the whole budget as the SOV) or "A sub bills us" (uses that sub\'s scope). Set the period-ending date and retainage %.',
        'The SOV lines fill in, with "previously billed" carried forward from earlier applications automatically.',
        'Enter this period\'s work (and any stored materials) per line. The G702 summary updates: completed to date, retainage held, and current payment due.',
        'Move it through Draft, Submitted, Certified, Funded as the bank/architect processes it.',
        'Use "G702 / G703 PDF" to print the Application and Certificate for Payment plus the continuation sheet to submit.',
      ] },
      { type: 'tip', text: 'The schedule of values is your budget line items, so build the budget first. Change orders that adjust the contract flow into the SOV total.' },
    ],
    related: ['add-project-budget', 'create-invoice', 'money-overview'],
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
    keywords: ['money', 'overview', 'financials', 'escrow', 'fee', 'cost plus', 'how it works', 'which tab', 'customer invoice', 'client invoice', 'bill the client', 'money in', 'money out', 'where do i', 'opened', 'views', 'did they open it', 'void', 'buttons', 'menu', 'mark paid'],
    summary: 'The big picture: money in from the client, money out to vendors, and your fee.',
    blocks: [
      { type: 'text', text: 'Money flows two ways. IN from your client (recorded as client payments) and OUT to vendors (subcontracts → invoices → payments). Your profit is a cost-plus fee: a percentage on top of vendor costs.' },
      { type: 'text', text: 'WHICH TAB IS WHICH. Money OUT - the bills your subs and suppliers send you - lives on BILLS FROM SUBS, one per bill, each landing on a budget line. Money IN depends on how the job bills: an AIA job invoices the owner from PAY APPS (the G702 application you print is the bill you send), and a simple job records what the client has paid on PAYMENTS & ESCROW.' },
      { type: 'text', text: 'THE QUICKEST ROUTE is from the bill itself. Approve a sub\'s bill and a green BILL THE CLIENT button appears on it showing what the client owes with your markup on. It takes you to a client invoice that already has that cost on it and its total worked out - press Raise and it is done. Use "Add another cost" there if you want to put more on the same invoice.' },
      { type: 'text', text: 'BILLING THE CLIENT on a simple-billing job happens on the Billing the client tab (it was called Payments & Escrow), under "Invoices to your client". Click "Bill the client", tick the costs going on this one - approved sub invoices and material receipts, each already showing its markup - and raise it. Nothing is retyped, and a cost can only ever appear on one client invoice, so the same bill cannot go out twice. Delete a draft and its costs go back to being billable.' },
      { type: 'text', text: 'ONE TICK BOX DECIDES WHAT THEY SEE. "Show the client the cost and my markup" prints every line as cost + your percentage = amount, with cost of work and contractor\'s fee broken out at the bottom - the open-book presentation a cost-plus contract usually requires. Leave it off and the client sees one amount per line and one total, with your margin nowhere on the document.' },
      { type: 'text', text: 'SENDING IT. "Issue & get link" turns a draft into a real invoice and creates a link for it. Copy the link, or click Email to open your own mail client with the message and link already written. Your client opens it with no account and no sign-up - it works on a phone - and can print or save it as a PDF from there. The list shows how many times they have opened it and when they last did - "opened 4 times, last Aug 27" - which answers most of the "did they even get it" phone calls before you make them.' },
      { type: 'text', text: 'MARKING ONE PAID records the money. Press Mark paid and the normal Record a client payment box opens with the invoice amount and number already filled in - put in the date, how they paid (check, ACH, wire) and their check number in Reference, and save. That is what puts the money in Funds Received and your escrow balance, and what settles THAT invoice in QuickBooks - the payment carries the invoice you pressed it on, so two invoices raised the same day cannot be mixed up. Change the amount before saving if they paid something different.' },
      { type: 'text', text: 'WHERE THE REST OF THE BUTTONS WENT. Each invoice row shows the one action that is normally next - Issue & get link on a draft, Mark paid on a sent one - and everything else is behind the ... menu at the end of the row: View / Print, copy the client\'s link, email it, compose it yourself, and Void. Seven buttons in a row all looked equally like the thing to press, with Mark paid sitting next to Void.' },
      { type: 'text', text: 'GOT ONE WRONG? Void it. A draft can be deleted outright, but an invoice you have already SENT is a document your client is holding, so it is voided rather than deleted: it stays on the list with its number, greyed out, the costs on it go back to being billable, and it is voided in QuickBooks too so it stops counting as money owed. Then raise a fresh one. That is how an accountant expects a mistake to be corrected - editing a sent invoice would leave your copy and theirs disagreeing.' },
      { type: 'text', text: 'THE QB TICK ON AN INVOICE HAS TWO STATES, because there are two facts: the invoice reached QuickBooks, and the money settling it reached QuickBooks. "QB tick" on a sent invoice means the bill is over there as money owed. "QB tick paid" on a paid one means the payment is over there too and the invoice is settled. An amber "payment not synced" means the invoice went across but the money has not, so QuickBooks still shows it owing - press Sync client payments in Settings. "Not in QuickBooks" means the invoice itself never made it, usually because it was raised before you connected; press Sync client invoices. You only ever see any of this if you have a QuickBooks connected.' },
      { type: 'text', text: 'ON THEIR PORTAL TOO. Every invoice you have sent (and every paid one) is listed on the client\'s portal link under "Invoices", with what is currently due at the top - so a client who lost the email finds the bill there instead of asking you to resend it. Drafts never appear.' },
      { type: 'tip', text: 'The link is made once, when you issue the invoice, and never regenerated - so a link already sitting in somebody\'s inbox keeps working. A draft has no link; a cancelled invoice stops working on the one it had.' },
      { type: 'tip', text: 'It defaults to OFF on purpose. A client who was never shown your margin cannot be un-shown it. You can flip it on a draft before you send, and each invoice remembers its own answer.' },
      { type: 'steps', items: [
        'Award a quote → creates a subcontract (Committed) and optionally a budget line.',
        'The sub bills you → you create an invoice; approving it makes it a real cost (Actual/Billed).',
        'Mark the invoice paid → cash actually leaves.',
        'Record client payments → money in. Your fee = billed × fee%. Escrow = received − paid out − fee.',
      ] },
      { type: 'text', text: 'COST-PLUS MARKUP is applied per invoice, which is how it is actually billed. The electrician sends you $35,000, your 15% goes on top, and the client owes $40,250. Open any sub invoice and it shows cost, markup and what to bill, and the top of the Bills from subs tab totals it across everything approved so far. On a job set to cost-plus these controls are always there, whatever your default rate is - they used to appear only once a project rate was set, which left a job priced line by line with no way to mark up its first invoice.' },
      { type: 'text', text: 'THE RATE CAN LIVE ON A BUDGET LINE. "Permits at cost, electrical at 15%" is a fact about the trade, not about each bill as it arrives - so click the line on the Budget tab and set it there once. Every bill landing on that line follows it. Precedence is most-specific-first: what one invoice says beats what its line says, which beats the project rate. Blank at any level means follow the level above, so changing the project rate still moves everything you have not given its own answer. A bill split across a line at 15% and a line at cost earns the right fee for each part.' },
      { type: 'text', text: 'Two things you can change on any single invoice. Tick "Bill this at cost - no markup" for a permit fee, a deposit the client paid direct, or anything you agreed to pass through; it then bills at exactly what it cost. Or type a different percent for one you negotiated separately.' },
      { type: 'tip', text: 'Leaving the percent BLANK is not the same as typing 0. Blank means "follow the project rate", so if you change your markup later that invoice moves with it. Typing 0 fixes that invoice at no markup for good.' },
      { type: 'tip', text: 'Master Money (admin only) rolls all of this up across every project in one table.' },
    ],
    related: ['add-project-budget', 'create-invoice', 'record-client-payment', 'change-order-basics'],
  },
  {
    slug: 'create-invoice',
    title: 'Create an invoice (even if the sub has no account)',
    category: 'money',
    keywords: ['invoice', 'bill', 'create', 'sub', 'vendor', 'no account', 'budget line', 'which line', 'lands on'],
    summary: 'You record the vendor\'s bill yourself and can attach their actual file.',
    blocks: [
      { type: 'text', text: 'Subs never need a SyteNav account. You create the invoice for them on the Bills from subs tab.' },
      { type: 'steps', items: [
        'Open the project and go to the Bills from subs tab.',
        'Click Create Invoice and pick the subcontractor.',
        'Bill by a fixed amount, a percent of the contract, or a payment-schedule milestone.',
        'Add a description and due date, then create.',
        'Open the invoice and use Upload invoice to attach the PDF or photo the sub sent you.',
      ] },
      { type: 'tip', text: 'Picking the sub tells you where the money lands - the budget line, what is left on it, and a warning if this invoice is more than that line can still cover. If the sub has no line yet, add one without leaving the form.' },
      { type: 'tip', text: 'New invoices start as Pending Approval. Approve, then Mark Paid when the money goes out. "Mark Sent for Payment" is an optional middle step if you hand bills to a bookkeeper or run payments in batches - skip it if you pay as you approve.' },
      { type: 'tip', text: 'The amount is capped at what\'s still owed on that sub\'s contract, so you can\'t over-bill. Use "Bill full remaining" to invoice the exact balance in one click.' },
    ],
    related: ['approve-invoice', 'lien-waiver', 'money-overview'],
  },
  {
    slug: 'approve-invoice',
    title: 'Approve, send, and pay an invoice',
    category: 'money',
    keywords: ['approve', 'status', 'paid', 'sent', 'invoice', 'workflow', 'sent for payment', 'sent to sub', 'released for payment', 'queued for payment', 'queue', 'sent to who', 'delete', 'delete invoice', 'remove invoice', 'duplicate invoice', 'undo', 'notification', 'notified', 'pending approval', 'sub submitted', 'who gets told'],
    summary: 'Move an invoice through its lifecycle and record how it was paid.',
    blocks: [
      { type: 'text', text: 'These are bills your subs sent YOU, so every step here is about paying them - nothing is ever sent to the sub from this tab. There are only two steps that matter: APPROVE (it becomes a real cost on your budget and a bill in QuickBooks) and MARK PAID (the money went out). Queue for payment sits between them and is optional - it means the bill is with bookkeeping or in the next payment run.' },
      { type: 'text', text: 'YOU ARE TOLD WHEN ONE ARRIVES. A bill raised on a job - by you, or by a sub submitting their own from My Jobs - notifies everyone on your team who can approve one, naming who sent it and for how much. People whose role cannot open this tab are not notified, so the alert only reaches somebody who can act on it. If a bill is not reaching the right person, it is a role question: Settings > Team, and give them edit on Invoices.' },
      { type: 'steps', items: [
        'On the Bills from subs tab, open an invoice.',
        'Click Approve - it now counts as a real cost in your Budget and Financials.',
        'Click Mark Paid when the money goes out.',
        'Optionally, use Queue for payment in between - it records that the bill has gone to bookkeeping or into the next payment run, without saying it has been paid yet. Nothing is sent to the sub; the name used to be "Mark Sent for Payment", which made everyone ask who it went to.',
        'Use Edit to record how it was paid: from escrow vs. paid directly by the client.',
      ] },
      { type: 'warn', text: 'Paying an invoice releases funds - upload an unconditional lien waiver to protect yourself.' },
      { type: 'text', text: 'DELETING AN INVOICE. Open it and click Delete. It works at any status, including paid - a duplicate you already marked paid is exactly the one you need to remove. The confirmation tells you what it will do first: how much comes back off which budget line, and whether the bill has already gone to QuickBooks - if it has, deleting it here VOIDS it there, and voids the payment first if you had marked it paid, so QuickBooks stops showing a payable for money that no longer exists. If QuickBooks cannot be reached at that moment SyteNav says so and the bill is left for you to void by hand. Deletions are recorded in the project activity log.' },
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
        'Open the invoice on the Bills from subs tab.',
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
        'Set your Contractor fee rate (cost-plus %) - click the percentage to edit it.',
        'Click Record Payment. A window pops up.',
        'Enter the date, amount, method, and memo. Mark it a retainer/deposit if applicable, and check Entered in QuickBooks if you\'ve logged it there.',
        'Click Add.',
      ] },
      { type: 'tip', text: 'On the ledger, the QB badge on each row is a one-click toggle - check off "entered in QuickBooks" any day without opening edit.' },
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
        'Green banner: you\'re holding enough in escrow to cover what\'s owed to vendors - with a link to go pay them.',
        'Amber banner: you\'re short - it shows exactly how much more to collect from the client first.',
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
      { type: 'text', text: 'They also raise the budget. An approved change order adds its amount to the budget line it belongs to - the line you picked, or the line its subcontract sits on. Without that, approving a change order raised the sub\'s contract while leaving the budget alone, and the line went red at the exact moment the extra was approved and funded. The Budget tab shows the increase as "incl. $X CO" on the line, and your original estimate is kept intact underneath.' },
      { type: 'tip', text: 'This is derived, not written in - un-approving, rejecting or deleting a change order takes the amount straight back out of the budget. There is nothing to undo by hand and no way to count it twice.' },
    ],
    related: ['change-order-subcontract', 'money-overview', 'add-project-budget'],
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
        'Approve it - the amount is folded into that sub\'s contract, shown as "Added to <sub>\'s contract".',
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
    keywords: ['compliance', 'coi', 'insurance', 'license', 'w9', 'workers comp', 'documents', 'not required', 'not needed', 'waive', 'remove document', 'no employees', 'request documents'],
    summary: 'Keep COI, license, W-9, and workers\' comp current for every sub.',
    blocks: [
      { type: 'text', text: 'Each subcontractor on a project gets a compliance card showing which documents are on file, missing, or expiring.' },
      { type: 'steps', items: [
        'Open the project and go to the Compliance tab.',
        'For each sub, upload a document with the Upload/Update button, or scan it with AI to auto-fill expiry and coverage.',
        'Click a document row to expand and see the extracted details on file.',
      ] },
      { type: 'tip', text: 'The summary at the top shows how many subs are fully compliant, expiring soon, or missing documents.' },
      { type: 'text', text: 'NOT EVERY SUB OWES EVERY DOCUMENT. A one-man sub has no workers\' comp to give you, and a trade that cannot hold a licence in your state has no licence. Click "Not needed" on that row and it stops counting against them - the row reads "Not required" instead of "Missing", and the sub stops dragging the job\'s compliance status red over paperwork that was never coming. "Require it" puts it back.' },
      { type: 'text', text: 'It applies to that vendor everywhere, because "they have no employees" is a fact about the vendor rather than about one job. The button only shows while there is nothing on file - once you hold a document, hiding it would just lose it.' },
      { type: 'tip', text: 'This also drives what a document request asks for. The request pre-ticks only what that vendor actually owes and has not already sent - it will never ask for something you waived, or for a COI that is current. Anything they do not owe is still listed with a dashed outline if you want to ask anyway.' },
    ],
    related: ['request-compliance-docs', 'compliance-scan'],
  },
  {
    slug: 'fill-in-pdf',
    title: 'Type into a PDF instead of printing it out',
    category: 'compliance',
    keywords: [
      'fill', 'fill in', 'fill out', 'form', 'forms', 'pdf', 'type on pdf', 'edit pdf',
      'w-9', 'w9', 'credit application', 'permit application', 'application',
      'handwrite', 'print and scan', 'rescan', 'filled', 'sign', 'signature',
    ],
    summary: 'Add text to any PDF and save a filled copy. The original is never changed.',
    blocks: [
      { type: 'text', text: 'One-page forms are the annoying case: a permit application, a supplier credit application, a W-9. They arrive as a PDF, and the usual routine is print it, fill it by hand, scan it back in. This skips all three steps.' },
      { type: 'steps', items: [
        'Go to Files and find the PDF. Any PDF has a "Fill in text" button (the pen icon).',
        'Click anywhere on the page to drop a block of text, then type.',
        'Drag the handle on the left of a block to line it up with the box on the form. Use the − and + at the top to size the text.',
        'Multi-page form? Use the arrows at the top to move between pages. Text stays where you put it on each one.',
        'Click "Save filled copy", then name it. It suggests the original name with "(filled)" on the end - change it to whatever is useful, e.g. "W-9 for Brookstone Flooring". The .pdf is kept for you.',
      ] },
      { type: 'text', text: 'The filled version is saved as a NEW file in the same category, recording who filled it. Your original is left exactly as it was - which matters when the blank form is something you reuse, or something somebody else sent you.' },
      { type: 'tip', text: 'You can rename any file later too - the pencil on a file card changes its name and category, filled copies included.' },
      { type: 'warn', text: 'This types text onto a document. It is NOT a signature tool, and it deliberately has no signature field, no script font and no "sign here". If you need a signature that will stand up when someone disputes it, that needs an audit trail and a tamper-evident record this does not have - use a proper e-signature service for contracts, change orders and lien waivers.' },
      { type: 'tip', text: 'A couple of limits worth knowing. Emoji and non-Latin text (Hebrew, Chinese) cannot be written into a PDF this way and are left out - you get a warning at the top when that would happen. And a page that has been saved rotated cannot be filled accurately yet, so it tells you rather than putting the text in the wrong place.' },
      { type: 'text', text: 'Once it is filled, send it on the same way as anything else - tick it into a share link from the Files page or the Sharing tab on a job.' },
    ],
    related: ['share-documents', 'compliance-overview'],
  },
  {
    slug: 'share-documents',
    title: 'Send documents to someone outside your company',
    category: 'compliance',
    keywords: [
      'share', 'share documents', 'send files', 'send documents', 'expeditor', 'expediter',
      'permit', 'permits', 'architect', 'engineer', 'inspector', 'lender', 'bank', 'attorney',
      'link', 'share link', 'no account', 'send back', 'upload back', 'revoke', 'turn off link',
    ],
    summary: 'Pick documents, pick a contact, send a link. They can send documents back on the same link.',
    blocks: [
      { type: 'text', text: 'Pulling permits is the case this was built for: you send the expeditor a set of plans and forms, and they send the approved permit back. They will never have a SyteNav account, and the files are too big to email. So you send a link instead.' },
      { type: 'text', text: 'Two ways in. On a job, open the Sharing tab under Docs & Legal - that picks up everything on that job, grouped by where it lives: Plans, Permits, Submittals, Compliance, plus your company files. From the Files page, click Share documents for company paperwork like your W-9 or insurance certificate.' },
      { type: 'steps', items: [
        'Open the job and go to Docs & Legal → Sharing (or the Files page for company paperwork).',
        'Click Send documents.',
        'Pick who it is going to from your contacts, or just type a name and email.',
        'Tick the documents to send.',
        'Give it a title (e.g. "Permit package - 19 Shady Nook Ave") and a message if you need one.',
        'Leave "Let them send documents back" on, and say what you need back.',
        'Set when the link should expire, then create it. Copy the link, or open it straight in your email.',
      ] },
      { type: 'text', text: 'They open the link with no account and no sign-up. They see who sent it, your message, and every document you picked, ready to download. If you left the return trip on, they can attach documents and send them straight back to you.' },
      { type: 'tip', text: 'Tapping a document opens it full screen, and on a phone you swipe left or right to move to the next one - no going back to the list between each file. Photos, PDFs and everything else page through the same way, with a counter showing where you are, and "Open original" is always there if a PDF will not preview on their browser. On a laptop the arrows and arrow keys do the same job.' },
      { type: 'tip', text: 'The link is not lost when you close the window. Every link you send is listed on the Sharing tab of that job (and on the Files page under Shared), showing whether it has been opened and whether anything came back. Copy the link again any time, download what was returned, or turn the link off - and turn it back on if you turned it off by mistake.' },
      { type: 'text', text: 'Plans got revised? Click Add documents on the link you already sent instead of making a new one. The recipient keeps the same URL and sees the new files marked with the date they were added. Documents already on the link are never replaced or removed - so a link only ever grows, and nothing you sent quietly changes underneath the person you sent it to.' },
      { type: 'text', text: 'That is also why the files you send are a snapshot: rename, re-file or delete the file on your side and they still see exactly what you sent.' },
      { type: 'text', text: 'This is the opposite of a compliance request. Use a compliance request to collect insurance and licences FROM a sub; use this to send documents TO someone.' },
    ],
    related: ['request-compliance-docs', 'compliance-overview', 'create-first-project'],
  },
  {
    slug: 'request-compliance-docs',
    title: 'Request compliance docs by email',
    category: 'compliance',
    keywords: ['request', 'email', 'link', 'coi', 'upload', 'sub', 'compliance'],
    summary: 'Send a sub a one-time link to upload their documents - no account needed.',
    blocks: [
      { type: 'steps', items: [
        'On the Compliance tab, find the sub\'s card and click Request via email.',
        'Pick which documents you need (it defaults to what\'s missing or expired).',
        'Click Create secure link, then Copy it or use the Email button to send a pre-filled message.',
        'The sub uploads their files with no account. They land back on the card as pending for your review.',
      ] },
      { type: 'tip', text: 'If a sub uploads only some of the requested docs, the link stays open - it shows what\'s still needed and they can come back to finish later.' },
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
    slug: 'field-mode',
    title: 'Field Mode for field workers',
    category: 'field',
    keywords: ['field mode', 'field worker', 'crew', 'mobile', 'phone', 'clock in', 'clock out', 'punch', 'tasks', 'photo', 'laborer', 'worker'],
    summary: 'A stripped-down phone screen for crew: clock in, see today\'s tasks, snap photos.',
    blocks: [
      { type: 'text', text: 'Team members with the Worker role get Field Mode - a simple, phone-first screen built for gloves and sunlight. There is no sidebar and no project tabs; just today\'s work. They land here automatically when they sign in.' },
      { type: 'text', text: 'The bottom bar has four spots: Home, Tasks, Log, and Me.' },
      { type: 'steps', items: [
        'Home: one big Clock in / Clock out button (takes a quick selfie and grabs GPS), plus today\'s tasks and a shortcut to add a photo.',
        'Tasks: every task assigned to the worker across all their jobs. Tap the circle to check one off.',
        'Log: pick a job, snap or attach photos, add a quick note - it saves as a daily log entry on that job.',
        'Me: their assigned jobs, current clock status, and sign out.',
      ] },
      { type: 'tip', text: 'A worker only ever sees the jobs they are assigned to and their own tasks, time, and photos. No budgets, invoices, or other people\'s work.' },
    ],
    related: ['daily-log-create', 'invite-team-member'],
  },
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
        'Attach photos - you can tag them by subcontractor.',
        'Sign the log and save.',
      ] },
      { type: 'tip', text: 'You can post updates through the day; they show as a timeline on the log.' },
      { type: 'tip', text: 'Several entries on the same date group together under one day, so a day with crew submissions plus your log reads as one record.' },
    ],
    related: ['daily-log-review', 'daily-log-pdf'],
  },
  {
    slug: 'daily-log-review',
    title: 'Review what the crew logged from the field',
    category: 'field',
    keywords: ['field', 'review', 'approve', 'crew', 'worker', 'photo', 'observation', 'pending', 'task', 'daily log'],
    summary: 'Field entries wait for your sign-off before they reach the client PDF.',
    blocks: [
      { type: 'text', text: 'A crew member on the mobile field view can file a note and photos in seconds. Those arrive on the day\'s log marked "Needs review" so you can check them before they become part of the official record.' },
      { type: 'steps', items: [
        'Open the project and go to the Daily Logs tab. Days with unreviewed entries show a "to review" count.',
        'Expand the entry to see the note and photos.',
        'Click Create task if it needs work - the note and first photo carry over to a new task on the Tasks tab.',
        'Click Mark reviewed once you have checked it.',
      ] },
      { type: 'warn', text: 'An unreviewed field entry is deliberately left out of the client-facing PDF. Mark it reviewed to include it.' },
      { type: 'tip', text: 'Changed your mind? Undo review puts an entry back to pending and pulls it out of the PDF again.' },
    ],
    related: ['daily-log-create', 'daily-log-pdf'],
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
      { type: 'warn', text: 'Field entries that have not been reviewed yet cannot be exported - mark the entry reviewed first.' },
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
        'To bring it back, click Check in - one click.',
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
    slug: 'connect-quickbooks',
    title: 'Connect QuickBooks Online',
    category: 'settings',
    keywords: ['quickbooks', 'qbo', 'accounting', 'sync', 'integration', 'bookkeeping', 'customers', 'vendors', 'invoices', 'export', 'intuit', 'not synced', 'still open', 'receivable', 'applied payment', 'settles', 'double counted', 'twice', 'wrong invoice paid', 'reference', 'check number', 'ref no', 'reference no', 'update formatting', 'memo'],
    summary: 'Push your customers and subs into QuickBooks Online so nothing gets double-entered.',
    blocks: [
      { type: 'text', text: 'SyteNav connects to QuickBooks Online (the cloud version). Once connected, you can push your data into QuickBooks so your bookkeeper does not have to re-enter it. This is a one-way push (SyteNav to QuickBooks).' },
      { type: 'text', text: 'ONCE CONNECTED IT RUNS ITSELF. Every client payment you record and every sub bill you approve pushes to QuickBooks on its own - no button to remember. If QuickBooks is slow or down, the record saves anyway and the miss is picked up next time you press Sync. The Settings card tells you if anything is waiting.' },
      { type: 'text', text: 'CUSTOMERS GO ACROSS AS YOU ADD THEM, and a correction to a name, email, phone or billing address updates them in QuickBooks too. Subcontractors and suppliers still appear as Vendors the first time you approve one of their bills.' },
      { type: 'text', text: 'WHAT GOES WHERE. An invoice you SEND your client becomes a QuickBooks Invoice - money owed to you, visible in your books before it is paid, so your accountant sees receivables and aging. When the client pays, that payment is applied against the invoice rather than booked as a second sale. A deposit taken before any invoice exists has no receivable to settle, so it lands as a Sales Receipt instead. Bills your subs send you become QuickBooks Bills.' },
      { type: 'text', text: 'IT SETTLES THE INVOICE YOU PRESSED MARK PAID ON. Not the oldest one, not the biggest one - the one you were looking at. Money recorded on its own, without going through an invoice, is applied to the oldest invoice still open, which is what anybody does with a cheque that arrives naming nothing.' },
      { type: 'text', text: 'A PAYMENT WAITS FOR ITS INVOICE. If you mark an invoice paid before that invoice has reached QuickBooks, the payment holds rather than booking itself as a separate sale - which would count the job twice once the invoice arrives. Press Sync client invoices, then Sync client payments, and both land in the right order.' },
      { type: 'text', text: 'PAYING A SUB GOES ACROSS TOO. Approving their bill puts it in QuickBooks as money you owe; marking it paid records the payment against that same bill, so the payable closes. Both halves matter - the bill on its own leaves QuickBooks thinking you still owe money you have already sent. Bills paid before this existed are caught up with SYNC BILL PAYMENTS on the Settings card.' },
      { type: 'text', text: 'CORRECTING A BILL CORRECTS IT IN QUICKBOOKS. Change the amount on a bill that has already gone across and the QuickBooks bill is updated in place - never a second one. Two exceptions, and both tell you: if you have already marked the bill PAID, the payment in QuickBooks is applied to the old amount, so void that payment in QuickBooks first and then edit; and if your bookkeeper has split the bill across several lines over there, that split is theirs and SyteNav will not overwrite it - change the amount in QuickBooks instead. Either way the edit still saves in SyteNav, so the message is worth reading.' },
      { type: 'text', text: 'A DRAFT INVOICE NEVER PUSHES. Nobody has been asked for that money yet, so it is not a receivable. It goes to QuickBooks the moment you send it.' },
      { type: 'text', text: 'HOW THE MONEY CAME IN GOES TOO. The method you pick when recording a payment - Check, ACH, Wire, Cash, CC - is set on the QuickBooks record, which is the column your bookkeeper reconciles a bank statement against. QuickBooks ships with Check, Cash and Credit Card; anything it does not have (ACH, Wire, QuickPay) is created in your QuickBooks the first time you use it. Leave the method blank and the QuickBooks record simply has none, rather than a guess.' },
      { type: 'text', text: 'IF QUICKBOOKS WILL NOT ACCEPT THE METHOD - usually because somebody made it inactive over there - the payment still goes across and still settles the invoice, and how it was paid is written into the memo instead: "Hackensack Medical Suite - check1005 (paid by Check)". Money in the right place beats a tidy column, and the sync log names the method that needs fixing so the next one can use the proper field again.' },
      { type: 'text', text: 'IF YOU CONNECTED BEFORE AUGUST 2026, records pushed back then are all Sales Receipts - the older cash-basis way. They are left exactly as they are rather than rewritten; anything sent from now on follows the invoice-and-payment model above.' },
      { type: 'text', text: 'REFERENCE AND MEMO ARE TWO FIELDS, because QuickBooks has two. The Reference / check # is the payer\'s number - a check number, a wire confirmation - and the Memo is anything worth remembering. This was one box called "Memo / check #", so a check number went across as the memo and the reference column got SyteNav\'s tracking id, which is backwards. To fix a payment recorded before this changed: put the number in the Reference box, then press UPDATE FORMATTING on the Settings card and it is rewritten in QuickBooks in place - nothing is duplicated.' },
      { type: 'text', text: 'A SYNC THAT FAILS NOW SAYS WHY. QuickBooks answers a bad reference with "Object Not Found" and a sentence listing every field it might be, naming none of them. When that happens SyteNav asks QuickBooks about each thing it sent - the customer, the invoice, the payment method - and the sync log records which one was refused and what is wrong with it. Read it under Recent sync activity in Settings.' },
      { type: 'text', text: 'IF A RECORD LOOKS DUPLICATED IN QUICKBOOKS from before 27 Aug 2026, void the copy SyteNav is not pointing at - a very brief window let a double-press create two. Deleting a sub bill in SyteNav before 30 Aug 2026 also left its QuickBooks bill behind; void those in QuickBooks by hand. None of this can happen going forward - a delete now voids the QuickBooks side with it.' },
      { type: 'text', text: 'THE QB CHIP ON A PAYMENT means two different things and looks it. A solid "QB ✓" is a fact - the sync pushed that payment and has its QuickBooks id. The clickable "QB?" tick is your own claim, for payments you typed into QuickBooks by hand.' },
      { type: 'text', text: 'ALREADY TYPED IT INTO QUICKBOOKS YOURSELF? Tick \'Already in QuickBooks - don\'t sync\' when you record the payment and SyteNav leaves it alone, so you do not end up with the same payment twice in your books. Leave it unticked and the payment goes across on its own.' },
      { type: 'text', text: 'MATCHING A RECORD IN QUICKBOOKS. Record a payment with a Reference / check # and that is what QuickBooks shows as its Reference no. - the column you reconcile a bank statement against - with the project name and your memo alongside it. Leave the reference blank and SyteNav puts its own tracking number there instead (SN-9f84f2bd), so a record is never unmatchable. Hover the QB chip on a payment in SyteNav to see its reference. The "NO." column in QuickBooks lists is that reference - unless your QuickBooks company auto-numbers transactions, in which case the memo is your match. Records pushed before this existed can be brought up to the same format with UPDATE FORMATTING on the Settings card - it rewrites the memo and reference on the records already in QuickBooks, in place, without duplicating anything.' },
      { type: 'steps', items: [
        'Open Settings and go to the Integrations tab.',
        'Click Connect QuickBooks and sign in to your QuickBooks Online company.',
        'Use Sync customers, Sync subs (vendors), Sync bills, Sync bill payments, Sync client invoices and Sync payments to push those records - bills before bill payments, and invoices before payments, so each payment has something to settle.',
        'Watch the Recent sync activity list to confirm what went over (and see any errors).',
      ] },
      { type: 'text', text: 'What each button sends: customers become QuickBooks Customers; subs become Vendors; approved or paid sub invoices become Bills (accounts payable); invoices you sent your client become Invoices (money owed to you); and client payments settle those invoices, or become Sales Receipts when there is no invoice to settle. Bills and payments automatically create their vendor or customer in QuickBooks first if it is not there yet.' },
      { type: 'tip', text: 'Each record is linked to its QuickBooks counterpart, so re-running a sync will not create duplicates - already-synced records are skipped.' },
      { type: 'text', text: 'Bills post against a default expense (or cost-of-goods) account and payments against a default service item in QuickBooks; your bookkeeper can recategorize inside QuickBooks. QuickBooks Desktop is not supported - only QuickBooks Online.' },
    ],
    related: ['invite-team-member', 'pay-applications'],
  },
  {
    slug: 'sub-job-money',
    title: 'Job Money: are you making money on your own job? (subs)',
    category: 'money',
    keywords: ['subcontractor', 'sub', 'own job', 'job money', 'profit', 'margin', 'cost', 'labor', 'crew rate', 'hourly', 'materials', 'earned', 'left to bill', 'quote'],
    summary: 'For subs running their own jobs: quoted vs earned vs cost, with live profit and margin.',
    blocks: [
      { type: 'text', text: 'When you run your own job, your quote is your budget. The Budget tab becomes Job Money and shows the full picture instead of just the quote.' },
      { type: 'text', text: 'Four numbers across the top: Earned to date (your quote weighted by how complete each line is), Cost to date (materials plus labor), Profit so far (earned minus cost, with your margin %), and Left to bill (quote total minus what the client has actually paid you).' },
      { type: 'steps', items: [
        'Upload your quote on the Quote tab - it is read into line items automatically.',
        'Set your Crew rate ($/hr) in the "Where the money went" card. Clocked hours are then costed at that rate.',
        'Log material receipts on the Materials tab - they count as job cost (receipts marked as billed to the client are shown separately, not as your cost).',
        'Update % complete per line on the Progress tab - that drives Earned to date.',
      ] },
      { type: 'tip', text: 'Until you set a crew rate, labor shows hours only and stays out of the cost total, so your profit number is not silently wrong.' },
      { type: 'text', text: 'How hours are counted: every finished shift on the time clock for this job (clock in to clock out), for everyone on the crew, added together. A shift that is still open does not count until the person clocks out.' },
      { type: 'text', text: 'Each line item shows its % complete and the dollars earned on that line, so you can see exactly where the money is sitting.' },
      { type: 'text', text: 'Need to send the client a written proposal? Use Generate Proposal to print a branded PDF of your line items - lump sum, by section, or fully itemized. Your line prices are what you charge, so they print as-is.' },
    ],
    related: ['add-project-budget', 'materials-receipt', 'time-clock'],
  },
  {
    slug: 'notification-preferences',
    title: 'Choose what you get told about',
    category: 'settings',
    keywords: ['notification', 'notifications', 'email', 'alerts', 'bell', 'turn off', 'mute', 'unsubscribe', 'preferences', 'settings', 'stop emails'],
    summary: 'Pick which notifications reach you in the app, by email, or both.',
    blocks: [
      { type: 'steps', items: [
        'Open Settings from the sidebar, then the Notifications tab.',
        'Each row is one kind of notification, with a short line saying what sets it off.',
        'Two switches per row: App puts it in the bell, Email sends it to your account address.',
        'Changes save the moment you press them - there is no Save button.',
      ] },
      { type: 'text', text: 'EMAIL IS OFF FOR MOST THINGS ON PURPOSE. It is on by default for six, all of them cases where finding out at your next login is too late: somebody is waiting on your sign-off, a bill needs approving, a bill you sent got paid, a bid you priced was decided, an insurance certificate is about to lapse, or you have been invited to quote a package. Everything else stays in the bell until you ask for it.' },
      { type: 'text', text: 'Notifications marked COMING SOON are ones the app does not send yet. The switch is there so you can see what is planned; it will start working when the notification does.' },
      { type: 'text', text: 'BIDS. You are told when a sub sends a quote or declines to, when you are invited to quote, when somebody chases you for a price you have not sent, and when a package is awarded. A sub who does not have a SyteNav account still gets the award by email, since the address is on their quote.' },
      { type: 'tip', text: 'Turning off the bell and the email for something means you will not hear about it at all. If you want a quieter inbox but still want to catch up in your own time, turn off Email and leave App on.' },
    ],
    related: ['invite-team-member', 'permissions'],
  },
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
    related: ['invite-team-member', 'custom-roles'],
  },
  {
    slug: 'custom-roles',
    title: 'Edit a role\'s defaults or create a new class',
    category: 'settings',
    keywords: ['role', 'class', 'custom', 'permissions', 'edit defaults', 'new role', 'project manager', 'office staff'],
    summary: 'Change what a standard role can do, or build a brand-new class from scratch.',
    blocks: [
      { type: 'text', text: 'Standard roles like Project Manager or Office Staff come with sensible default permissions - but you can now edit those defaults company-wide, or create an entirely new class with its own permission grid.' },
      { type: 'steps', items: [
        'Open Settings, go to Team & Users, and find the Roles & Classes section.',
        'Pick a standard role and check/uncheck view, create, edit, delete for each screen - this changes the default for everyone with that role (unless a person has their own override).',
        'Click "New class" to create a custom role. Give it a name, then set its permissions the same way; it starts out with Worker-level (view-only) access.',
        'The new class shows up alongside the standard roles when inviting someone or changing a teammate\'s role.',
        'To remove a custom class, reassign anyone still on it first, then delete it.',
      ] },
      { type: 'tip', text: 'Admin access can never be edited or removed - this keeps at least one person always able to manage the account.' },
    ],
    related: ['permissions', 'invite-team-member'],
  },
  {
    slug: 'auto-signout',
    title: 'Sign users out automatically after inactivity',
    category: 'settings',
    keywords: ['auto logout', 'sign out', 'inactivity', 'timeout', 'security', 'session', 'idle', 'log off'],
    summary: 'Set an inactivity timer that signs the whole company out automatically.',
    blocks: [
      { type: 'text', text: 'By default, everyone stays signed in. If you share office computers or worry about lost phones, set an inactivity timeout.' },
      { type: 'steps', items: [
        'Open Settings and go to the Security tab.',
        'Under Auto sign-out, pick how long someone can be inactive (15 minutes up to 8 hours) before they\'re signed out.',
        'Save. It applies company-wide the next time each person loads the app.',
      ] },
      { type: 'tip', text: 'Activity means any tap, keypress, or scroll. The timer also keeps counting while the app is closed, so a phone left in a truck overnight is signed out by morning.' },
    ],
    related: ['delete-protection', 'permissions'],
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
      { type: 'warn', text: 'Keep the key somewhere safe - anyone who deletes protected data will need it.' },
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
        'Save - it appears on the timeline alongside the auto-generated items.',
      ] },
      { type: 'tip', text: 'Awarding a quote adds that sub\'s work to the schedule automatically, so the plan fills in as you hire.' },
    ],
    related: ['award-quote', 'master-calendar', 'tasks-assign'],
  },
  {
    slug: 'tasks-assign',
    title: 'Create and assign tasks',
    category: 'field',
    keywords: ['task', 'todo', 'assign', 'crew', 'due date', 'priority', 'punch list', 'board', 'kanban', 'drag', 'move task', 'in progress', 'completed', 'column', 'stage', 'status'],
    summary: 'Assign work to your crew or subs and track it to done.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the Tasks tab.',
        'Click New Task.',
        'Add a title and description, set a priority and due date, and assign it to a person.',
        'Attach a photo if it helps, then save.',
        'Move tasks along as they progress and add notes as you go.',
      ] },
      { type: 'text', text: 'MOVING A TASK ALONG. Every card on the board shows three buttons - Open, In Progress, Completed - with the current stage filled in. Press any of them to move the task there. It goes both ways, so reopening something is the same one press. In List view, use the stage dropdown on the right of the row instead.' },
      { type: 'text', text: 'The round icon next to a task only shows you which stage it is in. It is not a button, so a stray tap cannot move a task.' },
      { type: 'text', text: 'Each column on the board has its own + button, and it adds straight into that column. Press + on In Progress and the task starts as in progress - useful when you are writing down work that is already underway. The form tells you which column it is adding to.' },
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
        'Punch in - it records the time, a GPS location check, and a selfie.',
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
    keywords: ['rfi', 'request for information', 'question', 'answer', 'respond', 'architect', 'designer', 'answer link'],
    summary: 'Ask and answer formal questions on a project.',
    blocks: [
      { type: 'steps', items: [
        'Open the project and go to the RFIs tab.',
        'Create an RFI with your question and any supporting detail.',
        'To get the answer from your architect or designer, click the link icon on the RFI card - it copies a secure one-time link. Send it to them; they see the question and attachments and submit the answer (with drawings if needed), no account required.',
        'When a response comes in, review it and mark it answered.',
      ] },
      { type: 'tip', text: 'RFIs keep a clear record of who asked what and when it was resolved. Answers submitted through the link land on the RFI automatically and show in the activity feed.' },
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
      { type: 'text', text: 'The Approvals screen (in the sidebar) gathers items across your projects that need a decision - invoices, submittals, time entries, and more.' },
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
    summary: 'Get a signature confirming work is done and accepted - on tasks and progress lines.',
    blocks: [
      { type: 'text', text: 'A signoff is a signed approval - different from percent-done, which just tracks progress. Signoffs live in three places:' },
      { type: 'steps', items: [
        'Tasks: open a completed task - use Request signoff to ask the assignee (they get notified), or Sign off to sign right there with the signature pad.',
        'Progress lines (the sub\'s Estimate/Progress view): when a line is marked Done, a Sign off action appears next to it.',
        'Daily logs: the site manager\'s end-of-day signature is the log\'s signoff.',
      ] },
      { type: 'tip', text: 'Every signoff stores who signed, when, and the signature image - tap "View signature" to see it.' },
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
      { type: 'text', text: 'The Inspections tab (under Docs & Legal) runs the whole workflow - request → schedule → pass/fail - with notifications along the way.' },
      { type: 'steps', items: [
        'On the Inspections tab, click Request Inspection (a site manager or sub can do this).',
        'Pick the inspection type, the contact/inspector to schedule with, a preferred date and time, and assign who schedules it. That person gets a notification.',
        'When the work is actually done, the sub hits Mark Ready for Inspection from My Jobs (or anyone can from the Inspections tab). Whoever requested it and whoever schedules it get a notification to book the inspector, and it lands in the job history.',
        'The scheduler books it and marks it Scheduled - the requester is notified back.',
        'After the visit, upload the inspector\'s card/paper on the inspection - AI reads it and fills the details.',
        'Mark it Passed or Failed - the requester (and scheduler) are notified of the result.',
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
        'Save - they\'re now available to invite to bids and add to projects.',
      ] },
      { type: 'tip', text: 'Awarding a quote adds the winning vendor to your Directory automatically.' },
    ],
    related: ['request-quotes', 'award-quote', 'add-subcontractor-no-price'],
  },
  {
    slug: 'job-overview',
    title: 'The job Overview',
    category: 'projects',
    keywords: ['overview', 'dashboard', 'job home', 'landing', 'what now', 'waiting on me', 'status', 'where does the job stand', 'active job', 'summary'],
    summary: 'Where a job stands and what is waiting on you, without opening six tabs.',
    blocks: [
      { type: 'text', text: 'Opening a job lands on Overview. It is the first tab, to the left of Field, and you can go back to it any time.' },
      { type: 'text', text: 'IT IS NOT A CHECKLIST. You know how to run a job. What you cannot know without clicking through half the tabs is what has piled up since you last looked - so this states what is sitting there and links straight to it.' },
      { type: 'text', text: 'WAITING ON YOU is work you can clear right now: bills waiting for approval, RFIs nobody has answered, inspections to book, sign-offs requested, and payment requests you raised but never sent.' },
      { type: 'text', text: 'WAITING ON SOMEONE ELSE is work you can only chase: money requested from the client and not yet paid, certificates expired or expiring within 30 days, vendors with nothing on file, and selections the client still has to choose.' },
      { type: 'text', text: 'Across the top: what you have received from the client, what you have committed to vendors, what they have billed, and what is still outstanding to them. Below: what is on site over the next three weeks and which inspections are booked.' },
      { type: 'tip', text: 'When nothing is waiting on anyone, it says so plainly. That is the point - a list you can actually finish means something, and one that is never empty is just noise.' },
      { type: 'text', text: 'Jobs still in planning have their own checklist instead, on the status dropdown: the handful of things to sort before setting a job Active.' },
    ],
    related: ['project-status-active', 'approvals-inbox', 'project-tabs-explained'],
  },
  {
    slug: 'request-deposit',
    title: 'Ask the client for a deposit',
    category: 'money',
    keywords: ['deposit', 'retainer', 'down payment', 'up front', 'request payment', 'payment request', 'stage payment', 'progress payment', 'ask for money', 'first payment', 'mobilization'],
    summary: 'Request a deposit or a quoted stage payment, and send it to your client.',
    blocks: [
      { type: 'text', text: 'A deposit is money you take before there are any costs to bill against, so it is not built like an invoice. It has its own section on Billing the client: DEPOSITS & STAGE PAYMENTS.' },
      { type: 'steps', items: [
        'Open the job, go to Money, then Billing the client.',
        'Under "From your estimate" you will see the payment stages off your quote - deposit, rough-in, final - with each one priced.',
        'Press Request on the one you want. It moves to "Asked for, not yet paid".',
        'Press Send to email it to your client, or Copy the link and send it yourself.',
        'When the money arrives, press Mark paid on the request. That opens the normal payment record with the date, amount, method and cheque number, already filled in from the request.',
      ] },
      { type: 'text', text: 'THE AMOUNTS COME FROM YOUR ESTIMATE. If your quote said "50% deposit", that is 50% of the estimate total, worked out for you. A stage the estimate left vague is still listed, and says what it needs - usually an estimate total - rather than guessing a number you are about to ask a client for.' },
      { type: 'text', text: 'No stages on the estimate? Use "Request a one-off amount" at the bottom. It takes either a dollar figure or a percentage - $5,000 to start, or 30% up front. Type a percentage and it shows what that comes to against your estimate before you send it, and the request keeps a note of how it was worked out.' },
      { type: 'text', text: 'YOUR CLIENT SEES IT on their portal link, under "Payment requested", but only once you have actually sent it - raising a request does not surprise them with it.' },
      { type: 'text', text: 'ONCE THE MONEY IS RECORDED, the portal acknowledges it: the request disappears and a green Payments card takes its place, showing every payment they have made with its date and a running total. Your client always sees that their money arrived.' },
      { type: 'text', text: 'This works the same on AIA jobs. Pay applications bill work already in place; a deposit is not work in place, so it is requested here on both kinds of job.' },
      { type: 'text', text: 'CHANGE ANYTHING BEFORE YOU SAVE. If you asked for $5,000 and they sent $4,800, record $4,800 - the request is settled by what actually arrived, not by what you asked for.' },
      { type: 'text', text: 'A client payment does NOT go against a budget line. Budget lines track what the job costs you, and their actuals come from sub invoices and material receipts - money out. Money in from the client lands in Funds Received and your escrow balance, and gets drawn down as you pay vendors.' },
      { type: 'tip', text: 'Deposits are ticked as Retainer / deposit automatically, because that is what they are - money held against work not yet done.' },
    ],
    related: ['pay-applications', 'record-client-payment', 'project-status-active', 'estimate-proposal'],
  },
  {
    slug: 'add-subcontractor-no-price',
    title: 'Add a sub before you know their price',
    category: 'workspace',
    keywords: ['subcontractor', 'sub', 'add sub', 'contract amount', 'no price', 'price later', 'tbd', 'not set', 'optional', 'team tab', 'not-null', 'error adding sub', 'could not add subcontractor'],
    summary: 'Put a sub on the job now and fill in the contract amount once it is agreed.',
    blocks: [
      { type: 'text', text: 'There are two ways a sub ends up on a job, and they suit different moments.' },
      { type: 'steps', items: [
        'You already agreed a price: Team tab, Add Subcontractor, fill in the Contract Amount. Done.',
        'You have not agreed a price yet: same form, leave Contract Amount blank. They go on the job and the contract shows as "Not set".',
        'You want them to quote it: Quotes & Bids tab instead - send them a scope, they price it on their link, and awarding creates the subcontract with their number already in it.',
      ] },
      { type: 'text', text: 'An unpriced subcontract reads as "Not set" everywhere, never as $0. That distinction matters: $0 would sit in your budget as a real commitment of nothing, and would look identical to a sub who genuinely costs nothing.' },
      { type: 'text', text: 'Two things need an agreed amount and will say so until you set one: billing a percentage of the contract, and checking an invoice against what is still owed. Flat-amount invoices work either way.' },
      { type: 'tip', text: 'To fill it in later, open the Team tab, click the pencil on the subcontractor, and set the Contract Amount.' },
      { type: 'text', text: 'If a save fails for any other reason, the error now appears inside the form and names the field it is about. Nothing is left behind - the company is not added to your Directory unless the whole save succeeds.' },
    ],
    related: ['directory', 'request-quotes', 'award-quote', 'create-invoice'],
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
      { type: 'text', text: 'The in-app Master Calendar is always there - this just adds a copy of those events to your personal calendar. It\'s read-only, so it can never change anything in SyteNav.' },
      { type: 'steps', items: [
        'Open Master Calendar and click Connect to Calendar.',
        'Pick your calendar - Google, Apple, or Outlook - and it opens that app with an "add calendar" prompt. Confirm and you\'re done.',
        'Schedule items, task due dates, and scheduled inspections now appear in your calendar and refresh automatically.',
      ] },
      { type: 'tip', text: 'Using a different app? There\'s a "Copy the link instead" option, plus a Reset link button to invalidate the URL and get a new one.' },
      { type: 'warn', text: 'If you never connect a calendar, nothing changes - just keep using the Master Calendar inside SyteNav.' },
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
      { type: 'tip', text: 'A negative escrow shows in red - a fast flag that a job has paid out more than it has collected.' },
    ],
    related: ['money-overview', 'record-client-payment'],
  },

  // ── Materials ──────────────────────────────────────────────────────────────
  {
    slug: 'materials-receipt',
    title: 'Snap a material receipt and assign it to a job',
    category: 'materials',
    keywords: ['material', 'receipt', 'photo', 'store', 'buy', 'purchase', 'supplier', 'cost', 'expense', 'lumber', 'wire'],
    summary: 'Take a photo of a receipt - AI reads the store and total, and it goes into the job\'s costs.',
    blocks: [
      { type: 'text', text: 'When someone buys materials (wire, lumber, lights, hardware), capture the receipt so the cost lands on the right job.' },
      { type: 'steps', items: [
        'Click Materials in the sidebar.',
        'Click Add receipt, then Take photo (or Upload file).',
        'The AI reads the store, date, total, tax, and line items - review and fix anything.',
        'Choose which job it\'s for. For the budget line, pick an existing one, choose "+ Create new budget line…" to make one on the spot (same idea as awarding a quote), or leave it unlinked. Keep "Save the store to my Directory" checked to add the store as a supplier.',
        'Click Save receipt.',
      ] },
      { type: 'tip', text: 'See a job\'s receipts on that project\'s Financials tab (a Materials section with the total), or filter by job on the Materials page. If you linked a budget line, the amount also shows in that line\'s Actual on the Budget tab.' },
    ],
    related: ['money-overview', 'add-project-budget', 'materials-client-paid'],
  },
  {
    slug: 'materials-client-paid',
    title: 'Track which material costs the customer already paid',
    category: 'materials',
    keywords: ['material', 'receipt', 'client paid', 'customer paid', 'owed', 'reimbursed', 'expand', 'details'],
    summary: 'Check "customer paid" on a receipt so it stops counting as money owed.',
    blocks: [
      { type: 'text', text: 'Sometimes the client reimburses you for a material purchase directly, or pays the supplier themselves. Mark that receipt paid so your numbers stay accurate.' },
      { type: 'steps', items: [
        'When adding a receipt, check "Customer already paid for this" if it applies.',
        'Already added a receipt? Click it to expand the full details - store, date, category, tax, notes, line items, and the receipt image.',
        'Inside the expanded view, click "Mark customer paid" (or click it again to undo).',
      ] },
      { type: 'tip', text: 'The Materials page, and the Materials sections on Financials and Budget, all show Total cost, Customer paid, and Owed by customer so you always know what\'s outstanding.' },
    ],
    related: ['materials-receipt'],
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
