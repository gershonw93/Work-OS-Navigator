import { Lightbulb, AlertTriangle, Info, Check, X } from 'lucide-react'
import type { GuideBlock, GuideTone } from '@/lib/guides/schema'
import { headingId } from '@/lib/guides/schema'

// ─────────────────────────────────────────────────────────────────────────────
// The renderer for a guide's body.
//
// The page holds no copy: every sentence on a guide lives in lib/guides, and
// this file decides only how a block LOOKS. That is the whole point of the
// split - the index, the sitemap, the structured data and the page are reading
// one source, so none of them can drift from the others.
//
// Anchors come from `headingId`, the same function the contents list asks, so
// a link and the heading it points at cannot disagree.
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<GuideTone, { icon: typeof Lightbulb; wrap: string; badge: string }> = {
  tip: { icon: Lightbulb, wrap: 'border-accent-tint bg-accent-tint/40', badge: 'text-accent-fg' },
  warn: { icon: AlertTriangle, wrap: 'border-warn/30 bg-warn-tint/50', badge: 'text-warn' },
  note: { icon: Info, wrap: 'border-info/30 bg-info-tint/50', badge: 'text-info' },
}

function Callout({ tone, title, text }: { tone: GuideTone; title: string; text: string }) {
  const t = TONE[tone]
  const Icon = t.icon
  return (
    <div className={`my-8 rounded-2xl border ${t.wrap} p-5 sm:p-6`}>
      <p className={`flex items-start gap-2 font-semibold text-ink ${t.badge}`}>
        <Icon className="h-[18px] w-[18px] shrink-0 mt-0.5" aria-hidden />
        <span className="text-ink">{title}</span>
      </p>
      <p className="mt-2 text-[15px] sm:text-base text-muted-fg leading-relaxed">{text}</p>
    </div>
  )
}

function Compare({ title, left, right }: Extract<GuideBlock, { type: 'compare' }>) {
  // Two stacked columns of prose, never a grid of cells: at 390px a two-column
  // comparison laid out as rows gives each cell about seven characters, and the
  // repo counts anything that reaches a phone that way.
  const columns = [
    { col: left, icon: X, ring: 'border-line', label: 'text-muted-fg', mark: 'text-danger' },
    { col: right, icon: Check, ring: 'border-accent-tint', label: 'text-ink', mark: 'text-accent-fg' },
  ]
  return (
    <figure className="my-9">
      <figcaption className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint mb-3">{title}</figcaption>
      <div className="grid gap-4 sm:grid-cols-2">
        {columns.map(({ col, icon: Icon, ring, label, mark }) => (
          <div key={col.label} className={`rounded-2xl border ${ring} bg-panel p-5`}>
            <p className={`text-sm font-bold ${label}`}>{col.label}</p>
            <ul className="mt-3 space-y-2.5">
              {col.items.map(item => (
                <li key={item} className="flex gap-2.5 text-[15px] text-muted-fg leading-relaxed">
                  <Icon className={`h-4 w-4 shrink-0 mt-1 ${mark}`} aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </figure>
  )
}

export function GuideBody({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div className="max-w-none">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2':
            return (
              <h2
                key={i}
                id={headingId(b.text)}
                className="scroll-mt-24 mt-12 sm:mt-16 mb-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-[1.15]"
              >
                {b.text}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={i} className="mt-8 mb-3 text-lg sm:text-xl font-bold text-ink">
                {b.text}
              </h3>
            )
          case 'p':
            return (
              <p key={i} className="mt-4 text-[17px] text-ink-soft leading-[1.75]">
                {b.text}
              </p>
            )
          case 'list':
            return (
              <ul key={i} className="mt-5 space-y-3">
                {b.items.map(item => (
                  <li key={item} className="flex gap-3 text-[17px] text-ink-soft leading-[1.7]">
                    <span aria-hidden className="mt-[13px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-fg" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )
          case 'steps':
            return (
              <ol key={i} className="mt-5 space-y-4">
                {b.items.map((item, n) => (
                  <li key={item} className="flex gap-3.5 text-[17px] text-ink-soft leading-[1.7]">
                    <span
                      aria-hidden
                      className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent-tint text-accent-fg font-mono text-xs font-bold flex items-center justify-center"
                    >
                      {n + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            )
          case 'checklist':
            return (
              <div key={i} className="my-9 rounded-2xl border border-line bg-panel p-5 sm:p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">{b.title}</p>
                <ul className="mt-4 divide-y divide-line-soft">
                  {b.items.map(item => (
                    <li key={item} className="flex gap-3 py-3 text-[15px] sm:text-base text-ink-soft leading-relaxed first:pt-0 last:pb-0">
                      <span
                        aria-hidden
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-md border border-line flex items-center justify-center"
                      >
                        <Check className="h-3.5 w-3.5 text-accent-fg" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          case 'callout':
            return <Callout key={i} tone={b.tone} title={b.title} text={b.text} />
          case 'compare':
            return <Compare key={i} {...b} />
        }
      })}
    </div>
  )
}
