import { NextResponse } from 'next/server'
import { admin } from '@/lib/google-contacts'

export const runtime = 'nodejs'

/**
 * MOVE STAGED CONTACTS INTO THE DIRECTORY - the one act that crosses the line.
 *
 * Everything before this is reversible: a staged row can be relabelled or
 * dismissed all day. This writes real `companies` rows, so it is explicit, it
 * is bulk, and it refuses anything not yet labelled - an unlabelled contact
 * landing in the directory as an untyped row is how a phone book leaks into a
 * trade list, which the staging area exists to prevent.
 */
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!(profile as any)?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  const companyId = (profile as any).company_id as string

  const body = await request.json().catch(() => ({} as any))
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((v: unknown): v is string => typeof v === 'string' && !!v)
    : []
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one contact.' }, { status: 400 })

  const { data: rows, error } = await db
    .from('google_contact_imports')
    .select('*')
    .eq('company_id', companyId).eq('status', 'staged').in('id', ids)

  if (error) {
    console.error('[google-contacts/import] read failed:', error.message)
    return NextResponse.json({ error: 'Could not read those contacts.' }, { status: 500 })
  }
  if (!rows?.length) {
    return NextResponse.json({ error: 'Those contacts are not waiting any more. Reload the list.' }, { status: 400 })
  }

  // SAY WHICH ONES, not "some contacts are not labelled". A refusal that does
  // not name the row it is about cannot be acted on.
  const unlabelled = (rows as any[]).filter(r => !r.contact_type)
  if (unlabelled.length) {
    const names = unlabelled.slice(0, 3).map(r => r.name || r.email || 'Unnamed').join(', ')
    const more = unlabelled.length > 3 ? ` and ${unlabelled.length - 3} more` : ''
    return NextResponse.json(
      { error: `Label these before importing: ${names}${more}.` },
      { status: 400 },
    )
  }

  const results: { id: string; company_record_id?: string; error?: string }[] = []

  for (const row of rows as any[]) {
    // ONE AT A TIME, ON PURPOSE. A loop that throws abandons the rest in
    // silence - and a batch of forty where the eleventh has a duplicate name
    // must still import the other thirty-nine and SAY which one did not.
    try {
      const name = String(row.organization || row.name || row.email || '').trim()
      if (!name) { results.push({ id: row.id, error: 'No name to file them under' }); continue }

      const { data: created, error: insertError } = await db.from('companies').insert({
        name,
        type: row.contact_type,
        trade: row.trade ?? null,
        contact_email: row.email ?? null,
        phone: row.phone ?? null,
        added_by_company_id: companyId,
      }).select('id').single()

      if (insertError) {
        results.push({ id: row.id, error: insertError.message })
        continue
      }

      // If they were assigned to a job, put them on that job's team as well.
      // `profile_id` stays null - they have no account - and the email is what
      // links them if they ever accept an invite.
      if (row.assigned_project_id) {
        await db.from('project_team_members').insert({
          project_id: row.assigned_project_id,
          name,
          role: row.job_title || row.trade || 'Contact',
          email: row.email ?? null,
          phone: row.phone ?? null,
        })
      }

      await db.from('google_contact_imports').update({
        status: 'imported',
        company_record_id: created.id,
        imported_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)

      results.push({ id: row.id, company_record_id: created.id })
    } catch (e: any) {
      console.error('[google-contacts/import] row failed:', row.id, e?.message)
      results.push({ id: row.id, error: e?.message ?? 'Could not import' })
    }
  }

  const failed = results.filter(r => r.error)
  return NextResponse.json({
    imported: results.length - failed.length,
    failed: failed.length,
    // Every failure carries its reason, so "38 of 40" is never the whole story.
    problems: failed.map(f => ({ id: f.id, error: f.error })),
  })
}
