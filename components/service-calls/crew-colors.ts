// One colour per crew member on the dispatch board and its legend, so a
// person's calls are recognisable at a glance in the Week view, where columns
// are days rather than people. Written out in full: Tailwind only keeps class
// names it can see. Red is NOT in the set - red on this board means a double
// booking, and a colour that can mean "Dana" cannot also mean "clash".

export const CREW_COLORS = [
  { block: 'bg-info-tint border-info', dot: 'bg-info', text: 'text-info' },
  { block: 'bg-success-tint border-success', dot: 'bg-success', text: 'text-success' },
  { block: 'bg-special-tint border-special', dot: 'bg-special', text: 'text-special' },
  { block: 'bg-warn-tint border-warn', dot: 'bg-warn', text: 'text-warn' },
  { block: 'bg-accent-tint border-accent', dot: 'bg-accent', text: 'text-accent-fg' },
] as const

export const UNASSIGNED_COLOR = { block: 'bg-surface border-muted2', dot: 'bg-muted2', text: 'text-muted-fg' } as const

export type CrewColor = (typeof CREW_COLORS)[number] | typeof UNASSIGNED_COLOR

/** The colour for a crew member, by their place in the (name-sorted) crew list. */
export function colorFor(crewIds: readonly string[], id: string | null): CrewColor {
  if (!id) return UNASSIGNED_COLOR
  const i = crewIds.indexOf(id)
  return i === -1 ? UNASSIGNED_COLOR : CREW_COLORS[i % CREW_COLORS.length]
}

/** "DW" for Dana Whitfield, "S" for sub2@x.com. */
export function initials(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}
