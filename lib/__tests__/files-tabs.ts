// "Shared tab shows an extra empty Packets panel on top of its own empty
// state." The packets panel was the final `else` of the tab chain, and the
// Shared tab renders separately below it - so on Shared, both rendered.

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/files/page.tsx')
ok(/\) : tab === 'packets' \? \(/.test(page), 'THE BUG: the packets panel renders only on the Packets tab')
ok(/<\/>\s*\) : null\}\s*\{!loading && tab === 'shares' && \(/.test(page),
  '...the chain ends in nothing, and Shared renders on its own')

done()
