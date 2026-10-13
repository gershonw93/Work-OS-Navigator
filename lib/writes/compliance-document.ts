import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { expiryState } from '@/lib/expiry'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Filing a compliance document (COI, W-9, licence, workers' comp) on a job -
// the ONE home for the write.
//
// Moved out of `POST /api/projects/[id]/compliance` unchanged - the same upsert
// on (company, type, job), the same pre-migration retry without `notes`, the
// same activity line - so the MCP server (Claude) files a certificate through
// exactly the code the Compliance tab does. WHO MAY is
// lib/writes/compliance-access.ts, which the route asks first.
// ─────────────────────────────────────────────────────────────────────────────

export const COMPLIANCE_TYPES = ['coi', 'license', 'w9', 'workers_comp', 'other'] as const
export type ComplianceType = typeof COMPLIANCE_TYPES[number]

/**
 * The status a document filed BY CLAUDE is stored with. THE DATE DECIDES
 * (`statusFromExpiry` in lib/compliance-report.ts): a dated document reads
 * current, expiring or expired off its date whatever the row says, so the row
 * must never say the opposite - a lapsed COI stored "approved" is the bug
 * lib/expiry.ts exists for. An undated one (a W-9) is `pending` - reviewed by
 * a person, never approved by a model.
 */
export function complianceStatusFor(expiry: string | null | undefined, today?: Date): 'pending' | 'expired' | 'expiring_soon' {
  const state = expiryState(expiry ?? null, today ? { today } : {})
  if (state === 'expired') return 'expired'
  if (state === 'soon') return 'expiring_soon'
  return 'pending'
}

export async function fileComplianceDocument(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const params = { id: projectId }
  const { company_id, type, status, expiry_date, notes, file_url } = body ?? {}

  if (!company_id || !type) {
    return { status: 400, body: { error: 'company_id and type are required' } }
  }

  const row: Record<string, unknown> = {
    company_id,
    project_id: params.id,
    type,
    status: status ?? 'pending',
    expiry_date: expiry_date ?? null,
    notes: notes ?? null,
    file_url: file_url ?? null,
  }

  let { data: doc, error } = await db
    .from('compliance_documents')
    .upsert(row, { onConflict: 'company_id,type,project_id' })
    .select()
    .single()

  // Retry without notes if migration hasn't run yet
  if (error && (error as any).code === '42703') {
    delete row.notes
    const retry = await db
      .from('compliance_documents')
      .upsert(row, { onConflict: 'company_id,type,project_id' })
      .select()
      .single()
    doc = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, withVia((profile as any)?.full_name || 'Someone', via), 'compliance_document_added',
    `Compliance document added: ${type}`, { doc_id: (doc as any).id, type, status: (doc as any).status }, user.id)

  return { status: 201, body: { doc } }
}

/** Does this company have a subcontract on this job? A failed read is a no. */
export async function companyOnJob(db: SupabaseClient, projectId: string, companyId: string): Promise<boolean> {
  const { data, error } = await db.from('subcontracts').select('id').eq('project_id', projectId).eq('company_id', companyId).limit(1)
  if (error) { console.error('[compliance] subcontract lookup:', error.message); return false }
  return !!data?.length
}
