import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractComplianceFields, buildComplianceSummary } from '@/lib/compliance-extract'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DOC_LABELS: Record<string, string> = {
  coi: 'Certificate of Insurance (COI)',
  license: 'License',
  w9: 'W-9',
  workers_comp: "Workers' Comp",
  other: 'Other document',
}

// Public: anyone with the link can see what's requested and upload — no account.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: req } = await db.from('compliance_requests').select('*').eq('token', params.token).single()
  if (!req) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  if (req.status === 'pending') {
    await db.from('compliance_requests').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', req.id)
  }

  const [{ data: project }, { data: existing }] = await Promise.all([
    db.from('projects').select('name, address').eq('id', req.project_id).single(),
    db.from('compliance_documents').select('type, file_url, status').eq('company_id', req.company_id).or(`project_id.eq.${req.project_id},project_id.is.null`),
  ])

  const uploaded = new Set((existing ?? []).filter((d: any) => d.file_url).map((d: any) => d.type))

  return NextResponse.json({
    vendor_name: req.vendor_name,
    project_name: project?.name ?? null,
    project_address: project?.address ?? null,
    status: req.status,
    docs: (req.doc_types ?? []).map((t: string) => ({ type: t, label: DOC_LABELS[t] ?? t, uploaded: uploaded.has(t) })),
  })
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: req } = await db.from('compliance_requests').select('*').eq('token', params.token).single()
  if (!req) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const form = await request.formData()
  const uploadedTypes: string[] = []

  for (const type of req.doc_types ?? []) {
    const file = form.get(`file_${type}`) as File | null
    if (!file || file.size === 0) continue
    let expiry = (form.get(`expiry_${type}`) as string) || null

    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `compliance/${req.company_id}/${type}-${Date.now()}-${safe}`
    const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)

    // Scan the document with AI so the contractor sees extracted details, not
    // just a bare "pending". Never let a scan failure block the upload.
    let notes: string | null = null
    try {
      const fields = await extractComplianceFields(file)
      if (!expiry && fields.expiry_date) expiry = fields.expiry_date
      const summary = buildComplianceSummary(type, fields)
      notes = [summary, fields.notes].filter(Boolean).join('\n') || null
    } catch { /* unreadable file — store it anyway, contractor reviews manually */ }

    const row: Record<string, unknown> = {
      company_id: req.company_id,
      project_id: req.project_id,
      type,
      status: 'pending',
      expiry_date: expiry,
      notes,
      file_url: signed?.signedUrl ?? null,
    }
    let { error: docErr } = await db.from('compliance_documents').upsert(row, { onConflict: 'company_id,type,project_id' })
    if (docErr && (docErr as any).code === '42703') { // notes column missing on older DBs
      delete row.notes
      docErr = (await db.from('compliance_documents').upsert(row, { onConflict: 'company_id,type,project_id' })).error
    }
    if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })
    uploadedTypes.push(type)
  }

  if (uploadedTypes.length === 0) return NextResponse.json({ error: 'Attach at least one document.' }, { status: 400 })

  // Which of the requested docs now have a file? Only fully close the request
  // when every requested doc is in — otherwise keep it open so the sub can
  // return via the same link and finish the rest.
  const { data: onFile } = await db
    .from('compliance_documents')
    .select('type')
    .eq('company_id', req.company_id)
    .or(`project_id.eq.${req.project_id},project_id.is.null`)
    .not('file_url', 'is', null)
  const haveTypes = new Set((onFile ?? []).map((d: any) => d.type))
  const remaining = (req.doc_types ?? []).filter((t: string) => !haveTypes.has(t))
  const complete = remaining.length === 0

  await db.from('compliance_requests')
    .update(complete
      ? { status: 'submitted', submitted_at: new Date().toISOString() }
      : { status: 'viewed' })
    .eq('id', req.id)

  return NextResponse.json({ ok: true, uploaded: uploadedTypes, remaining, complete })
}
