// ─────────────────────────────────────────────────────────────────────────────
// SyteNav - What's new
//
// IMPORTANT (working agreement): when you ship something a user would notice,
// add an entry here in the SAME change. Same rule as the Help Center. A feature
// nobody knows about may as well not exist, and a tester who has to guess what
// changed since last week will stop looking.
//
// Not everything belongs here. Internal refactors, build fixes, and anything a
// user could not possibly observe do not go in - this is a list of things that
// changed for THEM, not a commit log.
//
// Newest first. `date` is ISO (YYYY-MM-DD) and drives the "new since you last
// looked" badge, so keep it accurate.
// ─────────────────────────────────────────────────────────────────────────────

export type ReleaseKind = 'new' | 'improved' | 'fixed'

export interface ReleaseItem {
  kind: ReleaseKind
  title: string
  /** Plain-language: what it does for them, not how it was built. */
  text: string
  /** Slug of the Help article that explains it in full. */
  help?: string
  /** Where to go and try it. */
  href?: string
}

export interface Release {
  date: string
  /** The headline for the batch. */
  title: string
  items: ReleaseItem[]
}

export const KIND_LABEL: Record<ReleaseKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
}

export const KIND_TINT: Record<ReleaseKind, string> = {
  new: 'bg-accent-tint text-accent-fg',
  improved: 'bg-info-tint text-info',
  fixed: 'bg-success-tint text-success',
}

export const RELEASES: Release[] = [
  {
    date: '2026-08-11',
    title: 'Selections, item lists, and seeing what you sent',
    items: [
      {
        kind: 'new',
        title: 'Selections board',
        text: 'Every choice the client owes you - paint, tile, flooring, cabinets, fixtures, windows - in one place. Each carries an allowance and a decide-by date driven by lead time rather than the schedule, because a six-week window order decided the week framing finishes is already late. Starting a board asks which categories this job actually has, pre-ticked for the kind of job it is: a commercial fit-out gets 41 selections instead of 71, with no sod, shutters or bathtub.',
        help: 'selections',
        href: '/projects',
      },
      {
        kind: 'new',
        title: 'Your client picks on the link they already have',
        text: 'Same link as their project portal - no second link to lose, no account needed. They see only what is waiting on them, most urgent first, with the upgrade cost shown against your allowance before they commit. Every option can carry a photo, a brand and a link to the product page, or you can point them at the manufacturer\'s full range and let them write in what they found. Everything decided shows its status in their words, and they can change anything not yet ordered.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Allowances, change orders and ordering, all on the budget',
        text: 'Link a selection to a budget line and the allowance fills in with what is left on that line - and says so when you have gone over. Go over on a pick and one click raises a change order for the difference, against the same line. When you are ready to buy, "Order it" records the supplier from your Directory, the amount already priced from what they chose, and the expected delivery, then books the cost against the budget. A selection cannot be accepted or ordered without a line, because money with nowhere to land is the thing this board exists to prevent.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Scan a sub\'s invoice instead of retyping it',
        text: 'Drag the PDF a sub emailed onto the Invoices tab - a photo or screenshot works too - and it reads the document and fills the form in: who is billing, the amount, the date, what the work was, with the file already attached. It also matches the invoice to a subcontract on that job and to a line on their payment schedule, and tells you in red when the amount does not match the line it looks like. Nothing saves until you confirm it.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'fixed',
        title: 'A typed option was only saved by adding another one',
        text: 'On the selections board, the row where you type an option - brand, name, price, link, photo - was only saved by clicking the small "+" at the end of it. Type one option and move on and it looked entered but never was. Enter now adds it from any field in the row, the button says Add rather than just "+", and while there is something typed the row says "Not added yet" so a half-finished line cannot pass for a saved one.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Invoice your client - open book, or a flat number',
        text: 'There was no way to produce a bill to SEND a client on a job that is not AIA, which is nearly every job. Payments & Escrow only recorded money that had already arrived. Now: pick the costs you want to bill for - approved sub invoices and receipts, each already carrying its markup - and it raises an invoice. Nothing is retyped and a cost can only ever be on one invoice, so the same electrician\'s bill cannot go out twice. One tick box decides what the client sees: cost, your percentage and the total on every line for an open-book cost-plus job, or a single amount per line where your margin is nobody else\'s business. It defaults to hidden, because a client who was never shown your margin cannot be un-shown it. Print or save as PDF from the invoice.',
        help: 'money-overview',
      },
      {
        kind: 'new',
        title: 'Markup on each invoice, with a tick to bill something at cost',
        text: 'Cost-plus is billed invoice by invoice: the electrician sends $35,000, your 15% goes on, the client owes $40,250. Every sub invoice now shows exactly that - cost, markup, what to bill - and the Invoices tab totals it across everything approved so far. Two controls per invoice: tick "Bill this at cost" for a permit fee or anything you pass through, or type a different percent for one you negotiated. Leave the percent blank and it follows the project rate, so changing that rate still moves everything you have not given its own answer. The contractor fee on Payments & Escrow is now worked out the same way, item by item - it used to be one flat percentage multiplied over the job total, which silently ignored both of these.',
        help: 'money-overview',
      },
      {
        kind: 'improved',
        title: '"Sellout" is now called what it is on your kind of job',
        text: 'Sellout is developer language - it is what a spec house SELLS for. On a custom home or a fit-out you are not selling anything, you are charging a client a contract value, and calling it a sellout made the whole panel read as though it was meant for somebody else. A job with a client on it now asks "What are you charging for this job?" and labels the figure Contract value; a job with no client - one you are building to sell - still says Sellout. Same number, called the right thing.',
        help: 'sellout-projected-profit',
      },
      {
        kind: 'improved',
        title: 'The markup box no longer disappears once a job is won',
        text: 'Markup showed while a job was in Planning and then vanished when it went Active, which looked like it had been taken away - especially as the same number stayed editable on Payments & Escrow as your contractor fee rate. It is now on the Budget tab at every stage: the full estimate bar with client price and proposal before the job is won, and a compact percent box after, with a note on where that number is still used. It is hidden only on AIA jobs, where progress billing replaces it.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: 'Projected profit was made up until you set a sale price',
        text: 'With no sellout entered, the budget screen fell back to an assumed markup and printed a confident green "projected profit" with a margin percentage - for a job whose sale price nobody had told it. It now asks for the figure on a single line instead of reporting on one it invented, and profit only appears once you have actually set what the job sells for. It still shows at every stage, not just planning: "am I still making money on this" is the question you ask most once work has started, and profit against actual spend only means anything once costs have landed. Leave it empty on a cost-plus job, where your markup is the profit.',
        help: 'sellout-projected-profit',
      },
      {
        kind: 'improved',
        title: 'The budget screen explains itself, and repeats itself less',
        text: 'Hover any of the four figures at the top - or any column heading on the lines below: Budgeted, Committed, Actual, Variance - and it says in plain words what the number means and how it is worked out, including why Left to spend is not simply budget minus invoices. The explainers wait a moment and fade in, so they do not flash open as the pointer crosses the screen. The variance column on a line now counts signed contracts the same way that tile does; the two used to disagree, and hovering shows how much of a contract is signed but not yet invoiced. Three tiles that printed the same figure as Total Budget are gone, the interior/exterior split no longer carries a Grand Total that contradicted the one above it (it was ignoring approved change orders), and the soft-costs pitch shrinks to a single link once a job is active.',
        help: 'add-project-budget',
      },
      {
        kind: 'new',
        title: 'Every invoice shows what you are actually being charged for',
        text: 'An invoice used to keep only its total - the scan read the line items off the PDF and threw them away, so the one question that matters, what am I paying for, meant reopening the document. The breakdown is now kept and shown on the invoice: every line with its quantity and rate where the vendor printed one, then the lines total, tax, retainage withheld, and the invoice total. It checks that they add up and says so plainly when they do not, and by how much - a breakdown that looks like detail but does not reconcile is where a quiet extra hides. Typed invoices get the same treatment: add lines by hand and it reconciles those too. Lines the quote check flagged are highlighted in the table with what was quoted.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'new',
        title: 'Not every sub needs every compliance document',
        text: 'Required documents were fixed by vendor type, so a one-man sub with no workers\' comp, or a trade that cannot hold a licence in the state, sat as Missing forever and turned the job red over paperwork that was never coming. Any document can now be marked "Not needed" for a vendor, and put back just as easily. Requests only ask for what that vendor actually owes and has not already sent - asking for a waived licence, or for a COI you already hold, is how these requests get ignored.',
        help: 'compliance-overview',
      },
      {
        kind: 'new',
        title: 'A sub\'s invoice is checked against what they quoted',
        text: 'Scan an invoice from a sub whose contract has priced lines on it, and it now tells you either "Matches their quote" or exactly what does not: a line billed for more than it was quoted (showing both figures), a line that is not on the quote at all, or an invoice that takes the running total past the contract. The contract total is the check most people already do in their head - the two that actually cost money are a rate nobody agreed to and work that was never quoted, and both look completely ordinary on an invoice that comes in under the contract. It never blocks the invoice; it just means you see it before you approve rather than after.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'fixed',
        title: 'Importing a budget sheet brought the lines in at zero',
        text: 'On a brand new job the only button on an imported sheet was "Add all as new (save template)" - and that route quietly dropped every amount, so the preview showed your prices and the budget came in at zero. There is now a plain "Add these lines to this budget" that puts the sheet straight on the job without going near a template, and the template route keeps its amounts too. Separately, the reader only understood amounts stored as plain numbers, so "$24,000.00", "24,000" or any CSV read as no amount at all; it now handles currency symbols, separators, cents and credits like (500), takes the line total rather than the unit price, and stops turning a cost-code column into the line-item name. The confirmation screen tells you how many amounts it actually read before you commit, and a "Bring the amounts in too" tick box lets you import just the line items when that is what you wanted.',
        help: 'add-project-budget',
      },
      {
        kind: 'new',
        title: 'Type into a PDF instead of printing it',
        text: 'On the Files page, any PDF now has a "Fill in text" button. Click anywhere on the page to add text, drag it to line up with the box on the form, and save. It is for the pile of one-page forms that get printed, filled by hand and rescanned - permit applications, supplier credit apps, W-9s. Saving asks you to name it, suggesting the original name with "(filled)" on the end so you can change it to something useful like "W-9 for Brookstone Flooring". It saves as a NEW file and shows who filled it; the original is left exactly as it was. Your own files also now sit at the top of the Files page, above documents collected from subs. To be clear about what this is: it types text onto a document. It is not a signature tool and does not offer signature fields.',
        help: 'fill-in-pdf',
        href: '/files',
      },
      {
        kind: 'new',
        title: 'Swipe between documents on your phone',
        text: 'Open a document on a share link and swipe left or right to move to the next one, instead of tapping each file open in a new tab and coming back. Photos, PDFs and anything else all page through the same way, with a counter so you know where you are. Daily log photos swipe too. Arrows and arrow keys still work on a laptop, and pinch-to-zoom on a photo is untouched.',
      },
      {
        kind: 'fixed',
        title: 'Commercial jobs had nowhere to put a sub\'s bill',
        text: 'On a job set to AIA billing the Invoices tab was hidden completely - but that tab holds bills your subs and suppliers send YOU, which has nothing to do with how you bill the owner. The job type with the most subcontractors on it had nowhere to record a single one. It is back. Every money tab now says which direction it points: Invoices is money out, Pay Apps and Payments are money in, each linking to the other.',
        help: 'money-overview',
      },
      {
        kind: 'improved',
        title: 'Deleting an invoice, and a clearer Invoices tab',
        text: 'Delete is now a labelled button instead of a small grey icon, and it works at any status - including paid, which is exactly where a duplicate you already ticked off needs removing and where the button used to disappear. The confirmation tells you what it will do first: how much comes back off which budget line, and whether the bill has already gone to QuickBooks. The tab now says plainly that these are bills your subs sent you - upload one they emailed or enter it yourself - with a link to where you bill your client instead.',
        help: 'approve-invoice',
      },
      {
        kind: 'fixed',
        title: 'Approving a change order now raises the budget line',
        text: 'Approving a change order grew the sub\'s contract but left the budget where it was, so the line went red at the exact moment the extra was approved and paid for. An approved change order now adds to the budget line it belongs to - the one you picked, or the one its subcontract sits on - and the line shows "incl. $X CO" so the budget never grows silently. Your original estimate is kept, and un-approving or deleting the change order takes the money straight back out.',
        help: 'change-order-basics',
      },
      {
        kind: 'fixed',
        title: '"Remaining" was telling you that you had more money than you did',
        text: 'The tile counted only invoices that had arrived, not the contracts you had already signed. Budget $500k, signed $450k, billed $200k, and it told you $300k was left - it was $50k. It now counts signed contracts, and is labelled "Left to spend". The Committed tile says how much is signed but not yet billed, which is the money that used to hide.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: '"Mark Sent to Sub" had the invoice going the wrong way',
        text: 'These are bills your subs send YOU. The button now reads "Mark Sent for Payment" - which is what it always did: released to be paid, handed to a bookkeeper or queued in the next payment run. You can also go straight from Approved to Paid now, instead of being made to click through a step that did not apply. The sub gets told their invoice was released for payment, rather than being asked to review an invoice they wrote.',
        help: 'approve-invoice',
      },
      {
        kind: 'new',
        title: 'Every sub invoice says which budget line it hits',
        text: 'Pick the sub - or let the scan pick one - and the invoice tells you where the money lands: the line, what is budgeted, what is already billed against it, and what is left. It warns you in red when the invoice is more than that line can still cover. Every invoice card shows the same thing, so you no longer open the Budget tab and work backwards from the sub\'s name to find out which line moved.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'fixed',
        title: 'An invoice for a sub with no budget line used to vanish',
        text: 'If a subcontract had no budget line, its invoices saved fine and the budget simply never moved - real money out, flat budget, no warning anywhere. The invoice now says "This won\'t show up on the budget" and offers to add the line on the spot, starting it at the contract amount.',
        help: 'scan-sub-invoice',
      },
      {
        kind: 'new',
        title: 'Item lists on a quote request',
        text: 'When you are the one buying the material, send the lines and every supplier prices the same ones. Import a takeoff, paste rows out of a spreadsheet, or type them. Their prices come back line by line, and "Compare line by line" shows you the one item that is triple on one bid and missing on another - the thing a total hides.',
        help: 'item-list',
      },
      {
        kind: 'improved',
        title: 'Editing the scope on a quote request',
        text: 'Click any line to change its wording, or use the move arrows to send it from Included to Not included and back - it used to mean deleting and retyping. The panel names which trade template filled it in, and the item list now says plainly whether it is needed on this package, so it is clear the two are not doing the same job.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'improved',
        title: 'You can see your own quote request again',
        text: 'An expanded request showed who you invited and what you attached, but not the scope you sent or what you asked for back - you had to open the sub\'s link to find out. There is now a "What you sent" panel on the card.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'new',
        title: 'This page',
        text: 'Somewhere to find out what changed. Anything you would notice shows up here the day it ships, with a link through to the Help article that explains it in full.',
      },
      {
        kind: 'fixed',
        title: 'The client link on a project never shared',
        text: 'On a project that had never been shared with a client, the "Copy client link" button on the Selections board was missing entirely. It now creates the link for you.',
      },
      {
        kind: 'fixed',
        title: 'The client name on the portal',
        text: 'The project portal was reading the wrong field, so the "Client:" line never appeared even when the name was filled in.',
      },
    ],
  },
  {
    date: '2026-08-10',
    title: 'Scope templates and document sharing',
    items: [
      {
        kind: 'new',
        title: 'Scope templates per trade',
        text: 'Pick the trade and the quote request fills itself in: who supplies the material, what is included, what is excluded, and what you need back besides a price. Every bidder answers the same questions, which is what makes quotes comparable - no takeoff required.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'new',
        title: 'Send documents to anyone',
        text: 'A Sharing tab under Docs & Legal on every project. Pick files, pick a contact, send a link. They can send documents back on the same link, and you can add more files to a link that is already out there.',
      },
      {
        kind: 'new',
        title: 'Project status is a switch',
        text: 'The status badge on a project is now a dropdown, with a pre-flight checklist before a job goes Active so nothing obvious is missing.',
      },
    ],
  },
  {
    date: '2026-08-09',
    title: 'Preconstruction and the money picture',
    items: [
      {
        kind: 'new',
        title: 'Sellout and projected profit',
        text: 'Put your sellout against the budget and see projected profit as you go, per unit and across a whole site.',
      },
      {
        kind: 'new',
        title: 'Hard and soft costs, split',
        text: 'Soft costs get their own section on the budget with their own subtotal and a standard starter list, so preconstruction reads as its own stage instead of being buried in the trades.',
      },
      {
        kind: 'improved',
        title: 'A planning-stage project menu',
        text: 'A job that has not broken ground no longer shows tabs for things that cannot happen yet. They come back the moment the project goes Active.',
      },
      {
        kind: 'new',
        title: '49 budget categories in build order',
        text: 'Trades listed the way the job actually runs, plus your own custom categories which now stick around from job to job.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: 'Project Settings',
        text: 'The address dropdown no longer opens by itself, and billing method, square footage and job type are editable after setup.',
      },
    ],
  },
]

/** The newest release date, used for the "something new" badge. */
export const LATEST_RELEASE = RELEASES[0]?.date ?? ''

export const SEEN_KEY = 'sytenav-whats-new-seen'

/** True when there's a release the reader hasn't acknowledged yet. */
export function hasUnread(lastSeen: string | null): boolean {
  if (!LATEST_RELEASE) return false
  if (!lastSeen) return true
  return lastSeen < LATEST_RELEASE
}

/** How many releases landed since they last looked. */
export function unreadCount(lastSeen: string | null): number {
  if (!lastSeen) return RELEASES.length
  return RELEASES.filter(r => r.date > lastSeen).length
}
