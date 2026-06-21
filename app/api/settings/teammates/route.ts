import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) return NextResponse.json({ teammates: [] })

  const [{ data: teammates }, { data: rawInvites }] = await Promise.all([
    db.from('profiles').select('id, full_name, email, role').eq('company_id', profile.company_id).order('full_name'),
    db.from('company_invites').select('*').eq('company_id', profile.company_id).eq('status', 'pending'),
  ])

  // Deduplicate by email (keep most recent), and exclude emails that are already active members
  const memberEmails = new Set((teammates ?? []).map((t: Record<string, unknown>) => t.email as string))
  const seenEmails = new Set<string>()
  const pendingInvites = (rawInvites ?? [])
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    )
    .filter((r: Record<string, unknown>) => {
      const email = r.email as string
      if (memberEmails.has(email)) return false // already joined
      if (seenEmails.has(email)) return false   // duplicate invite
      seenEmails.add(email)
      return true
    })
    .map((r: Record<string, unknown>) => ({
      id: r.id, email: r.email, role: r.role ?? 'read_only', status: r.status, created_at: r.created_at,
    }))

  return NextResponse.json({ teammates: teammates ?? [], pendingInvites })
}
