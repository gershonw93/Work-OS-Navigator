import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'construction-management-software-small-contractors',
  title: 'Best construction management software for small contractors',
  metaTitle: 'Best Construction Management Software for Small Contractors (2026) | SyteNav',
  description:
    'How to choose construction management software as a small contractor: what actually matters, the questions that expose a bad fit, and a buying checklist.',
  keyword: 'construction management software for small contractors',
  keywords: [
    'construction management software for small contractors', 'best construction software small business',
    'construction software for small builders', 'contractor software', 'small gc software',
    'construction project management software small company', 'software for remodelers',
  ],
  category: 'choosing',
  published: '2026-09-15',
  lede:
    'There is no best construction management software for small contractors. There is a best one for a four-job remodeler whose problem is change orders, and a different one for a ten-job builder whose problem is job costing. This is how to work out which you are before you sign anything.',
  takeaways: [
    'Adoption beats features. The best system is the one your field will still be using in month three.',
    'Buy against the three things that cost you money last year. Everything else is a tiebreaker.',
    'One system that holds the work and the money beats two systems that each do half and disagree.',
    'Watch out for per-seat pricing if you want subs and crew in the system - that is where the bill grows fastest.',
  ],
  blocks: [
    { type: 'p', text: 'Written by the team behind SyteNav, which is one of the options in this category. The checklist below is the one we would hand a contractor who had not heard of us.' },

    { type: 'h2', text: 'Start with what it is costing you now' },
    { type: 'p', text: 'Software is bought to stop a specific bleed. Before you look at products, put a number on yours. Most small contractors find theirs on this list.' },
    { type: 'list', items: [
      'Extra work done and never billed, because nobody wrote it down at the time.',
      'Sub invoices paid past contract, or paid twice, because nothing checked them against what was agreed.',
      'Hours - yours - spent rebuilding a budget spreadsheet after somebody typed over a formula.',
      'Jobs that finished at a margin nobody could explain, because costs were only visible after the fact.',
      'Claims and disputes that came down to whether there was a written record of a day, a photo, or an approval.',
      'Compliance gaps: an expired COI, a lapsed licence, a permit that ran out unnoticed.',
    ] },
    { type: 'p', text: 'Rank your top three. That ranking is your buying criteria and it will disqualify most of the market in an afternoon, because these systems are genuinely different underneath even though the marketing pages look the same.' },

    { type: 'h2', text: 'The four questions that expose a bad fit' },
    { type: 'h3', text: '1. What does the field have to do?' },
    { type: 'p', text: 'Ask for the phone experience, not the tablet one, and ask to see it in the hands of somebody who has not been trained. A crew member should be able to clock in, log a day with photos, and tick off a task without navigating a project hierarchy. If logging a day takes a laptop, it will be done on Friday for the whole week from memory, which is worth very little in a dispute and nothing at all as a progress record.' },
    { type: 'h3', text: '2. Where does a number get typed the second time?' },
    { type: 'p', text: 'Trace one dollar through a demo. The sub quotes $35,000. Who types that into the budget? The sub invoices against it. Who types that? You bill the client for it with markup. Who works that out? Every one of those handoffs is either automatic or it is a job somebody at your company does every month forever, and the difference between two products is often exactly that.' },
    { type: 'h3', text: '3. How do people outside your company take part?' },
    { type: 'p', text: 'Subs, clients, inspectors, lenders. If each of them needs an account, a password and a five-minute explanation, the system will be routed around by email within a month. Links that just work - a sub uploading their insurance, a client opening their invoice on a phone - are what keeps the record inside the system instead of in an inbox.' },
    { type: 'h3', text: '4. What happens on a job that is already running?' },
    { type: 'p', text: 'This is the question nobody asks in a demo and everybody hits in week one. Ask specifically: how do I enter a job that is 60% done, with four subs awarded, money already spent, and a permit pulled? A system with a good answer here has thought about real adoption. A system with no answer expects you to start over on your next job, which means the tool does nothing for you for six months.' },

    { type: 'callout', tone: 'warn', title: 'Per-seat pricing and the field', text: 'If the field is charged per seat, you will ration seats, and rationed seats mean the people on site are not in the system. Check how crew, subs and office staff are counted before you compare monthly prices - two products with the same headline number can differ by a factor of three once everyone who needs access is in.' },

    { type: 'h2', text: 'What matters more than the feature list' },
    { type: 'list', items: [
      'ONE PLACE THE JOB LIVES. Budget, subs, bills, schedule, logs and documents on the same record. Two systems mean two truths and a monthly reconciliation you did not sign up for.',
      'DERIVED NUMBERS, NOT TYPED ONES. Committed, actual, remaining and profit should be calculated from what has actually happened. Any figure a human maintains by hand is a figure that will be wrong the week you need it.',
      'A RECORD THAT HOLDS UP. Time-stamped, attributed, with the photo attached. The value of a daily log is entirely in whether it was written that day by somebody who was there.',
      'SPEED OF ENTRY. Scanning a sub invoice PDF and checking it beats typing it. Anything that removes typing removes the excuse not to keep the system current.',
      'SOMETHING THAT SAYS WHAT IT DOES NOT DO. A product that tells you where it stops is telling you the truth about the rest.',
    ] },

    { type: 'h2', text: 'The buying checklist' },
    { type: 'checklist', title: 'Run this against every product on your shortlist', items: [
      'Enter a real job that is already under way, including awarded subs and spent costs.',
      'Scan or enter the last three sub invoices from the original PDFs and time it.',
      'Have an untrained crew member file a daily log from their own phone.',
      'Raise one client invoice from costs already in the system and check the markup is right.',
      'Create a change order and confirm it moves the budget line and the sub contract, not just a list.',
      'Ask a sub to upload a certificate of insurance without creating an account.',
      'Answer, unaided: what has this job committed, spent, and left?',
      'Ask what the export looks like if you leave.',
      'Confirm who at the vendor you talk to when something is wrong, and how fast.',
    ] },

    { type: 'h2', text: 'Categories, and who each one is for' },
    { type: 'compare', title: 'Two ends of the same market', left: {
      label: 'Accounting-first systems',
      items: [
        'Strongest at job cost, payroll, and closing the month',
        'Your bookkeeper will like it',
        'Field tools are usually thin, so crews end up on a second app',
        'Best when your pain is "I cannot tell what a job cost"',
      ],
    }, right: {
      label: 'Field-first systems',
      items: [
        'Strongest at daily record, photos, schedule and sub coordination',
        'Your foreman will use it',
        'Check how far the money side really goes before you buy',
        'Best when your pain is "nothing is written down"',
      ],
    } },
    { type: 'p', text: 'The right answer for most small GCs is whichever one also does a passable job of the other half, because running one system badly is still better than running two systems that disagree. Ask each vendor to show you the half you assume is weak.' },

    { type: 'h2', text: 'Where SyteNav fits' },
    { type: 'p', text: 'SyteNav is built for contractors running roughly two to twenty live jobs who need the money and the field in one place: AI scanning for quotes, sub invoices and inspector cards; budgets that show committed, actual and remaining as costs land; change orders that raise the budget line and the sub contract together; client invoices built from costs already recorded, with markup applied per invoice; daily logs, time clock with a location check, permits, inspections and compliance tracking; and links rather than logins for subs and clients.' },
    { type: 'p', text: 'It is an invite-only beta, free while you are in it. It does not do document control at enterprise scale, it does not run payroll, and its QuickBooks Online integration pushes one way - out of SyteNav. If you need any of those, say so on the call and we will tell you straight whether it is a fit.' },
  ],
  links: [
    { text: 'AI scanning for quotes, sub invoices and inspector cards', href: '/ai' },
    { text: 'budgets that show committed, actual and remaining as costs land', href: '/money' },
    { text: 'daily logs, time clock with a location check, permits, inspections and compliance tracking', href: '/mobile' },
    { text: 'links rather than logins for subs and clients', href: '/features' },
  ],
  faqs: [
    { q: 'What is the difference between construction management software and accounting software?', a: 'Accounting software answers what happened, in a form your accountant and the tax authority accept. Construction management software is supposed to answer what is happening, while you can still change it. Most small contractors need both, with a clear rule about which one is the book of record for costs.' },
    { q: 'Do I need software if I only run three or four jobs?', a: 'Not necessarily. Three jobs with one crew and no subs bills is a spreadsheet problem. The threshold is usually subcontractors and change orders: once other companies are billing you against agreed amounts and scope is changing mid-job, the coordination cost outgrows a sheet quickly.' },
    { q: 'How long does it take to get running?', a: 'For a light system, entering your first live job is an afternoon - budget, awarded subs, costs to date. Getting the field to use it daily is the part that takes weeks, and it depends far more on picking one job and one foreman to start with than on the software.' },
    { q: 'What about subs who refuse to use anything?', a: 'Assume that is most of them. Choose a system where subs participate through links - upload a certificate, accept a bid invitation, open an invoice - rather than accounts. Anything that requires them to learn software will be done by phone instead, and the record ends up nowhere.' },
  ],
  related: ['procore-alternatives-small-gcs', 'construction-spreadsheet-vs-software', 'construction-job-cost-tracking'],
}
