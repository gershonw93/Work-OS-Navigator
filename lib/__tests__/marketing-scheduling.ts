/**
 * WHAT THE PUBLIC PAGES SAY THE SCHEDULER DOES.
 *
 * Asked directly: "does the website have the scheduling flow explained well?"
 * The guide did. The two pages a prospect reaches FIRST did not, and they were
 * wrong in the expensive direction - describing the scheduler as it was before
 * dependencies shipped, plus two claims the product does not honour.
 *
 * SAME FAMILY AS THE PRICING COPY, which arrived promising a 14-day trial and
 * a live demo that do not exist. Copy is a spec, and an un-checked one
 * describes a product somebody else has to explain away on a call.
 *
 * THE TWO THAT WERE WRONG:
 *
 *   1. "The booking is checked against every other job that crew is on.
 *      Overlaps get flagged before you save" - attributed to the GC on the
 *      lifecycle page. The check is REAL but it is `SubSchedule`, the SUB's
 *      own job view, scoped to their own company's other jobs. A GC setting a
 *      sub's dates gets no such warning. The claim is correct on
 *      /subcontractors, where it is framed as the sub's own tool, and this
 *      suite asserts it is still there - the fix was to attribute it, not to
 *      delete a real feature from the site.
 *
 *   2. "The sub sees the dates on their own SyteNav calendar, across all the
 *      GCs they work for." There is no such calendar. My Jobs is a project
 *      LIST, and the master calendar is admin/manager only and scoped to the
 *      caller's own company - the guide says so in its own words, so the two
 *      pages contradicted each other.
 */
import { ok, done, read } from './_helpers'
import { FLOWS } from '../flows'

console.log('\n\x1b[1mmarketing-scheduling\x1b[0m')

const workflow = read('app/(marketing)/workflow/page.tsx')
const features = read('app/(marketing)/features/page.tsx')
const subs = read('app/(marketing)/subcontractors/page.tsx')
const guide = read('lib/guides/articles/construction-scheduling-software.ts')

// The scheduling step, sliced out so an assertion about it cannot be satisfied
// by wording somewhere else on a 500-line page.
//
// ANCHORED ON `step: 'Step 5'`, NOT on `id: 'schedule'`. The page carries a
// NAV list at the top using the same ids, so slicing on the id grabbed 53
// characters of navigation and every assertion about the prose failed against
// text that was never the section. The same shape as the class-literal helper
// in overlay-geometry: a scan reading the wrong span is worthless in both
// directions, so the slice asserts its own size before anything reads it.
const step5 = workflow.slice(
  workflow.indexOf("step: 'Step 5'"),
  workflow.indexOf("step: 'Step 6'"),
)
ok(step5.length > 600,
  `the slice IS the scheduling section, not the nav that repeats its id (${step5.length} chars)`)

// ── the feature is actually described ───────────────────────────────────────
{
  // It used to say "drag the sub's dates onto the schedule" and stop there,
  // which is the scheduler as it was two releases ago.
  ok(/waits on|waiting on|waits for|behind it/i.test(step5),
    'THE MISSING FEATURE: the step says trades wait on each other')
  ok(/shift|moves? by/i.test(step5),
    '...and that one slipping moves the ones behind it')
  ok(/review/i.test(step5),
    '...through a review screen, which is the thing that makes it safe to use')
  ok(/only if you press|unless you press|nothing is sent/i.test(step5),
    '...and that nothing is emailed without a press - the promise the product actually keeps')

  ok(/waits|after|depend/i.test(features),
    'the features page mentions dependencies too - it is the page that lists what exists')
}

// ── the two claims that were not true ───────────────────────────────────────
{
  // The GC does not get an overlap check. Asserted against the scheduling step
  // rather than the file: the word "conflict" is legitimate elsewhere.
  ok(!/overlap/i.test(step5),
    'THE MISATTRIBUTED CHECK: the GC lifecycle step no longer claims an overlap warning the GC never gets')

  const crossGc = /across all the GCs|across every GC|all the GCs they work for/i
  ok(!crossGc.test(workflow),
    'THE CALENDAR THAT DOES NOT EXIST: no claim that a sub gets a cross-GC calendar')
  ok(!crossGc.test(features), '...not on the features page either')

  // AND THE REAL FEATURE IS STILL SOLD, in the right place and to the right
  // person. Deleting it from the site would have been a worse fix.
  ok(/overlap/i.test(subs),
    'the overlap warning is STILL on /subcontractors, where it is the sub\'s own tool across their own jobs')
}

// ── the guide stays the honest one ──────────────────────────────────────────
{
  ok(/no critical path/i.test(guide) && /float or slack/i.test(guide),
    'the guide still says what SyteNav does NOT do')
  ok(/admins and managers/i.test(guide),
    '...including that the cross-project month view is admin/manager only - the fact the workflow page used to contradict')
  ok(/placeholder/i.test(guide) && /takes the placeholder/i.test(guide),
    'and it now covers what happens to a placeholder when the trade is awarded')
}


// ── THE SEVENTH FLOW: a trade runs long ─────────────────────────────────────
{
  // /flows is six scenarios where money goes missing, and a schedule slip was
  // not one of them - which was the gap: it is the leak that costs a crew's
  // morning rather than a line on an invoice, and it is the one the app got
  // good at this week.
  const slip = FLOWS.find(f => f.slug === 'the-schedule-slipped')
  ok(!!slip, 'the schedule-slip flow exists')

  const text = JSON.stringify(slip ?? {}).toLowerCase()

  // The file's own accuracy rule: nothing here describes something the app
  // does not do. Each of these is a real behaviour, and each is the half a
  // reader would otherwise assume wrongly.
  ok(/before anything is written|shows what moves/.test(text),
    'it says the review screen comes BEFORE anything is written')
  ok(/one letter|one email/.test(text),
    'ONE email per sub, not one per line - the thing a reader would assume wrongly')
  ok(/unless you press|nothing is emailed/.test(text),
    'and that nothing is sent without a press, which is the promise the product actually keeps')
  ok(/no email address|no address/.test(text),
    'it names the subs with no address, because assuming everyone was told is the failure')
  ok(/skipped|left alone/.test(text),
    'and that a hand-dated line is skipped rather than moved underneath you')

  // THE CLAIM IT MUST NOT MAKE. Every other schedule surface in the product
  // refuses to send without a press; a flow promising automatic emails would
  // be selling a different product.
  ok(!/automatically emails|emails them automatically|sends automatically/.test(text),
    'it never claims SyteNav emails the subs by itself')

  // Every step carries a win or a loss - the file says a flow with only the
  // happy path is a feature list with arrows drawn on it.
  ok((slip?.steps ?? []).every(st => st.win || st.loss),
    'every step carries a win or a loss')
  ok((slip?.steps ?? []).some(st => st.loss),
    '...and the losses are there, which is the point of the page')
}

// ── AND THE COUNT ON THE PAGE IS DERIVED ────────────────────────────────────
{
  const page = read('app/(marketing)/flows/page.tsx')
  // "Six" was typed in THREE places - the metadata, the eyebrow and the title
  // - so adding a seventh flow left a page announcing six and rendering seven.
  // A number in prose about a list sitting beside it goes stale the moment
  // somebody edits the list.
  ok(/FLOWS\.length/.test(page),
    'THE STALE COUNT: the heading counts the flows rather than stating a number')
  ok(!/Six flows|Six places/.test(page),
    '...and the hardcoded "Six" is gone from the headings')
}

done()
