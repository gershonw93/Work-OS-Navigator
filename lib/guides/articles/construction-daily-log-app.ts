import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'construction-daily-log-app',
  title: 'A construction daily log app that actually gets used: logs and inspections from the field',
  cardTitle: 'Daily logs and inspections from the field',
  metaTitle: 'Construction Daily Log App: Logs and Inspections From the Field | SyteNav',
  description:
    'What a construction daily log app has to do to actually get used: what belongs in a log, why the photos carry the weight, and how inspections should run.',
  keyword: 'construction daily log app',
  keywords: [
    'construction daily log app', 'daily report construction', 'jobsite log app',
    'daily log software', 'construction field reporting', 'site diary app',
    'inspection scheduling construction', 'daily log photos',
  ],
  category: 'field',
  published: '2026-09-15',
  lede:
    'A daily log is worth exactly as much as the habit behind it. Written that day by somebody who was there, it settles disputes. Written on Friday for the whole week, it is a document that proves you keep documents.',
  takeaways: [
    'If logging a day takes more than about a minute on a phone, it will be done from memory later, or not at all.',
    'Photos and who was on site are the parts that hold up. The weather is automatic and the prose is optional.',
    'A blank log is worse than no log - it reads as a report that somebody was there and found nothing.',
    'Field entries should reach a client-facing record only after somebody has reviewed them.',
  ],
  blocks: [
    { type: 'h2', text: 'What a daily log is for' },
    { type: 'p', text: 'Three different jobs, and they pull in different directions.' },
    { type: 'list', items: [
      'EVIDENCE. Six months from now, somebody asks what the weather was on the 14th, how many men were on site, or whether that wall was already out of plumb before the tile went on. A contemporaneous record answers it; a reconstruction does not.',
      'COORDINATION. What happened yesterday, what is blocked, who did not turn up. This is what makes the log worth reading rather than just worth keeping.',
      'CLIENT REPORTING. A weekly PDF of what happened on site is one of the highest-value things a small GC can send, and it is nearly free if the logs exist.',
    ] },
    { type: 'p', text: 'Design the habit around the first one and the other two come for free. Design it around the third and you get a marketing document that nobody trusts in a dispute.' },

    { type: 'h2', text: 'What actually belongs in one' },
    { type: 'p', text: 'Short list, because a long form is why people stop filling it in.' },
    { type: 'checklist', title: 'A log that is worth having', items: [
      'Date, and weather - filled in automatically, because nobody should be typing this.',
      'Who was on site: your crew count and which subs, by trade.',
      'What was worked on, in one or two lines.',
      'Photos. As many as it takes, tagged to the sub whose work they show.',
      'Anything abnormal: a delay, an accident, a visitor, an inspection, a delivery that did not arrive.',
      'Anything observed that will matter later: a condition found, a safety issue, a quality concern.',
    ] },
    { type: 'callout', tone: 'tip', title: 'Photos are the part that holds up', text: 'Written notes are contestable and get read as opinion. A photograph with a date on it is not. If a crew will only do one thing, have them photograph the work - a log with six photos and one line of text is far more valuable than a paragraph with none.' },

    { type: 'h2', text: 'Why daily logs stop happening' },
    { type: 'p', text: 'The cause is almost always one of these four, and all four are fixable.' },
    { type: 'list', items: [
      'IT TAKES A LAPTOP. If the log lives on a desktop the log is written from memory, at the end of the week, in the office.',
      'THE FORM IS TOO LONG. Twenty fields on a phone, in the sun, in gloves, is a form that gets abandoned at field six.',
      'NOBODY EVER READS IT. A record that disappears into a folder stops being written within a month. Reading it - and acting on it - is what keeps it alive.',
      'IT IS SOMEBODY ELSE’S JOB. If logging is the PM’s task and the PM is on another site, nothing gets logged. The person holding the phone is the person who should log.',
    ] },
    { type: 'callout', tone: 'warn', title: 'The blank log problem', text: 'A log saved with nothing but a date on it goes into the count and into the client PDF as a page of empty headings - which reads as "somebody was on site and reported nothing happened". That is worse than an absent log, because it is a positive claim. A log should refuse to save unless something real is on it: a note, a photo, who was on site, or an observation. The date and the weather do not count, because they were filled in for you.' },

    { type: 'h2', text: 'Field entries and review' },
    { type: 'p', text: 'There is a tension between "the crew files whatever they see, in seconds" and "this is the official record that goes to the client". Resolve it with a review step rather than by restricting who can file.' },
    { type: 'p', text: 'A crew member files a note and photos in seconds from a phone. It lands on the day’s log marked as needing review. Somebody in the office checks it, turns anything that needs action into a task, and marks it reviewed - and only reviewed entries reach the client-facing PDF. That way the field is never a bottleneck and the client never sees a half-formed note about a defect before anyone has looked at it.' },

    { type: 'h2', text: 'Inspections: the other half of the field record' },
    { type: 'p', text: 'Inspections fail for a structural reason: the request, the booking and the readiness are three different people, and most tools model them as one status field.' },
    { type: 'steps', items: [
      'THE REQUEST comes from the office or the site: which inspection, and the date it is needed by.',
      'THE BOOKING is a phone call somebody makes to the jurisdiction. No software calls an inspector for you, and any tool implying otherwise is setting you up for a missed trip.',
      'THE CONFIRMED DATE comes back from that call, with a time or window, who you spoke to, and a confirmation number. This is a different fact from the date you asked for.',
      'READY is the sub or the site saying the work is actually finished - which may be before or after the booking, because you ring the township days out.',
      'THE RESULT is pass or fail, recorded from the inspector’s card, dated the day printed on the card rather than the day somebody got round to entering it.',
    ] },
    { type: 'callout', tone: 'warn', title: 'Two dates, and only one of them is an appointment', text: '"Needed by" and "confirmed for" are different facts. Collapse them into one "scheduled date" field and a request nobody has acted on reads like a confirmed booking - and shows up as one on the calendar, in any subscribed Outlook or Google feed, and in whatever the client can see. Only a booking somebody actually made belongs on a calendar.' },
    { type: 'p', text: 'The other structural point: a status that claims something must carry its evidence. An inspection marked scheduled needs the confirmed date and the name of who you spoke to, or it is still just the date you asked for. And moving it back to requested has to clear the booking, or a cancelled appointment stays in the calendar feed for ever.' },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'Field Mode is a stripped-down phone view for crew: one big clock in and out button with a location check, today’s tasks, and Log - pick a job, snap photos, add a note. Entries arrive on the day’s log marked "needs review"; the office can turn one into a task with the note and first photo carried over, and unreviewed entries are deliberately left out of the client-facing PDF. Several entries on the same date group into one day, so crew submissions and the manager’s log read as a single record. A log with nothing real on it will not save.' },
    { type: 'p', text: 'Inspections run request to booking to result with the two dates kept separate. The request needs the inspection type and the date needed by. Whoever is booking it gets the numbers the job already knows - the issuing authority and inspector from your permits, plus any inspectors in your Directory - and the screen says plainly that SyteNav does not contact the inspector for you. Booking asks for the confirmed date, the window, who you spoke to and the confirmation number. Only booked inspections appear on calendars. The sub presses "Work is ready" when the work is done, which is its own permission because saying the work is finished is a report from the site rather than office work. If an inspection is booked within two days and nobody has marked it ready, the people who asked for it and the people booking it are told. The inspector’s card is scanned afterwards and fills in the details, but nothing is marked passed or failed until a person says so.' },
    { type: 'p', text: 'What it does not do: it does not submit permit applications or inspection requests to a jurisdiction, and it has no integration with municipal portals. Somebody still makes the call - SyteNav tells the right person, hands them the number, and holds the answer they come back with.' },
  ],
  links: [
    { text: 'Field Mode is a stripped-down phone view for crew', href: '/mobile' },
    { text: 'The inspector’s card is scanned afterwards and fills in the details', href: '/ai' },
  ],
  faqs: [
    { q: 'Who should write the daily log - the foreman or the project manager?', a: 'Whoever is on site. A log written by somebody who was not there is a summary of a phone call. If the PM wants to add context afterwards, that is an addition to the day, not a replacement for the field entry.' },
    { q: 'How long should we keep daily logs?', a: 'At least as long as your statute of limitations for construction defects, which varies by state and can be many years. Since storage is cheap and reconstruction is impossible, the practical answer is to keep them permanently along with the photos.' },
    { q: 'Can daily logs be used as evidence in a dispute?', a: 'Contemporaneous records made in the ordinary course of business generally carry weight, which is precisely why the timing matters - a log written the same day by somebody present is a different kind of document from one assembled afterwards. Talk to your attorney about your jurisdiction; write them daily either way.' },
    { q: 'Does a daily log app need to work offline?', a: 'Signal on a site is genuinely unreliable, so at minimum capture should not lose what somebody typed. Test it on the worst site you have, on a phone that has been in somebody’s pocket all morning, before you trust it with a record you may need years later.' },
  ],
  related: ['change-order-documentation', 'construction-job-cost-tracking', 'construction-management-software-small-contractors'],
}
