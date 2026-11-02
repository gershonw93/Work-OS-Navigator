import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { addPermitItem } from '@/lib/writes/permit-round'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// One more thing the reviewer asked for, typed in by hand - the city emailed
// another ask between rounds.
export async function POST(request: Request, { params }: { params: { id: string; permitId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({} as any))
  const result = await addPermitItem(db, {
    userId: gate.actor.userId, projectId: params.id, permitId: params.permitId, label: body?.label ?? null,
  })
  return NextResponse.json(result.body, { status: result.status })
}
