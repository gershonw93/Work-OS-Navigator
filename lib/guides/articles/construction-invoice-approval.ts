import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'construction-invoice-approval',
  title: 'Construction invoice approval workflow',
  metaTitle: 'Construction Invoice Approval Workflow (With Template) | SyteNav',
  description:
    'A construction invoice approval workflow that scales past one person: who checks what, what approval means in your job numbers, and where it jams.',
  keyword: 'construction invoice approval',
  keywords: [
    'construction invoice approval', 'invoice approval workflow construction',
    'subcontractor invoice approval process', 'AP workflow construction',
    'approve sub invoices', 'three way match construction', 'invoice approval template',
  ],
  category: 'billing',
  published: '2026-09-15',
  lede:
    'Most construction invoice approval processes are one person and a memory. That works until it does not - and what it fails at is not paying twice, it is paying things that were never checked against anything.',
  takeaways: [
    'Approval is a decision about the work, not about the cash. Separate it from payment and the whole process gets clearer.',
    'Two roles, minimum: somebody who confirms the work happened, and somebody who confirms the money is right.',
    'Define what approval MEANS in your numbers - usually the point where committed becomes actual - and everybody’s incentives fall into place.',
    'The bottleneck is almost always one person who has to be asked, not the number of steps.',
  ],
  blocks: [
    { type: 'h2', text: 'What approval actually means' },
    { type: 'p', text: 'Before designing a workflow, decide what pressing "approve" does. In most construction systems it is the moment a cost stops being a promise and becomes real: the budget line moves from committed to actual, the amount becomes billable to your client with markup, and your job margin changes. Payment is a later, separate act about cash.' },
    { type: 'p', text: 'This distinction does a lot of work. It explains why approval needs a check on the work and not just on the arithmetic, why an approved-then-wrong invoice is expensive to unwind, and why the person who approves should not be the person who chases the payment run.' },

    { type: 'h2', text: 'The two questions, and who answers them' },
    { type: 'compare', title: 'Every invoice needs both', left: {
      label: 'Did the work happen?',
      items: [
        'Answered by whoever was on site',
        'Is the percent complete real?',
        'Was this scope actually performed?',
        'Was anything here never asked for?',
        'Evidence: daily logs, photos, the schedule',
      ],
    }, right: {
      label: 'Is the money right?',
      items: [
        'Answered by whoever holds the budget',
        'Do the rates match the quote?',
        'Does the running total still fit the contract?',
        'Is there a change order behind anything extra?',
        'Which budget line does it land on?',
      ],
    } },
    { type: 'p', text: 'In a small company one person answers both, and that is fine - what matters is that both questions are asked. The failure mode is not "we only have one approver", it is "we only ever asked one of the two questions".' },

    { type: 'h2', text: 'A workflow that fits a small GC' },
    { type: 'steps', items: [
      'RECEIVE IT INTO ONE PLACE. Not an inbox. Every invoice lands on the job it belongs to, with the original PDF attached, the moment it arrives.',
      'MATCH IT. To the sub, to their contract, and to the budget line. An invoice that cannot be matched is the first thing to resolve, because it is usually a sub who was never properly awarded or a line nobody created.',
      'CHECK THE FIELD SIDE. Confirm the work. On progress billing, against logs and photos, not against how the job feels.',
      'CHECK THE MONEY SIDE. Rates against the quote, lines against the scope, running total against the revised contract.',
      'APPROVE, QUERY OR REJECT - with a reason recorded on the invoice, not sent in a separate email that nobody else will ever see.',
      'SCHEDULE PAYMENT SEPARATELY, when you know you have the funds and any lien waiver you require is in hand.',
      'BILL THE CLIENT from the approved cost, with markup applied, rather than retyping the amount into a new document.',
    ] },
    { type: 'callout', tone: 'tip', title: 'Set a query deadline for yourself', text: 'Decide how long an invoice may sit unanswered - three working days is a reasonable target - and treat a breach as your failure, not the sub’s. Subs price future work partly on how you pay. An approval process with a known clock is worth real money at bid time.' },

    { type: 'h2', text: 'The lien waiver question' },
    { type: 'p', text: 'If you require waivers, decide where they sit and be consistent. Conditional on payment, attached at approval, or unconditional on receipt of funds - the choice depends on your state and your contracts, and you should take advice on it. What causes trouble is having no rule, so waivers are chased on some invoices and forgotten on others, and the gap is only discovered during a closeout or a title review.' },

    { type: 'h2', text: 'Where the bottleneck really is' },
    { type: 'p', text: 'Every stuck approval process looks like a queue problem and is almost always an access problem. One person can answer the question, and reaching them requires finding them.' },
    { type: 'list', items: [
      'The approver is on site all day and the invoices are on a desktop in the office. Fix: approval from a phone.',
      'The field evidence lives somewhere the approver cannot see, so confirming progress means a phone call. Fix: logs and photos on the same job record as the invoice.',
      'The invoice arrived as an email attachment to one person. Fix: every invoice on the job, not in an inbox.',
      'Nobody knows which budget line it hits, so it waits for whoever does. Fix: the contract carries the line, so the invoice inherits it.',
      'There is a query and the sub was told by phone, so nothing is recorded and it is asked again next week. Fix: the reason lives on the invoice.',
    ] },

    { type: 'h2', text: 'An approval checklist you can copy' },
    { type: 'checklist', title: 'Before approving any subcontractor invoice', items: [
      'The original document is attached to the invoice record.',
      'It is matched to a subcontract and a budget line.',
      'Lines, tax and retainage add up to the invoice total.',
      'Rates match the awarded quote or priced contract.',
      'Every line is within scope, or has an approved change order behind it.',
      'The running total across all their invoices is within the revised contract.',
      'Progress claimed is consistent with logs, photos or the schedule.',
      'Retainage is withheld at the agreed rate.',
      'Any required lien waiver is in hand or accounted for.',
      'Any query is recorded on the invoice with a reason.',
    ] },

    { type: 'callout', tone: 'warn', title: 'Approve wrong and it travels', text: 'An approved invoice moves the budget, changes the margin, and becomes billable to your client. If you have already raised the client invoice, correcting it means voiding a document your client is holding and issuing a new one. That is the correct way to fix it - but it is a great deal of work to avoid by spending two minutes before approval.' },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'Invoices live on the job, under Financials, and money out is kept strictly separate from money in - a sub’s bill can never turn up as client billing. Scanning the PDF fills the form, attaches the file, matches the sub and the payment schedule line, and shows which budget line the money will land on with what is budgeted, billed and remaining on it. If the sub has no budget line at all, it says the invoice will not show up on the budget and offers to create the line right there.' },
    { type: 'p', text: 'Approving is what moves the budget - uploading the document alone does not - and once an invoice is approved a "Bill the client" button appears on it showing what the client owes with your markup applied, which opens a client invoice with that cost already on it. A cost can only ever appear on one client invoice, so the same bill cannot go out twice. Markup is set per invoice, or inherited from the budget line, or from the project rate, most specific first.' },
    { type: 'p', text: 'What it does not do: it is not an accounts payable system with multi-level approval routing and delegation rules, and it does not run your payment run. It pushes one way into QuickBooks Online, where the money side is settled.' },
  ],
  links: [
    { text: 'Scanning the PDF fills the form', href: '/ai' },
    { text: 'shows which budget line the money will land on with what is budgeted, billed and remaining on it', href: '/money' },
    { text: 'Approving is what moves the budget', href: '/money' },
  ],
  faqs: [
    { q: 'Do we need a formal three-way match in construction?', a: 'Not in the purchase-order sense, for most small GCs - construction’s equivalent is contract, progress and invoice. Match the invoice to the subcontract, confirm the progress from the field record, and check the arithmetic. That is the same control with different documents.' },
    { q: 'Who should approve invoices if the owner is the only one who knows the job?', a: 'The owner, for now - but write the checklist down anyway. The checklist is the thing that transfers when you hire a project manager, and a process that exists only in one head is the reason many small contractors cannot delegate the office work.' },
    { q: 'Should approval be blocked until compliance documents are current?', a: 'Blocking approval is heavy-handed; blocking payment is common practice and easier to defend. Either way, decide the rule once and apply it to every sub, because selective enforcement of insurance requirements is a problem of its own.' },
    { q: 'How do we handle an invoice we partly disagree with?', a: 'Approve what is agreed and query the rest, with the reason recorded on the invoice, or return the whole thing for reissue. Whichever you choose, do it the same way every time - partial approvals with no written reason are the origin of most year-end reconciliation arguments.' },
  ],
  related: ['construction-invoice-verification', 'construction-job-cost-tracking', 'change-order-management-software'],
}
