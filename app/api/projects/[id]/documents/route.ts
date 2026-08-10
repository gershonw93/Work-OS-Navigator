import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Every document on this job, flattened into one pickable list.
 *
 * A project's paperwork is spread across plans, permits, submittals and
 * compliance, and nobody sharing a permit package thinks in terms of which tab
 * a file happens to live on. They think "the site plan, the zoning form and the
 * COI". So this collects all of it and labels where each came from.
 *
 * Company-level files are appended too - the W-9 and the insurance certificate
 * are company documents that get sent with a job's paperwork constantly.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()

  // Each source is best-effort: a table missing on an older deployment should
  // cost you that one group, not the whole picker.
  const grab = async <T,>(fn: () => PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
    try { return (await fn()).data ?? [] } catch { return [] }
  }

  const [plans, permits, submittals, compliance, companyFiles] = await Promise.all([
    grab(() => db.from('project_plans').select('id, name, file_url, plan_type, created_at').eq('project_id', params.id)),
    grab(() => db.from('permits').select('id, permit_type, permit_number, file_url, created_at').eq('project_id', params.id)),
    grab(() => db.from('submittals').select('id, title, file_url, type, created_at').eq('project_id', params.id)),
    grab(() => db.from('compliance_documents').select('id, type, file_url, created_at').eq('project_id', params.id)),
    profile?.company_id
      ? grab(() => db.from('company_files').select('id, name, file_url, file_type, size_bytes, category, created_at').eq('company_id', profile.company_id))
      : Promise.resolve([]),
  ])

  const docs = [
    ...plans.map((p: any) => ({
      id: `plan:${p.id}`, name: p.name || 'Plan', file_url: p.file_url,
      category: p.plan_type || 'Plans', source: 'Plans', created_at: p.created_at,
    })),
    ...permits.map((p: any) => ({
      id: `permit:${p.id}`,
      name: [p.permit_type || 'Permit', p.permit_number].filter(Boolean).join(' · '),
      file_url: p.file_url, category: 'Permits', source: 'Permits', created_at: p.created_at,
    })),
    ...submittals.map((s: any) => ({
      id: `submittal:${s.id}`, name: s.title || 'Submittal', file_url: s.file_url,
      category: s.type || 'Submittals', source: 'Submittals', created_at: s.created_at,
    })),
    ...compliance.map((c: any) => ({
      id: `compliance:${c.id}`, name: c.type || 'Compliance document', file_url: c.file_url,
      category: 'Compliance', source: 'Compliance', created_at: c.created_at,
    })),
    ...companyFiles.map((f: any) => ({
      id: `file:${f.id}`, name: f.name, file_url: f.file_url, file_type: f.file_type,
      size_bytes: f.size_bytes, category: f.category || 'Company files', source: 'Company files',
      created_at: f.created_at,
    })),
  ].filter(d => d.file_url)

  return NextResponse.json({ documents: docs })
}
