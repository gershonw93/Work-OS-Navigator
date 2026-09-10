// ─────────────────────────────────────────────────────────────────────────────
// The controls in a project header, in one class string.
//
// There were four of them and they were four different shapes: an avatar pill
// with a chevron, a `px-3 py-1.5` bordered word, a `px-3 py-2` bordered word,
// and one clean square icon. They do the same KIND of thing - open something
// about this job - so they should read as a set, and a set that is written out
// four times drifts the moment anybody touches one of them.
//
// 44px on a phone and a compact square where a mouse is doing the aiming, the
// same split RowMenu uses. Every one of them is icon-only, so every one of them
// carries `aria-label` AND `title` - the label for a screen reader, the title
// for the hover text that tells a sighted user what the picture means.
// ─────────────────────────────────────────────────────────────────────────────

export const headerIconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line '
  + 'bg-panel text-muted-fg transition-colors hover:bg-muted hover:text-ink lg:h-9 lg:w-9'
