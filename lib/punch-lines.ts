/**
 * A box of punch list items, one per line, as the titles to create.
 *
 * Asked for as "open a box and every line is a punch list item" - a walk with
 * the client produces twenty of these at once, and twenty trips through a
 * one-task form is how a punch list ends up on paper instead.
 *
 * Whatever somebody pasted from a note or an email comes with its own marks on
 * it - "- ", a bullet, "1. ", "[ ] " - and those are not part of the item, so they
 * come off. Blank lines are spacing, not items. Duplicates are KEPT: "Touch up
 * paint" twice is usually two rooms, and silently dropping one is losing an
 * item off a punch list.
 */
export const MAX_PUNCH_LINES = 100

export function punchLines(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(line => line
      .replace(/^\s*(?:[-*\u2022\u00b7\u2010-\u2015]|\d{1,3}[.)]|\[\s?[xX]?\s?\])\s+/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
}
