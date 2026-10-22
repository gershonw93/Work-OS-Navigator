import type { Guide } from '../schema'
import { SYTENAV_FIT, PLANS_SENTENCE, plansLink, QBO_SYNC_LIMIT } from '../sytenav'

export const guide: Guide = {
  slug: 'contractor-foreman-alternatives',
  title: 'Contractor Foreman alternatives (2026): when breadth is not the problem',
  cardTitle: 'Contractor Foreman alternatives (2026)',
  metaTitle: 'Contractor Foreman Alternatives (2026): An Honest Comparison | SyteNav',
  description:
    'Contractor Foreman covers almost every module in construction for a low entry price. What to compare in a Contractor Foreman alternative, and when to stay.',
  keyword: 'contractor foreman alternative',
  keywords: [
    'contractor foreman alternative', 'contractor foreman alternatives', 'contractor foreman competitors',
    'contractor foreman pricing', 'contractor foreman review', 'software like contractor foreman',
    'contractor foreman vs',
  ],
  category: 'compare',
  published: '2026-10-20',
  updated: '2026-10-22',
  lede:
    'Contractor Foreman’s pitch is breadth at a low price: scheduling, daily logs, estimates, job costing, time cards, safety meetings, RFIs, submittals, a client portal and a lead manager, from one subscription. Nobody leaves it for lack of modules. They leave when a module exists and the money still does not reconcile.',
  takeaways: [
    'Contractor Foreman lists a very wide feature set - project management, financials, people, documents and a client portal - and prices by number of users with unlimited projects.',
    'Its homepage advertises a low entry price for one user on annual billing, a free trial, and a money-back guarantee.',
    'Its knowledge base describes a QuickBooks Online sync that is two-way for contacts, invoices, payments and bills, and says change orders do not sync.',
    'The question for an alternative is depth, not breadth: test how a sub bill is checked, how a change order moves money, and how many places a cost is typed.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is written by SyteNav, a competitor. Statements about Contractor Foreman link to Contractor Foreman’s own pages and say what those pages say, as of October 2026. Its prices vary between its own pages, so we describe the shape and send you to the source for the numbers.' },

    { type: 'h2', text: 'What Contractor Foreman is built for' },
    { type: 'p', text: 'Contractor Foreman has pages for residential general contractors, general contractors and small businesses, and its features page reads like a catalogue of the whole industry. Project management covers scheduling with Gantt and critical path, daily logs, punch lists, permits, inspections and service tickets. Financials cover estimates, job costing, change orders, purchase orders, invoicing and takeoffs. People covers GPS time cards, crew scheduling, team chat and safety meetings. Documents covers RFIs, submittals, markup and forms.' },
    { type: 'p', text: 'Its client portal page describes clients reviewing and approving estimates, change orders, RFIs and submittals, switched on per project. There is a leads manager for the sales side.' },

    { type: 'h2', text: 'What Contractor Foreman costs' },
    { type: 'p', text: 'Contractor Foreman’s homepage advertises plans starting at a low monthly price for a single user on annual billing, with a free trial and a money-back guarantee. Plans step up by the number of users, and projects are unlimited on all of them. The exact tier prices differ between its own pages, which usually means they have changed recently - check the current figures directly before you budget.' },
    { type: 'p', text: 'Per-user pricing at a low entry point makes Contractor Foreman one of the cheapest ways to put a whole construction suite in front of a small office. As the team grows, the tier changes, so price it on everyone who will log in.' },

    { type: 'h2', text: 'Why GCs look for a Contractor Foreman alternative' },
    { type: 'list', items: [
      'A MODULE IS NOT A WORKFLOW. Having job costing, change orders and invoicing as three modules is not the same as a change order raising the budget line and the sub’s contract and then appearing on the client invoice. Test the path, not the menu.',
      'TOO MUCH TO SET UP. A system with forty modules asks a lot of somebody’s evenings in the first month. Many GCs use five and feel the weight of the rest.',
      'ACCOUNTING EDGES. Its knowledge base says change orders do not sync to QuickBooks, so an approved change order needs a second step to be reflected in the books.',
      'SUB BILLS. The question that loses money is whether a bill charges a rate nobody agreed. Ask any system, this one included, to show you that check on a real bill.',
    ] },

    { type: 'h2', text: 'When Contractor Foreman is the right answer' },
    { type: 'list', items: [
      'You want the widest feature set for the lowest entry price, and you will configure it yourself.',
      'Crew time, GPS time cards and safety meetings matter as much as the money.',
      'You do service work alongside projects and want service tickets in the same tool.',
      'You need two-way QuickBooks Online for contacts, invoices, payments and bills.',
    ] },

    { type: 'compare', title: 'Breadth or depth', left: {
      label: 'Contractor Foreman is likely the fit',
      items: [
        'Low entry price, priced by users',
        'Time cards, crew scheduling and safety in one place',
        'Service tickets alongside projects',
        'You enjoy configuring software',
      ],
    }, right: {
      label: 'Look at an alternative',
      items: [
        'Money leaks through sub billing and change orders',
        'You want a narrow path that is already set up',
        'Change orders must move money everywhere at once',
        'You want to pay for jobs, not seats',
      ],
    } },

    { type: 'h2', text: 'How to compare without drowning in features' },
    { type: 'steps', items: [
      'Write down the five things that cost you money last year. Ignore every feature not on that list.',
      'Take one real sub bill with a rate above the quote and see what each system does with it before approval.',
      'Approve one change order and follow it: budget line, sub contract, client invoice, accounting.',
      'Count the screens a foreman needs to file a daily log with photos.',
      'At the end, answer for one job: cost to date, committed, and not on a budget line.',
    ] },

    { type: 'h2', text: 'Where SyteNav fits' },
    { type: 'p', text: `SyteNav is built for ${SYTENAV_FIT}, and it is deliberately narrower than Contractor Foreman. The path it cares about is one line: a quote scanned into the budget, sub bills checked against that quote before approval, change orders that raise the budget line and the subcontract together, and a client invoice built from the approved costs. The field side - daily logs, photos, inspections, the schedule - writes to the same job. ${PLANS_SENTENCE}` },
    { type: 'p', text: `What it does not do, and where Contractor Foreman is ahead: SyteNav has no lead manager, no service tickets, no takeoff and no safety meeting module, and ${QBO_SYNC_LIMIT}. If those are on your list of five, Contractor Foreman covers them and SyteNav does not.` },
  ],
  links: [
    { text: 'its features page reads like a catalogue of the whole industry', href: 'https://contractorforeman.com/features/' },
    { text: 'Its client portal page', href: 'https://contractorforeman.com/features/project-management/client-portal/' },
    { text: 'Contractor Foreman’s homepage advertises plans starting at a low monthly price', href: 'https://contractorforeman.com/' },
    { text: 'Its knowledge base says change orders do not sync to QuickBooks', href: 'https://kb.contractorforeman.com/knowledge-base/contractor-foreman-quickbooks-integration-what-syncs-and-what-doesnt/' },
    { text: 'sub bills checked against that quote before approval', href: '/guides/construction-invoice-verification' },
    { text: 'change orders that raise the budget line and the subcontract together', href: '/guides/how-to-track-change-orders' },
    plansLink,
  ],
  faqs: [
    { q: 'How much does Contractor Foreman cost?', a: 'Its homepage advertises a low starting price for one user on annual billing, with plans tiered by number of users and unlimited projects. Its own pages list different tier prices in different places, so take the current figures from the vendor before budgeting.' },
    { q: 'Does Contractor Foreman sync with QuickBooks?', a: 'Its knowledge base describes a QuickBooks Online integration where contacts, invoices, invoice payments and bills sync both ways, time cards go one way into QuickBooks, and change orders do not sync.' },
    { q: 'Is Contractor Foreman good for general contractors?', a: 'It has pages aimed at general contractors and residential GCs, and the feature list covers most of what a GC does. Whether it is good for you depends on depth in the two or three places you lose money, which is what a trial should test.' },
    { q: 'What is the best Contractor Foreman alternative?', a: 'If you want similar breadth with a homeowner focus, look at JobTread or Buildertrend. If you want deep commercial document control, Procore. If your problem is that sub bills and change orders do not reconcile, compare systems on how they check a bill against the quote.' },
  ],
  related: ['jobtread-alternatives', 'buildertrend-alternatives', 'construction-invoice-verification'],
}
