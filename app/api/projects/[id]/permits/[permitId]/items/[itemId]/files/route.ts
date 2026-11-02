import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { attachItemFiles, removeItemFile } from '@/lib/writes/permit-round'
import { filesFrom, permitFilesUploader } from '@/lib/permit-upload'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type P = { params: { id: string; permitId: string; itemId: string } }

// The file that closes a corrections item - the revised site plan, the energy
// calc. It rides along on the next resubmission and shows in Files > Permits.
export async function POST(request: Request, { params }: P) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const form = await request.formData()
  const result = await attachItemFiles(db, {
    projectId: params.id, permitId: params.permitId, itemId: params.itemId,
    uploadFiles: permitFilesUploader(db, params.id, filesFrom(form)),
  })
  return NextResponse.json(result.body, { status: result.status })
}

// Taking a wrong file off an item. Only the URL is read from the body, and it
// only ever removes a file already on this item.
export async function DELETE(request: Request, { params }: P) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({} as any))
  const result = await removeItemFile(db, {
    projectId: params.id, permitId: params.permitId, itemId: params.itemId, url: typeof body?.url === 'string' ? body.url : null,
  })
  return NextResponse.json(result.body, { status: result.status })
}
