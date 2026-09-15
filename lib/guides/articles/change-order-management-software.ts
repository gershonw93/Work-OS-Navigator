import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'change-order-management-software',
  title: 'Change order management software for GCs: what to look for',
  cardTitle: 'Change order management software for general contractors',
  metaTitle: 'Change Order Management Software for General Contractors | SyteNav',
  description:
    "A buyer's guide to change order management software for general contractors: what it should capture, how approvals should update job costs, and what to test before you buy.",
  keyword: 'change order management software',
  keywords: [
    'change order management software', 'change order software', 'change order system',
    'change order software for general contractors', 'construction change order software',
    'change order approval workflow', 'change order tracking software', 'co log software',
  ],
  category: 'change-orders',
  published: '2026-09-15',
  lede:
    'Every product in this category will show you a change order form. The form is not the problem. What separates them is whether approving one actually moves the budget line, the sub’s contract and the next client invoice - or whether it just turns a status field green while your job report still says you are over budget.',
  takeaways: [
    'Buy on what approval DOES, not on what the form captures. A log that does not move the money is a spreadsheet with a login.',
    'The reversal matters as much as the addition: rejecting or withdrawing an approved change order has to take the money back out of every place it went.',
    'Capture has to happen on site, from a phone, with a photo - because the expensive change orders are the ones nobody wrote down at the time.',
    'Test it on a real job with a real extra before you buy. Six minutes of demo answers more than any feature grid.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is written for the general contractor doing the buying - the person who approves extras, carries the cost if one is missed, and has to explain the job’s margin at the end. It is published by SyteNav, which is one of the products in this category; the buyer’s checklist below is the one we would hand somebody who had never heard of us.' },

    { type: 'h2', text: 'What change order management software is actually for' },
    { type: 'p', text: 'Change orders leak money in four places, and only one of them is a paperwork problem. Any product you are evaluating should be scored on how many of the four it closes.' },
    { type: 'list', items: [
      'NEVER CAPTURED. The ask happened on site, the work got done, nothing was written. There is nothing to bill and nothing to argue with. This is a capture problem, and it is solved on a phone or not at all.',
      'CAPTURED BUT NEVER PRICED. It sits on a list as "extra tile work, TBC" until nobody remembers the scope well enough to price it honestly.',
      'PRICED BUT NEVER APPROVED. The number exists in an email, the client never said yes in writing, and the work went ahead anyway - which turns your invoice into a negotiation.',
      'APPROVED BUT NEVER FLOWED THROUGH. Signed, agreed, billed, and still not on the budget line it belongs to. This is the one that makes your own reporting lie to you, and it is the one a feature grid will never show you.',
    ] },
    { type: 'p', text: 'Most products handle the middle two. The first and the last are where they genuinely differ, and they are the two that cost you money.' },

    { type: 'h2', text: 'What it has to capture' },
    { type: 'p', text: 'Short list. A form with thirty fields is a form that gets filled in at the end of the month from memory, which defeats the point.' },
    { type: 'list', items: [
      'WHO REQUESTED IT, by name, and on what date. "The client asked for" is not attribution, and attribution is what makes a record specific enough to confirm or deny.',
      'THE SCOPE, in a sentence a stranger could understand a year from now.',
      'THE AMOUNT, positive or negative. Deductions are where informal tracking fails most often, because nobody chases the paperwork on money coming off.',
      'THE REASON - a design change, a field condition, an owner request. This is what you will sort by when you are working out why a job ran over.',
      'THE STATUS AND ITS HISTORY: raised, priced, approved, rejected, withdrawn, each with a date and a name against it.',
      'THE EVIDENCE: the photo of the condition, and the approval itself.',
    ] },

    { type: 'h2', text: 'Approval has to move the money, not just the status' },
    { type: 'p', text: 'This is the question that should decide your purchase, and it is worth asking in exactly these words during a demo: when I approve this, what changes?' },
    { type: 'compare', title: 'Two products that both have a change order module', left: {
      label: 'A log with a status field',
      items: [
        'The change order appears on a list',
        'The budget line is untouched, so it now reads over budget',
        'The sub’s contract is untouched, so their next bill looks like overbilling',
        'Somebody remembers to bill it, or does not',
        'Job margin is wrong in your own reporting, quietly',
      ],
    }, right: {
      label: 'A system that controls the money',
      items: [
        'The client contract value goes up by the approved amount',
        'The budget line it belongs to goes up by its share',
        'The sub’s contract goes up where the sub is doing the work',
        'The extra becomes billable on the next client invoice, without retyping',
        'Rejecting or deleting it takes all of that straight back out',
      ],
    } },
    { type: 'callout', tone: 'warn', title: 'The line that goes red at the worst possible moment', text: 'The pattern to test for: the client approves a $12,000 electrical extra, the system raises the sub’s contract, and the budget line stays at its original figure. The moment the change is approved and funded, your budget tab shows that line over budget - so the report says you are losing money on the exact change that made you money. If the budget figure is DERIVED from approved change orders rather than copied across by a person, this cannot happen.' },

    { type: 'h2', text: 'The reversal is half the feature' },
    { type: 'p', text: 'Ask what happens when an approved change order is rejected, deleted or reset to pending. In a system that copies the amount into the budget on approval, the reversal is a second manual edit - one that gets done once and remembered as done for ever. In a system that derives the figure, there is nothing to undo and no way to count it twice.' },
    { type: 'p', text: 'This is a good proxy for the quality of the whole product. A vendor who can answer the reversal question crisply has thought about change orders as money; one who has to check has built a form.' },

    { type: 'h2', text: 'Capture on site, or it will not happen' },
    { type: 'p', text: 'The expensive change orders are not the disputed ones. They are the ones nobody wrote down, because the ask happened at eleven in the morning with a trade waiting and the person hearing it had a phone, not a laptop.' },
    { type: 'p', text: 'So look at the phone experience specifically, in the hands of somebody untrained: can a site manager raise a change order with a photo attached, in under a minute, standing where the work is? And can they do it against the right job without navigating a project hierarchy? If capture needs the office, your process starts a day late, which is the day the scope was still fresh.' },
    { type: 'callout', tone: 'tip', title: 'A good demo question', text: '"Show me how the person on site raises one." If the answer is a walkthrough on a desktop, you are buying an office system, and the four leaks above start with the one that office systems cannot reach.' },

    { type: 'h2', text: 'What to test before you buy' },
    { type: 'p', text: 'Six steps, one real change order, on a job that is already running. It takes about twenty minutes and it tells you more than any comparison table.' },
    { type: 'steps', items: [
      'Raise a change order from a phone, with a photo, as a site manager would - unassisted.',
      'Price it, attach it to a budget line, and attach it to the subcontract of the trade doing the work.',
      'Record the approval, including who approved it and the amount they approved.',
      'Open the budget and confirm the line went up, the sub’s contract went up, and nothing was double counted.',
      'Raise the client invoice and confirm the extra is on it, at the right number, without retyping.',
      'Now reject the change order, and watch all of that come back out.',
    ] },
    { type: 'checklist', title: 'Buyer’s checklist', items: [
      'Capture from a phone, on site, with photos, by whoever is standing there.',
      'Requester, scope, amount, reason and status history, each with a name and a date.',
      'Approval raises the budget line it is attached to.',
      'Approval raises the subcontract where a sub is doing the work, without double counting it in the job total.',
      'Approved extras become billable to the client without being retyped.',
      'Rejection and withdrawal reverse everything, exactly once.',
      'An approved change order that is attached to nothing is SHOWN to you, not silently dropped from the rows.',
      'A permanent record of who asked, who approved, and when - kept even when a request is withdrawn.',
      'Deductions handled the same way as additions.',
      'Your subs and your client can take part without accounts.',
    ] },

    { type: 'h2', text: 'Where the products in this category differ' },
    { type: 'list', items: [
      'GENERIC PROJECT MANAGEMENT TOOLS bolt a change order onto a task list. They capture well and connect to no money at all, so the fourth leak stays wide open.',
      'ACCOUNTING-FIRST SYSTEMS get the flow-through right and are usually weakest at capture - the site cannot reach them, so extras arrive late and second-hand.',
      'ENTERPRISE CONSTRUCTION PLATFORMS do both properly, with the configuration burden and the annual commitment that go with them. If you are running concurrent large commercial jobs, that is the right trade.',
      'LIGHTER FIELD-FIRST SYSTEMS aim at the small-to-mid GC: capture on a phone, money in the same system, less to configure, and a narrower ceiling. Check the money half carefully, because it is the half that is usually thin.',
    ] },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'A change order in SyteNav carries a title, an amount that can be positive or negative, a reason, who requested it, and the budget line and subcontract it raises. Approving it adds the amount to that line and folds it into that sub’s contract; un-approving, rejecting or deleting it takes the amount straight back out, because the budget figure is derived from the change order rather than copied from it. There is nothing to reverse by hand and no way to count it twice. An approved change order attached to neither a line nor a contract still counts in the job total, so it is listed under "Not on a budget line" with a picker to file it - money in a total that is not on a row is exactly how a job stops adding up.' },
    { type: 'p', text: 'The field side is on the same record: daily logs with photos filed to the job, a time clock with a location check, and tasks - so the backup for an extra is being created as the work happens rather than reconstructed afterwards. On a job where you are the one under contract rather than the one awarding it, the budget screen changes to match: a contract amount, change orders against it, and billing that draws from both. Job Money shows what a job is contracted for, what has been billed, and what is left.' },
    { type: 'p', text: 'What it does not do: it will not route an approval through three levels of your client’s organisation, it does not produce a formal notice under your contract’s change clause, and it cannot make a client answer. It makes the paperwork exist on time, with the photos attached, and makes sure the money lands where it belongs.' },
  ],
  links: [
    { text: 'change orders against it, and billing that draws from both', href: '/money' },
    { text: 'daily logs with photos filed to the job, a time clock with a location check, and tasks', href: '/mobile' },
    { text: 'Job Money', href: '/money' },
  ],
  faqs: [
    { q: 'Do we need change order software, or will our project management tool do?', a: 'Ask your current tool one question: when a change order is approved, does the budget line move? If the answer is no, the tool is a log, and the leak it leaves open is the expensive one - your own job reporting is wrong for the rest of the build, and you will estimate the next job off it.' },
    { q: 'Should change orders raise the subcontract automatically?', a: 'Where the sub is doing the changed work, yes - otherwise their next invoice reads as billing past contract and somebody spends an afternoon working out why. What matters is that it is counted once: a change order folded into a sub’s contract must not also be added on top of the contract total.' },
    { q: 'How should software handle a change order the client rejects?', a: 'Keep it, with the rejection recorded and dated. A rejected change order is the record of why that work was not done, and deleting it loses the one document that answers the question later. It should also have no effect on any budget or contract figure.' },
    { q: 'What about extras that belong to no trade?', a: 'They are real and they need somewhere to live - owner-side allowances, permit fees, a survey. They should count in the job total AND be visible as unattached, with a way to file them. A system that silently keeps them out of the rows gives you a budget whose lines do not add up to its own headline.' },
  ],
  related: ['how-to-track-change-orders', 'change-order-documentation', 'construction-invoice-approval'],
}
