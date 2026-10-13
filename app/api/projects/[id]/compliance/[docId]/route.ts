import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { companyOnJob } from '@/lib/writes/compliance-document'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; docId: string } },
) {
  const db = admin()
  // Used to ask only "is somebody signed in", and then updated the document by
  // id ALONE - any account could re-date or approve any company's certificate
  // on any job. Nothing in the app calls this today, so it is gated at the
  // permission it means: the GC's, on its own job, for a document on that job.
  const gate = await requirePermission(db, request, 'compliance', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data: found, error: findError } = await db.from('compliance_documents')
    .select('id, company_id, project_id').eq('id', params.docId).maybeSingle()
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  const here = found && (
    (found as any).project_id === params.id
    || ((found as any).project_id === null && await companyOnJob(db, params.id, (found as any).company_id))
  )
  if (!here) return NextResponse.json({ error: 'That document is not on this job.' }, { status: 404 })

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
