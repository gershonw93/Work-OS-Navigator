import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'how-to-track-change-orders',
  title: 'How to track change orders without losing money',
  metaTitle: 'How to Track Change Orders Without Losing Money | SyteNav',
  description:
    'A practical system for tracking change orders: what to capture, when to price it, how to get approval that counts, and how to make the extra reach the budget.',
  keyword: 'how to track change orders',
  keywords: [
    'how to track change orders', 'change order tracking', 'change order log',
    'construction change order process', 'track change orders spreadsheet',
    'change order approval', 'unapproved change orders', 'scope creep construction',
  ],
  category: 'change-orders',
  published: '2026-09-15',
  lede:
    'Change orders are not lost in the paperwork. They are lost in the twenty minutes between somebody saying "while you are here, can you also" and anybody writing it down. Everything after that is recovery.',
  takeaways: [
    'Capture at the moment of the ask, not at the end of the week. A note with a date and a photo beats a perfect form written from memory.',
    'Price it before you build it. Work performed before a number exists is work you will negotiate for, not bill for.',
    'Approval has to be written and it has to name an amount. A nod on site is a conversation, not an agreement.',
    'The extra must land in three places: the client contract value, the budget line, and the sub contract if a sub is doing the work. Miss the budget line and your job goes red for the wrong reason.',
  ],
  blocks: [
    { type: 'h2', text: 'Where the money actually goes' },
    { type: 'p', text: 'Ask a contractor what change orders cost them and you get a story about a client who would not pay. Look at the records and it is usually one of these four, none of which is about the client being difficult.' },
    { type: 'list', items: [
      'NEVER CAPTURED. The ask happened on site, the work got done, and nothing was written. There is nothing to bill and nothing to argue with.',
      'CAPTURED BUT NEVER PRICED. It is on a list as "extra tile work, TBC". Six weeks later nobody remembers the scope well enough to price it honestly, so it gets rounded down or dropped.',
      'PRICED BUT NEVER APPROVED. The number exists in an email. The client never said yes in writing and the work went ahead anyway, which turns an invoice into a negotiation.',
      'APPROVED BUT NEVER FLOWED THROUGH. Signed, agreed, and still not on the budget line it belongs to - so the line reads over budget, the sub contract reads over-billed, and the job’s margin is wrong in your own reporting.',
    ] },
    { type: 'p', text: 'The fourth one is the quiet killer, because everything looks handled. The client is billed, the money arrives, and your own numbers still say the electrical line blew its budget by eleven thousand dollars - so the next job gets estimated off a figure that was never true.' },

    { type: 'h2', text: 'Capture at the moment of the ask' },
    { type: 'p', text: 'The only reliable capture is the one that happens while somebody is standing there. It does not have to be a form. It has to have four things: what was asked, who asked, the date, and a photo of the condition if there is one.' },
    { type: 'steps', items: [
      'The moment the ask happens, write it down on the job - not in a personal notebook, not in a text thread.',
      'Photograph what is there now. On a dispute six months later, the before photo does more work than the paragraph.',
      'Say out loud, then and there: "that is outside the contract, I will price it and send it over." This one sentence prevents most of the arguments that follow.',
      'Get it priced within a day or two, while the scope is still fresh and before the trade has moved on.',
      'Send the price for written approval and do not start until it comes back.',
    ] },
    { type: 'callout', tone: 'tip', title: 'The sentence that saves the invoice', text: '"Happy to do it - that is extra to the contract, I will get you a number today." Said on site, in front of a witness, it changes the default from "included" to "extra" for everything that follows. Most disputed change orders were never verbally framed as changes at the time.' },

    { type: 'h2', text: 'Price it while you can still say no' },
    { type: 'p', text: 'A change order priced after the work is done is not a price, it is an invoice with a story attached. Before the work starts you have leverage and the client has a choice, which is exactly what makes the number credible. After it is built, you are asking somebody to pay for something they already have.' },
    { type: 'p', text: 'Price the whole impact, not just the labour and materials: the trade that has to come back a second time, the two days the schedule moves, the inspection that has to be re-booked. Those are real costs that are invisible on a line-item quote, and they are the ones that turn a "small" change order into a loss.' },

    { type: 'h2', text: 'Approval that counts' },
    { type: 'p', text: 'Whatever your contract says about written change orders, what protects you in practice is a record that shows three things together: an amount, a scope, and an affirmative response from somebody with authority. An email reply saying "ok go ahead" under a quoted number does that. A signature on a form does it better. A verbal yes on site does not do it at all, however sincere it was.' },
    { type: 'p', text: 'Two practical rules. First, the approval must name the amount - "approved" under an email thread with three numbers in it is ambiguous by design. Second, approval and the record of the work are different acts: recording that a change happened is not the same as the client accepting it, and a system that collapses them into one step will eventually book an agreement nobody made.' },

    { type: 'h2', text: 'Make it flow through to the money' },
    { type: 'p', text: 'This is the step that spreadsheets almost never get right, because it is three edits in three places and a person has to remember all of them.' },
    { type: 'compare', title: 'An approved change order has to move', left: {
      label: 'What usually happens',
      items: [
        'Added to a change order log',
        'Invoiced to the client',
        'Budget line untouched, so the line shows over budget',
        'Sub contract untouched, so their next bill looks like overbilling',
        'Job margin quietly wrong in your own reports',
      ],
    }, right: {
      label: 'What has to happen',
      items: [
        'Client contract value goes up by the approved amount',
        'The budget line it belongs to goes up by its share',
        'The sub’s contract goes up if the sub is doing the work',
        'The extra becomes billable on the next client invoice',
        'Reverse all of it if the change order is rejected or withdrawn',
      ],
    } },
    { type: 'p', text: 'The reversal half matters as much as the addition. A change order that is approved, folded into a budget, and then cancelled has to take its money back out of every one of those places. Anywhere this is done by hand, it is done once and remembered as done forever.' },

    { type: 'callout', tone: 'warn', title: 'The line that goes red at the worst moment', text: 'A common pattern: the client approves a $12,000 extra on the electrical, you raise the sub’s contract, and the budget line stays at its original figure. The moment the extra is approved and funded, the budget tab shows the line over budget - so the report says you are losing money on the exact change that made you money. If your system derives the budget from approved change orders, this cannot happen.' },

    { type: 'h2', text: 'A tracking system that works, with or without software' },
    { type: 'p', text: 'If you are doing this on paper or in a sheet, these are the columns that earn their place. Anything else is decoration.' },
    { type: 'list', items: [
      'Number and date raised - sequential, never reused.',
      'Who requested it, by name.',
      'Scope, in one sentence a stranger could understand a year later.',
      'Amount, and whether it is an addition or a deduction.',
      'Status: pending, approved, rejected, withdrawn - with the date it changed.',
      'Who approved it, and where that approval is recorded.',
      'The budget line it raises.',
      'The sub contract it raises, if any.',
      'The client invoice it went out on.',
    ] },
    { type: 'p', text: 'The last three are what turn a log into a control. A log with only the first six tells you what was agreed; it does not tell you whether the money ever arrived where it was supposed to go.' },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'In SyteNav a change order carries the budget line it raises and, where relevant, the sub contract it belongs to. Approving it adds the amount to that line and folds it into that sub’s contract; un-approving, rejecting or deleting it takes the amount straight back out, because the budget figure is derived from the change order rather than copied from it. There is nothing to reverse by hand and no way to count it twice.' },
    { type: 'p', text: 'An approved change order that names neither a line nor a contract still counts in the job total, and the budget tab lists it under "Not on a budget line" with a picker to file it - because money in a total that is not on a row is exactly how a job stops adding up. And when a pay application refuses a line for being billed past its scheduled value, the words "change order" in that message open the form with the overage and the right line already filled in.' },
  ],
  faqs: [
    { q: 'Can I bill for a change order that was only approved verbally?', a: 'You can try, and on a good relationship you will often be paid. What you cannot do is rely on it. If the work is already done and the only record is a conversation, write up what was agreed, send it with the invoice, and ask for confirmation in reply - a written acknowledgement after the fact is weaker than one before, but it is far better than nothing.' },
    { q: 'What if the client keeps asking for small extras?', a: 'Price and log every one of them, however small, and send a running total with each monthly invoice. The problem with small extras is never any individual one - it is that thirty of them arrive as a single surprise at the end. A running total makes the pattern visible while the client can still choose to stop.' },
    { q: 'Should a change order be its own budget line or attached to an existing one?', a: 'Attach it to the line the work belongs to whenever you can, so the line reflects the real scope and the pay application scheduled value moves with it. Keep separate lines for owner-side extras that genuinely belong to no trade.' },
    { q: 'How do I handle a deduction?', a: 'The same way, as a negative amount against the line it reduces. Deductions are where informal tracking fails most often, because nobody chases the paperwork on money coming off - and then the final account does not reconcile and the client has found the discrepancy first.' },
  ],
  related: ['change-order-documentation', 'change-order-management-software', 'construction-job-cost-tracking'],
}
