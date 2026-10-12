// "On the board view, the status control is covered by the delete button;
// clicking it opens delete confirmation. List view status works fine."
//
// The card's Edit / Invoice / Delete row was `lg:absolute lg:bottom-2
// lg:right-2` and `lg:opacity-0` until hover. The status picker sits at the
// top-right of the same card, and on a one-line card those are the same
// corner - so an INVISIBLE delete button lay over the status icon and took its
// click. opacity hides a control; it does not stop it being pressed.

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/tasks/page.tsx')
const card = page.slice(page.indexOf('function BoardCard('), page.indexOf('function ListCard('))
ok(card.length > 0, 'the board card is where it was')
const actions = (card.match(/<div data-card-actions className="([^"]*)"/) ?? [])[1] ?? ''
ok(actions.length > 0, 'the card actions row is found')
ok(!/\babsolute\b/.test(actions), 'THE BUG: the actions row is in the flow, not absolute over the card')
ok(/<StatusPicker status=\{task\.status\}/.test(card) && /deleteTask\(task\.id\)/.test(card),
  '...and the card still carries both the status picker and Delete')
ok(/lg:group-focus-within:opacity-100/.test(actions), 'keyboard focus reveals the actions as hover does')

done()
