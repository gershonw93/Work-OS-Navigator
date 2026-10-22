import type { Guide } from '../schema'
import { SYTENAV_FIT, PLANS_SENTENCE, plansLink, QBO_SYNC_LIMIT } from '../sytenav'

export const guide: Guide = {
  slug: 'crux-construction-software-alternatives',
  title: 'Crux construction software alternatives: bill approval and job cost without the QuickBooks layer',
  cardTitle: 'Crux alternatives (2026)',
  metaTitle: 'Crux Construction Software Alternatives (2026) | SyteNav',
  description:
    'What Crux (crux.build) is, how it prices, and the alternatives for a GC who wants bill approval and budget vs actual - compared from Crux’s own pages.',
  keyword: 'crux construction software',
  keywords: [
    'crux construction software', 'crux alternative', 'crux.build', 'crux construction pricing',
    'crux build alternative', 'quickbooks bill approval construction', 'construction invoice approval software',
    'budget vs actual construction software',
  ],
  category: 'compare',
  published: '2026-10-20',
  updated: '2026-10-22',
  lede:
    'Crux is not a project management app with a finance tab. It describes itself as a financial control layer for general contractors who run on QuickBooks: bills come in, get approved by the right PM, land on the right job, and go to QuickBooks. That is a narrower product than most on this list, and closer to the problem most GCs actually have.',
  takeaways: [
    'Crux keeps QuickBooks as your accounting system of record and adds bill intake, routed approvals, budget vs actual and job cost reporting around it.',
    'Its pricing page lists a flat company fee by scope, not by seat, across three tiers, plus a one-time onboarding fee.',
    'If your books are clean in QuickBooks and the gap is approvals and job cost visibility, Crux is aimed squarely at you.',
    'If you also want the field record, the schedule and client billing in the same place as the budget, compare a system where the job - not QuickBooks - is the record.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is written by SyteNav. Crux and SyteNav overlap more than most products on our comparison list, because both start from the same pain: a sub’s bill that nobody checked properly. Everything we say about Crux links to Crux’s own pages and is worded as what those pages say, as of October 2026.' },

    { type: 'h2', text: 'What Crux is' },
    { type: 'p', text: 'Crux’s homepage calls it the financial control layer for QuickBooks-based general contractors, and says it was developed by and for builders in collaboration with Regency Development. Its pricing page is explicit about the boundary: QuickBooks stays your accounting system of record. Crux takes in the bills, routes them, ties them to a job and a cost code, and hands the approved ones to QuickBooks.' },
    { type: 'p', text: 'Crux’s invoice approvals page describes vendors’ bills reaching the project manager for approval, with the PM able to ask for clarification, and each bill carrying its project and cost code. Its budget vs actual page describes budget, committed, approved and variance figures by job. Around those, the homepage lists further modules - a scheduler that puts pay application funding on a calendar for cash flow, permit and inspection notices to project managers, estimates, tasks, and syncing company card purchases to a job with the receipt attached.' },

    { type: 'h2', text: 'What Crux costs' },
    { type: 'p', text: 'Crux’s pricing page lists three tiers priced as a flat company fee - by scope, not by seat, so everyone on the team can use it. The entry tier covers bill intake, routed approvals, budget vs actual, job cost and QuickBooks sync of approved bills; the higher tiers add more modules and multi-job oversight, up to all of them. Annual billing gives a month free. Every tier carries a one-time onboarding fee covering setup, the QuickBooks connection, configuration and training.' },
    { type: 'p', text: 'That pricing says who it is for. A flat fee of more than a thousand dollars a month is easy to justify for a GC whose bill volume needs a controller, and hard to justify for one whose office is two people. Read the numbers on the pricing page against what a missed overbill or a slow approval costs you in a year.' },

    { type: 'h2', text: 'Why GCs look for a Crux alternative' },
    { type: 'list', items: [
      'THE PRICE AND THE ONBOARDING FEE. Both are set for a company with real bill volume. A GC earlier on that curve wants the same controls at a smaller commitment.',
      'THE FIELD IS SOMEWHERE ELSE. Crux’s modules are about money. Daily logs, photos, the schedule crews work to and the record of what was built live in another tool, which means percent complete on a pay app is checked against a system Crux cannot see.',
      'CLIENT BILLING. Approving what you owe is half of the money. Billing the client for it - with markup, from the costs you just approved - is the other half. Crux’s pages describe the first; ask how the second is handled.',
      'QUICKBOOKS AS THE RECORD. For some GCs that is exactly right. For others, QuickBooks is where the accountant works, and the job itself should be the record the PM opens.',
    ] },

    { type: 'h2', text: 'When Crux is the right answer' },
    { type: 'list', items: [
      'Your books are already clean in QuickBooks and your accountant wants them to stay the record.',
      'The pain is routing: bills arrive in one inbox and the right PM never sees them before they are paid.',
      'Your bill volume is high enough that the fee is small next to one missed overbill a quarter.',
      'You want onboarding done for you, with the QuickBooks mapping set up by somebody who has done it before.',
    ] },

    { type: 'compare', title: 'Two places to keep the record', left: {
      label: 'QuickBooks is the record (Crux)',
      items: [
        'Approvals and job cost added around your existing books',
        'Accountant keeps working exactly as today',
        'Field record lives in a separate tool',
        'Priced as a flat company fee plus onboarding',
      ],
    }, right: {
      label: 'The job is the record',
      items: [
        'Budget, bills, change orders and client invoices on one job',
        'Field logs and photos beside the money they prove',
        'Accounting receives what the job approved',
        'Usually priced by projects or seats instead',
      ],
    } },

    { type: 'h2', text: 'What to test in any alternative' },
    { type: 'steps', items: [
      'Forward three real sub bills. Time how long until each is on the right job, the right budget line and in front of the right PM.',
      'Include one bill with a rate above the quote. See whether the system notices before approval.',
      'Approve one and check what reached your accounting system, and in what form.',
      'Ask for budget vs actual on one job, including committed costs, without exporting anything.',
      'Get the first-year cost in writing, onboarding included.',
    ] },

    { type: 'h2', text: 'Where SyteNav fits' },
    { type: 'p', text: `SyteNav is built for ${SYTENAV_FIT}, and it starts where Crux does - with the sub’s bill. Scan the PDF and SyteNav reads it, matches it to the sub’s contract and a budget line, and checks it against the quote that sub was awarded on, flagging a rate above the quote, a line never quoted, and a running total past the contract. The difference is where the record lives: the job holds the budget, the bills, the change orders, the client invoices and the daily logs, and approved bills and invoices go to QuickBooks. ${PLANS_SENTENCE}` },
    { type: 'p', text: `What it does not do: ${QBO_SYNC_LIMIT}; it does not sync company card purchases; and it is invite-only rather than delivered with a done-for-you onboarding. If keeping QuickBooks as the system of record is the point, Crux is designed around that and SyteNav is not.` },
  ],
  links: [
    { text: 'Crux’s homepage calls it the financial control layer', href: 'https://crux.build/' },
    { text: 'Its pricing page is explicit about the boundary', href: 'https://crux.build/pricing/' },
    { text: 'Crux’s invoice approvals page', href: 'https://crux.build/platform/invoice-approvals/' },
    { text: 'Its budget vs actual page', href: 'https://crux.build/platform/budget-vs-actual/' },
    { text: 'checks it against the quote that sub was awarded on', href: '/guides/construction-invoice-verification' },
    { text: 'percent complete on a pay app', href: '/guides/subcontractor-pay-application-review' },
    plansLink,
  ],
  faqs: [
    { q: 'What is Crux construction software?', a: 'Crux (crux.build) describes itself as a financial control layer for general contractors who use QuickBooks. It handles bill intake, routed approvals, budget vs actual and job cost reporting, and sends approved bills to QuickBooks, which stays the accounting record.' },
    { q: 'How much does Crux cost?', a: 'Crux’s pricing page lists three tiers as a flat company fee rather than per seat, with a discount for paying annually and a one-time onboarding fee on every tier. Check the page for current figures.' },
    { q: 'Is Crux a replacement for QuickBooks?', a: 'No, and it says so. Its pricing page says QuickBooks stays your accounting system of record; Crux adds controls around it.' },
    { q: 'What is the difference between Crux and SyteNav?', a: 'Both check sub bills before they are approved. Crux keeps QuickBooks as the record and focuses on the money. SyteNav keeps the job as the record - budget, bills, change orders, client invoices, daily logs and schedule together - and pushes what is approved into QuickBooks Online.' },
  ],
  related: ['construction-invoice-approval', 'construction-invoice-verification', 'construction-job-cost-tracking'],
}
