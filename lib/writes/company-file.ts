import type { SupabaseClient } from '@supabase/supabase-js'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Recording a file in the company's Files library - the ONE home for it.
//
// Moved out of `POST /api/files` unchanged: sign the stored path for ten
// years, insert the `company_files` row, accept a "filled from" parent only
// when this company owns it, and retry without the fill columns on an older
// database. The route keeps both of its ways in (a signed-URL upload the
// browser finished, or multipart) and the gate; this is everything after the
// bytes are in the `company-files` bucket. The MCP server (Claude) calls it
// after storing a document it was handed (lib/writes/stored-document.ts).
//
// `company_files` has no project column: Files is the COMPANY's library. A
// job's paperwork lives on the job's own tabs (plans, permits, compliance,
// bills), which is where Claude is pointed for those.
// ─────────────────────────────────────────────────────────────────────────────

/** The folders the Files screen offers. Anything else files under Other. */
export const FILE_CATEGORIES = ['Insurance', 'License', 'W-9', 'Site Plans', 'ID/Legal', 'Permits', 'Other'] as const

export async function recordCompanyFile(
  db: SupabaseClient,
  { userId, companyId, storagePath, name, category, fileType, fileSize, filledFromId, via }: {
    userId: string
    companyId: string
    storagePath: string
    name: string
    category: string
    fileType: string | null
    fileSize: number | null
    filledFromId: string | null
    via?: string
  },
): Promise<WriteResult> {
  const company_id = companyId
  const { data: signed, error: signError } = await db.storage
    .from('company-files')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

  if (signError || !signed?.signedUrl) {
    return { status: 500, body: { error: signError?.message ?? 'Could not create file URL' } }
  }

  const row: Record<string, unknown> = {
    company_id,
    name,
    category,
    file_url: signed.signedUrl,
    file_type: fileType,
    size_bytes: fileSize,
  }

  if (filledFromId) {
    // Only accept a parent this company actually owns - the id arrives from the
    // browser, and a file should never be able to claim descent from someone
    // else's document.
    const { data: parent } = await db.from('company_files')
      .select('id').eq('id', filledFromId).eq('company_id', company_id).maybeSingle()
    if (parent) {
      const { data: profile } = await db.from('profiles')
        .select('full_name').eq('id', userId).maybeSingle()
      row.filled_from_id = parent.id
      row.filled_by = (profile as any)?.full_name ? withVia((profile as any).full_name, via) : null
      row.filled_at = new Date().toISOString()
    }
  }

  let { data: companyFile, error } = await db.from('company_files').insert(row).select().single()

  // Pre-migration fallback: the fill columns may not be there yet.
  if (error && (error as any).code === '42703') {
    delete row.filled_from_id; delete row.filled_by; delete row.filled_at
    const retry = await db.from('company_files').insert(row).select().single()
    companyFile = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }
  return { status: 201, body: { file: companyFile } }
}
