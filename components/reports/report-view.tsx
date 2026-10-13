'use client'

import { cn } from '@/lib/utils'
import type { ReportDoc, ReportSection, ReportTable } from '@/lib/report-builder'
import { formatCell, formatStat, numeric } from '@/lib/report-format'
import { formatDate } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────────────────
// One renderer for a finished report - the Reports tab, the link a developer
// or a sub opens, and the PDF (the browser's print, through `print:` rules).
// It formats and lays out; it never works a number out. That is
// lib/report-builder.ts, so the three copies cannot disagree.
//
// A report IS tabular, so each table is kept - for the desktop and for paper.
// A phone gets the same rows as a list (`lg:hidden print:hidden`), because a
// ten-column table is not a phone layout; a printed page is narrower than
// `lg`, which is why the table carries `print:block` too.
// ─────────────────────────────────────────────────────────────────────────────

function Stats({ section }: { section: ReportSection }) {
  if (!section.stats.length) return null
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-panel sm:grid-cols-4 print:grid-cols-4 print:rounded-none">
      {section.stats.map(s => (
        <div key={s.label} className="border-b border-r border-line-soft px-4 py-3 last:border-r-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{s.label}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-ink">{formatStat(s.kind, s.value)}</p>
        </div>
      ))}
    </div>
  )
}

function DeskTable({ table }: { table: ReportTable }) {
  return (
    <div className="hidden lg:block print:block overflow-x-auto rounded-xl border border-line print:overflow-visible print:rounded-none">
      <table className="w-full min-w-[640px] text-sm print:min-w-0 print:text-[10px]">
        <thead className="bg-surface">
          <tr>
            {table.columns.map(c => (
              <th key={c.key} className={cn('px-3 py-2 text-xs font-semibold text-muted-fg', numeric(c.kind) ? 'text-right' : 'text-left')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {table.rows.map((r, i) => (
            <tr key={i} className="break-inside-avoid">
              {table.columns.map(c => (
                <td key={c.key} className={cn('px-3 py-2 align-top text-ink-soft', numeric(c.kind) && 'text-right tabular-nums whitespace-nowrap')}>
                  {formatCell(c.kind, r[c.key] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {table.totals && (
          <tfoot className="border-t-2 border-line bg-surface">
            <tr>
              {table.columns.map(c => (
                <td key={c.key} className={cn('px-3 py-2 font-semibold text-ink', numeric(c.kind) && 'text-right tabular-nums whitespace-nowrap')}>
                  {table.totals![c.key] === undefined ? '' : formatCell(c.kind, table.totals![c.key] ?? null)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

/** The same rows, as a list - the first column is the row's title. */
function PhoneList({ table }: { table: ReportTable }) {
  const [lead, ...rest] = table.columns
  return (
    <div className="lg:hidden print:hidden divide-y divide-line-soft rounded-2xl border border-line bg-panel">
      {table.rows.map((r, i) => (
        <div key={i} className="px-4 py-3">
          <p className="font-medium text-ink">{formatCell(lead.kind, r[lead.key] ?? null)}</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {rest.filter(c => r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '').map(c => (
              <div key={c.key} className="min-w-0">
                <dt className="text-xs text-faint">{c.label}</dt>
                <dd className={cn('truncate text-ink-soft', numeric(c.kind) && 'tabular-nums')}>{formatCell(c.kind, r[c.key] ?? null)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {table.totals && (
        <div className="bg-surface px-4 py-3">
          <p className="font-semibold text-ink">Total</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {rest.filter(c => typeof table.totals![c.key] === 'number').map(c => (
              <div key={c.key}>
                <dt className="text-xs text-faint">{c.label}</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatCell(c.kind, table.totals![c.key] ?? null)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

export function ReportView({ doc, companyName, logoUrl }: { doc: ReportDoc; companyName?: string | null; logoUrl?: string | null }) {
  return (
    <article className="report-doc space-y-8">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink">{doc.title}</h2>
          <p className="mt-1 text-sm text-muted-fg">{doc.subtitle}</p>
          <p className="mt-1 text-xs text-faint">
            {companyName ? `${companyName} - ` : ''}Generated {formatDate(doc.generatedAt, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={companyName ?? 'Company logo'} className="h-12 w-auto max-w-[160px] object-contain" />
        )}
      </header>

      {doc.sections.map(s => (
        <section key={s.key} className="space-y-3 break-inside-avoid-page">
          <h3 className="text-base font-semibold text-ink">{s.title}</h3>
          {s.note && <p className="text-xs text-muted-fg">{s.note}</p>}
          <Stats section={s} />
          {s.tables.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted-fg">
              {s.empty ?? 'Nothing to show.'}
            </p>
          )}
          {s.tables.map((t, i) => (
            <div key={i} className="space-y-2">
              {t.heading && <h4 className="text-sm font-semibold text-ink-soft">{t.heading}</h4>}
              <DeskTable table={t} />
              <PhoneList table={t} />
            </div>
          ))}
        </section>
      ))}

      {!doc.sections.length && (
        <p className="text-sm text-muted-fg">This report has no sections.</p>
      )}
    </article>
  )
}
