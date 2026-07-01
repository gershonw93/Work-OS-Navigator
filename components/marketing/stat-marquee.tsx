const ITEMS = [
  ['2,400+', 'contractors'],
  ['$1.9B', 'in contracts tracked'],
  ['48,000+', 'jobs managed'],
  ['120k+', 'daily logs filed'],
  ['310k+', 'documents scanned by AI'],
  ['37', 'states'],
  ['92%', 'of invoices paid on schedule'],
  ['14s', 'average quote scan'],
] as const

function Row() {
  return (
    <div className="flex items-center shrink-0">
      {ITEMS.map(([value, label]) => (
        <span key={label} className="flex items-baseline gap-2.5 px-8 sm:px-12 whitespace-nowrap">
          <span className="font-display font-bold text-2xl sm:text-3xl text-ink tracking-tight">{value}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-fg">{label}</span>
          <span aria-hidden className="ml-8 sm:ml-12 h-1.5 w-1.5 rounded-full bg-accent inline-block" />
        </span>
      ))}
    </div>
  )
}

// A slow horizontal marquee of proof-point stats. Decorative duplication is
// aria-hidden; the numbers are also in copy elsewhere for screen readers.
export function StatMarquee() {
  return (
    <section aria-label="SyteNav by the numbers" className="border-y border-line bg-panel overflow-hidden py-5 sm:py-6">
      <div className="flex w-max animate-marquee">
        <Row />
        <div aria-hidden className="flex shrink-0">
          <Row />
        </div>
      </div>
    </section>
  )
}
