// Progress hung on "Loading..." - reported once in review, gone on reload.
//
// The load ended with a bare setLoading(false), which only runs on the happy
// path: a fetch that THROWS (a dropped connection) skipped it and left the page
// loading for ever. And a refused response set nothing and fell through to "No
// tasks yet" - a failure rendered as an empty list. CLAUDE.md: "A loading
// state must have a WAY TO END" and "Loading and failed are different facts".

import { ok, done, code } from './_helpers'

const src = code('app/(dashboard)/projects/[id]/progress/page.tsx')
ok(/finally\s*\{[\s\S]*?setLoading\(false\)/.test(src), 'loading ends in finally, so a thrown request cannot leave it spinning')
ok(/setError\(/.test(src) && /\) : error \? \(/.test(src), 'a failed load renders as a failure, not as "No tasks yet"')
ok(/Try again/.test(src) && /setAttempt\(/.test(src), '...with a way to try again without reloading')
done()
