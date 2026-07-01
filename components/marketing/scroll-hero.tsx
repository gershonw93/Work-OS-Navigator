'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, ChevronDown } from 'lucide-react'
import { ProjectsMock } from './projects-mock'
import { BrowserMock } from './browser-mock'
import { BlueprintGrid } from './blueprint'

const HEADLINE = 'Run the whole build from one place.'
const SUB =
  'SyteNav turns quotes into budgets, schedules the field, tracks every dollar in and out, and gets you paid. Built for GCs and subs who live on the jobsite, not at a desk.'

function Badge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-fg">
      <Sparkles className="h-3.5 w-3.5 text-accent-fg" /> AI-powered jobsite management
    </span>
  )
}

function Ctas({ center = false }: { center?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${center ? 'justify-center' : ''}`}>
      <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
        Start free <ArrowRight className="h-4 w-4" />
      </Link>
      <Link href="/homepage/features" className="inline-flex items-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3 hover:bg-panel transition-colors">
        See everything it does
      </Link>
    </div>
  )
}

// Plain hero for phones, the scroll-zoom effect doesn't work well on mobile.
function StaticHero() {
  return (
    <section className="px-4 pt-12 pb-14 text-center">
      <div className="mb-4"><Badge /></div>
      <h1 className="text-[2.1rem] font-extrabold tracking-tight text-ink leading-[1.08]">{HEADLINE}</h1>
      <p className="mt-4 text-base text-muted-fg leading-relaxed">{SUB}</p>
      <div className="mt-7 flex flex-col gap-2.5">
        <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3.5">
          Start free <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/homepage/features" className="inline-flex items-center justify-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3.5">
          See everything it does
        </Link>
      </div>
      <div className="mt-10">
        <BrowserMock url="app.sytenav.com/projects">
          <div className="h-[380px] overflow-hidden"><ProjectsMock /></div>
        </BrowserMock>
      </div>
    </section>
  )
}

const clamp = (n: number, a: number, b: number) => Math.min(Math.max(n, a), b)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// The signature intro: a busy Projects screen fills the viewport, settles into
// a monitor as you scroll, then cross-fades to the headline and CTAs.
export function ScrollHero() {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true)
      return
    }
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
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Everything finishes by p ≈ 0.72, then the finished headline stays pinned
  // for the rest of the track, so the animation never bleeds into the un-pin.
  const zoom = clamp(p / 0.35, 0, 1)
  const scale = lerp(1.14, 0.94, zoom)
  const appOpacity = 1 - clamp((p - 0.32) / 0.18, 0, 1) // app fades 0.32 → 0.50
  const textProg = clamp((p - 0.44) / 0.28, 0, 1)       // headline in 0.44 → 0.72
  const hintOpacity = 1 - clamp(p / 0.08, 0, 1)

  // Reduced motion: skip the scroll choreography entirely, show a static hero.
  if (reduced) {
    return (
      <div className="max-w-2xl mx-auto md:max-w-5xl">
        <StaticHero />
      </div>
    )
  }

  return (
    <>
      {/* Mobile: plain hero */}
      <div className="md:hidden"><StaticHero /></div>

      {/* Desktop: scroll-driven settle + cross-fade. The track is long enough
          that the cross-fade completes and holds before the section un-pins. */}
      <div ref={ref} className="relative hidden md:block h-[175vh]">
        <div className="sticky top-0 h-screen overflow-hidden flex items-center justify-center bg-surface">
          {/* Blueprint paper behind the whole choreography */}
          <BlueprintGrid />
          {/* App settling into a monitor. Wide enough to feel screen-filling on
              large displays; the mock overfills the screen and clips, so the
              monitor never shows empty glass. */}
          <div className="will-change-transform" style={{ transform: `scale(${scale})`, opacity: appOpacity }} aria-hidden={appOpacity < 0.05}>
            <div className="mx-auto w-[1500px] max-w-[90vw]">
              <div className="rounded-2xl border-[10px] border-[#202126] bg-[#202126] shadow-2xl shadow-black/30 overflow-hidden">
                {/* Capped so the mock always overfills the glass, even on tall displays */}
                <div className="h-[76vh] max-h-[940px] overflow-hidden rounded-lg bg-surface"><ProjectsMock /></div>
              </div>
              <div className="mx-auto h-5 w-28 bg-[#202126]/85" />
              <div className="mx-auto h-2 w-56 rounded-full bg-[#202126]/50" />
            </div>
          </div>

          {/* Headline cross-fade */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
            style={{
              opacity: textProg,
              transform: `translateY(${lerp(28, 0, textProg)}px)`,
              pointerEvents: textProg > 0.5 ? 'auto' : 'none',
            }}
            aria-hidden={textProg < 0.05}
          >
            <div className="mb-6"><Badge /></div>
            <h1 className="text-5xl lg:text-[4.4rem] font-extrabold tracking-tight text-ink max-w-4xl leading-[1.02]">
              {HEADLINE}
            </h1>
            <p className="mt-6 text-lg text-muted-fg max-w-2xl leading-relaxed">{SUB}</p>
            <div className="mt-8"><Ctas center /></div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              2,400+ contractors · $1.9B tracked · 48,000+ jobs
            </p>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center text-faint" style={{ opacity: hintOpacity }} aria-hidden>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Scroll</span>
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </div>
        </div>
      </div>
    </>
  )
}
