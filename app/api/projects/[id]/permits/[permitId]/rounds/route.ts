import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { submitRound } from '@/lib/writes/permit-round'
import { filesFrom, permitFilesUploader } from '@/lib/permit-upload'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Logging a submission: "it went to the township on Oct 3, here is what we
// sent". Same gate as editing the permit - it is the GC's paperwork with the
// township, so the job must be the caller's own.
export async function POST(request: Request, { params }: { params: { id: string; permitId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const form = await request.formData()
  const str = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : null }

  const result = await submitRound(db, {
    userId: gate.actor.userId, projectId: params.id, permitId: params.permitId,
    fields: { submitted_on: str('submitted_on'), expected_by: str('expected_by'), note: str('note') },
    uploadFiles: permitFilesUploader(db, params.id, filesFrom(form)),
    // Fixes already attached to this permit's items; the write keeps only those.
    carry: form.getAll('carry').filter((v): v is string => typeof v === 'string'),
  })
  return NextResponse.json(result.body, { status: result.status })
}
