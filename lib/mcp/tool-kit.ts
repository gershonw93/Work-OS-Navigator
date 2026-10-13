import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorPerms } from '@/lib/server-permissions'
import type { Action } from '@/lib/permissions'
import type { WriteResult } from '@/lib/writes/result'
import type { ToolOutcome, ToolSpec } from './protocol'

// ─────────────────────────────────────────────────────────────────────────────
// The shapes and small helpers every MCP tool file shares - the read tools in
// tools.ts, the write tools in write-tools.ts, and each area under areas/.
// Types and argument parsing only: nothing here reads or writes a table except
// `onJob`, which only READS to check a record belongs to the job.
// ─────────────────────────────────────────────────────────────────────────────

/** More than this many rows and the result says it was cut, rather than silently stopping. */
export const ROW_LIMIT = 200

export type ProjectArg = 'required' | 'optional' | 'none'

export interface RunContext {
  db: SupabaseClient
  actor: ActorPerms
  args: Record<string, unknown>
  /** The jobs this call covers: the one asked for, or every job the person can see. */
  projectIds: string[]
  projectNames: Map<string, string>
}

export interface ToolDef extends ToolSpec {
  /** The permission (resource) a person needs, at `view`. */
  resource: string
  project: ProjectArg
  run: (ctx: RunContext) => Promise<ToolOutcome>
}

/** The rows, and whether there were more than we sent. */
export function capped<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  return rows.length > ROW_LIMIT ? { rows: rows.slice(0, ROW_LIMIT), truncated: true } : { rows, truncated: false }
}

export const PROJECT_ID = { type: 'string', description: 'The project id from list_projects.' }
export const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }

export const failed = (what: string, error: { message: string }): ToolOutcome => {
  console.error(`[mcp] ${what} read failed:`, error.message)
  return { error: `SyteNav could not read ${what} just now. Try again in a moment.` }
}

/** Who to credit in the activity feed: "Dana via Claude". */
export const VIA = 'Claude'

export interface WriteRunContext {
  db: SupabaseClient
  actor: ActorPerms
  args: Record<string, unknown>
  /** The one job this call is for - checked against the company's own by the dispatcher. */
  projectId: string | null
}

export interface WriteToolDef extends ToolSpec {
  write: true
  resource: string
  action: Action
  project: 'required' | 'none'
  run: (ctx: WriteRunContext) => Promise<ToolOutcome>
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
export const fold = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')


/** The app's answer, as Claude reads it: the record on success, the app's own sentence on refusal. */
export function outcome(result: WriteResult, key: string, summary: (row: any) => Record<string, unknown>): ToolOutcome {
  if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
  const row = result.body?.[key]
  if (!row) return { error: 'SyteNav did not confirm the record was created. Check the app before trying again.' }
  return { data: { created: true, ...summary(row) } }
}

export const money = (v: unknown): number | null | 'bad' => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 'bad'
}
export const pct = (v: unknown): number | null | 'bad' => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 'bad'
}

/** Only the keys the caller actually gave - an absent key is "leave it alone", never "clear it". */
export function given(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (k in args && args[k] !== undefined) out[k] = args[k]
  return out
}

/** Does this row belong to this job? A failed read is not a "no" - it says so. */
export async function onJob(db: SupabaseClient, table: string, id: unknown, projectId: string): Promise<string | null> {
  if (typeof id !== 'string' || !id.trim()) return 'Say which one: the id is missing.'
  const { data, error } = await db.from(table).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  if (error) { console.error(`[mcp] ${table} lookup:`, error.message); return 'SyteNav could not check that record just now.' }
  return data ? null : 'That record is not on this job.'
}
