import type { Guide } from '../schema'
import { SYTENAV_FIT, PLANS_SENTENCE, plansLink, QBO_SYNC_LIMIT } from '../sytenav'

export const guide: Guide = {
  slug: 'fieldwire-alternatives',
  title: 'Fieldwire alternatives (2026): when the field is covered and the money is not',
  cardTitle: 'Fieldwire alternatives (2026)',
  metaTitle: 'Fieldwire Alternatives (2026): Field Management vs the Money | SyteNav',
  description:
    'Fieldwire is jobsite management - plans, tasks, punch lists, forms. What a GC should compare in a Fieldwire alternative when the budget and sub billing live elsewhere.',
  keyword: 'fieldwire alternative',
  keywords: [
    'fieldwire alternative', 'fieldwire alternatives', 'fieldwire competitors', 'fieldwire pricing',
    'fieldwire vs', 'software like fieldwire', 'fieldwire budget', 'fieldwire quickbooks',
  ],
  category: 'compare',
  published: '2026-10-20',
  updated: '2026-10-22',
  lede:
    'Fieldwire is very good at the thing it is for: the drawings, the tasks pinned to them, the punch list and the forms a crew fills in on site. The reason GCs look for a Fieldwire alternative is rarely the field. It is that the field and the money are in two systems, and the two never quite agree.',
  takeaways: [
    'Fieldwire, part of Hilti, calls itself real-time jobsite management software: plans with version control, tasks and punch lists on the drawings, inspections, forms and scheduling.',
    'Its budget module tracks a budget against actual costs that are imported from accounting; its QuickBooks Online integration brings bills and expenses in as read-only actual costs.',
    'Its pricing page lists a free plan with limits and per-user paid plans, with RFIs, submittals, change orders and budget on the top published tier.',
    'If your losses are in sub billing and change orders, compare a system where the bill is checked and approved, not one that receives it after the fact.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is written by SyteNav, a competitor on part of what Fieldwire does. Statements about Fieldwire link to Fieldwire’s own pages and say what they say, as of October 2026.' },

    { type: 'h2', text: 'What Fieldwire is built for' },
    { type: 'p', text: 'Fieldwire’s homepage calls it real-time jobsite management software, for general contractors, specialty contractors, owners and designers. Hilti acquired it in 2021, and it is sold today as Fieldwire by Hilti. The heart of it is the drawing set: sheets with version control, tasks and punch items pinned to a location on the plan, photos, inspections and forms for daily reports, safety and time-and-materials tickets, with a mobile app that works offline.' },
    { type: 'p', text: 'On the higher tiers it adds project management documents - RFIs, submittals and change orders - and a budget. Fieldwire’s budget update describes splitting a project into line items, assigning costs to subs, linking change orders, and tracking the budget against actual costs.' },

    { type: 'h2', text: 'Where the money comes from in Fieldwire' },
    { type: 'p', text: 'This is the part to understand before comparing. Fieldwire’s QuickBooks Online help article describes a one-way integration from QuickBooks into Fieldwire: bills, expenses, checks and credits come across as read-only actual costs in the budget, and invoices do not sync. So the bill is entered, checked and approved somewhere else - usually in QuickBooks by the office - and Fieldwire shows the result against the budget.' },
    { type: 'p', text: 'That is a reasonable design for a company whose accounting team owns the money and whose field team owns the drawings. It means Fieldwire is not the place a sub’s bill gets checked against what the sub quoted. By the time the cost reaches the budget in Fieldwire, it has already been accepted.' },

    { type: 'h2', text: 'What Fieldwire costs' },
    { type: 'p', text: 'Fieldwire’s pricing page lists a free plan limited by users, projects and sheets, and three paid plans priced per user per month, cheaper billed annually. The top published plan carries RFIs, submittals, change orders, the budget and the accounting integrations; enterprise is quoted. Its help centre says invited users count as licences.' },
    { type: 'p', text: 'Per-user pricing on a field tool has a particular cost: the people you most want in it - foremen, superintendents, the sub’s lead hand - are the people you are tempted to leave out to save a seat.' },

    { type: 'h2', text: 'Why GCs look for a Fieldwire alternative' },
    { type: 'list', items: [
      'TWO SYSTEMS, ONE JOB. The field record is in Fieldwire, the bills are in QuickBooks, and percent complete on a pay application is reconciled between them by somebody, by hand.',
      'BILLS ARRIVE ALREADY APPROVED. Actual costs imported from accounting tell you what was spent, not whether it should have been.',
      'THE SEAT COUNT. Paying per user for everybody who walks the site adds up, and the money features sit on the top tier.',
      'CLIENT BILLING. Fieldwire’s pages describe the budget and actual costs, not raising the client invoice from them.',
    ] },

    { type: 'h2', text: 'When Fieldwire is the right answer' },
    { type: 'list', items: [
      'Drawings are the centre of your job: large sheet sets, frequent revisions, many trades working off them.',
      'Punch lists and inspections pinned to locations on the plan are where you lose time.',
      'Your accounting team owns the money and is happy in QuickBooks or an ERP.',
      'You need offline mobile for crews on sites with no signal.',
    ] },

    { type: 'compare', title: 'Drawings first or money first', left: {
      label: 'Fieldwire is likely the fit',
      items: [
        'Large, frequently revised drawing sets',
        'Punch and inspections pinned to the plan',
        'Accounting owns the bills elsewhere',
        'Field teams need offline access',
      ],
    }, right: {
      label: 'Look at an alternative',
      items: [
        'Sub bills need checking before approval',
        'Change orders must move budget and contract together',
        'Client invoices should come from recorded costs',
        'You want the field and the money on one job',
      ],
    } },

    { type: 'h2', text: 'Where SyteNav fits' },
    { type: 'p', text: `SyteNav is built for ${SYTENAV_FIT}, which is the half of the job Fieldwire receives rather than runs. A sub’s bill is scanned, matched to their contract and a budget line, and checked against the quote they were awarded on before anybody approves it. Change orders raise the budget line and the subcontract together, client invoices are built from approved costs, and daily logs, photos and inspections sit on the same job as the money. ${PLANS_SENTENCE}` },
    { type: 'p', text: `What it does not do, and where Fieldwire is ahead: SyteNav is not a drawing-management platform. You can open a plan set, pin a task to a spot on a sheet and send the trades a scope update when a drawing changes, but there is no version control or sheet compare across revisions, no form builder, and no offline mode - it needs a connection - and ${QBO_SYNC_LIMIT}. Plenty of GCs would be right to run Fieldwire for the drawings and something else for the money.` },
  ],
  links: [
    { text: 'Fieldwire’s homepage calls it real-time jobsite management software', href: 'https://www.fieldwire.com/' },
    { text: 'Hilti acquired it in 2021', href: 'https://www.fieldwire.com/blog/hilti-acquires-fieldwire/' },
    { text: 'Fieldwire’s budget update', href: 'https://www.fieldwire.com/blog/construction-budget-management-product-updates/' },
    { text: 'Fieldwire’s QuickBooks Online help article', href: 'https://help.fieldwire.com/hc/en-us/articles/37251922140817-Integrations-Tab-Quickbooks-Online' },
    { text: 'Fieldwire’s pricing page lists a free plan', href: 'https://www.fieldwire.com/pricing/' },
    { text: 'Its help centre says invited users count as licences', href: 'https://help.fieldwire.com/hc/en-us/articles/202634054-Fieldwire-Pricing-and-Overages' },
    { text: 'checked against the quote they were awarded on', href: '/guides/construction-invoice-verification' },
    plansLink,
  ],
  faqs: [
    { q: 'Does Fieldwire do budgets and job costing?', a: 'Fieldwire has a budget module that tracks a budget against actual costs, with costs assigned to subs and change orders linked. Actual costs are imported from accounting - its QuickBooks Online integration brings bills and expenses in as read-only actual costs.' },
    { q: 'How much does Fieldwire cost?', a: 'Its pricing page lists a free plan with user, project and sheet limits, three paid plans priced per user per month with a discount for annual billing, and a quoted enterprise plan. Check the page for current figures.' },
    { q: 'Does Fieldwire sync with QuickBooks?', a: 'Its help article describes a QuickBooks Online integration that pulls bills, expenses, checks and credits into Fieldwire’s budget as actual costs. Invoices do not sync, and it is on the top published plan.' },
    { q: 'Can I use Fieldwire alongside another system?', a: 'Yes, and many GCs do: Fieldwire for drawings, punch and inspections, and a separate system for budgets, sub bills and client billing. Decide which one is the record for money and keep it there.' },
  ],
  related: ['construction-daily-log-app', 'construction-invoice-verification', 'procore-alternatives-small-gcs'],
}
