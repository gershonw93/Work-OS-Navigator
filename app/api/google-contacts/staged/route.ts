import { NextResponse } from 'next/server'
import { isContactType } from '@/lib/google-contacts'
import { contactsActor } from '@/lib/google-contacts-actor'
import { isKnownTrade } from '@/lib/trades'

export const runtime = 'nodejs'

/**
 * THE STAGING AREA: what came out of YOUR Google account, and what you decide
 * about it.
 *
 * "They land in a separate staging area, not auto-mixed into the directory.
 * From there assign to a job and label - sub, supplier, delivery, electrician,
 * whatever. Bulk actions: select 5, label all at once."
 *
 * PRIVATE UNTIL FILED. Every read and write here is keyed on `owner_id` = the
 * person asking. This comment used to say the route was gated on
 * `directory: edit`; it checked nothing but a login and filtered on the
 * COMPANY, so anyone signed in could read an admin's whole address book.
 */

export async function GET(request: Request) {
  const ctx = await contactsActor(request, 'view')
  if ('denied' in ctx) return ctx.denied

  const status = new URL(request.url).searchParams.get('status') ?? 'staged'
  const { data, error } = await ctx.db
    .from('google_contact_imports')
    .select('*')
    .eq('owner_id', ctx.userId)
    .eq('status', status)
    .order('name', { ascending: true, nullsFirst: false })

  // A refused query and an empty one are both `[]` to a caller, and on this
  // screen empty is the happy answer - so a mistyped column would read as
  // "nothing to review" for ever.
  if (error) {
    console.error('[google-contacts/staged] read failed:', error.message)
    return NextResponse.json({ error: 'Could not load the imported contacts.' }, { status: 500 })
  }
  return NextResponse.json({ contacts: data ?? [] })
}

/**
 * BULK LABEL: "select 5, label all at once."
 *
 * Every field is optional and only what is SENT is written - so labelling five
 * people as suppliers does not blank the trade somebody already set on one of
 * them. A whitelist with a field missing fails exactly like a rejection, so the
 * list is short and explicit.
 */
export async function PATCH(request: Request) {
  const ctx = await contactsActor(request, 'view')
  if ('denied' in ctx) return ctx.denied

  const body = await request.json().catch(() => ({} as any))
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((v: unknown): v is string => typeof v === 'string' && !!v)
    : []
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one contact.' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.contact_type !== undefined) {
    if (body.contact_type !== null && !isContactType(body.contact_type)) {
      return NextResponse.json({ error: 'That is not a contact type.' }, { status: 400 })
    }
    updates.contact_type = body.contact_type
  }
  if (body.trade !== undefined) {
    const trade = body.trade === null ? null : String(body.trade).trim()
    // A trade the app would not offer is how "Elecric" got into the directory
    // in the first place. Refused here rather than laundered in through an
    // import.
    if (trade && !isKnownTrade(trade)) {
      return NextResponse.json({ error: 'Pick a trade from the list.' }, { status: 400 })
    }
    updates.trade = trade || null
  }
  if (body.assigned_project_id !== undefined) {
    const projectId = body.assigned_project_id === null ? null : String(body.assigned_project_id)
    if (projectId) {
      // The id comes from a browser: it must be a job this company owns.
      const { data: proj } = await ctx.db.from('projects')
        .select('id').eq('id', projectId)
        .or(`gc_company_id.eq.${ctx.companyId},created_by_company_id.eq.${ctx.companyId}`)
        .maybeSingle()
      if (!proj) return NextResponse.json({ error: 'That job is not yours.' }, { status: 403 })
    }
    updates.assigned_project_id = projectId
  }
  if (body.status !== undefined) {
    if (!['staged', 'dismissed'].includes(String(body.status))) {
      return NextResponse.json({ error: 'A contact can only be staged or dismissed here.' }, { status: 400 })
    }
    updates.status = body.status
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  const { data, error } = await ctx.db
    .from('google_contact_imports')
    .update(updates)
    .eq('owner_id', ctx.userId)   // never somebody else's list - not even a colleague's
    .in('id', ids)
    .select('id')

  if (error) {
    console.error('[google-contacts/staged] update failed:', error.message)
    return NextResponse.json({ error: 'Could not update those contacts.' }, { status: 500 })
  }
  return NextResponse.json({ updated: (data ?? []).length })
}
