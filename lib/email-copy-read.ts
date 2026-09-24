import type { SupabaseClient } from '@supabase/supabase-js'
import { COPY_SLUGS, copySlug, applyTags, type CopyFields, type MergeValues } from './email-copy'

// ─────────────────────────────────────────────────────────────────────────────
// The ONE place a stored override is laid over the code default.
//
// Three senders need this - the signup route, the nudge cron and the trial cron
// - and if each resolved it its own way they would drift about what happens
// when the table is unreachable. They all call this.
//
// A FAILED READ FALLS BACK TO THE CODE, LOUDLY. The default is a real, shipped
// sentence, so serving it is never wrong - it is just not the edit somebody
// made. Silence would be: log it, so "my change did not take" has an answer
// other than a shrug.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedCopy extends CopyFields {
  /** Did a stored row supply this, or the code? The console prints it. */
  source: 'stored' | 'default'
  updatedByName?: string | null
  updatedAt?: string | null
}

type Row = {
  slug: string
  subject: string
  body: string
  cta: string | null
  updated_by_name: string | null
  updated_at: string | null
}

/** Every override we hold, keyed by slug. Never throws. */
export async function storedCopy(db: SupabaseClient): Promise<Map<string, Row>> {
  const out = new Map<string, Row>()
  const { data, error } = await db
    .from('email_copy')
    .select('slug, subject, body, cta, updated_by_name, updated_at')
  if (error) {
    console.error('[email-copy] could not read overrides - sending the code copy', error.message)
    return out
  }
  for (const r of (data ?? []) as unknown as Row[]) out.set(r.slug, r)
  return out
}

const merge = (spec: { fallback: CopyFields }, row: Row | undefined): ResolvedCopy =>
  row
    ? {
      subject: row.subject, body: row.body, cta: row.cta,
      source: 'stored', updatedByName: row.updated_by_name, updatedAt: row.updated_at,
    }
    : { ...spec.fallback, source: 'default' }

/** One slug, resolved. Unknown slugs answer null rather than an invented sentence. */
export async function resolveCopy(
  db: SupabaseClient,
  slug: string,
  values: MergeValues = {},
): Promise<ResolvedCopy | null> {
  const spec = copySlug(slug)
  if (!spec) return null
  const rows = await storedCopy(db)
  return fill(merge(spec, rows.get(slug)), values)
}

/** Every slug at once - one trip, for the console and for a cron run. */
export async function resolveAll(db: SupabaseClient): Promise<Record<string, ResolvedCopy>> {
  const rows = await storedCopy(db)
  const out: Record<string, ResolvedCopy> = {}
  for (const spec of COPY_SLUGS) out[spec.slug] = merge(spec, rows.get(spec.slug))
  return out
}

/** Fill the merge tags in, on every field at once. */
export function fill(copy: ResolvedCopy, values: MergeValues): ResolvedCopy {
  return {
    ...copy,
    subject: applyTags(copy.subject, values),
    body: applyTags(copy.body, values),
    cta: copy.cta ? applyTags(copy.cta, values) : copy.cta,
  }
}
