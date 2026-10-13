import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import { recordCompanyFile } from '@/lib/writes/company-file'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'files', 'view')
  if (denied(gate)) return gate.denied
  const company_id = gate.actor.companyId
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // All projects this company is GC on
  const { data: projects } = await db.from('projects').select('id').eq('gc_company_id', company_id)
  const projectIds = (projects ?? []).map((p: any) => p.id)

  // All company_ids of subs on those projects
  let subCompanyIds: string[] = []
  if (projectIds.length > 0) {
    const { data: subs } = await db.from('subcontracts').select('company_id').in('project_id', projectIds)
    const seen = new Set<string>()
    subCompanyIds = (subs ?? []).map((s: any) => s.company_id).filter((id: string) => { if (!id || seen.has(id)) return false; seen.add(id); return true })
  }

  const [filesRes, packetsRes, complianceRes] = await Promise.all([
    db.from('company_files').select('*').eq('company_id', company_id).order('created_at', { ascending: false }),
    db.from('file_packets').select('*').eq('company_id', company_id).order('created_at', { ascending: false }),
    // Compliance docs with a file_url - own company + all subs
    subCompanyIds.length > 0
      ? db.from('compliance_documents')
          .select('id, type, status, expiry_date, file_url, notes, company_id, project_id, companies(name), projects(id, name)')
          .in('company_id', [company_id, ...subCompanyIds])
          .not('file_url', 'is', null)
          .order('type')
      : db.from('compliance_documents')
          .select('id, type, status, expiry_date, file_url, notes, company_id, project_id, companies(name), projects(id, name)')
          .eq('company_id', company_id)
          .not('file_url', 'is', null)
          .order('type'),
  ])

  if (filesRes.error) return NextResponse.json({ error: filesRes.error.message }, { status: 500 })
  if (packetsRes.error) return NextResponse.json({ error: packetsRes.error.message }, { status: 500 })

  return NextResponse.json({
    files: filesRes.data ?? [],
    packets: packetsRes.data ?? [],
    complianceDocs: complianceRes.data ?? [],
  })
}

export async function POST(request: Request) {
  const db = admin()
  // Asked at `files: view`, plus the billing lock that `view` skips. Every
  // built-in role holds files view and the Files screen offers Upload to all
  // of them - a vendor keeps its own W-9 here - so `create` would take the
  // button away from four roles that use it. The library is the CALLER's own
  // company's, which is the fence that matters.
  const gate = await requirePermission(db, request, 'files', 'view')
  if (denied(gate)) return gate.denied
  const company_id = gate.actor.companyId
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const locked = await billingLock(db, company_id)
  if (locked) return locked

  // Two ways in. The browser normally uploads straight to storage (see
  // /api/files/upload-url) and posts JSON naming the path it wrote to - that
  // is the only way a file over ~4.5MB can get here at all, since the platform
  // rejects a bigger request body before this function runs. Multipart is kept
  // for small files and older callers.
  const isJson = (request.headers.get('content-type') ?? '').includes('application/json')

  let name: string
  let category: string
  let filledFromId: string | null
  let storagePath: string
  let fileType: string | null
  let fileSize: number | null

  if (isJson) {
    const body = await request.json().catch(() => ({}))
    storagePath = String(body?.storage_path ?? '')
    name = String(body?.name ?? '').trim() || 'Untitled'
    category = String(body?.category ?? 'Other')
    filledFromId = body?.filled_from_id ? String(body.filled_from_id) : null
    fileType = body?.file_type ? String(body.file_type) : null
    fileSize = Number(body?.size ?? 0) || null

    if (!storagePath) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    // The path comes from the browser, so confirm it is this company's own
    // folder and that something was actually written there.
    if (!storagePath.startsWith(`${company_id}/`)) {
      return NextResponse.json({ error: 'That upload does not belong to this company' }, { status: 403 })
    }
    const folder = storagePath.slice(0, storagePath.lastIndexOf('/'))
    const leaf = storagePath.slice(storagePath.lastIndexOf('/') + 1)
    const { data: found } = await db.storage.from('company-files').list(folder, { search: leaf, limit: 1 })
    if (!found?.length) {
      return NextResponse.json({ error: 'The upload did not finish - try again.' }, { status: 400 })
    }
    fileSize = fileSize ?? (found[0] as any)?.metadata?.size ?? null
  } else {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    name = (formData.get('name') as string | null) || file?.name || 'Untitled'
    category = (formData.get('category') as string | null) || 'Other'
    // Set when this is a filled copy of another document. The original is never
    // modified, so the pair only makes sense if the link is recorded.
    filledFromId = (formData.get('filled_from_id') as string | null) || null

    if (!file || file.size === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    storagePath = `${company_id}/${Date.now()}-${safeName}`
    fileType = file.type || null
    fileSize = file.size

    const { error: uploadError } = await db.storage
      .from('company-files')
      .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: true })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const result = await recordCompanyFile(db, {
    userId: gate.actor.userId, companyId: company_id, storagePath, name, category,
    fileType, fileSize, filledFromId,
  })
  return NextResponse.json(result.body, { status: result.status })
}
