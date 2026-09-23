/**
 * The colour a person actually SEES at a point on the page, as #RRGGBB.
 *
 * For the Android system-bar bands (MainActivity.java): the element at the
 * edge is often transparent itself - a link, an icon, a flex row - and the
 * colour showing is some ancestor's. So walk up to the first element with an
 * opaque-enough background. Null when nothing has one, which the caller reads
 * as "leave the bands alone" rather than guessing white.
 *
 * Pure apart from getComputedStyle, and the parsing half is split out so it
 * can be tested without a browser.
 */
export function edgeColor(el: Element | null): string | null {
  let node: Element | null = el
  while (node) {
    const hex = cssColorToHex(getComputedStyle(node).backgroundColor)
    if (hex) return hex
    node = node.parentElement
  }
  return null
}

/**
 * "rgb(31, 34, 39)" -> "#1F2227". Transparent, or mostly transparent, is null:
 * a translucent backdrop is not the colour of anything, it is a tint over
 * whatever is below it.
 */
export function cssColorToHex(css: string | null | undefined): string | null {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(String(css ?? '').trim())
  if (!m) return null
  if (m[4] !== undefined) {
    const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (!(a >= 0.9)) return null
  }
  const hex = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`.toUpperCase()
}
