// A sub's delay report, closed - applied or dismissed - and the sub told.
//
// One writer of the decision, shared by the cascade PUT (which applies one as
// part of recording the delay) and the dismiss route, so "decided" is stamped
// and announced the same way whichever door closed it. Only a PENDING report
// can be decided: the conditional update is the claim, so two GCs pressing at
// once decide it once and tell the sub once.

import { notify } from './notify'

export type Decision = 'applied' | 'dismissed'

export async function decideDelayReport(input: {
  db: any
  projectId: string
  reportId: string
  /** The line the decision was taken on - a report for another line is not this one. */
  itemId?: string
  decision: Decision
  decidedBy: string
  /** What the line now reads, for the applied sentence. */
  landed?: { start: string; end: string } | null
}): Promise<{ decided: boolean }> {
  const { db, projectId, reportId, itemId, decision, decidedBy, landed } = input
  try {
    let q = db.from('schedule_delay_reports')
      .update({ status: decision, decided_by: decidedBy, decided_at: new Date().toISOString() })
      .eq('id', reportId)
      .eq('project_id', projectId)
      .eq('status', 'pending')
    if (itemId) q = q.eq('schedule_item_id', itemId)
    const { data: rows, error } = await q.select('id, company_id, reported_by, days, schedule_item_id')
    if (error) {
      console.error('[delay-report] decide failed', { reportId, error: error.message })
      return { decided: false }
    }
    const report = rows?.[0]
    if (!report) return { decided: false }

    const [{ data: line }, { data: project }] = await Promise.all([
      db.from('schedule_items').select('trade, label').eq('id', report.schedule_item_id).maybeSingle(),
      db.from('projects').select('name').eq('id', projectId).maybeSingle(),
    ])
    const what = line?.trade?.trim() || line?.label?.trim() || 'Your line'
    const where = project?.name ? ` on ${project.name}` : ''
    await notify({
      db,
      userIds: [report.reported_by],
      type: 'schedule_delay_decided',
      title: decision === 'applied' ? 'Your delay was applied' : 'Your delay was not applied',
      message: decision === 'applied'
        ? `${what}${where}${landed ? ` now runs ${landed.start} to ${landed.end}` : ' has new dates'}.`
        : `${what}${where} keeps its dates. Message the GC if the delay still stands.`,
      link: `/my-jobs/${projectId}`,
    })
    return { decided: true }
  } catch (e: any) {
    console.error('[delay-report] decide threw', { reportId, error: e?.message })
    return { decided: false }
  }
}
