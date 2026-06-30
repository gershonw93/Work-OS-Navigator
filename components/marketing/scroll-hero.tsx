'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, ChevronDown } from 'lucide-react'
import { ProjectsMock } from './projects-mock'
import { BrowserMock } from './browser-mock'

// Plain hero for phones — the scroll-zoom effect doesn't work well on mobile.
function StaticHero() {
  return (
    <section className="px-4 pt-10 pb-12 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-muted-fg mb-4">
        <Sparkles className="h-3.5 w-3.5 text-accent-fg" /> AI-powered jobsite management
      </span>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink leading-tight">From the quote to the final invoice — one place to run the build.</h1>
      <p className="mt-4 text-base text-muted-fg">Quotes, budgets, schedules, daily logs, invoices, and compliance — for GCs and subs alike.</p>
      <div className="mt-6 flex flex-col gap-2.5">
        <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90">Start free <ArrowRight className="h-4 w-4" /></Link>
        <Link href="/homepage/features" className="inline-flex items-center justify-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3">See features</Link>
      </div>
      <div className="mt-8"><BrowserMock url="app.sytenav.com/projects"><div className="h-[360px] overflow-hidden"><ProjectsMock /></div></BrowserMock></div>
    </section>
  )
}

const clamp = (n: number, a: number, b: number) => Math.min(Math.max(n, a), b)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Scroll-driven intro: a busy Projects page fills the screen, zooms out into a
// computer monitor as you scroll, then the app fades and the headline appears.
export function ScrollHero() {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const total = el.offsetHeight - window.innerHeight
        const prog = total > 0 ? clamp(-el.getBoundingClientRect().top / total, 0, 1) : 0
        setP(prog)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [])

  const zoom = clamp(p / 0.6, 0, 1)             // 0 → fills screen, 1 → full monitor visible
  const scale = lerp(1.4, 0.8, zoom)
  const appOpacity = 1 - clamp((p - 0.7) / 0.18, 0, 1)
  const textProg = clamp((p - 0.72) / 0.24, 0, 1)
  const hintOpacity = 1 - clamp(p / 0.12, 0, 1)

  return (
    <>
      {/* Mobile: plain hero */}
      <div className="md:hidden"><StaticHero /></div>

      {/* Desktop: scroll-driven zoom-out */}
      <div ref={ref} className="relative h-[240vh] hidden md:block">
      <div className="sticky top-0 h-screen overflow-hidden flex items-center justify-center bg-surface">
        {/* App zooming out into a monitor */}
        <div className="will-change-transform" style={{ transform: `scale(${scale})`, opacity: appOpacity }}>
          <div className="mx-auto w-[1000px] max-w-[72vw]">
            {/* Monitor screen + bezel */}
            <div className="rounded-2xl border-[12px] border-[#202126] bg-[#202126] shadow-2xl overflow-hidden">
              <div className="h-[60vh] overflow-hidden rounded-lg bg-surface"><ProjectsMock /></div>
            </div>
            {/* Stand */}
            <div className="mx-auto h-5 w-24 bg-[#202126]/80" />
            <div className="mx-auto h-2 w-48 rounded-full bg-[#202126]/50" />
          </div>
        </div>

        {/* Headline that fades in as the app fades out */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
          style={{ opacity: textProg, transform: `translateY(${lerp(24, 0, textProg)}px)`, pointerEvents: textProg > 0.5 ? 'auto' : 'none' }}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-muted-fg mb-5">
            <Sparkles className="h-3.5 w-3.5 text-accent-fg" /> AI-powered jobsite management
          </span>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-ink max-w-3xl leading-[1.05]">
            From the quote to the final invoice — one place to run the build.
          </h1>
          <p className="mt-5 text-lg text-muted-fg max-w-2xl">
            SyteNav is construction management built for the field. Quotes, budgets, schedules, daily logs, invoices, and compliance — for GCs and subs alike.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90">Start free <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/homepage/features" className="inline-flex items-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3 hover:bg-panel">See features</Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center text-faint" style={{ opacity: hintOpacity }}>
          <span className="text-xs mb-1">Scroll</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </div>
      </div>
      </div>
    </>
  )
}
