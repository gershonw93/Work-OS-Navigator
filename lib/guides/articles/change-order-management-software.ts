import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'change-order-management-software',
  title: 'Change order management for subcontractors',
  metaTitle: 'Change Order Management for Subcontractors | SyteNav',
  description:
    'Change order management for subcontractors: getting extra work authorised by a GC, what to send, tracking it against your contract, and getting paid for it.',
  keyword: 'change order management software',
  keywords: [
    'change order management software', 'subcontractor change orders', 'change order software',
    'sub change order process', 'getting paid for extra work', 'T&M tickets',
    'time and material tickets', 'change order tracking subcontractor',
  ],
  category: 'change-orders',
  published: '2026-09-15',
  lede:
    'A subcontractor’s change order problem is different from a GC’s. You are not deciding whether to approve the extra - you are trying to get somebody else to, usually while your crew is already standing on the work.',
  takeaways: [
    'Your leverage is highest before the crew does the work and drops to almost nothing afterwards. Every part of your process should exploit that window.',
    'A signed T&M ticket at the end of each day is the single highest-value habit in this article.',
    'Track extras against the contract you signed, not against a general sense of how the job is going. You need to know your revised contract total at any moment.',
    'The GC’s change order number is not your change order number. Keep your own, and map between them.',
  ],
  blocks: [
    { type: 'h2', text: 'Why subs lose more on extras than GCs do' },
    { type: 'p', text: 'Three structural reasons, none of which are about being disorganised.' },
    { type: 'list', items: [
      'YOU ARE ON SITE AND THEY ARE NOT. The person asking for the extra is a superintendent with no authority to commit money, and the person with that authority is in an office. "Just do it, we will sort the paperwork" is a genuine instruction from somebody who cannot actually give it.',
      'STOPPING COSTS YOU MORE THAN CONTINUING. Pulling a crew off and remobilising is expensive, so the rational move in the moment is nearly always to keep working. Everybody knows this, including the GC.',
      'YOUR CHANGE ORDER IS THEIR COST. A GC passing an extra to an owner has an incentive to get it approved. A GC absorbing an extra does not, and your paperwork sits in the pile accordingly.',
    ] },
    { type: 'p', text: 'None of this is fixed by being more insistent later. It is fixed by what you do in the first hour.' },

    { type: 'h2', text: 'The first hour' },
    { type: 'steps', items: [
      'Stop and name it. "That is not in our scope - I will need it authorised." Said once, politely, on the spot. You are not refusing; you are changing what the work is called.',
      'Photograph the condition before you touch it, with the date on the record.',
      'Write it up the same day: what was asked, by whom, what it will take, and what it will cost. One paragraph and a number beats a formal document that arrives next week.',
      'Send it to whoever can actually authorise it, and copy the superintendent who asked. The copy is not politics - it is what stops the office saying nobody mentioned it.',
      'If they tell you to proceed on time and material, get a ticket signed at the end of every single day. Not at the end of the week.',
    ] },
    { type: 'callout', tone: 'tip', title: 'The daily signed ticket', text: 'Hours, names, equipment, materials, the work done, signed by whoever is on site for the GC. It does not commit them to a price - it commits them to the facts, and the facts are what you would otherwise be arguing about. A stack of signed daily tickets settles nearly every T&M dispute before it starts.' },

    { type: 'h2', text: 'What to send, and what to keep' },
    { type: 'p', text: 'A change order request that gets approved quickly usually has the same five things, and it is short.' },
    { type: 'list', items: [
      'The request: who asked, when, and in what form - an RFI response, a drawing revision, a verbal instruction on site.',
      'The scope, in plain language, with the drawing or spec reference if there is one.',
      'The price, broken into labour, material, equipment and any markup, so it can be checked rather than believed.',
      'The schedule impact, stated even when it is zero. Silence here gets read as "no impact" and you cannot claim it later.',
      'What you need back, and by when, to avoid delaying the work.',
    ] },
    { type: 'p', text: 'Keep, on your side: the photos, the signed tickets, the email thread, and a note of the verbal instruction with the name of who gave it. Most subcontractor claims are decided on the quality of this file and nothing else.' },

    { type: 'h2', text: 'Tracking it against your contract' },
    { type: 'p', text: 'At any moment on a job, you should be able to answer four questions in under a minute.' },
    { type: 'checklist', title: 'Your position on any job, at any time', items: [
      'What is my original contract amount?',
      'What has been approved in changes, and what is my revised contract total?',
      'What have I submitted that is still pending, and how long has it been sitting?',
      'What have I billed to date, and how much of my revised contract is left to bill?',
    ] },
    { type: 'p', text: 'If any of those takes a phone call to your bookkeeper, you are running the job on hope. The pending figure in particular is the one that matters: work performed against unapproved changes is money you have spent and might not recover, and it is almost never on anybody’s dashboard.' },

    { type: 'compare', title: 'Two ways to run extras', left: {
      label: 'The expensive way',
      items: [
        'Verbal instruction, work proceeds',
        'Write-up at the end of the month',
        'One combined invoice for "extras"',
        'GC asks for backup you do not have',
        'Settled at a discount to close the job out',
      ],
    }, right: {
      label: 'The way that gets paid',
      items: [
        'Named as extra on the spot, in front of the person asking',
        'Written up the same day with a number',
        'Authorisation in writing before the crew starts, or signed daily tickets if not',
        'Each change order billed as its own line with its own backup',
        'Running total sent with every progress application',
      ],
    } },

    { type: 'h2', text: 'What change order management software should do for a sub' },
    { type: 'p', text: 'Most products in this category are built for the GC side - approving, routing, folding into an owner contract. As a subcontractor, look for these specifically.' },
    { type: 'list', items: [
      'Capture from a phone, on site, with photos attached, by whoever is standing there.',
      'A running revised contract total that includes approved changes automatically.',
      'A visible pending queue with the age of each request, because the ageing is the argument.',
      'Billing that draws from your contract and approved changes rather than being typed fresh each month.',
      'A permanent record of who asked, who approved, and when - kept even if a request is withdrawn.',
      'Something a GC can respond to without creating an account.',
    ] },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'SyteNav treats a subcontractor’s job the same way it treats a GC’s: a contract amount, change orders against it, and billing that draws from both. A change order carries a title, an amount that can be positive or negative, a reason, and who requested it - the GC or you - and approving it raises the contract it is attached to rather than sitting on a separate list. Un-approving or deleting it takes the amount straight back out.' },
    { type: 'p', text: 'The field side is on the same record: daily logs with photos filed to the job, a time clock with a location check, and tasks - so the backup for an extra is being created as the work happens rather than reconstructed afterwards. Job Money shows what a job is contracted for, what has been billed, and what is left.' },
    { type: 'p', text: 'What it does not do: it will not file a formal claim for you, it does not produce a legal notice under your contract’s change clause, and it cannot make a GC answer. It makes the paperwork exist, on time, with the photos attached - which is the part that is actually in your control.' },
  ],
  faqs: [
    { q: 'The super told us to proceed and said the paperwork would follow. What do we do?', a: 'Proceed if you must, and send an email the same day: "Confirming your instruction today to proceed with X on a time and material basis. Daily tickets will be presented for signature." Then get every daily ticket signed. You have not refused anything, and you have moved the record from a conversation to a document.' },
    { q: 'How long should we wait for a change order to be approved before stopping work?', a: 'Whatever your subcontract says - read the clause, because many have a notice period that starts running immediately. Practically, raise it in writing when a request passes a week, again at two, and state plainly what the schedule consequence of the delay will be. Ageing that nobody was told about is the hardest to claim later.' },
    { q: 'Should we include markup on a change order?', a: 'Yes, at whatever your subcontract allows - many specify the percentages for overhead and profit on changed work. Show it as a separate line rather than burying it, because a hidden markup found during a review costs you credibility on the whole submission.' },
    { q: 'What about extras on a lump sum contract with no change clause?', a: 'You still put it in writing before you build it. A contract that is silent on changes does not mean changes are free - it means the terms will be argued from the correspondence, which is exactly why the correspondence needs to exist and be contemporaneous.' },
  ],
  related: ['how-to-track-change-orders', 'change-order-documentation', 'construction-invoice-approval'],
}
