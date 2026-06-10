import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; docId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { status, expiry_date, notes, file_url } = body

  const updates: Record<string, any> = {}
  if (status !== undefined) updates.status = status
  if (expiry_date !== undefined) updates.expiry_date = expiry_date
  if (notes !== undefined) updates.notes = notes
  if (file_url !== undefined) updates.file_url = file_url

  const { data: doc, error } = await db
    .from('compliance_documents')
    .update(updates)
    .eq('id', params.docId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ doc })
}
