import { NextResponse } from 'next/server'
import { accessTokenFor, stageContact, worthStaging } from '@/lib/google-contacts'
import { contactsActor } from '@/lib/google-contacts-actor'

export const runtime = 'nodejs'
// Reading a whole address book is several round trips to Google. The default
// cut-off is shorter than that, and a request the platform kills mid-read
// reports as "Failed to fetch" with nothing to say what happened.
export const maxDuration = 60

const FIELDS = 'names,emailAddresses,phoneNumbers,organizations'
const PAGE_SIZE = 200
/** Enough for a real phone book, bounded so one sync cannot run for ever. */
const MAX_PAGES = 25

/**
 * Pull YOUR address book into YOUR staging list.
 *
 * Private until filed (migration 117): every row written here carries
 * `owner_id` = whoever is asking, and nobody else's list can see it.
 *
 * Nothing here touches `companies`. Contacts land in `google_contact_imports`
 * and stay there until somebody labels them and says to import - "not
 * auto-mixed into the directory", as asked.
 */
export async function POST(request: Request) {
  const ctx = await contactsActor(request, 'view')
  if ('denied' in ctx) return ctx.denied
  const { db, userId, companyId } = ctx

  const accessToken = await accessTokenFor(db, userId)
  if (!accessToken) {
    // EXPIRED AND NEVER-CONNECTED ARE DIFFERENT, and the screen says different
    // things. An empty list would read as "you have no contacts".
    return NextResponse.json(
      { error: 'Google is not connected, or the connection has expired. Reconnect it above.' },
      { status: 409 },
    )
  }

  const staged: ReturnType<typeof stageContact>[] = []
  let pageToken: string | undefined
  let pages = 0

  try {
    do {
      const params = new URLSearchParams({
        personFields: FIELDS,
        pageSize: String(PAGE_SIZE),
        sortOrder: 'LAST_MODIFIED_DESCENDING',
      })
      if (pageToken) params.set('pageToken', pageToken)

      const res = await fetch(
        `https://people.googleapis.com/v1/people/me/connections?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        console.error('[google-contacts/sync] people api', res.status, detail.slice(0, 400))
        if (res.status === 401 || res.status === 403) {
          await db.from('google_connections')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('profile_id', userId)
          return NextResponse.json(
            { error: 'Google refused the request. Reconnect Google Contacts above.' },
            { status: 409 },
          )
        }
        return NextResponse.json({ error: 'Google could not be reached. Try again in a moment.' }, { status: 502 })
      }

      const body = await res.json()
      for (const person of (body?.connections ?? [])) {
        const c = stageContact(person)
        if (worthStaging(c)) staged.push(c)
      }
      pageToken = body?.nextPageToken
      pages++
    } while (pageToken && pages < MAX_PAGES)
  } catch (e: any) {
    console.error('[google-contacts/sync] failed:', e?.message)
    return NextResponse.json({ error: 'Could not read your contacts. Try again in a moment.' }, { status: 502 })
  }

  if (!staged.length) {
    await db.from('google_connections')
      .update({ last_sync_at: new Date().toISOString() }).eq('profile_id', userId)
    return NextResponse.json({ found: 0, staged: 0, alreadyHandled: 0 })
  }

  // Anybody already dealt with stays dealt with. Re-offering a contact the
  // person already imported or dismissed is how a staging area becomes noise
  // nobody opens twice.
  const { data: seen } = await db
    .from('google_contact_imports')
    .select('resource_name, status')
    .eq('owner_id', userId)
    .in('resource_name', staged.map(c => c!.resource_name))
  const handled = new Set(
    (seen ?? []).filter((r: any) => r.status !== 'staged').map((r: any) => r.resource_name),
  )

  const rows = staged
    .filter(c => !handled.has(c!.resource_name))
    .map(c => ({ ...c!, company_id: companyId, owner_id: userId, updated_at: new Date().toISOString() }))

  if (rows.length) {
    // UPSERT on (owner_id, resource_name): a second sync UPDATES a staged row
    // rather than adding a duplicate, which is what the unique index is for.
    // `ignoreDuplicates: false` so a changed phone number actually lands.
    const { error } = await db
      .from('google_contact_imports')
      .upsert(rows, { onConflict: 'owner_id,resource_name', ignoreDuplicates: false })
    if (error) {
      console.error('[google-contacts/sync] upsert failed:', error.message)
      return NextResponse.json({ error: 'Could not save the contacts we read.' }, { status: 500 })
    }
  }

  await db.from('google_connections')
    .update({ last_sync_at: new Date().toISOString() }).eq('profile_id', userId)

  return NextResponse.json({
    found: staged.length,
    staged: rows.length,
    alreadyHandled: staged.length - rows.length,
  })
}
