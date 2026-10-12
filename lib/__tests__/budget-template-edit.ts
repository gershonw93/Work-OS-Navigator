// BUDGET TEMPLATES YOU CAN EDIT, AND HOUSES THAT FOLLOW THEM.
//
// "if i need to add one expense line across all houses in the template how do
// i do it? ... you cant just add the line with its amount its not an option".
// The Budget Templates page could upload, list and delete - nothing else - and
// the model editor pointed there to "fill the amounts in". Two halves:
//   1. a template's lines can be added, changed and removed;
//   2. Apply puts a changed AMOUNT on the houses still on the old figure, and
//      leaves alone (and lists) a figure somebody changed on a house.

import { amountChange, amountChanges, cleanTemplateLine, templateNameProblem } from '../budget-template-line'
import { planApply, applySummary, APPLY_PARTS } from '../site-models'
import { ok, done, read, code } from './_helpers'

// ── which house lines follow the template ───────────────────────────────────
const item = { id: 't1', default_amount: '20000.00' }
const line = (budgeted: string | null, source: string | null, src = 't1') =>
  ({ id: 'b1', description: 'Framing labor', budgeted_amount: budgeted, source_template_item_id: src, source_amount: source })

const follows = amountChange(line('18000.00', '18000.00'), item)
ok(!!follows && 'update' in follows && follows.update.from === 18000 && follows.update.to === 20000,
  'a house still on the figure it was copied at FOLLOWS the template: 18,000 -> 20,000')
const handEdited = amountChange(line('19500.00', '18000.00'), item)
ok(!!handEdited && 'kept' in handEdited && handEdited.kept.why === 'changed_here' && handEdited.kept.house === 19500,
  'a figure somebody changed on the house is LEFT ALONE, and said - never overwritten')
const untracked = amountChange(line('18000.00', null), item)
ok(!!untracked && 'kept' in untracked && untracked.kept.why === 'untracked',
  'a line with no copied-at figure cannot be told apart from a hand edit, so it is left alone too')
ok(amountChange(line('20000.00', '18000.00'), item) === null,
  'a house already on the new figure has nothing to update or report')
ok(amountChange(line('18000', '18000.00'), { id: 't1', default_amount: 18000 }) === null,
  'NUMERIC comes back as a string: "18000.00" and 18000 are the same amount, compared in cents')
ok(amountChange(line('0.00', '0.00'), { id: 't1', default_amount: null }) === null,
  'a template line with no amount is copied as zero, and zero against zero is no change')
const many = amountChanges([line('18000.00', '18000.00'), { ...line('5.00', '5.00', 'gone'), id: 'b2' }], [item])
ok(many.updates.length === 1 && many.kept.length === 0, 'a line whose template line no longer exists is not compared with anything')

// ── the apply plan carries them ─────────────────────────────────────────────
const lines = [{ id: 't1', category: 'Framing', cost_code: null, description: 'Framing labor', default_amount: '20000.00' }]
const houses = [{ id: 'h1', name: 'Lot 1', model_id: 'm', garage_side: null }]
const plan = planApply({
  modelId: 'm', plans: [], items: [], templateLines: lines, houses,
  has: { h1: { planSources: [], taskSources: [], inspectionTypes: [], budgetDescriptions: ['Framing - labour (renamed)'],
    budgetLines: [{ id: 'b1', description: 'Framing - labour (renamed)', budgeted_amount: '18000.00', source_template_item_id: 't1', source_amount: '18000.00' }] } },
})
ok(plan[0].budget.length === 0, 'a line renamed on the house is still HELD by its source - applying again does not add a second one')
ok(plan[0].amountUpdates.length === 1, '...and its amount change is offered')
ok(applySummary(plan[0], ['amounts']) === '1 amount change', 'the house row says so')
ok(applySummary(plan[0], ['budget']) === null, '...and only when amount changes are ticked')
ok(APPLY_PARTS.indexOf('amounts') === APPLY_PARTS.indexOf('budget') + 1,
  'new lines and changed amounts are SEPARATE choices: adding a line is harmless, rewriting thirty figures is a decision')

// ── the apply writes the source, and updates only what it previewed ─────────
const apply = code('app/api/projects/[id]/models/[modelId]/apply/route.ts')
ok(/source_template_item_id: l\.id/.test(apply) && /source_amount: toAmount\(l\.default_amount\) \?\? 0/.test(apply),
  'a copied line remembers its template line and the amount it was copied at')
ok(/amounts: \['budget', 'edit'\]/.test(apply), 'changing amounts needs budget:edit')
ok(/\.eq\('budgeted_amount', u\.from\)\.eq\('source_amount', u\.from\)/.test(apply),
  'the update is CONDITIONAL on the line still holding the previewed figure - an edit made in between wins')
const mig = read('supabase/migrations/138_budget_line_template_source.sql')
ok(/source_template_item_id uuid REFERENCES budget_template_items \(id\) ON DELETE SET NULL/.test(mig),
  'deleting a template line never takes a house\'s line with it')
ok(/ELSE NULL END/.test(mig), 'a backfilled line whose figure differed from the template is marked "cannot tell", not "untouched"')
ok(/source_template_item_id, source_amount/.test(code('lib/site-models-read.ts')), 'the reader fetches the two columns the rule reads')

// ── a template can be edited ────────────────────────────────────────────────
ok(cleanTemplateLine({ description: '  ', default_amount: '5' }).ok === false, 'a line needs a description')
const c = cleanTemplateLine({ description: 'Dumpster', default_amount: '', cost_type: 'weird' })
ok(c.ok && c.value.default_amount === null && c.value.cost_type === 'hard' && c.value.category === 'General',
  'a blank amount is a placeholder (null), not zero; an unknown cost type is hard')
ok(cleanTemplateLine({ description: 'X', default_amount: 'abc' }).ok === false, 'an amount that is not a number is refused')
ok(templateNameProblem('') !== null && templateNameProblem('Aspen') === null, 'a template needs a name')

const T = 'app/api/budget-templates/'
for (const f of ['[templateId]/route.ts', '[templateId]/items/route.ts', '[templateId]/items/[itemId]/route.ts']) {
  const src = code(T + f)
  ok(/requirePermission\(db, request, 'budget', '(edit|delete)'\)/.test(src), `${f}: a write needs budget permission`)
  ok(/ownedTemplate\(db, gate\.actor\.companyId/.test(src), `${f}: ...and the template must be the caller's company's`)
  ok(!/auth\.getUser/.test(src), `${f}: not "signed in" alone`)
}
ok(/\.eq\('template_id', owned\.template\.id\)/.test(code(T + '[templateId]/items/[itemId]/route.ts')),
  'a line is changed only on the template named in the URL - a line id from another template matches nothing')
const list = code(T + 'route.ts')
ok(/requirePermission\(db, request, 'budget', 'view'\)/.test(list) && /requirePermission\(db, request, 'budget', 'edit'\)/.test(list),
  'listing needs budget:view and creating needs budget:edit')
ok(/requirePermission\(admin\(\), request, 'budget', 'edit'\)/.test(code(T + 'import/route.ts')), 'the importer is gated too')

const page = code('app/(dashboard)/budget-templates/page.tsx')
ok(/call\(base, \{ method: 'POST'/.test(page) && /method: 'PATCH'/.test(page) && /method: 'DELETE'/.test(page),
  'THE PAGE EDITS: add a line, change one, remove one')
ok(/cleanTemplateLine\(body\)/.test(page), '...asking the same rule the route asks before sending')
ok(/New template/.test(page), 'a template can be started from scratch, as the model editor has always claimed')
ok(/get\('t'\)/.test(page) && /deepLinked\.current = true/.test(page), '/budget-templates?t=<id> opens that template, once')
ok(!/fileRef\.current\?\.click\(\)/.test(page), 'Upload Excel is a label over the input, not a programmatic click')

const panel = code('components/projects/site-models-panel.tsx')
ok(/href=\{`\/budget-templates\?t=\$\{model\.budget_template_id\}`\}/.test(panel), 'the model links straight to ITS template')
ok(!/fill the amounts in on the Budget Templates page/.test(panel), 'and no longer sends somebody to a page that could not do it')
ok(/h\.amountUpdates\.map/.test(panel) && /h\.amountsKept\.map/.test(panel), 'the Apply preview lists each change and each line left alone')

done()
