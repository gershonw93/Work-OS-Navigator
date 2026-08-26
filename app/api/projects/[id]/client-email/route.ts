import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The client's email address for a project, for pre-filling a Send box.
 *
 * Small and honestly named on purpose. Several places want to email this
 * project's client - the invoice, the portal link - and the alternative was
 * each of them borrowing an unrelated endpoint that happened to return it.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await db.from('projects')
    .select('customer_id, client').eq('id', params.id).maybeSingle()

  let clientEmail: string | null = null
  if ((project as any)?.customer_id) {
    const { data: c } = await db.from('customers').select('email').eq('id', (project as any).customer_id).maybeSingle()
    clientEmail = (c as any)?.email ?? null
  }

  return NextResponse.json({ clientEmail, clientName: (project as any)?.client ?? null })
}
