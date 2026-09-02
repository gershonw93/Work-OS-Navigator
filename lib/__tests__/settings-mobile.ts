// Settings on a phone.
//
// REPORTED: "Mobile setting page is a disaster squish." The tab rail was a fixed
// 56px icon column at EVERY width, so on a 390px phone the rail plus its 24px
// gap came out of the content before anything was drawn. What was left put "Task
// assigned to me" on three lines with the switches jammed against the edge - and
// icon-only tabs meant guessing which one was which.
//
// CSS, so this checks the specific things that were wrong rather than pretending
// to judge a layout. Each one is a regression that shipped.

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/settings/page.tsx')
const notif = code('components/settings/notification-settings.tsx')

// ── the rail has to collapse ─────────────────────────────────────────────────
ok(!/w-14 md:w-52/.test(page), 'the tab rail is no longer a fixed 56px column on a phone')
ok(/shrink-0 md:w-52/.test(page), '...it only takes a fixed width from md up')
ok(/flex flex-col gap-4 md:flex-row/.test(page), 'the page stacks on a phone and goes side-by-side from md')

// A horizontal strip you can scroll, rather than a squeezed column.
ok(/overflow-x-auto/.test(page), 'the tabs scroll horizontally on a phone')
ok(/md:block md:space-y-1 md:overflow-visible/.test(page), '...and become a column again from md')

// ── the labels come back ─────────────────────────────────────────────────────
// `hidden md:block` on the label is what made a phone show nine unlabelled
// icons. A horizontal strip has room for words.
ok(!/<span className="hidden md:block">\{label\}<\/span>/.test(page),
  'tab labels are not hidden on a phone any more')
ok(/whitespace-nowrap/.test(page), '...and a label does not wrap inside its chip')

// The left border only reads as "selected" in a column - on a strip it is a
// stray line, so it is md-only and a phone gets a filled chip.
ok(/md:border-l-4 md:border-accent/.test(page), 'the selected marker is a left border only from md')
ok(!/'rounded-r-lg border-l-4 border-accent bg-accent-tint text-accent-fg pl-2'/.test(page),
  '...not at every width')

// ── the switch gutter ────────────────────────────────────────────────────────
// Two 40px switches with a 24px gutter is 104px taken from the label beside them.
ok(/gap-3 pt-0\.5 sm:gap-6/.test(notif), 'the switches sit closer together on a phone')
ok(/gap-3 pr-1 .*sm:gap-6/.test(notif), '...and so does the header above them')
ok(/min-w-0 flex-1/.test(notif), 'the label takes the space that is left rather than being squeezed')
ok(/whitespace-nowrap rounded-full bg-surface/.test(notif),
  'the "Coming soon" pill stays on one line instead of breaking mid-phrase')

// ── the wide tables were already right - keep them that way ──────────────────
const perms = code('components/settings/permissions-panel.tsx')
ok(/overflow-x-auto/.test(perms), 'the permissions grid scrolls rather than squishing')

done()
