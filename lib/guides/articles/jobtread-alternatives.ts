import type { Guide } from '../schema'
import { SYTENAV_FIT, PLANS_SENTENCE, plansLink, QBO_ONE_WAY } from '../sytenav'

export const guide: Guide = {
  slug: 'jobtread-alternatives',
  title: 'JobTread alternatives (2026): what to compare when the budget is the point',
  cardTitle: 'JobTread alternatives (2026)',
  metaTitle: 'JobTread Alternatives (2026): An Honest Comparison for GCs | SyteNav',
  description:
    'What JobTread does well, how it prices, and what to compare in a JobTread alternative - from a competitor that says where JobTread is ahead.',
  keyword: 'jobtread alternative',
  keywords: [
    'jobtread alternative', 'jobtread alternatives', 'jobtread competitors', 'jobtread pricing',
    'jobtread vs', 'software like jobtread', 'cheaper than jobtread', 'jobtread review',
  ],
  category: 'compare',
  published: '2026-10-20',
  lede:
    'JobTread is one of the products closest to SyteNav: both put the budget at the centre of the job and hang everything else off it. So a JobTread alternative is less about a different philosophy and more about how you pay, what you type, and what reaches your books.',
  takeaways: [
    'JobTread builds the job around the budget: estimates, bid requests, purchase orders, work orders and bills are tied to budget items. If that is the shape you want, you are comparing details, not approaches.',
    'Its pricing page lists a base price that includes one internal user and a charge for each internal user after that, with unlimited customer, vendor and sub portal users.',
    'JobTread describes a two-way QuickBooks Online sync. If your bookkeeper works in QuickBooks and expects changes to come back, that matters more than any feature on this page.',
    'Compare on who has to type: how a sub quote becomes a budget, and how a sub bill is checked against what was awarded.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is written by SyteNav, which competes with JobTread. Every statement about JobTread links to JobTread’s own site and says what that page says, as of October 2026. Where JobTread is ahead of us, we say so.' },

    { type: 'h2', text: 'What JobTread is built for' },
    { type: 'p', text: 'JobTread’s who-we-serve page lists home builders, remodelers, pool and outdoor living builders, roofers, specialty contractors, commercial contractors and franchises. It is a broad list, but the centre of gravity is residential work sold to a homeowner: a customer portal, selections tied to allowances, proposals with e-signature, and a CRM for leads before the job starts.' },
    { type: 'p', text: 'The idea underneath it is sound. JobTread’s budgeting page describes the budget as the record everything else attaches to: estimates, bid requests, purchase orders, work orders and bills all tie back to budget items. That is the same instinct SyteNav is built on - a cost that is not on a budget line is a cost nobody is watching.' },
    { type: 'p', text: 'Around that it adds estimating with on-screen takeoff, AI features for estimating, daily log summaries and receipt scanning, supplier ordering integrations, and free portals for customers and for vendors and subs.' },

    { type: 'h2', text: 'What JobTread costs' },
    { type: 'p', text: 'JobTread publishes its price, which is more than most of this category does. Its pricing page lists one plan with every feature, a base monthly price that includes one internal user, and a charge for each additional internal user, with a lower rate on annual billing. Customer, vendor and sub portal users are unlimited and free. There is no free trial; monthly plans carry a money-back guarantee instead, and the sign-up page says annual plans are not refundable.' },
    { type: 'p', text: 'The model to understand is that the price grows with your office, not with your jobs. A firm with two people in the office and twenty live jobs pays very little. A firm with ten estimators, project managers and admins pays for ten seats whether there are three jobs running or thirty.' },
    { type: 'callout', tone: 'tip', title: 'Price it on your real headcount', text: 'Count everybody who will log in from your side - office, PMs, superintendents who enter costs - not the people you plan to give access to "eventually". Then price every option on that number, monthly and annually, before you look at a single demo.' },

    { type: 'h2', text: 'Why GCs look for a JobTread alternative' },
    { type: 'list', items: [
      'SEATS. The per-user model suits a lean office and gets more expensive as the office grows. A company that wants everybody - superintendents included - working in the system feels that first.',
      'THE HOMEOWNER SIDE IS NOT THE JOB. A GC doing commercial fit-outs or GC work for one owner contact has no selections and no allowances, and pays for a client experience it does not use.',
      'TYPING. Every system in this category promises that a cost is entered once. Test it with your own paperwork: a sub quote as a PDF, a sub bill as a PDF, and see how much of either you retype.',
      'CHECKING SUB BILLS. Tying a bill to a budget item says where the money goes. It does not by itself say whether the rate on the bill matches the rate the sub quoted.',
    ] },

    { type: 'h2', text: 'When JobTread is the right answer' },
    { type: 'list', items: [
      'Your bookkeeper lives in QuickBooks and needs changes made there to come back. JobTread’s QuickBooks Online page describes a two-way sync covering customers, vendors, invoices, bills, payments and cost codes.',
      'You sell to homeowners and want leads, proposals, selections and allowances in the same system as the budget.',
      'You estimate from plans and want takeoff built in.',
      'You want to sign up today and start, without waiting to be invited.',
      'Your office is small and your job count is high, which is exactly where per-seat pricing is cheapest.',
    ] },
    { type: 'p', text: 'If most of that describes you, JobTread is a strong choice and the effort is better spent setting it up properly than shopping further.' },

    { type: 'compare', title: 'Which way the decision tips', left: {
      label: 'JobTread is likely the fit',
      items: [
        'Two-way QuickBooks sync is a requirement',
        'Leads, proposals and selections in one place',
        'Takeoff from plans is part of estimating',
        'A small office running many jobs',
      ],
    }, right: {
      label: 'Look at an alternative',
      items: [
        'A large office you want fully on the system',
        'Commercial or one-owner work with no selections',
        'Sub billing is where the money leaks',
        'You want to pay for jobs, not seats',
      ],
    } },

    { type: 'h2', text: 'Five tests to run on any JobTread alternative' },
    { type: 'steps', items: [
      'Upload a real sub quote as the sub sent it. Count how many line items you type to get it into a budget.',
      'Upload a real sub bill that charges one rate above the quote. See whether anything tells you before you approve it.',
      'Approve a change order on site from a phone. Check it reached both the budget line and the sub’s contract.',
      'Raise a client invoice from costs already recorded and check the total without a calculator.',
      'Ask what the whole office costs at your headcount, monthly and annually, in writing.',
    ] },

    { type: 'h2', text: 'Where SyteNav fits' },
    { type: 'p', text: `SyteNav is built for ${SYTENAV_FIT}. A sub quote is scanned by AI into budget lines, so nothing is retyped. Sub bills land on those lines and are checked against the quote they were awarded on: a line above the quoted rate, a line that was never quoted, or a running total past the contract is flagged before you approve. Change orders raise both the budget line and the subcontract, and client invoices are built from costs already recorded. ${PLANS_SENTENCE}` },
    { type: 'p', text: `What it does not do, and where JobTread is ahead: SyteNav has no CRM or lead pipeline, no takeoff from plans and no supplier ordering, it is invite-only rather than sign-up-and-go, and ${QBO_ONE_WAY}. If those are deciding factors, JobTread is the better fit.` },
  ],
  links: [
    { text: 'JobTread’s who-we-serve page', href: 'https://www.jobtread.com/who-we-serve' },
    { text: 'JobTread’s budgeting page', href: 'https://www.jobtread.com/features/budgeting' },
    { text: 'AI features for estimating, daily log summaries and receipt scanning', href: 'https://www.jobtread.com/features/ai' },
    { text: 'Its pricing page lists one plan with every feature', href: 'https://www.jobtread.com/pricing' },
    { text: 'JobTread’s QuickBooks Online page', href: 'https://www.jobtread.com/integrations/quickbooks-online' },
    { text: 'checked against the quote they were awarded on', href: '/guides/construction-invoice-verification' },
    { text: 'A sub quote is scanned by AI into budget lines', href: '/ai' },
    plansLink,
  ],
  faqs: [
    { q: 'How much does JobTread cost?', a: 'JobTread publishes its price on its pricing page: one plan, a base price that includes one internal user, a charge per additional internal user, and a discount for paying annually. Customer, vendor and sub portal users are free. Check the page for the current numbers, since they are the vendor’s to change.' },
    { q: 'Does JobTread have a free trial?', a: 'Its sign-up page offers a money-back guarantee on monthly plans rather than a free trial, and says annual plans are not refundable. If you want to test it, start monthly.' },
    { q: 'Is JobTread good for commercial work?', a: 'JobTread lists commercial contractors among the companies it serves. Much of the product is built around selling to a homeowner, so for commercial work the useful test is how much of that you would be paying for and not using.' },
    { q: 'What is the closest JobTread alternative?', a: 'It depends on why you are leaving. For two-way accounting, look at accounting-first tools. For a homeowner-centred product with more scale, look at Buildertrend. If the problem is that sub bills and change orders do not reconcile to the budget, compare systems on how they check a bill against the quote.' },
  ],
  related: ['buildertrend-alternatives', 'construction-invoice-verification', 'construction-job-cost-tracking'],
}
