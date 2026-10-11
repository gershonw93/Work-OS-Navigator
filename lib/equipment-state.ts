// What a piece of equipment's state means, and which moves are allowed from
// it. Pure - the page, the check-in route and the repair route all ask these,
// so the button a screen offers and the move a route accepts cannot disagree.
//
// TWO QUESTIONS, NOT ONE. `status` is WHERE it is: in the shop, out on a job,
// away being fixed, gone for good. `repair_needed_at` is WHETHER IT IS BROKEN,
// and that is independent - a saw with a wobbling fence can still be on site
// in somebody's hands, and taking it out of service is a decision somebody
// makes after hearing about it, not the same act as reporting it.

export type EquipmentStatus = 'available' | 'checked_out' | 'maintenance' | 'retired'

export interface EquipmentState {
  status: string
  repair_needed_at?: string | null
}

export const STATUS_LABEL: Record<EquipmentStatus, string> = {
  available: 'Available',
  checked_out: 'Checked out',
  // The status nothing could set before. "Maintenance" read like a schedule;
  // this is a tool that is away being fixed.
  maintenance: 'In for repair',
  retired: 'Retired',
}

export type RepairAction = 'flag' | 'repaired' | 'send_out' | 'retire' | 'reactivate'

/** The event each move writes to `equipment_events`. */
export const EVENT_FOR: Record<RepairAction, string> = {
  flag: 'repair_flagged',
  repaired: 'repaired',
  send_out: 'sent_for_repair',
  retire: 'retired',
  reactivate: 'reactivated',
}

export const EVENT_LABEL: Record<string, string> = {
  repair_flagged: 'Marked needs repair',
  repaired: 'Marked repaired',
  sent_for_repair: 'Sent for repair',
  retired: 'Retired',
  reactivated: 'Back in service',
}

export const needsRepair = (e: EquipmentState) => !!e.repair_needed_at

/**
 * Why this move cannot happen from here, or null. Asked by the menu (so it
 * only offers what will work) AND by the route (so a second tab cannot go
 * round the menu).
 */
export function repairActionProblem(e: EquipmentState, action: RepairAction, note?: string | null): string | null {
  switch (action) {
    case 'flag':
      if (e.status === 'retired') return 'It is retired. Bring it back into service first.'
      if (!note?.trim()) return 'Say what is wrong with it, so whoever fixes it knows.'
      return null
    case 'repaired':
      return needsRepair(e) || e.status === 'maintenance' ? null : 'Nothing is marked wrong with it.'
    case 'send_out':
      if (e.status === 'checked_out') return 'Check it in first - it is still out on a job.'
      if (e.status === 'maintenance') return 'It is already in for repair.'
      if (e.status === 'retired') return 'It is retired.'
      return null
    case 'retire':
      if (e.status === 'checked_out') return 'Check it in first - it is still out on a job.'
      return e.status === 'retired' ? 'It is already retired.' : null
    case 'reactivate':
      return e.status === 'retired' ? null : 'It is not retired.'
  }
}

/** Can it be checked out at all? Away being fixed or retired, no. */
export function checkoutProblem(e: EquipmentState): string | null {
  if (e.status === 'maintenance') return 'It is in for repair. Mark it repaired before checking it out.'
  if (e.status === 'retired') return 'It is retired.'
  if (e.status === 'checked_out') return 'It is already checked out. Check it in first.'
  return null
}

export type ReturnCondition = 'ok' | 'needs_repair'

/** The check-in's own question: what state did it come back in? */
export function checkInProblem(condition: ReturnCondition, note?: string | null): string | null {
  if (condition === 'needs_repair' && !note?.trim()) return 'Say what is wrong with it, so whoever fixes it knows.'
  return null
}
