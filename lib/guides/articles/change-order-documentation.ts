import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'change-order-documentation',
  title: 'Change order documentation that holds up: why yours may not',
  cardTitle: 'Why your change orders will not hold up',
  metaTitle: 'Change Order Documentation: Why Yours Will Not Hold Up | SyteNav',
  description:
    'Change order documentation that survives a dispute: why voice notes, texts and verbal approvals fail, and what a defensible record actually looks like.',
  keyword: 'change order documentation',
  keywords: [
    'change order documentation', 'change order proof', 'verbal change order',
    'text message approval construction', 'construction dispute documentation',
    'contemporaneous records construction', 'change order evidence', 'lost approvals',
  ],
  category: 'change-orders',
  published: '2026-09-15',
  lede:
    'Nobody loses a change order argument because they had no paperwork at all. They lose it because what they had was a voice note, a text thread, and a memory of a conversation in a driveway.',
  takeaways: [
    'A record has to be contemporaneous, attributed, specific and retrievable. Most site records fail on at least two.',
    'Texts and voice notes are evidence of a conversation, not of an agreement - and they live on a phone that gets lost, wiped or upgraded.',
    'Approval needs a named amount and an affirmative response. "Ok" under a thread with three numbers in it is ambiguous.',
    'A retraction is an event too. A record that keeps a claim but not its withdrawal is half a record.',
  ],
  blocks: [
    { type: 'h2', text: 'Four properties, and where each one fails' },
    { type: 'p', text: 'Whether a record helps you comes down to four things. Run your last disputed change order against them.' },
    { type: 'h3', text: 'Contemporaneous' },
    { type: 'p', text: 'Made at the time, not reconstructed afterwards. This is the property that carries the most weight and the one hardest to fake, which is exactly why it matters. A write-up assembled at the end of a job - however accurate - is a party’s account of events. A note made that afternoon is a record of them.' },
    { type: 'h3', text: 'Attributed' },
    { type: 'p', text: 'It names who asked and who agreed. "The client asked for" is weaker than "Dave Molina asked, on site, at about 10am". Attribution is what makes a record specific enough to confirm or deny, and vague records are read against whoever wrote them.' },
    { type: 'h3', text: 'Specific' },
    { type: 'p', text: 'Scope, quantity, and an amount. "Extra tile work" is not a change order, it is a heading. If a stranger reading it a year later cannot tell what was agreed, neither will the person who agreed to it.' },
    { type: 'h3', text: 'Retrievable' },
    { type: 'p', text: 'This is where most contractors actually fail. The record exists - in a text thread on a phone that was replaced, in a voice note nobody transcribed, in an email account belonging to a PM who left, in a photo library with forty thousand photos and no job attached to any of them. A record you cannot produce is functionally the same as one you never made.' },

    { type: 'callout', tone: 'warn', title: 'The group text is not an archive', text: 'It has no search worth the name, no structure, no attribution beyond a phone number, and it lives on devices you do not control. It is also where most construction decisions in small companies are currently recorded. When somebody leaves the company or drops a phone in a footing, the record leaves with it.' },

    { type: 'h2', text: 'Why each common form fails' },
    { type: 'compare', title: 'What you probably have, and what it proves', left: {
      label: 'The record you have',
      items: [
        'Voice note: "yeah do the extra outlets"',
        'Text thread with three numbers in it',
        'Email saying "ok" with no amount quoted above it',
        'Photos in a camera roll',
        'A signed ticket with no scope written on it',
        'A verbal yes from a superintendent',
      ],
    }, right: {
      label: 'What it actually proves',
      items: [
        'A conversation happened. Not what scope, not what price',
        'That numbers were discussed. Which one was agreed is arguable',
        'Agreement to something in that thread',
        'That work existed at some point, somewhere',
        'That somebody was on site. Not what for',
        'Nothing, if the superintendent had no authority to commit money',
      ],
    } },
    { type: 'p', text: 'None of these are useless - together they are often enough to settle a friendly disagreement. What they will not do is carry a formal claim, and they will not stop a disagreement from becoming one.' },

    { type: 'h2', text: 'What a defensible record looks like' },
    { type: 'p', text: 'It is not longer. It is more specific and it lives somewhere permanent.' },
    { type: 'steps', items: [
      'The ask, recorded the day it happened, on the job: who asked, what they asked for, and a photo of the condition.',
      'The price, sent in writing, with the scope described in a sentence and the amount stated as a number.',
      'The response, in writing, that names the amount - "approved at $4,850" or a reply directly under a quote that states it.',
      'The performance: daily logs and photos showing the work being done, on the dates it was done.',
      'The billing: the change order appearing as its own line on an invoice, with its number, not folded into a lump called "extras".',
      'The status history: raised, priced, approved, and if it happened, rejected or withdrawn - each with a date and a name.',
    ] },
    { type: 'callout', tone: 'tip', title: 'The reply-under-the-number trick', text: 'Send the price in a short email with the amount on its own line, and ask for "approved" in reply. The reply then carries the number above it in the quoted text, which removes the entire class of argument about which figure was agreed. It costs nothing and it is the single most useful habit in this article after the daily ticket.' },

    { type: 'h2', text: 'The records people forget to keep' },
    { type: 'list', items: [
      'THE REFUSAL. A change order the client declined is as important as one they approved - it is the record of why that work was not done.',
      'THE WITHDRAWAL. A claim retracted needs to stay visible next to the claim. An audit trail that records an assertion but not its withdrawal is half a record, and the half it kept is the one that looks bad.',
      'THE DELAY. When approval sat for three weeks and the schedule moved, the ageing is the claim. Record when it was submitted and when it came back.',
      'THE VERBAL INSTRUCTION YOU FOLLOWED. If you proceeded on a verbal, write the confirming email the same day. It converts a conversation into a document while it is still uncontested.',
      'WHO HAD AUTHORITY. Note early in the job who can actually commit money on the client’s side, and route approvals there. Most "unapproved" extras were approved by somebody who could not approve them.',
    ] },

    { type: 'h2', text: 'Building the record without extra paperwork' },
    { type: 'p', text: 'The reason documentation fails is not that people do not value it. It is that it is a separate act from doing the work, performed later, by somebody tired. The only durable fix is to make the record a by-product of the work itself.' },
    { type: 'list', items: [
      'Photos taken on site file themselves to the job, not to a camera roll.',
      'The daily log is written that day by whoever was there, from a phone, in under a minute.',
      'The change order is raised where the job lives, so the photo, the log and the approval are on the same record.',
      'Status changes are logged automatically with a name and a timestamp, because nobody maintains an audit trail by hand.',
      'The billing draws from the approved change order, so what was invoiced and what was agreed cannot drift apart.',
    ] },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'Change orders live on the job with a title, an amount, a reason, who requested it, and the budget line and subcontract they raise. Status moves - raised, approved, rejected, reset to pending - are recorded with who did it and when, in the project’s Job History, alongside every inspection request, booking, pass, fail, void and restore. A claim and its withdrawal are both kept: marking inspection work ready and then taking it back leaves both entries, because a retraction is an event too.' },
    { type: 'p', text: 'The supporting record is created by the work: daily logs with photos filed to the job and tagged by sub, a time clock that records where a punch happened and why it could not be checked if it could not, and plans you can pin a task to. The client-facing side is a link rather than an account, and an invoice shows how many times it has been opened and when.' },
    { type: 'p', text: 'What it does not do: it is not a legal product. It does not generate contract notices, it cannot tell you whether your change clause has been complied with, and none of this is legal advice. It makes the contemporaneous record exist and stay retrievable, which is the part a contractor controls.' },
  ],
  links: [
    { text: 'the budget line and subcontract they raise', href: '/money' },
    { text: 'daily logs with photos filed to the job and tagged by sub, a time clock', href: '/mobile' },
    { text: 'plans you can pin a task to', href: '/features' },
  ],
  faqs: [
    { q: 'Are text messages legally binding for a change order?', a: 'A written exchange can form an agreement in many circumstances, and many contracts also require changes to be in writing and signed - which is a separate question from whether a text counts. Ask your attorney about your contract and your state. Practically: treat a text as the start of the record, and follow it with an email that states the scope and the amount.' },
    { q: 'What if the contract says no work proceeds without a signed change order, and we already did the work?', a: 'You are relying on the conduct of the parties and any doctrine your jurisdiction recognises for that situation, which is genuinely uncertain and expensive to test. Get advice, and in the meantime document everything contemporaneously - the strength of that file is what any negotiated outcome will be based on.' },
    { q: 'How do we document a verbal instruction we had to act on immediately?', a: 'Confirming email the same day: what you were told, by whom, at what time, what you did, and on what basis you will bill it. You are not asking permission - you are recording an instruction. Uncontested confirming emails are powerful precisely because the other party had the chance to correct them and did not.' },
    { q: 'Should photos be attached to the change order itself?', a: 'Yes, and to the daily log for the dates the work was done. The pairing of a before photo with the change order and progress photos with the log is what turns a set of claims into a narrative somebody can follow without you in the room.' },
  ],
  related: ['how-to-track-change-orders', 'change-order-management-software', 'construction-daily-log-app'],
}
