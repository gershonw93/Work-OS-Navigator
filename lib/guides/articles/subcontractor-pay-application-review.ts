import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'subcontractor-pay-application-review',
  title: 'How to review a subcontractor pay application before you approve it',
  cardTitle: 'Reviewing a sub’s pay application',
  metaTitle: 'Subcontractor Pay Application Review: Check Billing Against Work Done | SyteNav',
  description:
    'How a GC or owner checks a subcontractor pay application against the work actually built: the schedule of values, percent complete, stored materials and retainage.',
  keyword: 'subcontractor pay application',
  keywords: [
    'subcontractor pay application', 'review subcontractor pay application', 'pay application review',
    'validate pay application', 'pay app verification', 'progress billing review',
    'schedule of values review', 'aia g703 review', 'percent complete billing',
    'how to check a pay app', 'gc approve pay application', 'overbilling pay application',
  ],
  category: 'billing',
  published: '2026-10-20',
  lede:
    'A subcontractor pay application is a claim about the building: this much of each line is done. The arithmetic on the form is almost never what is wrong. The claim is.',
  takeaways: [
    'Check the schedule of values first. If it does not match the contract plus approved change orders, every percentage on the application is measured against the wrong number.',
    'Percent complete is the whole review on progress billing. Compare it line by line with something you can see - units installed, a photo, a daily log - not with last month’s application.',
    'Stored materials need proof they exist and are protected: an invoice, a delivery ticket, a photo of where they sit.',
    'Retainage and the running total are where the paperwork goes wrong quietly. Recompute them; do not read them off the form.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is for the person holding the pen: a general contractor approving a sub’s monthly draw, or an owner checking the GC’s. The steps are the same either way. The question underneath them is always: does what has been billed match what has been built, and does it stay inside what was agreed?' },

    { type: 'h2', text: 'What a subcontractor pay application actually claims' },
    { type: 'p', text: 'Most progress billing in the US uses the AIA shape or something copied from it: a summary sheet (the G702) and a continuation sheet (the G703) with one row per line of the schedule of values. Each row says what the line is worth, what was billed on earlier applications, what is billed this period, what materials are stored on site, and the percent complete that adds up to.' },
    { type: 'p', text: 'Every number on the summary sheet falls out of those rows. So the review is not of the total. It is of each row, and of the schedule the rows are measured against.' },

    { type: 'h2', text: 'The review, in the order that finds problems' },
    { type: 'steps', items: [
      'CHECK THE SCHEDULE OF VALUES. Line values should add up to the subcontract amount plus every change order you have approved - and only those. A change order the sub expects but you have not approved does not belong on the schedule yet.',
      'CHECK PREVIOUSLY BILLED AGAINST YOUR OWN RECORDS. The "from previous application" column should equal what you certified last time, not what they asked for last time. If you cut a line in March, April’s application starts from your number.',
      'WALK PERCENT COMPLETE LINE BY LINE. For each row, find evidence on your side: units installed, a daily log entry, a dated photo, an inspection passed. A line at 80% with nothing to show for it is the conversation to have.',
      'CHECK STORED MATERIALS. Ask for the supplier invoice and a delivery ticket, and look at a photo of where the material is sitting. Material billed but not on site, or on site and not protected, is not something to pay for yet.',
      'RECOMPUTE RETAINAGE. Apply the contract’s retainage percentage to work completed to date and stored materials, and compare it with the form. Retainage reduced early, or released on lines that are not finished, is easy to miss in a total.',
      'CHECK THE RUNNING TOTAL. Completed to date plus stored materials must not exceed the scheduled value of any line, and the whole application must not exceed the revised contract.',
      'CHECK THE PAPER THAT TRAVELS WITH IT. Lien waivers for the previous payment, a current certificate of insurance, and anything else the subcontract requires before money moves.',
    ] },

    { type: 'callout', tone: 'warn', title: 'Last month’s percentage is not evidence', text: 'The easiest review is to compare this month’s application with last month’s and check the step looks reasonable. It catches nothing, because a line that was front-loaded in month one stays front-loaded at a reasonable pace for the rest of the job. Compare against the building.' },

    { type: 'h2', text: 'Front-loading and how it hides' },
    { type: 'p', text: 'Front-loading is billing ahead of the work, usually by weighting the early lines of the schedule of values. It is rarely fraud. It is a sub funding payroll on your job while waiting to be paid on someone else’s. It still means you are carrying their cash flow, and if they walk at 60% complete you have paid for work you will have to buy again.' },
    { type: 'list', items: [
      'Mobilisation, general conditions and "rough-in" lines worth far more than they cost. Check them at award, not at the third application.',
      'A percent complete that rises steadily every month while the site does not. Progress on a real job is lumpy.',
      'Lines that reach 90% quickly and then sit there for months. The last 10% is where the hard work is, and it has already been paid for.',
      'Stored materials billed on items with long lead times that have not shipped.',
    ] },
    { type: 'p', text: 'The structural fix is a schedule of values agreed at award with line values that track real cost, and percent complete tied to something countable. A judgement call billed every month will drift toward the sub’s cash needs.' },

    { type: 'h2', text: 'What to do when a line is ahead of the work' },
    { type: 'p', text: 'Certify what you can see and say why. "I have the electrical rough-in at 55%, you billed 80% - here is the photo from Tuesday" is a normal conversation between people who will work together again, and it is much easier before you pay than after.' },
    { type: 'compare', title: 'Two ways to handle a line that is ahead', left: {
      label: 'Reject the application',
      items: [
        'Every line waits, including the ones that were right',
        'The sub has no idea which number was the problem',
        'Billing drifts off the system and into email',
        'The next application arrives late and defensive',
      ],
    }, right: {
      label: 'Certify the line at what you can see',
      items: [
        'The lines that were right get paid on time',
        'The disagreement is one number with a reason beside it',
        'The sub can bring evidence next month',
        'Your job numbers stay true in the meantime',
      ],
    } },

    { type: 'h2', text: 'Questions owners and lenders will ask you' },
    { type: 'p', text: 'If you are the GC, your own application to the owner or the bank is built from your subs’ applications. Whatever you did not check on theirs, you are now certifying on yours. A lender’s inspector will walk the site with your G703 in hand, and a line you passed through at 80% that is visibly at 50% is your problem, not the sub’s.' },
    { type: 'checklist', title: 'Before you certify', items: [
      'The schedule of values matches the contract plus approved change orders',
      'Previously billed matches what you certified last time',
      'Every line’s percent complete has evidence on your side',
      'Stored materials have an invoice, a delivery ticket and a photo',
      'Retainage is recomputed, not read off the form',
      'Lien waivers and insurance are current',
    ] },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'On a job billed by progress billing, the Pay Apps tab builds an application in either direction - you billing the owner, or a sub billing you. For a sub, the schedule of values is that sub’s scope plus approved change orders, and previously billed carries forward from earlier applications automatically, so it is your record rather than their recollection.' },
    { type: 'p', text: 'It refuses the two mistakes that are pure arithmetic: a line cannot be billed past its scheduled value or below zero, and retainage cannot be set outside 0 to 100%. A draft can hold a line that is over while you sort out the change order, but it will not move to Submitted, Certified or Funded until that is resolved - and the reason, with a link to raise the change order already filled in, sits next to the button. If a change order is approved after the draft was started, the application says how much is missing from its schedule and offers to bring it in. Certified and funded applications are never changed afterwards. It prints the G702 and G703.' },
    { type: 'p', text: 'What it does not do: it does not decide percent complete for you. The daily logs, photos and inspections that are your evidence live on the same job, but comparing them with a line is still your judgement, and SyteNav does not read a photo and tell you the rough-in is at 55%. It also does not collect lien waivers as part of the application.' },
  ],
  links: [
    { text: 'the Pay Apps tab builds an application in either direction', href: '/money' },
    { text: 'The daily logs, photos and inspections that are your evidence live on the same job', href: '/guides/construction-daily-log-app' },
    { text: 'The structural fix is a schedule of values agreed at award', href: '/guides/construction-invoice-verification' },
    { text: 'Your job numbers stay true in the meantime', href: '/guides/construction-job-cost-tracking' },
  ],
  faqs: [
    { q: 'Should the GC or the owner check the subcontractor pay application?', a: 'The GC, every time, because the GC’s own application to the owner is built from it. An owner or a lender may check again, but they are checking your certification of the sub’s numbers, not doing the review for you.' },
    { q: 'What if the sub never agreed a schedule of values?', a: 'Then percent complete is measured against nothing, and the review is a negotiation every month. Agree one now, from the contract amount, with line values that track real cost, and make it a condition of the next award.' },
    { q: 'Can I certify part of a pay application?', a: 'Yes, and it is usually the right answer. Certify each line at what you can see, note the lines you reduced and why, and pay the rest on time. Holding the whole application over one line teaches a sub to stop sending them.' },
    { q: 'How is this different from checking an ordinary invoice?', a: 'An ordinary invoice is checked against a quote: rates, quantities, and lines that were never priced. A pay application is checked against the building: how much of each line is actually done. Most jobs need both, which is why the two checks sit side by side.' },
  ],
  related: ['construction-invoice-verification', 'construction-invoice-approval', 'construction-job-cost-tracking'],
}
