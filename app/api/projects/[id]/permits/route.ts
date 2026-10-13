import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { createPermit } from '@/lib/writes/permit'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // GATED. This answered anybody with a login and an id - a worker or an
  // invited sub, neither of whom holds `permits: view`, could read every
  // permit on the job by pasting the URL. A guard on the menu is not a guard.
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'view')
  if (denied(gate)) return gate.denied

  const { data: permits, error } = await db
    .from('permits')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ permits: permits ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  // `edit`, not `create`: Office Staff hold permits VE and file permits today.
  // And the job must be the caller's company's own - a permit is the GC's
  // paperwork with the township, and a sub's admin holds `permits: edit` at
  // their own company.
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const formData = await request.formData()
  const permit_type = formData.get('permit_type') as string
  const permit_number = formData.get('permit_number') as string | null
  const description = formData.get('description') as string | null
  const status = formData.get('status') as string | null
  const issued_date = formData.get('issued_date') as string | null
  const expiry_date = formData.get('expiry_date') as string | null
  const issuing_authority = formData.get('issuing_authority') as string | null
  const inspector_name = formData.get('inspector_name') as string | null
  const inspector_phone = formData.get('inspector_phone') as string | null
  const notes = formData.get('notes') as string | null
  const file = formData.get('file') as File | null

  // Uploaded only once `createPermit` has accepted the permit, as it always was.
  const uploadFile = file && file.size > 0
    ? async (): Promise<{ url: string | null } | { error: string }> => {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${params.id}/${timestamp}-${safeName}`
      const arrayBuffer = await file.arrayBuffer()

      const { error: uploadError } = await db.storage
        .from('permits')
        .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

      if (uploadError) return { error: uploadError.message }

      const { data: signed } = await db.storage
        .from('permits')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

      return { url: signed?.signedUrl ?? null }
    }
    : undefined

  // Everything after reading the form is `createPermit`, which Claude's MCP
  // server calls too - including the `permitProblem(` check on a blank permit.
  const result = await createPermit(db, {
    userId: gate.actor.userId, projectId: params.id, uploadFile,
    fields: {
      permit_type, permit_number, description, status, issued_date, expiry_date,
      issuing_authority, inspector_name, inspector_phone, notes,
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}
