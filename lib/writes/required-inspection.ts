import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanTypeName, typeNameProblem, isDefaultType, missingTypes, typeSortOrder } from '@/lib/inspection-types'
import { rememberInspectionTypes } from '@/lib/inspection-types-read'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding inspections to the job's REQUIRED list - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/required-inspections` unchanged, so
// the MCP server adds to the plan through the same type-name check, the same
// skip of types already listed (skipped, not refused), and the same "remember
// a custom type for next time". The route keeps the gate - `inspections: edit`
// and the job being the GC's own, because the plan for the job is the GC's,
// not something an invited sub sets.
// ─────────────────────────────────────────────────────────────────────────────

export const REQUIRED_COLUMNS = 'id, type, sort_order, source, created_at'

export async function addRequiredInspections(
  db: SupabaseClient,
  { userId, companyId, projectId, body }: { userId: string | null; companyId: string | null; projectId: string; body: any },
): Promise<WriteResult> {
  const asked: unknown[] = Array.isArray(body?.types) ? body.types : []
  if (!asked.length) return { status: 400, body: { error: 'Pick at least one inspection.' } }
  for (const t of asked) {
    const problem = typeNameProblem(t)
    if (problem) return { status: 400, body: { error: problem } }
  }
  const source = body?.source === 'model' ? 'model' : 'manual'

  const { data: existing, error: readError } = await db
    .from('project_required_inspections').select('type').eq('project_id', projectId)
  if (readError) {
    console.error('[required-inspections] read before insert failed', readError.message)
    return { status: 500, body: { error: 'Could not load the required inspections.' } }
  }
  const toAdd = missingTypes(asked.map(t => cleanTypeName(t)!), existing ?? [])
  if (toAdd.length) {
    const rows = toAdd.map((type, i) => ({
      project_id: projectId, type, source,
      sort_order: typeSortOrder(type, (existing?.length ?? 0) + i),
      created_by: userId ?? null,
    }))
    const { error } = await db.from('project_required_inspections').insert(rows)
    // 23505: a second tab added the same type a moment ago - same outcome.
    if (error && error.code !== '23505') {
      console.error('[required-inspections] insert failed', error.message)
      return { status: 500, body: { error: 'Could not save the required inspections.' } }
    }
    // A type typed in here is one this company uses - offer it next time.
    await rememberInspectionTypes(db, companyId, toAdd.filter(t => !isDefaultType(t)))
  }

  const { data: required, error: afterError } = await db
    .from('project_required_inspections').select(REQUIRED_COLUMNS).eq('project_id', projectId).order('sort_order')
  if (afterError) console.error('[required-inspections] read after insert failed', afterError.message)
  return { status: 200, body: { required: required ?? [], added: toAdd.length, addedTypes: toAdd } }
}
