import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { searchAreas } from '@/lib/job-areas'

export const runtime = 'nodejs'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// "Towns it covers" on a township's Directory card: townships and counties by
// name, from the map service. Gated (Directory view) - the map key is paid
// per call, and an open proxy for it is a bill anybody can run up.
export async function GET(request: Request) {
  const gate = await requirePermission(admin(), request, 'directory', 'view')
  if (denied(gate)) return gate.denied
  const q = new URL(request.url).searchParams.get('q') ?? ''
  return NextResponse.json({ areas: await searchAreas(q) })
}
