import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'construction-invoice-verification',
  title: 'Construction invoice verification that stops subcontractor overbilling',
  cardTitle: 'How to stop subs from overbilling',
  metaTitle: 'Construction Invoice Verification: How to Stop Subcontractor Overbilling | SyteNav',
  description:
    'Construction invoice verification that catches overbilling before you pay: the four checks that matter, and why the invoice total is the weakest of them.',
  keyword: 'construction invoice verification',
  keywords: [
    'construction invoice verification', 'subcontractor overbilling', 'verify sub invoices',
    'how to stop subs overbilling', 'invoice audit construction', 'billed over contract',
    'front loading construction billing', 'check sub invoice against quote',
  ],
  category: 'billing',
  published: '2026-09-15',
  lede:
    'Almost nobody gets overbilled by an invoice that is obviously too big. You get overbilled by an invoice that is entirely reasonable, under the contract total, and includes one rate nobody ever agreed to.',
  takeaways: [
    'The total is the check everyone does and the weakest one. An invoice can be under contract and still wrong in three places.',
    'Check line rates against the quote, look for lines that are not on the quote at all, and check the running total across every invoice from that sub.',
    'Front-loaded progress billing is the most common form of overbilling and it is not fraud - it is cash flow. Verify percent complete against what is actually built.',
    'Do the check before approval, not before payment. Approval is the moment the cost becomes real.',
  ],
  blocks: [
    { type: 'h2', text: 'The four ways a sub invoice is wrong' },
    { type: 'p', text: 'In rough order of how often they cost money, and inverse order of how visible they are.' },
    { type: 'h3', text: '1. A rate nobody agreed to' },
    { type: 'p', text: 'The quote said $42 a linear foot. The invoice says $47. The quantity is right, the description is right, and the total is still under the contract, so nothing looks wrong. This is the single most expensive error in subcontractor billing because there is no way to catch it without going back to the quote line by line - which is exactly why it goes uncaught.' },
    { type: 'h3', text: '2. Work that is not on the quote at all' },
    { type: 'p', text: 'A line appears for something genuinely done, genuinely needed, and never priced - no change order behind it. Often this is honest: the sub did extra work at somebody’s request and is billing for it the only way they know. It still needs to be a change order, because otherwise it is an unapproved cost sitting inside an approved invoice, and your budget line takes the hit silently.' },
    { type: 'h3', text: '3. Billed past the contract' },
    { type: 'p', text: 'Each invoice is fine in isolation; the running total across all of them passes the contract amount. This is the check that needs a system, because nobody holds five invoices in their head. It is also the one clients and lenders will ask about at the worst moment.' },
    { type: 'h3', text: '4. Percent complete that is ahead of the work' },
    { type: 'p', text: 'The rough-in is billed at 80% and it is at 55%. Not usually deception - it is a sub funding their own payroll on a job where they are owed money elsewhere. It still means you are carrying their float, and if they walk or fold at 60%, you have paid for work you now have to buy twice.' },

    { type: 'callout', tone: 'warn', title: 'Why the total is the weakest check', text: 'An invoice whose total is under the contract feels safe, and it is the check almost everyone does in their head. All four errors above can happen on an invoice that passes it. If your verification stops at "is it under contract", you are checking for the one mistake nobody makes.' },

    { type: 'h2', text: 'The verification that actually works' },
    { type: 'p', text: 'Four checks, in this order, before approval. Together they take a couple of minutes on an invoice you have the paperwork for, and they catch essentially everything that is catchable.' },
    { type: 'steps', items: [
      'DOES IT ADD UP? Lines plus tax minus retainage should equal the total. A breakdown that does not reconcile is not detail, it is an invitation to trust something that is wrong - and the difference is where a quiet extra sits.',
      'DO THE RATES MATCH THE QUOTE? Line by line against the awarded quote or the priced contract. This is the check that finds money.',
      'IS EVERY LINE ON THE QUOTE? Anything that is not needs a change order behind it before it is approved, not after.',
      'DOES THE RUNNING TOTAL STILL FIT THE CONTRACT? This invoice plus everything already billed by this sub, against their contract as revised by approved change orders.',
      'IS THE PERCENT COMPLETE REAL? Compare it to the daily logs, the photos and the schedule. On progress billing this is the whole check.',
    ] },

    { type: 'callout', tone: 'tip', title: 'Never block a sub over this', text: 'A hard rule that refuses invoices simply pushes billing off the system and into email, where nothing is checked at all. A sub being owed money for genuine extra work is normal. The point of verification is that you see the discrepancy before you approve, not that the software argues with your trade partner.' },

    { type: 'h2', text: 'Front-loading, and how to handle it without a fight' },
    { type: 'p', text: 'Progress billing ahead of progress is endemic and mostly not malicious. The way to manage it is structural rather than confrontational.' },
    { type: 'list', items: [
      'Agree a schedule of values at award, with values that reflect real cost distribution. Mobilisation lines are where front-loading hides.',
      'Tie percent complete to something observable - units installed, floors complete, a milestone somebody can photograph - rather than a judgement.',
      'Hold retainage as agreed and do not release it early as a favour. It is the mechanism that makes the last 5% of a job get finished.',
      'Check the first invoice from every new sub properly, in full. What they learn from your first response sets the pattern for the whole job.',
      'When a line is ahead, say so plainly and adjust it. "I have got this at 55%, you have billed 80% - talk me through it" is a normal conversation, and it is much easier now than after you have paid it twice.',
    ] },

    { type: 'h2', text: 'Build it into approval, not into payment' },
    { type: 'p', text: 'The distinction matters more than it sounds. Approving an invoice is what makes the cost real in your job numbers - it is the moment your budget line moves, your committed figure becomes actual, and the amount becomes billable to your client with markup on it. Payment is just cash leaving later.' },
    { type: 'p', text: 'So the verification belongs at approval. An invoice approved wrong and caught at payment has already polluted every number downstream of it, including the client invoice you may have already sent.' },
    { type: 'compare', title: 'Two places to put the check', left: {
      label: 'Checking at payment',
      items: [
        'Cost is already in your job numbers',
        'May already be billed to the client',
        'Correction means voiding and reissuing documents',
        'The conversation with the sub happens after they expected the money',
      ],
    }, right: {
      label: 'Checking at approval',
      items: [
        'Nothing downstream has moved yet',
        'A discrepancy is a question, not a correction',
        'The sub can reissue cleanly',
        'Your client invoice is right the first time',
      ],
    } },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'Drop the PDF the sub emailed onto "Scan an invoice" and SyteNav reads it: who is billing, the amount, the date, the work, and the line breakdown with quantities and rates where the vendor printed them. It attaches the file at the same time and tries to match the invoice to a subcontract on the job and to a line on that sub’s payment schedule. Nothing is created until you save, and the form says plainly when the scan was unsure.' },
    { type: 'p', text: 'Then it does the comparisons. It checks the lines add up to the total and says exactly how far out they are if not. Where the sub’s contract has priced lines behind it - from an awarded quote or an accepted bid - it checks the invoice against them and flags three things: a line billed above the quoted rate, with both figures; a line that is not on the quote at all; and an invoice that takes the running total past the contract. The form also shows which budget line the money will land on, what is budgeted, what has been billed, and what is left.' },
    { type: 'p', text: 'It never blocks the invoice. It puts the discrepancy in front of you before you approve, which is the moment it is still a question.' },
  ],
  links: [
    { text: '"Scan an invoice"', href: '/ai' },
    { text: 'which budget line the money will land on, what is budgeted, what has been billed, and what is left', href: '/money' },
  ],
  faqs: [
    { q: 'How do I verify an invoice when the sub never gave a line-item quote?', a: 'You cannot, properly - which is the argument for insisting on priced lines at bid stage. In the meantime, verify against the schedule of values in their contract and against what is physically built. And make line pricing a condition of the next award: the cost of that conversation is one awkward email.' },
    { q: 'Is retainage the same as holding money back for a bad invoice?', a: 'No, and mixing them up causes disputes. Retainage is a contractual percentage held on all billing until completion. Disputing a line is a separate act with its own reason, and it should be communicated separately so the sub can correct the invoice rather than assume you are short-paying.' },
    { q: 'What if a sub bills for extra work that we did ask for?', a: 'Then it is a change order that never got written. Write it now, get it approved on your side, attach it to the right budget line and the sub’s contract, and let the invoice land against it. The point is not to refuse the money - it is that it stops being an unexplained overage in your numbers.' },
    { q: 'How much does overbilling actually cost a small GC?', a: 'It varies too much to put a number on honestly, and any published figure you see is somebody’s estimate. The useful measure is your own: take the last completed job, pull every sub invoice, and check the rates against the quotes. Whatever you find there is your annual number, multiplied by how many jobs you run.' },
  ],
  related: ['construction-invoice-approval', 'construction-job-cost-tracking', 'how-to-track-change-orders'],
}
