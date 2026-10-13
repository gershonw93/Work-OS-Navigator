// HOUSE MODELS - "30 houses, three models: upload plans and select which of
// the 30 get which, same with budget sheets, punch list, checklist items."
// And for later changes to a model: "ask and I'll select".

import { planApply, plansFor, applySummary, modelNameProblem, distinctModelNames, type ModelPlan } from '../site-models'
import { ok, done, read, code } from './_helpers'

const P = (id: string, handing: ModelPlan['handing']): ModelPlan => ({ id, name: id, plan_type: 'architectural', handing, storage_path: `models/m/${id}.pdf` })
const plans = [P('floor', 'any'), P('left-set', 'left'), P('right-set', 'right')]

// ── the garage side picks the plan set ──────────────────────────────────────
ok(plansFor({ garage_side: 'left' }, plans).fit.map(p => p.id).join() === 'floor,left-set', 'a garage-left house gets the shared plans and the left set')
ok(plansFor({ garage_side: 'right' }, plans).fit.map(p => p.id).join() === 'floor,right-set', '...a garage-right house the right set')
const unknown = plansFor({ garage_side: null }, plans)
ok(unknown.fit.map(p => p.id).join() === 'floor' && unknown.skipped.length === 2,
  'a house with no garage side gets NEITHER handed set - it is not guessed - and both are reported, not dropped')

// ── applying twice adds nothing twice ───────────────────────────────────────
const houses = [
  { id: 'h1', name: '89 White Hall Dr', model_id: 'm', garage_side: 'left' as const },
  { id: 'h2', name: '34 Wheeling Ln', model_id: 'other', garage_side: 'right' as const },
]
const items = [
  { id: 'i1', kind: 'inspection' as const, title: 'Framing' },
  { id: 'i2', kind: 'inspection' as const, title: 'Septic Final' },
  { id: 'p1', kind: 'punch' as const, title: 'Touch up paint' },
]
const lines = [
  { id: 'l1', category: 'Framing', cost_code: null, description: 'Framing labor', default_amount: '18000.00' },
  { id: 'l2', category: 'Roofing', cost_code: null, description: 'Shingles', default_amount: '9000.00' },
  { id: 'l3', category: 'Roofing', cost_code: null, description: 'shingles', default_amount: '1.00' },
]
const fresh = planApply({ modelId: 'm', plans, items, templateLines: lines, houses, has: {} })
ok(fresh[0].plans.length === 2 && fresh[0].budget.length === 2 && fresh[0].inspections.length === 2 && fresh[0].punch.length === 1,
  'a fresh house gets its plans, the budget, the inspections and the punch items - and a duplicated template line once')
ok(fresh[0].onModel && !fresh[1].onModel, 'a house on another model is shown as such, not silently included')
const again = planApply({
  modelId: 'm', plans, items, templateLines: lines, houses,
  has: { h1: { planSources: ['floor', 'left-set'], taskSources: ['p1'], inspectionTypes: ['framing'], budgetDescriptions: ['Framing Labor', 'Shingles'] } },
})
ok(again[0].plans.length === 0 && again[0].punch.length === 0 && again[0].budget.length === 0,
  'APPLYING AGAIN ADDS ONLY WHAT IS MISSING - nothing a house already holds from the model is doubled')
ok(again[0].inspections.join() === 'Septic Final', '...so a type added to the model later is the one thing that goes on')
ok(applySummary(again[0], ['plans', 'budget']) === null && applySummary(again[0]) === '1 inspection',
  'the preview line says what is new, for the parts ticked, or nothing')
ok(applySummary(fresh[0]) === '2 plans · 2 budget lines · 2 inspections · 1 punch item', 'and counts each part')

ok(modelNameProblem('the aspen', ['The Aspen']) !== null && modelNameProblem('', []) !== null && modelNameProblem('The Birch', ['The Aspen']) === null,
  'a model name is required and unique in its group, case-blind')
ok(distinctModelNames(['Aspen', 'aspen', null, ' Birch ']).join() === 'Aspen,Birch', 'a lot list\'s model column becomes one model per name')

// ── the preview and the apply are one computation ───────────────────────────
const apply = code('app/api/projects/[id]/models/[modelId]/apply/route.ts')
ok((apply.match(/planApply\(/g) ?? []).length === 1 && /async function load/.test(apply) && (apply.match(/await load\(/g) ?? []).length === 2,
  'GET (the preview) and POST (the apply) both run the same load + planApply - what was shown is what is written')
ok(/houseIds\.has\(p\.houseId\)/.test(apply), 'the apply writes only the houses the person ticked')
ok(/actorCan\(gate\.actor, \.\.\.PART_PERMISSION\[p\]\)/.test(apply), 'each part is gated on the permission for what it writes - budget on budget, punch on tasks')
ok(/storage\.from\('plans'\)\.copy\(/.test(apply), 'each house gets its OWN copy of a plan file, so deleting one house\'s plan cannot take thirty')
ok(/source_model_plan_id: p\.id/.test(apply) && /source_model_item_id: i\.id/.test(apply), 'every copy records its source - that is what makes applying again safe')
ok(/ownedProject/.test(apply), 'and the group must be the caller\'s company\'s')

const read_ = code('lib/site-models-read.ts')
ok(/throw new Error\(`reading what the houses hold/.test(read_),
  'a failed read of what houses hold REFUSES the apply - it would otherwise read as "holds nothing" and write everything twice')

for (const f of ['app/api/projects/[id]/models/route.ts', 'app/api/projects/[id]/models/[modelId]/route.ts', 'app/api/projects/[id]/models/[modelId]/items/route.ts', 'app/api/projects/[id]/models/[modelId]/plans/route.ts', 'app/api/projects/[id]/models/[modelId]/plans/upload-url/route.ts', 'app/api/projects/[id]/house-models/route.ts']) {
  const src = code(f)
  ok(/requirePermission/.test(src) && /ownedProject/.test(src), `${f.replace('app/api/projects/[id]/', '')} asks for a permission AND that the group is yours`)
}
ok(/modelOnSite/.test(code('app/api/projects/[id]/house-models/route.ts')) && /\.eq\('parent_project_id', params\.id\)/.test(code('app/api/projects/[id]/house-models/route.ts')),
  'assigning checks the model and the houses both belong to this group - ids from a body prove nothing')
ok(/startsWith\(`models\/\$\{model\.id\}\/`\)/.test(code('app/api/projects/[id]/models/[modelId]/plans/route.ts')),
  'a model plan\'s storage path must be the model\'s own')

// ── schema ──────────────────────────────────────────────────────────────────
const m = read('supabase/migrations/133_site_models.sql')
ok(/site_id uuid NOT NULL REFERENCES projects \(id\) ON DELETE CASCADE/.test(m) && /model_id uuid REFERENCES site_models \(id\) ON DELETE SET NULL/.test(m),
  'a model goes with its group, and deleting a model leaves its houses unassigned rather than deleted')
ok(/kind text NOT NULL DEFAULT 'task'/.test(m), 'every existing task stays a task; punch is a kind')
ok(!/REFERENCES [a-z_]+ \([a-z_]+\)(?! ON DELETE)/.test(m.replace(/\n/g, ' ')), 'every foreign key states its ON DELETE rule')

// ── the main budget and the punch list are reachable ────────────────────────
ok(/'budget'/.test(read('components/layout/project-tabs.tsx').match(/SITE_ALLOWED = new Set\(\[[^\]]*\]/)?.[0] ?? ''),
  'a group of houses has its own Budget tab - the main budget')
ok(/siteBudget/.test(read('app/(dashboard)/projects/[id]/units/page.tsx')) && /houses \+ Number\(siteBudget/.test(read('app/(dashboard)/projects/[id]/units/page.tsx')),
  'the Jobs roll-up adds the main budget to the houses - profit from the houses alone would overstate it')
ok(/updates\.kind = body\.kind/.test((read('app/api/projects/[id]/tasks/[taskId]/route.ts') + read('lib/writes/task.ts'))) && /kind: 'punch'/.test((read('app/api/projects/[id]/tasks/route.ts') + read('lib/writes/task.ts'))),
  'punch is accepted by BOTH task doors - a field the edit route drops fails exactly like one it refuses')
ok(/filterMode === 'punch'/.test(read('app/(dashboard)/projects/[id]/tasks/page.tsx')), 'and the Tasks tab can show the punch list on its own')
ok(/distinctModelNames/.test(code('app/api/projects/bulk/route.ts')), 'a lot list naming models creates them and assigns the houses')

// "can I upload a budget right here?" - in the model, not a trip to Budget Templates.
const panel = code('components/projects/site-models-panel.tsx')
ok(/fetch\('\/api\/budget-templates\/import'/.test(panel), 'THE MODEL TAKES A SPREADSHEET: read by the same importer the Budget Templates page uses')
ok(/call\('\/api\/budget-templates', \{ method: 'POST'/.test(panel) && /budget_template_id: made\.data\.template\.id/.test(panel),
  '...saved as a template and selected on the model - one home for a budget, not a second')
ok(/amounts === 0/.test(panel), '...and a sheet read with no amounts says so')

done()
