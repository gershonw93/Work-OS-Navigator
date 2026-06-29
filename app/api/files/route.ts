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
    // Compliance docs with a file_url — own company + all subs
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

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string | null) || file?.name || 'Untitled'
  const category = (formData.get('category') as string | null) || 'Other'

  if (!file || file.size === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${company_id}/${timestamp}-${safeName}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from('company-files')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: signed, error: signError } = await db.storage
    .from('company-files')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message ?? 'Could not create file URL' }, { status: 500 })
  }

  const { data: companyFile, error } = await db
    .from('company_files')
    .insert({
      company_id,
      name,
      category,
      file_url: signed.signedUrl,
      file_type: file.type || null,
      size_bytes: file.size,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ file: companyFile }, { status: 201 })
}
