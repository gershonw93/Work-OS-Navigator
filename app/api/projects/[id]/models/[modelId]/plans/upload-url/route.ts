import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { modelOnSite } from '@/lib/site-models-read'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * A signed upload slot for one of a model's plan files - the browser sends the
 * bytes straight to storage, the same way job plans upload, because a plan set
 * is routinely bigger than a serverless request body.
 */
export async function POST(request: Request, { params }: { params: { id: string; modelId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const model = await modelOnSite(db, params.id, params.modelId)
  if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.file_name ?? 'plan.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `models/${model.id}/${Date.now()}-${name}`
  const { data, error } = await db.storage.from('plans').createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[models/plans] could not sign an upload', error?.message)
    return NextResponse.json({ error: 'Could not start the upload.' }, { status: 500 })
  }
  return NextResponse.json({ bucket: 'plans', path, token: data.token })
}
