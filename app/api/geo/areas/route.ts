import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { searchAreas, searchNearby } from '@/lib/job-areas'
import { cleanAreas } from '@/lib/permit-jurisdiction'

export const runtime = 'nodejs'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// "Towns it covers" on a township's Directory card: townships and counties by
// name, from the map service. Gated (Directory view) - the map key is paid
// per call, and an open proxy for it is a bill anybody can run up.
export async function GET(request: Request) {
  const gate = await requirePermission(admin(), request, 'directory', 'view')
  if (denied(gate)) return gate.denied
  const params = new URL(request.url).searchParams
  // ?near= is the place just picked (name, kind, state, placeId as JSON):
  // the townships or counties around it, suggested under the picker.
  const near = params.get('near')
  if (near) {
    let picked = null
    try { picked = cleanAreas([JSON.parse(near)])[0] ?? null } catch { /* refused below */ }
    if (!picked) return NextResponse.json({ error: 'Which place?' }, { status: 400 })
    return NextResponse.json({ areas: await searchNearby(picked) })
  }
  const q = params.get('q') ?? ''
  return NextResponse.json({ areas: await searchAreas(q) })
}
