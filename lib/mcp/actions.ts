import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorPerms } from '@/lib/server-permissions'
import type { ToolOutcome } from './protocol'
import type { WriteToolDef } from './write-tools'

// ─────────────────────────────────────────────────────────────────────────────
// The record of what Claude did, and the guard against doing it twice.
//
// Its own file so `tools.ts` - the reading half - can stay a file that writes
// nothing at all, which `mcp-server.ts` pins. The only table this touches is
// `mcp_actions`; the records themselves are made by `lib/writes/*`, through
// the tool bodies in `write-tools.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** The same request on the same day is the same request: one key, one record. */
export function idempotencyKey(userId: string, tool: string, args: Record<string, unknown>, day = new Date()): string {
  const stable = JSON.stringify(args, Object.keys(args).sort())
  // The attached document is hashed by content like everything else, so a
  // retry with the same PDF is recognised and a different PDF is not.
  return createHash('sha256')
    .update(`${userId}|${tool}|${day.toISOString().slice(0, 10)}|${stable}`)
    .digest('hex')
}


/**
 * A write, between its claim and its record.
 *
 * THE CLAIM IS WRITTEN FIRST, on a unique key. A model that did not see the
 * answer asks again; the second call finds the first one's row and hands back
 * what it made instead of a second bill. A claim that cannot be written
 * REFUSES the write - the record of what Claude did is the point of letting it
 * do anything, and a create nobody can trace is worse than one that did not
 * happen. A write that fails gives its claim back, so asking again works.
 */
export async function runWrite(
  db: SupabaseClient, actor: ActorPerms, tool: WriteToolDef, args: Record<string, unknown>,
  projectId: string | null, tokenId: string | null,
): Promise<ToolOutcome> {
  const key = idempotencyKey(actor.userId, tool.name, args)
  const { data: claim, error: claimErr } = await db.from('mcp_actions')
    .insert({ token_id: tokenId, profile_id: actor.userId, tool: tool.name, idempotency_key: key, project_id: projectId })
    .select('id')
    .single()

  if (claimErr) {
    if ((claimErr as any).code === '23505') {
      const { data: earlier } = await db.from('mcp_actions')
        .select('record_id, result').eq('idempotency_key', key).maybeSingle()
      if ((earlier as any)?.result) {
        return { data: { ...(earlier as any).result, already_done: 'This exact request was already carried out today; nothing new was created.' } }
      }
      return { error: 'This exact request is already being carried out. Check SyteNav before asking again.' }
    }
    console.error('[mcp] action claim:', claimErr.message)
    return { error: 'SyteNav could not record this action, so nothing was created. Try again in a moment.' }
  }

  const outcome = await tool.run({ db, actor, args, projectId })

  if ('error' in outcome) {
    const { error } = await db.from('mcp_actions').delete().eq('id', (claim as any).id)
    if (error) console.error('[mcp] releasing a failed claim:', error.message)
    return outcome
  }
  const result = outcome.data as Record<string, unknown>
  const { error: recErr } = await db.from('mcp_actions')
    .update({ record_id: result?.id != null ? String(result.id) : null, result })
    .eq('id', (claim as any).id)
  if (recErr) console.error('[mcp] recording the action:', recErr.message)
  return outcome
}
