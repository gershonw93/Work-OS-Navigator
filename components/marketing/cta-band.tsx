import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

// The closing CTA used at the bottom of every marketing page.
export function CtaBand({
  title = 'Run your next job on SyteNav',
  body = 'Set up your company in minutes, upload a quote, and bring the office and the field onto one page.',
}: {
  title?: string
  body?: string
}) {
  return (
    <section aria-label="Get started" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28">
      <div className="relative overflow-hidden rounded-3xl bg-accent text-accent-ink px-6 sm:px-14 py-16 sm:py-20 text-center">
        {/* Oversized ghost wordmark for texture, decorative only */}
        <span aria-hidden className="pointer-events-none select-none absolute -bottom-8 left-1/2 -translate-x-1/2 font-display font-bold uppercase text-[26vw] sm:text-[13rem] leading-none text-accent-ink/[0.06] whitespace-nowrap">
          SYTENAV
        </span>
        <div className="relative">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">{title}</h2>
          <p className="mt-4 text-accent-ink/75 max-w-xl mx-auto text-base sm:text-lg">{body}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-ink text-surface font-bold px-7 py-3.5 hover:opacity-90 transition-opacity"
            >
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/homepage/contact"
              className="inline-flex items-center gap-2 rounded-xl border border-accent-ink/30 font-semibold px-7 py-3.5 hover:bg-accent-ink/10 transition-colors"
            >
              Talk to us
            </Link>
          </div>
          <p className="mt-5 text-xs text-accent-ink/60">Free to start. No credit card. Bring one job or bring them all.</p>
        </div>
      </div>
    </section>
  )
}
