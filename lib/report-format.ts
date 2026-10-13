import { formatDate } from './dates'
import type { Cell, CellKind, ReportDoc } from './report-builder'

// How a report value is PRINTED. Kept apart from the builder so the snapshot
// a share link stores is plain numbers and dates, and formatting can improve
// without rewriting what somebody was sent.

export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(n) % 1 ? 2 : 0 })
  // A sentence dash is ` - ` in this app; a minus sign is still a minus sign.
  return n < 0 ? `-$${abs}` : `$${abs}`
}

export function formatCell(kind: CellKind, v: Cell): string {
  if (v === null || v === undefined || v === '') return '-'
  switch (kind) {
    case 'money': return typeof v === 'number' ? money(v) : String(v)
    case 'pct': return typeof v === 'number' ? `${Math.round(v)}%` : String(v)
    case 'hours': return typeof v === 'number' ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} h` : String(v)
    case 'number': return typeof v === 'number' ? v.toLocaleString('en-US') : String(v)
    case 'date': return formatDate(String(v))
    case 'status': {
      const s = String(v).replace(/_/g, ' ')
      return s.charAt(0).toUpperCase() + s.slice(1)
    }
    default: return String(v)
  }
}

export function formatStat(kind: 'money' | 'number' | 'hours', v: number): string {
  return kind === 'money' ? money(v) : kind === 'hours' ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} h` : v.toLocaleString('en-US')
}

/** Is a column right-aligned? Numbers are. */
export const numeric = (kind: CellKind) => kind === 'money' || kind === 'pct' || kind === 'hours' || kind === 'number'

/**
 * The report as sheets for Excel: one sheet per section, raw numbers (so a
 * spreadsheet can add them up), dates as ISO days. Sheet names are capped at
 * Excel's 31 characters and made unique.
 */
export function docToSheets(doc: ReportDoc): { name: string; rows: (string | number | null)[][] }[] {
  const used = new Set<string>()
  const sheetName = (t: string) => {
    let base = t.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Sheet'
    let name = base, n = 2
    while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${n++}`
    used.add(name.toLowerCase())
    return name
  }
  const sheets = [{
    name: sheetName('Report'),
    rows: [[doc.title], [doc.subtitle], [`Generated ${doc.generatedAt.slice(0, 10)}`], []] as (string | number | null)[][],
  }]
  for (const s of doc.sections) {
    sheets[0].rows.push([s.title])
    for (const st of s.stats) sheets[0].rows.push([st.label, st.value])
    sheets[0].rows.push([])
    const rows: (string | number | null)[][] = []
    for (const t of s.tables) {
      if (t.heading) rows.push([t.heading])
      rows.push(t.columns.map(c => c.label))
      for (const r of t.rows) rows.push(t.columns.map(c => r[c.key] ?? null))
      if (t.totals) rows.push(t.columns.map(c => t.totals![c.key] ?? null))
      rows.push([])
    }
    if (!s.tables.length) rows.push([s.empty ?? 'Nothing to show.'])
    sheets.push({ name: sheetName(s.title), rows })
  }
  return sheets
}
