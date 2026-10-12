// "Adding one expense line to every house on a model is a bit much and back
// and forth. Why can't we just have add and update" - and, on the Projects
// list, "the houses ... are taking up the whole screen on top".

import { followSummary } from '../site-models'
import { ok, done, code } from './_helpers'

// ── one press: save the line, put it on the houses ──────────────────────────
const added = (budget: number, amounts = 0) => ({ plans: 0, budget, amounts, inspections: 0, punch: 0 })
ok(followSummary([{ houseName: 'Lot 1', added: added(1), errors: [] }, { houseName: 'Lot 2', added: added(1), errors: [] }]) === 'Saved. Added to 2 houses.',
  'a new line reaching two houses says so')
const mixed = followSummary([
  { houseName: 'Lot 1', added: added(0, 1), errors: [], kept: [] },
  { houseName: 'Lot 5', added: added(0, 0), errors: [], kept: ['Framing labor'] },
])
ok(mixed === 'Saved. Updated on 1 house. Left alone on Lot 5 - changed there by hand.',
  'a house that kept its own figure is NAMED, never counted as updated')
ok(/Could not update Lot 9/.test(followSummary([{ houseName: 'Lot 9', added: added(0), errors: ['x'] }])), 'a house that failed is named with the way to retry')
ok(followSummary([{ houseName: 'Lot 1', added: added(0), errors: [] }]) === 'Saved. Every house already had it.', 'nothing to do says so')

const dialog = code('components/budget/template-line-dialog.tsx')
ok(/useState\(true\)/.test(dialog) && /Also put this on \{follow\.label\}/.test(dialog), 'the dialog offers the houses in the same press, ticked by default')
ok(/Saved to the template, but the houses were not updated/.test(dialog), 'a failed house update never reads as a failed save - the template saved')

const panel = code('components/projects/site-models-panel.tsx')
ok(/<TemplateLineDialog templateId=\{tplId\}[^>]*follow=\{follow\}/.test(panel), 'the model editor edits its template lines in place, with the houses attached')
ok(/parts: \['budget', 'amounts'\]/.test(panel) && /house_ids: houseIds/.test(panel), '...through the same apply route, budget parts only, this model\'s houses only')
ok(/linesState === 'failed'/.test(panel), 'a failed read of the lines is not shown as "no lines"')
ok(/kept = parts\.includes\('amounts'\) \? h\.amountsKept/.test(code('app/api/projects/[id]/models/[modelId]/apply/route.ts')),
  'the apply route reports which lines a house kept, so the sentence can name it')
ok(/TemplateLineDialog/.test(code('app/(dashboard)/budget-templates/page.tsx')), 'the Budget Templates page uses the same dialog - one editor, two doors')

// ── the map view's list is the page's list ──────────────────────────────────
const map = code('components/projects/projects-map.tsx')
ok(!/setItems\(/.test(map), 'the map never replaces the list with every project after a lookup - that brought 30 houses back as rows')
ok(/await onRefresh\?\.\(\)/.test(map), '...it asks the page to re-read, so its filters still apply')
ok(/houses\.filter\(h => h\.parent_project_id === p\.id/.test(map), 'a development is its houses on the map: choosing it flies to them')
const page = code('app/(dashboard)/projects/page.tsx')
ok(/<ProjectsMap projects=\{filtered as any\}[^>]*onRefresh=\{fetchProjects\}/.test(page) && /houses=\{mapHouses as any\}/.test(page),
  'the page hands the map its folded list plus the houses as pins')

// "This gotta consolidate": a model row was Edit + Houses + Apply + Delete,
// one model per phone screen. One button now; the row opens the model.
const row = panel.slice(panel.indexOf('const bits = ['), panel.indexOf("{dialog?.kind === 'new'"))
ok((row.match(/<Button /g) ?? []).length === 1 && /Apply<\/Button>/.test(row), 'a model row carries ONE button, Apply')
ok(/Choose houses/.test(row) && /Delete model/.test(row) && /<RowMenu/.test(row), '...Houses and Delete are in its menu')
ok(/onClick=\{\(\) => setDialog\(\{ kind: 'edit'/.test(row), '...and tapping the row opens the model')
done()
