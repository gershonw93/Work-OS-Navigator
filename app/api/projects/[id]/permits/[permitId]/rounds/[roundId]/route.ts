import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { answerRound } from '@/lib/writes/permit-round'
import { filesFrom, permitFilesUploader } from '@/lib/permit-upload'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Recording the reviewer's answer to one submission: approved, corrections
// (with the list of what they asked for) or rejected.
export async function PATCH(request: Request, { params }: { params: { id: string; permitId: string; roundId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const form = await request.formData()
  const str = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : null }
  const items = form.getAll('items').filter((v): v is string => typeof v === 'string')

  const result = await answerRound(db, {
    userId: gate.actor.userId, projectId: params.id, permitId: params.permitId, roundId: params.roundId,
    fields: {
      outcome: str('outcome'), outcome_on: str('outcome_on'), note: str('note'), items,
      permit_number: str('permit_number'), issued_date: str('issued_date'), expiry_date: str('expiry_date'),
    },
    uploadFiles: permitFilesUploader(db, params.id, filesFrom(form)),
    // Files that came back through a link sent from this permit; the write
    // looks each one up through the share's permit.
    shareUploadIds: form.getAll('share_upload').filter((v): v is string => typeof v === 'string'),
  })
  return NextResponse.json(result.body, { status: result.status })
}
