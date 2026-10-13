import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { createBidRequest } from '@/lib/writes/bid-request'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// Request Quotes. BOTH QUESTIONS, on both handlers: the permission
// (`request-quotes` - buyout work), and that the caller's company OWNS the job.
// This used to answer anybody with a login, and a sub invited onto the job is
// exactly who must not read the scope and the other subs pricing against them.
// Same pair as the thread route under it (`invites/[inviteId]/messages`).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'request-quotes', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data, error } = await db
    .from('bid_requests')
    // The thread's shape only - who spoke last, and when - so each invite row
    // can say "2 messages · they wrote last" without opening every thread.
    .select('*, bid_request_attachments(*), bid_invites(*), bid_submissions(*), bid_messages(bid_invite_id, side, created_at)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'request-quotes', 'create')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const form = await request.formData()

  // The scope questions, sent as JSON in the multipart form.
  const jsonField = (k: string) => {
    try { const v = JSON.parse((form.get(k) as string) || '[]'); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }
  let existing: { file_url: string; file_name?: string }[] = []
  const existingRaw = form.get('existing_attachments') as string | null
  if (existingRaw) {
    try { const v = JSON.parse(existingRaw); if (Array.isArray(v)) existing = v } catch { /* ignore malformed */ }
  }

  const result = await createBidRequest(db, {
    userId: gate.actor.userId, projectId: params.id, existingAttachments: existing,
    fields: {
      title: (form.get('title') as string) || null,
      trade: (form.get('trade') as string) || null,
      description: (form.get('description') as string) || null,
      due_date: (form.get('due_date') as string) || null,
      package_type: (form.get('package_type') as string) || null,
      material_by: (form.get('material_by') as string) || null,
      included: jsonField('included'),
      excluded: jsonField('excluded'),
      ask_for: jsonField('ask_for'),
      item_list: jsonField('item_list'),
    },
  })
  if (result.status >= 400) return NextResponse.json(result.body, { status: result.status })
  const req = result.body.request

  // Newly-uploaded plans / attachments
  const files = form.getAll('attachments') as File[]
  for (const file of files) {
    if (!file || file.size === 0) continue
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${params.id}/bid-requests/${req.id}/${Date.now()}-${safe}`
    const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
    if (!upErr) {
      const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
      if (signed?.signedUrl) await db.from('bid_request_attachments').insert({ bid_request_id: req.id, file_url: signed.signedUrl, file_name: file.name })
    }
  }

  return NextResponse.json({ request: req })
}
