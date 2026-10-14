import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import type { ActorPerms } from '@/lib/server-permissions'

// ─────────────────────────────────────────────────────────────────────────────
// The gate for Files, Packets and the Sharing tab - asked by every handler
// under /api/files and /api/file-shares.
//
// These routes used to ask only "is somebody signed in", and one of them
// (file-shares/[id]/send) did not even scope its row to the caller's company,
// so anybody holding a share id could email that share's link to anyone.
//
// `files: view`, ALSO FOR WRITES, ON PURPOSE. Every built-in role holds
// `files: view` and the Files page offers Upload, Rename, Delete and Share to
// all of them; `POST /api/files` and `POST /api/file-shares` have gated writes
// at `view` since they were locked down. Raising these to edit/delete would
// take controls away from a worker and a field supervisor that the screen
// still offers them - a change to the role map, which is the owner's call, not
// a side effect of a lockdown. What every handler DOES enforce:
//   - a real person with a company (a Files row is always a company's);
//   - every query scoped to THAT company - the id in the URL is never enough;
//   - the billing lock on a write, which `requirePermission` skips at `view`.
// ─────────────────────────────────────────────────────────────────────────────

export type FilesGate =
  | { actor: ActorPerms; companyId: string }
  | { denied: NextResponse }

export async function filesAccess(
  db: SupabaseClient, request: Request,
  opts: { write: boolean; noCompany?: () => NextResponse },
): Promise<FilesGate> {
  const gate = await requirePermission(db, request, 'files', 'view')
  if (denied(gate)) return gate
  const companyId = gate.actor.companyId
  // Each route keeps the answer it always gave a profile with no company.
  if (!companyId) return { denied: opts.noCompany?.() ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (opts.write) {
    const locked = await billingLock(db, companyId)
    if (locked) return { denied: locked }
  }
  return { actor: gate.actor, companyId }
}
