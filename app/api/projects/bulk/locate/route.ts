import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { lookUpAddress } from '@/lib/geocode'
import { matchPrecision, MAX_LOTS } from '@/lib/lot-list'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Look every address in a lot list up on the map BEFORE anything is created,
 * and say for each one what was found: the house, only the street, or nothing
 * and why. The review table shows it; the person fixes the row or lets it go.
 *
 * Creates nothing. The coordinates it returns are sent back with the batch, so
 * a row that was checked is not looked up a second time.
 */
export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'view')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({}))
  const addresses: string[] = Array.isArray(body?.addresses) ? body.addresses.map((a: unknown) => String(a ?? '')).slice(0, MAX_LOTS) : []
  if (!addresses.length) return NextResponse.json({ results: [] })

  const results: unknown[] = new Array(addresses.length)
  let next = 0
  // A handful at a time: a hundred at once gets rate-limited by both providers.
  async function worker() {
    while (true) {
      const i = next++
      if (i >= addresses.length) return
      const a = addresses[i]
      const out = await lookUpAddress(a)
      results[i] = out.ok
        ? { address: a, ok: true, lat: out.coords.lat, lng: out.coords.lng, matched: out.matched, precision: matchPrecision(a, out.matched) }
        : { address: a, ok: false, why: out.why }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, addresses.length) }, worker))
  return NextResponse.json({ results })
}
