import type { SupabaseClient } from '@supabase/supabase-js'
import { lineProgress, type Progress, type ScheduleLine } from './schedule-dependencies'

/**
 * HOW FAR ALONG EACH LINE IS, READ ONCE FOR A WHOLE PROJECT.
 *
 * `lineProgress` is the rule - a typed percent wins, else the subcontract's
 * budget lines weighted by amount, else UNKNOWN - but it needs those budget
 * rows handed to it, and fetching them is the same twenty lines wherever a
 * gate is asked about. It was written once in the unblocked route; the cascade
 * now needs it too, and a third copy is how two screens come to disagree about
 * whether a trade is far enough along.
 *
 * ONE QUERY FOR THE WHOLE PROJECT, not one per line. The cascade asks this for
 * every predecessor it walks.
 *
 * NEVER THROWS ON THE BUDGET HALF. A budget read that fails means the roll-up
 * is unavailable, which resolves to `unknown` - and unknown BLOCKS, which is
 * the safe direction: a gate that holds because we could not find out is a
 * wasted phone call, while a gate that opens because we could not find out is
 * a crew on a site.
 */
export async function progressReader(
  db: SupabaseClient,
  lines: ScheduleLine[],
): Promise<(lineId: string) => Progress> {
  const byId = new Map(lines.map(l => [l.id, l]))

  const subIds = Array.from(new Set(
    lines.map(l => l.subcontract_id).filter((v): v is string => !!v),
  ))

  const budgetBySub = new Map<string, { progress_pct?: number | string | null; amount?: number | string | null }[]>()
  if (subIds.length) {
    const { data, error } = await db
      .from('budget_line_items')
      .select('subcontract_id, progress_pct, amount')
      .in('subcontract_id', subIds)
    // Logged, not thrown: see above - the answer degrades to `unknown`, which
    // is the safe side of this particular fence.
    if (error) console.error('[schedule/progress] budget roll-up unavailable:', error.message)
    for (const row of (data ?? []) as any[]) {
      const list = budgetBySub.get(row.subcontract_id) ?? []
      list.push({ progress_pct: row.progress_pct, amount: row.amount })
      budgetBySub.set(row.subcontract_id, list)
    }
  }

  return (lineId: string): Progress => {
    const line = byId.get(lineId)
    if (!line) return { pct: null, source: 'unknown' }
    return lineProgress(line, line.subcontract_id ? budgetBySub.get(line.subcontract_id) ?? [] : [])
  }
}
