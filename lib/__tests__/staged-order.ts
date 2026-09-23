// The Google Contacts staging list: a contact with no email is greyed out and
// sits at the bottom. Asked for directly - the ones SyteNav can write to are
// the ones worth filing first - but nothing is HIDDEN, because a sub you only
// ever phone is still a sub.

import { stagedOrder, hasEmail } from '../google-contacts'
import { ok, done, code } from './_helpers'

const rows = [
  { id: 'a', email: null },
  { id: 'b', email: 'b@x.com' },
  { id: 'c', email: '   ' },
  { id: 'd', email: 'd@x.com' },
  { id: 'e', email: undefined },
]
const out = stagedOrder(rows).map(r => r.id).join('')
ok(out === 'bdace', `emails first, no-email last, each group in its original order (got ${out})`)
ok(stagedOrder(rows).length === rows.length, 'nothing is dropped')
ok(!hasEmail({ email: '  ' }), 'a blank email is no email')

const page = code('app/(dashboard)/directory/imported/page.tsx')
ok(/setRows\([^)]*stagedOrder\(/.test(page), 'the page orders what it loads')
ok(/!hasEmail\(r\)\s*&&\s*'opacity-60'/.test(page), 'a no-email row is greyed out')
ok(/No email/.test(page), 'and says why')

done()
