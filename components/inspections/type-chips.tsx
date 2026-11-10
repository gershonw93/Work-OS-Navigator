'use client'

import { foldType } from '@/lib/inspection-types'
import { MultiSelect } from '@/components/ui/multi-select'

/**
 * Pick several inspection types - a dropdown with checkboxes.
 *
 * It was a wall of pills: twenty of them filled the Directory's edit form and
 * pushed Save out of reach ("the edit opens this HUGE list"). Same control as
 * the permit types in Update several houses, for the same reason.
 *
 * A stored type that is no longer offered (a company type since removed, a
 * spelling from an older list) stays listed and ticked, so opening a card to
 * fix a phone number cannot quietly drop it. Values are matched by `foldType`,
 * so "framing" on a card ticks "Framing" in the list.
 */
export function InspectionTypeChips({
  options, value, onChange, placeholder = 'Pick the inspections they do',
}: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const extra = value.filter(v => !options.some(o => foldType(o) === foldType(v)))
  const all = [...options, ...extra]
  // Each stored value shown as the listed spelling it folds to.
  const picked = value.map(v => all.find(o => foldType(o) === foldType(v)) ?? v)
  return <MultiSelect options={all} value={picked} onChange={onChange} placeholder={placeholder} />
}
