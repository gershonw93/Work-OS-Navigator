import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'construction-spreadsheet-vs-software',
  title: 'Google Sheets vs construction software',
  metaTitle: 'Construction Spreadsheet vs Software: When to Switch | SyteNav',
  description:
    'When a construction spreadsheet is still the right tool, the four failures that mean it is not, and how to move one live job across without losing what works.',
  keyword: 'construction spreadsheet vs software',
  keywords: [
    'construction spreadsheet vs software', 'google sheets construction', 'excel construction management',
    'construction budget spreadsheet', 'when to stop using spreadsheets construction',
    'spreadsheet job costing', 'excel vs construction software',
  ],
  category: 'choosing',
  published: '2026-09-15',
  lede:
    'The spreadsheet is not the problem, and people who tell contractors it is usually have something to sell. The problem is the four specific things a spreadsheet cannot do, and whether any of them is currently costing you money.',
  takeaways: [
    'Spreadsheets are excellent at arithmetic, modelling and one-off analysis. Keep using them for estimating.',
    'They fail at concurrent editing, at capture from the field, at deriving one fact in many places, and at being an audit record.',
    'A sheet that only one person understands is a business risk before it is a software problem.',
    'Move one live job, not the whole company, and keep your estimating sheet if you like it.',
  ],
  blocks: [
    { type: 'h2', text: 'What a spreadsheet is genuinely better at' },
    { type: 'p', text: 'Worth saying first, because it is true and because it tells you what not to give up.' },
    { type: 'list', items: [
      'ESTIMATING. Nothing beats a sheet for building up a price from assemblies and unit rates. Every construction system in existence is more rigid than your estimating workbook and it always will be.',
      'ONE-OFF ANALYSIS. "What if we self-perform the framing?" is a column, not a feature request.',
      'MODELLING A DEAL. Land, financing, sellout, phasing. No construction management tool does this properly and most do not try.',
      'SHAPE-SHIFTING. Every job is slightly different and a sheet accommodates that instantly. Software makes you fit its shape, which is both its weakness and, later, the reason your numbers are comparable across jobs.',
    ] },
    { type: 'p', text: 'If your spreadsheet use is mostly the list above, you do not have a spreadsheet problem. You have an estimating tool that works.' },

    { type: 'h2', text: 'The four things it cannot do' },
    { type: 'h3', text: '1. Be edited by several people without someone losing work' },
    { type: 'p', text: 'Cloud sheets solved simultaneous editing, not simultaneous understanding. One person sorts a range without the adjacent columns, another types over a formula, a third works in a copy they downloaded on Tuesday. The file does not break loudly - it just quietly stops being right, and the version everyone is referring to is "the one Mike sent".' },
    { type: 'h3', text: '2. Receive a fact from the field at the moment it happens' },
    { type: 'p', text: 'This is the real dividing line. A receipt at the supply house, hours clocked on site, a photo of a condition, a sub invoice arriving as a PDF - none of these can enter a spreadsheet without a person in an office retyping them later. Everything in your sheet is therefore as current as the last time somebody sat down with a pile.' },
    { type: 'h3', text: '3. Keep one fact in one place' },
    { type: 'p', text: 'A sub’s contract amount is in the budget tab, on the payment schedule, in the invoice tracker, and on the client billing sheet. Change it once and you have created three disagreements. The sheet cannot derive committed from contracts, actual from approved invoices, and revised contract from approved change orders - so all of those are maintained by a person, which means they are maintained until the week somebody is busy.' },
    { type: 'h3', text: '4. Be an audit record' },
    { type: 'p', text: 'Who changed that number, when, and from what? Version history exists, but reconstructing the state of a budget on a given date from it is a forensic exercise, not a lookup. When a change order is disputed or a lender wants to see draw support, this is the gap that costs real time.' },

    { type: 'callout', tone: 'warn', title: 'The single-owner risk', text: 'The most common serious version of this problem has nothing to do with features. One person built the workbook, only they understand the linked tabs, and the company cannot run a job without them. That is a business continuity risk with a software symptom, and it is the reason to move that most contractors do not say out loud.' },

    { type: 'h2', text: 'The threshold, honestly' },
    { type: 'compare', title: 'Which side of the line are you on', left: {
      label: 'A spreadsheet is still fine',
      items: [
        'One or two live jobs',
        'You self-perform most of the work',
        'Few subs, and you pay them on simple agreements',
        'You are the only person who needs the numbers',
        'Change orders are rare and small',
        'The record you would need in a dispute is short',
      ],
    }, right: {
      label: 'The sheet is now costing you',
      items: [
        'Several live jobs and subs billing against contracts',
        'Someone other than you needs the current numbers',
        'You cannot answer "what is committed" without opening a file and thinking',
        'Extras are frequent and are being reconstructed at month end',
        'Field information reaches the office late or not at all',
        'The whole thing depends on one person and one file',
      ],
    } },
    { type: 'p', text: 'Note that three of the six on the right are about other people. That is the pattern: spreadsheets scale with complexity far better than they scale with headcount.' },

    { type: 'h2', text: 'The cost of switching, stated plainly' },
    { type: 'list', items: [
      'Entering live jobs. Budget, awarded subs, costs to date, permits. An afternoon per job if the data is good, longer if it is not - and finding out that it is not is itself worth the exercise.',
      'Learning a structure that is not yours. Your categories will not map perfectly. Decide early whether to bend the tool or bend your habits, and be consistent.',
      'Getting the field to use it. This is the real cost and it is measured in weeks, not hours. One job and one foreman first.',
      'Losing flexibility. Some things your sheet does in thirty seconds will not be possible. Keep the sheet for those rather than pretending the loss is zero.',
    ] },
    { type: 'callout', tone: 'tip', title: 'Do not migrate your whole company', text: 'Pick one live job, ideally a messy one, and run it fully in the new system for a month while the sheet stays as a shadow. You get a genuine comparison, and if the tool is wrong for you, you have lost a month on one job rather than a quarter across the business.' },

    { type: 'h2', text: 'Keep the sheet where it earns its place' },
    { type: 'p', text: 'The best setup for most small GCs is not one or the other. Estimate in the spreadsheet, because that is where the sheet is unbeatable. Then let the accepted estimate become the budget in the system, and run the job - commitments, costs, billing, the field record - there. Keep a sheet for deal modelling and one-off questions.' },
    { type: 'p', text: 'The only rule that matters is that there is one book of record for money, and everybody knows which one it is. Two systems where either might be right is worse than either system alone.' },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'SyteNav is built assuming you already have a budget in a sheet: import it rather than retyping it, and quotes, sub invoices and inspector cards are scanned by AI rather than keyed in. Committed, actual and remaining are derived from contracts, approved invoices and approved change orders - the same calculation on the budget tab, the job summary and Master Money, so they cannot disagree. Anything in the total that is not on a row is listed with a way to file it. Job History records who changed what and when.' },
    { type: 'p', text: 'What it does not replace: your estimating workbook, your development model, and your accounting package. Estimating in particular is something we would rather you kept doing where you are good at it, and bring the result in.' },
  ],
  faqs: [
    { q: 'Can I keep using my estimating spreadsheet?', a: 'Yes, and most contractors should. Estimating is the one part of this workflow where a spreadsheet is genuinely the better tool. What you want is for the accepted estimate to become the job budget without being retyped.' },
    { q: 'Is Google Sheets or Excel better for construction?', a: 'Sheets for anything several people touch, because the collaboration and history are better out of the box. Excel for heavy modelling and large data. This choice matters far less than whether the file is the only record of what a job has committed.' },
    { q: 'What about the free construction budget templates online?', a: 'They are a fine starting structure and they will teach you what columns you need. What they cannot fix is that the numbers still have to be typed in by somebody who was not there when the cost happened.' },
    { q: 'We tried construction software before and went back to the spreadsheet. Why?', a: 'Nearly always one of two reasons: the field never adopted it, so the data went stale and the sheet stayed truer; or setting up in-progress jobs was so painful it never got finished. Both are worth asking about specifically before you try again - they are the questions that predict whether the second attempt works.' },
  ],
  related: ['construction-management-software-small-contractors', 'construction-job-cost-tracking', 'procore-alternatives-small-gcs'],
}
