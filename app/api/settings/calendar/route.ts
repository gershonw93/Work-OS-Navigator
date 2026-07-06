import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

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

// Return the user's private calendar feed token, creating one on first use.
export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: profile } = await db.from('profiles').select('calendar_token').eq('id', user.id).single()
  let calendar_token = profile?.calendar_token
  if (!calendar_token) {
    calendar_token = randomUUID().replace(/-/g, '')
    await db.from('profiles').update({ calendar_token }).eq('id', user.id)
  }
  return NextResponse.json({ calendar_token })
}

// Reset the token (invalidates the old subscribe URL).
export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const calendar_token = randomUUID().replace(/-/g, '')
  const { error } = await db.from('profiles').update({ calendar_token }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ calendar_token })
}
