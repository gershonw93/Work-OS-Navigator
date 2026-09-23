import { NextResponse } from 'next/server'
import { requirePermission, denied } from './api-guard'
import type { Action } from './permissions'
import { admin } from './google-contacts'

// Server only - kept out of lib/google-contacts.ts, which the staging page
// imports in the browser for its labels and ordering.

/**
 * WHO IS ASKING - and every Google Contacts route asks through this.
 *
 * PRIVATE UNTIL FILED. A connection and its staging list belong to the PERSON
 * who connected them (`google_connections.profile_id`,
 * `google_contact_imports.owner_id`, migration 117), never to the company:
 * 112 made them per company, so one admin's whole address book - family,
 * doctor and all - was readable and importable by everyone signed in there.
 * Every query on either table is keyed on `userId` from here, and on nothing
 * the browser sends.
 *
 * The permission is the Directory's, because that is where these end up:
 * `view` to connect, read and label your own list, `create` to file a contact
 * into the shared Directory - the one act that makes it anybody else's.
 */
export async function contactsActor(
  request: Request,
  action: Action = 'view',
): Promise<{ db: ReturnType<typeof admin>; userId: string; companyId: string } | { denied: NextResponse }> {
  const db = admin()
  const gate = await requirePermission(db, request, 'directory', action)
  if (denied(gate)) return gate
  if (!gate.actor.companyId) return { denied: NextResponse.json({ error: 'No company' }, { status: 400 }) }
  return { db, userId: gate.actor.userId, companyId: gate.actor.companyId }
}
