import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'construction-job-cost-tracking',
  title: 'Job cost tracking in real time',
  metaTitle: 'Construction Job Cost Tracking Software: Real-Time Job Costing | SyteNav',
  description:
    'What real-time job cost tracking takes: committed versus actual, the costs that never reach a budget line, and knowing where a job stands in time to act.',
  keyword: 'construction job cost tracking software',
  keywords: [
    'construction job cost tracking software', 'job costing construction', 'real time job costing',
    'committed cost construction', 'cost to complete', 'construction budget tracking',
    'job cost report', 'wip construction',
  ],
  category: 'billing',
  published: '2026-09-15',
  lede:
    'Job costing that arrives with the month-end accounts is history. Useful job costing answers one question while you can still do something about it: given what is committed and what is spent, how does this job finish?',
  takeaways: [
    'Committed is the number that makes costing real-time. Actual alone is always behind the work.',
    'Most job costing is wrong because of costs that never made it onto a line, not because of arithmetic.',
    'Every rollup that can drop a row owes you two things: the total, and the list of what is not on a row.',
    'A cost has to be recorded by whoever incurs it, at the moment it happens, or the data is always a week old.',
  ],
  blocks: [
    { type: 'h2', text: 'Four numbers, and only one of them is easy' },
    { type: 'p', text: 'Job costing in real time means knowing, per budget line and for the whole job:' },
    { type: 'list', items: [
      'BUDGETED - what you estimated, plus approved change orders. Easy, provided change orders actually reach the line.',
      'COMMITTED - what you have promised to pay: signed subcontracts, purchase commitments, equipment hire. This is the number that makes costing real-time, and the one most systems handle worst.',
      'ACTUAL - what has been approved as a real cost. Always behind the work, because invoices arrive after the work is done.',
      'REMAINING - budgeted less the greater of committed and actual, per line. The forecast.',
    ] },
    { type: 'p', text: 'A system that tracks only actual costs tells you what the job cost after it is too late to change it. The moment you award a sub for $180,000, that money is gone in every meaningful sense - it is a commitment against the budget even though no invoice exists. Costing that ignores commitments is a lagging indicator dressed as a dashboard.' },

    { type: 'callout', tone: 'warn', title: 'Count committed once, and only once', text: 'The classic double count: a signed subcontract for $180,000 AND a budget line marked committed for $180,000, added together as $360,000. The rule is that a budget line tied to a contract does not add on top of that contract - it is the same promise described twice. If your committed figure is roughly double what feels right, this is why.' },

    { type: 'h2', text: 'The costs that never make it onto a line' },
    { type: 'p', text: 'This is where job costing actually goes wrong. Not arithmetic - orphans. Money that is real, recorded somewhere, and attached to no budget line, so it counts in the job total and appears on no row. The rows do not add up to the headline and nobody can see why.' },
    { type: 'list', items: [
      'A sub invoice from a sub whose contract was never pointed at a budget line.',
      'An approved change order that names neither a line nor a contract.',
      'Material receipts photographed at the supply house and never assigned to a job.',
      'Equipment hire booked on a company card.',
      'Soft costs - permits, engineering, surveys - that everyone treats as overhead until they are 4% of the job.',
      'Your own labour, on a job where you did two weeks of the work yourself.',
    ] },
    { type: 'p', text: 'The fix is not discipline, it is visibility. Any rollup that can drop a row owes the screen two things: the total, and the list of what is in the total but not on a row, with a way to file each one. Without the list, a job that does not add up is a mystery; with it, it is a five-minute task.' },

    { type: 'h2', text: 'Capture has to happen where the cost happens' },
    { type: 'p', text: 'Every job cost system fails at the same place: somebody has to enter the data, and by default that somebody is in the office, working from a pile.' },
    { type: 'compare', title: 'Where each cost should be captured', left: {
      label: 'Captured at the source',
      items: [
        'Receipt photographed at the counter, assigned to the job there',
        'Hours clocked from the site, on the job',
        'Sub invoice scanned the day it arrives',
        'Change order raised when the ask happens',
      ],
    }, right: {
      label: 'Captured in the office, later',
      items: [
        'A shoebox of receipts at month end',
        'Hours reconstructed from memory on Friday',
        'Invoices entered when someone gets to them',
        'Extras written up at the end of the job',
      ],
    } },
    { type: 'p', text: 'The right column is not just slower. It is systematically less accurate, because reconstruction always rounds towards the story somebody remembers.' },

    { type: 'h2', text: 'Reading a job cost report properly' },
    { type: 'p', text: 'Three questions, in this order, on any line that looks wrong.' },
    { type: 'steps', items: [
      'IS THE BUDGET RIGHT? A line over budget right after a change order was approved usually means the change order raised the sub’s contract and not the line. The overage is the change order.',
      'IS THE COMMITMENT COUNTED ONCE? A line at double its expected commitment is usually a contract and a manual commitment describing the same money.',
      'IS THE WORK AHEAD OF THE BILLING, OR BEHIND IT? A line at 40% cost and 70% complete is good news; at 70% cost and 40% complete you have found the problem while there is still budget left to manage.',
    ] },
    { type: 'p', text: 'And for the whole job, the only forecast that matters: cost to complete. Committed plus actual plus what is genuinely still to buy. If your remaining figure is just budget minus spend, it is arithmetic, not a forecast - it assumes everything left costs exactly what you guessed months ago.' },

    { type: 'callout', tone: 'tip', title: 'Profit needs a number you actually gave it', text: 'A "projected profit" figure that falls back to cost plus your standard markup when nobody has entered a contract value is an invented number printed in green. Profit should only ever be shown against a revenue figure you supplied - a contract value, a sellout, or a markup on a cost-plus job. If the figure is missing, the honest answer is to show nothing.' },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'The budget tab first asks how the job pays you - cost-plus, fixed price, or building to sell - because that decides what the screen should be tracking. On cost-plus it tracks your markup and the fee actually earned, worked out invoice by invoice so anything billed at cost or given its own rate is respected. On fixed price or a spec build it asks for the contract value or the sellout and shows profit against budgeted cost and against actual spend.' },
    { type: 'p', text: 'Committed counts every signed subcontract plus anything committed on a line without a contract behind it, each counted once - a line tied to a contract does not add on top of it. The same figure appears on the budget tab, the job summary and Master Money, from one calculation. Approved change orders raise the line they belong to, shown as "incl. $X CO" with the original estimate kept underneath, and the increase is derived, so rejecting or deleting the change order takes it straight back out.' },
    { type: 'p', text: 'Costs arrive from where they happen: sub invoices scanned from the PDF and landed on the contract’s budget line, material receipts photographed in the field and assigned to a job, hours clocked from the site with a location check. Anything that ends up in the total without a row - unlinked change orders, unassigned materials, committed money with no line - is listed under "Not on a budget line" with a picker to file it.' },
    { type: 'p', text: 'What it does not do: it is not a WIP schedule or a percentage-of-completion revenue recognition engine for your accountant, it does not run payroll, and it does not model a development pro-forma. It keeps the construction side honest while the job is running.' },
  ],
  faqs: [
    { q: 'What is the difference between committed and actual cost?', a: 'Committed is money you have promised - a signed subcontract, a purchase order - whether or not anybody has billed you. Actual is cost that has been invoiced and approved. Committed tells you where the job is heading; actual tells you where it has been.' },
    { q: 'How often should job costs be reviewed?', a: 'Weekly for live jobs, and it should take minutes rather than an afternoon. If reviewing costs requires assembling a report, it will happen monthly at best, which is one month of decisions made without it.' },
    { q: 'Do I need job costing software, or will a spreadsheet do?', a: 'A spreadsheet handles the arithmetic perfectly well. What it cannot do is receive a cost from the field at the moment it is incurred, and that is the actual constraint - a perfect model fed a week late is still a week late.' },
    { q: 'How do I account for my own time on a job?', a: 'Put it on the budget as a line and clock against it, or accept that your labour is overhead and be consistent. What you must not do is leave it out of the job and then compare the margin to a job where you did no work yourself - those two numbers are not comparable and one of them is flattering you.' },
  ],
  related: ['construction-invoice-verification', 'construction-spreadsheet-vs-software', 'construction-invoice-approval'],
}
