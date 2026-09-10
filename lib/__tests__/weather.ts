// The client portal showed a sun on every daily log.
//
// It printed the character `☀` beside `{log.weather}` unconditionally - so a
// log filed on a rainy day showed the customer a sun over the word "rainy", and
// a snowy one showed a sun over "snowy". On the page a client reads, which is
// the page a daily log exists to be.
//
// The daily-logs screen inside the app has had the right table since it was
// written; the portal never got it. Two screens showing one field, one of them
// making it up - and the tell was that the "icon" was a CHARACTER, which is
// what made it impossible to vary in the first place.

import { WEATHER_OPTIONS, weatherIcon, weatherOption } from '../weather'
import { ok, done, code } from './_helpers'

// ── the weather it says is the weather that was logged ──────────────────────
ok(weatherIcon('sunny') !== weatherIcon('rainy'),
  'THE BUG: a rainy day and a sunny one do not get the same picture')
ok(weatherIcon('rainy') !== weatherIcon('snowy') && weatherIcon('windy') !== weatherIcon('cloudy'),
  '...and neither do any other two')
ok(WEATHER_OPTIONS.length === 5 && new Set(WEATHER_OPTIONS.map(o => o.icon)).size === 5,
  `every condition has its own (${WEATHER_OPTIONS.length} conditions, all distinct)`)
ok(WEATHER_OPTIONS.every(o => o.value && o.label && o.icon), '...and every one is complete')

// NULL, not a default. A condition typed by the field app or added to the list
// later gets NO icon rather than a wrong one - a wrong picture beside the right
// word is exactly what the hardcoded sun was.
ok(weatherIcon('hurricane') === null, 'a condition nobody has mapped gets no icon rather than the wrong one')
ok(weatherIcon(null) === null && weatherIcon(undefined) === null && weatherIcon('') === null,
  'and no weather logged prints nothing')
ok(weatherOption('sunny')?.label === 'Sunny', 'the label comes from the same row as the icon')

// ── one table, both screens ─────────────────────────────────────────────────
const portal = code('app/portal/[token]/page.tsx')
const logs = code('app/(dashboard)/projects/[id]/daily-logs/page.tsx')
ok(/import \{ weatherIcon \} from '@\/lib\/weather'/.test(portal),
  'THE FIX: the portal asks the shared table')
ok(!/☀/.test(portal), '...rather than printing a fixed sun beside whatever it says')
ok(/const Icon = weatherIcon\(log\.weather\)/.test(portal), '...for the weather on THAT log')
ok(/from '@\/lib\/weather'/.test(logs), 'and the daily-logs screen reads the same one')
ok(!/const WEATHER_OPTIONS = \[/.test(logs), '...which it no longer declares itself')

// The crew count beside it was the other half of the same habit.
ok(!/👷/.test(portal) && /<HardHat /.test(portal),
  'the crew count is an icon too, sized and coloured with the text beside it')

done()
