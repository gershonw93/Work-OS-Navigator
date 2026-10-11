// Moving jobs in and out of a development, wired to the database. The rules
// are in lib/development.ts; this is the one writer of `parent_project_id`
// after a job exists, shared by the development's page, Project Settings and
// "make a development from these jobs".

import { attachProblem } from './development'

/**
 * Put these jobs into a development. Only jobs this company runs; anything else
 * in the list is refused by name rather than quietly skipped.
 *
 * THE MODEL GOES. A house model belongs to ONE development (`site_models.site_id`),
 * so a house carrying a model from the development it just left would point at
 * a model the new one does not have - and "apply again" there would offer it a
 * plan set from somewhere else. What the model already copied onto the house
 * stays: plans, budget lines and punch items are the house's own once applied.
 */
export async function attachJobs(
  db: any, companyId: string, developmentId: string, projectIds: string[],
): Promise<{ moved: number } | { error: string; status: number }> {
  const ids = Array.from(new Set(projectIds.map(String))).filter(Boolean)
  if (!ids.length) return { error: 'Pick at least one job.', status: 400 }

  const { data: jobs, error } = await db
    .from('projects')
    .select('id, name, is_site, parent_project_id, gc_company_id, created_by_company_id')
    .in('id', ids)
  if (error) {
    console.error('[development] read failed', error.message)
    return { error: 'Could not read those jobs, so nothing was moved.', status: 500 }
  }
  const found = new Map((jobs ?? []).map((j: any) => [j.id, j]))
  for (const id of ids) {
    const j: any = found.get(id)
    if (!j || (j.gc_company_id !== companyId && j.created_by_company_id !== companyId)) {
      return { error: 'One of those jobs belongs to another company.', status: 403 }
    }
    const problem = attachProblem(j, developmentId)
    if (problem) return { error: problem, status: 400 }
  }

  const moving = (jobs ?? []).filter((j: any) => j.parent_project_id !== developmentId).map((j: any) => j.id)
  if (!moving.length) return { moved: 0 }
  const { error: upErr } = await db.from('projects')
    .update({ parent_project_id: developmentId, model_id: null })
    .in('id', moving)
  if (upErr) {
    console.error('[development] attach failed', upErr.message)
    return { error: 'Could not move those jobs. Try again.', status: 500 }
  }
  return { moved: moving.length }
}

/** Take one job out of its development. It becomes a job of its own again. */
export async function detachJob(
  db: any, developmentId: string, projectId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const { data, error } = await db.from('projects')
    .update({ parent_project_id: null, model_id: null })
    .eq('id', projectId)
    .eq('parent_project_id', developmentId)
    .select('id')
  if (error) {
    console.error('[development] detach failed', error.message)
    return { error: 'Could not take that job out. Try again.', status: 500 }
  }
  if (!data?.length) return { error: 'That job is not in this development.', status: 404 }
  return { ok: true }
}
