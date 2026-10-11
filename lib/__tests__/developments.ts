// Developments: what Bulk Add makes, and now what you can add to and move
// between. "I don't see anywhere once I am in [one] where I can add another
// one ... the option of taking two jobs and applying it to a group as well.
// Just the ease of moving things around and adding things everywhere."

import { attachProblem, newJobProblem, newJobName, newDevelopmentProblem, DEVELOPMENT } from '../development'
import { ok, done, code } from './_helpers'

// ── the rules ───────────────────────────────────────────────────────────────
ok(attachProblem({ id: 'j1', is_site: false }, 'd1') === null, 'a job can go into a development')
ok(attachProblem({ id: 'd2', name: 'Oak Ridge', is_site: true }, 'd1') !== null, 'a development cannot go inside another one')
ok(attachProblem({ id: 'd1' }, 'd1') !== null, '...or inside itself')
ok(attachProblem({ id: 'j1', parent_project_id: 'd9' }, 'd1') === null, 'a job in ANOTHER development can move here')
ok(newJobProblem({}) !== null && newJobProblem({ address: '12 Oak Ln' }) === null && newJobProblem({ name: 'Lot 7' }) === null,
  'a new job needs a name or an address - either will do')
ok(newJobName({ address: '12 Oak Ln, Palm Coast, FL 32164' }) === '12 Oak Ln', '...and is named by its street when only an address was typed')
ok(newJobName({ name: ' Lot 7 ', address: '12 Oak Ln' }) === 'Lot 7', '...or by the name somebody typed')
ok(newDevelopmentProblem({ name: 'x', projectIds: [] }) !== null && newDevelopmentProblem({ name: ' ', projectIds: ['a'] }) !== null,
  'a new development needs a name and at least one job')

// ── the doors ───────────────────────────────────────────────────────────────
const units = code('app/(dashboard)/projects/[id]/units/page.tsx')
ok(/setAdding\(true\)/.test(units) && /setAddingExisting\(true\)/.test(units), 'THE ASK: inside a development you can add a job, and add jobs you already have')
ok(/Move to another development/.test(units) && /Take out of this development/.test(units), '...and move or take out any job from its row')
ok(!/rounded-xl border border-line overflow-hidden/.test(units), '...on a card that does not clip the row menu')
ok(/'existing'/.test(code('components/projects/bulk-add-modal.tsx')) && /GroupExistingForm/.test(code('components/projects/bulk-add-modal.tsx')),
  'Bulk Add can make a development out of jobs you already have')
ok(/MoveJobDialog/.test(code('components/layout/edit-project-button.tsx')), 'Project Settings says which development a job is in, with Change')
ok(/setOpen\(false\); setMoving\(true\)/.test(code('components/layout/edit-project-button.tsx')),
  '...as its own step after Settings closes - one dialog, one save, never two dialogs at once')

// ── the routes ask what any job door asks ───────────────────────────────────
const newJob = code('app/api/projects/[id]/children/new/route.ts')
ok(/requirePermission\(db, request, 'projects', 'create'\)/.test(newJob) && /projectSlotProblem\(db, companyId, new Date\(\), 1\)/.test(newJob),
  'a new job in a development asks create AND the plan\'s cap - it is a job on the plan wherever it is made')
ok(/ownedProject/.test(newJob) && /modelOnSite\(/.test(newJob), '...in a development this company owns, with one of ITS models')
ok(/parent_project_id: params\.id/.test(newJob) && /client: dev\.client/.test(newJob), '...and takes the development\'s client')
const children = code('app/api/projects/[id]/children/route.ts')
ok(/requirePermission\(db, request, 'projects', 'edit'\)/.test(children) && /is_site/.test(children), 'moving jobs needs edit, on something that IS a development')
const db = code('lib/development-db.ts')
ok(/gc_company_id !== companyId && j\.created_by_company_id !== companyId/.test(db), 'only this company\'s jobs move - another company\'s is refused, not skipped')
ok(/parent_project_id: developmentId, model_id: null/.test(db), 'a job that moves drops its old development\'s model')
ok(/\.eq\('parent_project_id', developmentId\)/.test(db), 'taking a job out only takes it out of THIS development')
const groupNew = code('app/api/projects/developments/route.ts')
ok(/is_site: true/.test(groupNew) && /delete\(\)\.eq\('id', dev\.id\)/.test(groupNew), 'a development made from jobs is removed again if the move fails - no empty folder left behind')

// ── the word ────────────────────────────────────────────────────────────────
ok(DEVELOPMENT === 'Development', 'it is called a Development')
ok(/>\s*Development\s*</.test(code('components/layout/project-tabs.tsx')) && !/>\s*Site\s*</.test(code('components/layout/project-tabs.tsx')), '...on its badge')
ok(/Development · \{childCount/.test(code('app/(dashboard)/projects/page.tsx')), '...and on the Projects list')

done()
