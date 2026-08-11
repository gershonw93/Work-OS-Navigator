// ─────────────────────────────────────────────────────────────────────────────
// Typing text onto a PDF.
//
// This fills in text. It is NOT a signature tool, and it deliberately offers
// nothing that looks like one - no signature field, no script font, no "sign
// here". The moment an app implies it is capturing a signature, people rely on
// an audit trail and a tamper-evident record that this does not have, and the
// place they find out is a dispute. Filling text carries none of that weight:
// it is the same thing anyone already does in Preview or Acrobat.
//
// The filled document is always saved as a NEW file. Typing on a PDF someone
// sent you and having it replace theirs is a document-alteration tool, which is
// a different and much worse product.
// ─────────────────────────────────────────────────────────────────────────────

/** A block of text the user placed on a page. */
export interface FillBox {
  id: string
  /** Zero-based page index. */
  page: number
  /** Top-left of the box, as a fraction of page width/height (0-1). */
  x: number
  y: number
  text: string
  /** Font size in PDF points. */
  size: number
}

/**
 * Helvetica's ascent is ~0.718em, but the on-screen box is drawn with
 * line-height 1, so the visual top of a line sits a shade above the glyphs.
 * 0.8 lands the baseline close enough that a box looks the same on screen and
 * in the saved file - and boxes can be dragged, so any last point or two of
 * drift is something the user fixes without thinking about it.
 */
export const BASELINE_RATIO = 0.8

/** Matches the on-screen line spacing so multi-line blocks agree. */
export const LINE_HEIGHT_RATIO = 1.2

/**
 * Where to draw one line of a box, in pdf-lib's coordinate space.
 *
 * pdf-lib puts the origin at the bottom-left of the page and `drawText` takes
 * the BASELINE, while boxes are stored from the top-left like everything on
 * screen. This is the conversion, and it is the part worth having tests for.
 */
export function baselineFor(
  box: { y: number; size: number },
  pageHeight: number,
  lineIndex: number,
): number {
  const top = pageHeight - box.y * pageHeight
  return top - box.size * BASELINE_RATIO - lineIndex * box.size * LINE_HEIGHT_RATIO
}

export function leftFor(box: { x: number }, pageWidth: number): number {
  return box.x * pageWidth
}

/**
 * pdf-lib's standard fonts encode WinAnsi, and anything outside it throws
 * rather than degrading. Curly quotes and dashes arrive constantly from
 * copy-paste, so they are folded to their ASCII equivalents and anything still
 * unencodable is dropped - a missing glyph is better than a failed save with
 * no explanation.
 */
export function sanitizeForPdf(input: string): string {
  const folded = input
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•·]/g, '-')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
  // WinAnsi is Latin-1 shaped: keep printable ASCII, newline, and the accented
  // range. Everything else (emoji, CJK, Hebrew) cannot be encoded at all.
  let out = ''
  for (const ch of folded) {
    const c = ch.codePointAt(0)!
    if (ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) out += ch
  }
  return out
}

/** True when text would lose characters on the way into the PDF. */
export function hasUnsupportedChars(input: string): boolean {
  return sanitizeForPdf(input).replace(/\n/g, '') !== input
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•·]/g, '-')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/\n/g, '')
}

/** "Permit application.pdf" → "Permit application (filled).pdf" */
export function filledName(original: string): string {
  const dot = original.lastIndexOf('.')
  const stem = dot > 0 ? original.slice(0, dot) : original
  const ext = dot > 0 ? original.slice(dot) : '.pdf'
  // Don't stack "(filled) (filled)" when someone fills a filled copy.
  if (/\(filled\)$/i.test(stem.trim())) return `${stem}${ext}`
  return `${stem} (filled)${ext}`
}
