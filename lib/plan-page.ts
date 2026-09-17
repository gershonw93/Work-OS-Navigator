/**
 * What a typed page number means on a 44-page plan set.
 *
 * WHY IT IS A MODULE. The viewer had only < and > - forty-three taps to reach
 * the last sheet of a set, which on a phone is not navigation, it is a
 * punishment. Typing the number is the whole feature, and everything that can
 * go wrong with a typed number is here rather than inline in a component:
 * blank, junk, a decimal, a negative, a number past the end of the document.
 *
 * COMMITTED, NOT LIVE. A caller must hold the typed text itself and ask this
 * only when the reader is finished (Enter, or leaving the field). Jumping on
 * every keystroke means typing "44" renders page 4 first - a full PDF page
 * decode - and then page 44, so the one thing the reader wanted is the second
 * thing they get, behind a render they never asked for.
 */

/**
 * The page a typed string asks for, or null if it asks for nothing.
 *
 * Null means "leave the reader where they are" - an empty box or junk is not a
 * request to go to page 1, which is what `parseInt` on its own would do
 * ("abc" -> NaN -> falsy -> 1 in a naive guard, and "1.9kb" -> 1).
 *
 * A number past either end CLAMPS rather than being refused. Asking for page 99
 * of 44 is unambiguous about intent - the reader wants the far end - and the
 * caller writes the clamped value back into the box, so the correction is
 * visible rather than silent.
 */
export function parsePageInput(raw: string, numPages: number): number | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  // Digits only, on purpose. `Number('1e3')` is 1000 and `parseInt('1.9')` is
  // 1 - both are a typo answered with confident nonsense.
  if (!/^\d+$/.test(text)) return null

  const total = Number.isFinite(numPages) && numPages >= 1 ? Math.floor(numPages) : 1
  const asked = Number(text)
  if (!Number.isFinite(asked)) return null
  if (asked < 1) return 1
  if (asked > total) return total
  return asked
}

/** Step one page, clamped. What the < and > buttons do. */
export function stepPage(current: number, by: number, numPages: number): number {
  const total = Number.isFinite(numPages) && numPages >= 1 ? Math.floor(numPages) : 1
  const next = Math.round(current + by)
  if (!Number.isFinite(next) || next < 1) return 1
  return next > total ? total : next
}
