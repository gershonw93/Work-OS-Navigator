import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { filesAccess } from '@/lib/files-access'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// PATCH - revoke (or un-revoke) a share. Revoking is kept rather than deleting
// so there's still a record of what was sent to whom, which is the point of
// having sent it through the app instead of email.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  // `files: view` like creating a share (POST /api/file-shares), plus the
  // billing lock, and the row is always matched on the caller's company too.
  const access = await filesAccess(db, request, {
    write: true, noCompany: () => NextResponse.json({ error: 'Profile not found' }, { status: 400 }),
  })
  if ('denied' in access) return access.denied
  const profile = { company_id: access.companyId }

  const body = await request.json().catch(() => ({}))

  // Add documents to a link that's already out there - "here's the updated
  // set". Appending only: what was already sent stays exactly as sent, so the
  // link never quietly becomes something different, but you can add to it
  // without making the recipient chase a second URL.
  if (Array.isArray(body.add_files)) {
    const incoming = body.add_files.filter((f: any) => f?.url && f?.name)
    if (incoming.length === 0) return NextResponse.json({ error: 'Nothing to add' }, { status: 400 })

    const { data: existing } = await db
      .from('file_shares').select('files').eq('id', params.id).eq('company_id', profile.company_id).single()
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const current = Array.isArray(existing.files) ? existing.files : []
    const have = new Set(current.map((f: any) => f.url))
    const added = incoming
      .filter((f: any) => !have.has(f.url))
      .map((f: any) => ({ ...f, added_at: new Date().toISOString() }))
    if (added.length === 0) {
      return NextResponse.json({ error: 'Those documents are already on this link' }, { status: 400 })
    }

    const { data, error } = await db
      .from('file_shares')
      .update({ files: [...current, ...added] })
      .eq('id', params.id)
      .eq('company_id', profile.company_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ share: data, added: added.length })
  }

  const revoked = body.revoked !== false

  const { data, error } = await db
    .from('file_shares')
    .update({ revoked_at: revoked ? new Date().toISOString() : null })
    .eq('id', params.id)
    .eq('company_id', profile.company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ share: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  // `files: view` like creating a share (POST /api/file-shares), plus the
  // billing lock, and the row is always matched on the caller's company too.
  const access = await filesAccess(db, request, {
    write: true, noCompany: () => NextResponse.json({ error: 'Profile not found' }, { status: 400 }),
  })
  if ('denied' in access) return access.denied
  const profile = { company_id: access.companyId }

  const { error } = await db
    .from('file_shares').delete().eq('id', params.id).eq('company_id', profile.company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
