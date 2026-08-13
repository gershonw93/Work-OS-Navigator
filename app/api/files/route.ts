import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getCompanyId(db: ReturnType<typeof admin>, token: string) {
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  return (profile as any)?.company_id ?? null
}

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const company_id = await getCompanyId(db, token)
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
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const company_id = await getCompanyId(db, token)
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const { data: signed, error: signError } = await db.storage
    .from('company-files')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message ?? 'Could not create file URL' }, { status: 500 })
  }

  const row: Record<string, unknown> = {
    company_id,
    name,
    category,
    file_url: signed.signedUrl,
    file_type: fileType,
    size_bytes: fileSize,
  }

  if (filledFromId) {
    // Only accept a parent this company actually owns - the id arrives from the
    // browser, and a file should never be able to claim descent from someone
    // else's document.
    const { data: parent } = await db.from('company_files')
      .select('id').eq('id', filledFromId).eq('company_id', company_id).maybeSingle()
    if (parent) {
      const { data: profile } = await db.from('profiles')
        .select('full_name').eq('id', (await db.auth.getUser(token)).data.user!.id).maybeSingle()
      row.filled_from_id = parent.id
      row.filled_by = (profile as any)?.full_name ?? null
      row.filled_at = new Date().toISOString()
    }
  }

  let { data: companyFile, error } = await db.from('company_files').insert(row).select().single()

  // Pre-migration fallback: the fill columns may not be there yet.
  if (error && (error as any).code === '42703') {
    delete row.filled_from_id; delete row.filled_by; delete row.filled_at
    const retry = await db.from('company_files').insert(row).select().single()
    companyFile = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ file: companyFile }, { status: 201 })
}
