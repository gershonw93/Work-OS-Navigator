import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  const [{ data: folders }, { data: plans }] = await Promise.all([
    db.from('plan_folders').select('*').eq('project_id', params.id).order('name'),
    db.from('project_plans').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ folders: folders ?? [], plans: plans ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()

  const { data, error } = await admin()
    .from('plan_folders')
    .insert({ project_id: params.id, name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ folder: data })
}
