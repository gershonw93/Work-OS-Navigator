import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import type { Action } from '@/lib/permissions'
import { createSelectionOption, selectionOnJob } from '@/lib/writes/selection'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Both handlers used to ask only "is somebody signed in" and keyed the option
// by `selId` alone - so any account could add or delete options on any
// selection, on any job, through any job's URL. Now: `selections`, the job is
// the caller's company's, and the selection is on that job.
async function gate(request: Request, projectId: string, action: Action) {
  const db = admin()
  const g = await requirePermission(db, request, 'selections', action)
  if (denied(g)) return g
  const owned = await ownedProject(db, g.actor, projectId, 'id')
  if ('denied' in owned) return owned
  return { db, actor: g.actor }
}

// What the client gets to choose from. The body is `createSelectionOption` in
// `lib/writes/selection.ts`, shared with the MCP server.
export async function POST(request: Request, { params }: { params: { id: string; selId: string } }) {
  const g = await gate(request, params.id, 'edit')
  if ('denied' in g) return g.denied

  const body = await request.json()
  const result = await createSelectionOption(g.db, { userId: g.actor.userId, projectId: params.id, selId: params.selId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request, { params }: { params: { id: string; selId: string } }) {
  const g = await gate(request, params.id, 'delete')
  if ('denied' in g) return g.denied
  const db = g.db

  const optionId = new URL(request.url).searchParams.get('optionId')
  if (!optionId) return NextResponse.json({ error: 'Which option?' }, { status: 400 })

  const where = await selectionOnJob(db, params.id, params.selId)
  if (where) return NextResponse.json(where.body, { status: where.status })

  const { error } = await db.from('selection_options')
    .delete().eq('id', optionId).eq('selection_id', params.selId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
