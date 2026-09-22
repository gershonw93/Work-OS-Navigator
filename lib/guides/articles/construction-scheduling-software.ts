import type { Guide } from '../schema'

export const guide: Guide = {
  slug: 'construction-scheduling-software',
  title: 'Construction scheduling software cannot fix a schedule nobody updates',
  cardTitle: 'How construction scheduling actually works',
  metaTitle: 'Construction Scheduling Software: Why the Schedule Goes Stale | SyteNav',
  description:
    'Why construction schedules go stale, what actually has to happen when one trade slips, and what scheduling software has to do to still be true on site.',
  keyword: 'construction scheduling software',
  keywords: [
    'construction scheduling software', 'construction schedule', 'construction scheduling',
    'how to schedule a construction project', 'construction schedule dependencies',
    'gantt chart construction', 'trade sequencing', 'construction project schedule software',
  ],
  category: 'field',
  published: '2026-09-22',
  lede:
    'Every construction schedule is accurate on the day it is drawn. The question that decides whether it was worth drawing is what happens on the third Tuesday, when the framer loses two days to weather and eleven other trades are still holding the dates they were given in a meeting nobody has re-run.',
  takeaways: [
    'Schedules do not fail because they were built wrong. They fail because the plan and the job stop matching and nobody is told.',
    'A slip is only handled when three things happen: the dates behind it move, the shape of the plan survives the move, and the people affected hear about it.',
    'Moving a dependent to sit against its predecessor is not the same as moving it by the days the predecessor slipped, and the difference can be weeks.',
    'Any date a person typed by hand must never be quietly overwritten by a recalculation. Skip it, and say you skipped it.',
  ],
  blocks: [
    { type: 'p', text: 'This guide is published by SyteNav, which makes one of the tools in this category. It is written as the process guide we would want if we did not sell anything: what a schedule is for, what has to happen when it moves, and only then what software does about it - including where ours stops.' },

    { type: 'h2', text: 'Why the schedule stops being true' },
    { type: 'p', text: 'Ask a contractor when their schedule was last correct and the honest answer is usually a date, not a duration. It was correct at the pre-construction meeting. It has been drifting ever since, and the drift is invisible because the document does not change - the job does.' },
    { type: 'p', text: 'Three things cause it, and none of them is laziness.' },
    { type: 'list', items: [
      'THE SCHEDULE LIVES WHERE THE WORK IS NOT. It is maintained in an office by one person, from photographs and phone calls, a day or two behind what is actually built. By the time a slip is entered, the trades behind it have already been told the old dates.',
      'UPDATING IT IS EXPENSIVE. If moving one trade means re-typing the eleven that follow it, that job gets done on Friday if at all - so the schedule is accurate once a week, on the day fewest decisions are made from it.',
      'NOBODY IS TOLD. This is the one that costs real money. A date that changed in a file and not in anybody’s week is a date that has not changed: the sub shows up, or does not, on the date they were given.',
    ] },
    { type: 'p', text: 'So the useful question about scheduling is not "can it draw a bar chart". Every tool draws a bar chart. It is whether keeping the plan true is cheap enough that it actually happens, and whether a change reaches the people whose week it is.' },

    { type: 'h2', text: 'What a schedule is actually for' },
    { type: 'p', text: 'It is doing three jobs at once, and they pull in different directions - which is why schedules that serve one of them well feel useless for the other two.' },
    { type: 'list', items: [
      'SEQUENCING. What has to finish before this can start. This is the part that looks like project management and the part software is usually built around.',
      'TELLING PEOPLE WHEN. Each sub needs one thing from your schedule: the days they are expected, kept current. They do not want your Gantt chart, and they will not open it.',
      'EVIDENCE. Months later, what was planned, what moved, when it moved, and who was told. This is what a delay claim is made of, and it is the job a schedule silently stops doing the moment somebody starts overwriting dates in place.',
    ] },
    { type: 'p', text: 'And a slip usually has a cause. When the cause is extra work somebody asked for, the two days the schedule moves are part of what that change order costs - which is worth pricing at the time rather than remembering at the end. When the cause is a trade that simply did not turn up, the schedule is where you can later prove it.' },
    { type: 'callout', tone: 'tip', title: 'The test for the second job', text: 'Ask a sub on your current project what dates they are holding for you. If the answer does not match your schedule - or if they have to check a text thread to answer - then whatever the file says, the schedule is not doing the only job the sub needs from it.' },

    { type: 'h2', text: 'One trade slips, and everything behind it moves' },
    { type: 'p', text: 'This is the whole problem in one sentence, and how a tool handles it is the thing worth evaluating. Say sheetrock finishes three days late.' },
    { type: 'p', text: 'Hand-run, you now have a choice nobody enjoys: re-type every trade behind it, or leave the plan wrong and hold the difference in your head. Most people do the second, and the schedule quietly becomes a record of what was once intended.' },
    { type: 'p', text: 'A tool that models dependencies does it for you - but the arithmetic it uses matters more than the feature name suggests.' },
    { type: 'compare', title: 'Two ways to move the trades behind a slip', left: {
      label: 'Snapping to the new boundary',
      items: [
        'Each dependent is placed immediately after its predecessor now ends',
        'A trade that was sitting five weeks later gets dragged forward to sit against it',
        'The gaps you deliberately left are erased',
        'One three-day slip can move a line by a month',
        'The plan loses the shape you gave it',
      ],
    }, right: {
      label: 'Shifting by the delta',
      items: [
        'Each dependent moves by the number of days its predecessor moved',
        'A trade five weeks later moves three days, and stays five weeks later',
        'Whatever breathing room existed is preserved',
        'Three days in means three days out',
        'The plan keeps its shape, so it is still recognisable to the people working to it',
      ],
    } },
    { type: 'p', text: 'The second is the correct behaviour and it is worth testing explicitly in a demo, because both look identical in the simple case: when a dependent starts the very next day after its predecessor ends, snapping and shifting produce the same date. The difference only shows up on the lines that sit further out, which are exactly the lines nobody checks.' },
    { type: 'h3', text: 'The rules that go with it' },
    { type: 'list', items: [
      'MEASURE THE PREDECESSOR’S FINISH, NOT ITS START. A trade whose start holds but whose end slips three days has taken three days longer, and everything waiting on it moves three days. Measuring the start reports "nothing else moves" for the most ordinary slip there is.',
      'THE SHIFT WORKS BOTH WAYS. If a trade finishes early, everything behind it should come forward too. A chain that only ever moves later drifts in one direction for the life of the job.',
      'DO NOT RE-APPLY THE GAP EACH TIME. If a dependency carries a few days of breathing room, that gap is already in the dates. Adding it again on every recalculation turns it into a floor, and the line creeps later every time anything upstream twitches.',
      'A DATE SOMEBODY TYPED WINS. If a person has set a line’s dates by hand since the link was made, an automatic recalculation must not overwrite it. Skip that line - and say so on screen, because a linked line missing from the list reads as one that is not linked at all.',
      'REFUSE A LOOP. If A waits on B and B waits on A, the tool should say so rather than compute forever or pick one.',
    ] },
    { type: 'callout', tone: 'warn', title: 'Nothing should move without being shown first', text: 'A cascade that writes straight to the schedule is a tool making dozens of decisions on your behalf, silently, while you are looking at one date. The correct shape is a preview: here is what will move, here is what will not and why, apply or cancel. That is also the moment to decide who gets told, which is a separate question from whether the dates change.' },

    { type: 'h2', text: 'A schedule nobody is told about is just a calendar' },
    { type: 'p', text: 'The dates moving in your system is the easy half. The half that decides whether the slip costs you money is whether the electrician who was coming Tuesday knows they are now coming Friday - and whether the trade that was waiting knows it can start.' },
    { type: 'p', text: 'Two messages are worth their weight here, and they go to different people: your dates moved, and you are no longer blocked. The first prevents a wasted mobilisation. The second is the one that recovers time, because a sub who does not know the wall is ready does not turn up early out of optimism.' },
    { type: 'p', text: 'Telling people should also be an explicit act rather than an automatic one. There are legitimate reasons to move dates quietly - you are re-planning, the change is not settled, the move is a correction of your own typo - and a tool that emails eleven subs every time you drag a bar will be used once.' },
    { type: 'callout', tone: 'note', title: 'And it should tell you who it cannot reach', text: 'The useful version of this feature names the subs who will get the message and, more importantly, the ones with no email on file who will not. A notification feature that silently covers 80% of your trades is worse than none, because you stop making the phone calls.' },

    { type: 'h2', text: 'The field has to be able to read it' },
    { type: 'p', text: 'A schedule is consumed on a phone, outdoors, by somebody holding something in the other hand. That constraint kills most of what desktop scheduling tools do well. Seven columns of a month grid on a 390px screen is a square about the width of a thumbnail - text does not fit in one, so a phone month view has to be colour and a tap, not labels.' },
    { type: 'p', text: 'It also changes what you should expect people to do. A foreman is not going to re-plan a chain of dependencies from a phone. What they need is today and the next few days, for this job, in one screen - and for the office, a view across every job so two crews are not promised the same Thursday.' },
    { type: 'p', text: 'The schedule is also read by people who are not planning anything. Progress claimed on a sub’s invoice gets checked against the logs and the schedule before anybody approves it, so a schedule three weeks out of date quietly removes one of the few cross-checks you have on a progress claim.' },
    { type: 'p', text: 'Be realistic about who needs write access, too. Most of the people who READ a schedule should never edit one, and the ones who do the editing are a small group in the office. A tool that makes everybody a scheduler produces a schedule nobody trusts.' },

    { type: 'h2', text: 'What to test before you buy' },
    { type: 'p', text: 'Twenty minutes with a real job answers more than any feature grid. Build a short chain - framing, rough-in, inspection, drywall - and then break it on purpose.' },
    { type: 'steps', items: [
      'Link four trades in sequence, with a couple of days of breathing room between two of them.',
      'Slip the first one by three days and look at what the tool proposes BEFORE it writes anything.',
      'Check the line furthest down the chain. Did it move three days, or did it jump to sit against its predecessor? This is the whole test.',
      'Check that your deliberate gap survived.',
      'Now pull the first trade three days EARLIER and confirm the chain comes forward as well as back.',
      'Edit one line’s dates by hand, then slip its predecessor again. The hand-edited line should be left alone and reported, not silently overwritten.',
      'Send the change to a sub and look at what they actually receive. Then check what happens to a sub with no email address on file.',
      'Open the whole thing on a phone, outside, and try to answer "what is happening on this job today" in one screen.',
    ] },
    { type: 'checklist', title: 'What a schedule tool has to do', items: [
      'Move dependents by the days their predecessor moved, in both directions.',
      'Preserve deliberate gaps instead of re-applying them.',
      'Show what will move, and what will not move and why, before writing anything.',
      'Never overwrite a date a person set by hand.',
      'Refuse circular dependencies out loud.',
      'Let the office decide whether a change is announced or applied quietly.',
      'Name the people it cannot reach.',
      'Be readable on a phone, outdoors, in one tap.',
      'Keep a record of what moved and when, because that is the evidence half.',
    ] },

    { type: 'h2', text: 'How SyteNav handles it' },
    { type: 'p', text: 'A schedule line is a trade, a set of dates and optionally the sub who owns it - and a line with no sub attached is a placeholder, so a chain can point at "sheetrock, dates to be confirmed" before anybody is awarded. Dependencies point at a LINE rather than a trade, which is what lets electrical rough-in and electrical finish be waited on separately. A link can carry a few days of lag, and it can carry a progress gate: drywall does not start because framing is finished, it starts because framing is far enough along. Links are also suggested from a declared build order, but only where the dates you have already typed agree with it, and always as an offer you accept rather than something written for you - an unrecognised trade produces no suggestion at all rather than the nearest guess.' },
    { type: 'p', text: 'When a line moves, every line that waits on it shifts by the number of days that line’s FINISH moved - signed, so pulling a trade earlier pulls the chain forward too - and the lag takes no part in the arithmetic, because shifting by the delta already preserves the gap. A line whose dates were edited by hand after the link was made is skipped and listed with the reason, never moved underneath you. Circular links are refused. Nothing is written until a review screen shows what moves, what does not and why, and then asks the question separately: notify the subs, or shift silently. It names the subs who will get an email, and warns you about the ones with no address on file who will not hear it from SyteNav.' },
    { type: 'p', text: 'Two notifications carry it: the sub whose dates moved is told, and the sub who just became unblocked is told. There are three views over the same job - a month calendar, a timeline and a list. Only the calendar draws the job’s other dated things beside the schedule: tasks that are due, and inspections that are actually booked. The timeline and the list stay schedule-only, because they are the editor, and a row nothing can save does not belong in one. On a phone the month grid is dots, and tapping a day opens what is on it.' },
    { type: 'p', text: 'What it does not do, plainly: there is no critical path, and no float or slack. It does keep a baseline - every date move is recorded with what the dates were before, whether somebody called it a delay and why, so as-planned against as-built is a question it can answer - but there is no resource levelling, and no import or export to MS Project or Primavera. It works in calendar days - there is no working-day calendar, so weekends and holidays are not skipped for you. And the cross-project month view is for admins and managers; everyone else gets their own job and their own day.' },
  ],
  links: [
    { text: 'inspections that are actually booked', href: '/guides/construction-daily-log-app' },
    { text: 'the two days the schedule moves are part of what that change order costs', href: '/guides/how-to-track-change-orders' },
    { text: 'checked against the logs and the schedule before anybody approves it', href: '/guides/construction-invoice-approval' },
    { text: 'three views over the same job', href: '/features' },
    { text: 'consumed on a phone, outdoors, by somebody holding something in the other hand', href: '/mobile' },
  ],
  faqs: [
    { q: 'Do I need dependencies, or are dates enough?', a: 'If you run one or two trades at a time, dates are enough and a chain is overhead. Dependencies start paying the moment a slip in one trade means re-typing several others - that is the week the schedule starts being maintained late, and late is the same as wrong for everybody downstream.' },
    { q: 'What is the difference between a schedule and a task list?', a: 'A schedule is about sequence and duration - what has to finish before this starts. A task list is about accountability - who owes what by when. They meet on a calendar and they are not the same object: a task links to the work and the money, a schedule line links to the trades around it.' },
    { q: 'Should the client see the schedule?', a: 'A simplified, read-only version, yes - it removes most "when are you doing X" calls. What a client should not get is the working schedule with every dependency in it, because every slip then becomes a conversation before you have decided what it means.' },
    { q: 'How often should a construction schedule be updated?', a: 'Weekly as a floor, and immediately for anything that moves another trade. The test is not the cadence, it is whether an update reaches the people whose week changes. A schedule updated daily in a file nobody is notified from is worth less than a weekly one that sends the dates out.' },
  ],
  related: ['construction-daily-log-app', 'construction-management-software-small-contractors', 'how-to-track-change-orders'],
}
