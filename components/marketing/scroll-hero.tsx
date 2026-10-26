'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, ChevronDown } from 'lucide-react'
import { ProjectsMock } from './projects-mock'
import { BlueprintGrid } from './blueprint'
import { appHref } from '@/lib/hosts'
import { SHOW_TRACTION_STATS } from '@/lib/traction'
import { SYTENAV_DEFINITION } from '@/lib/definition'
import { cn } from '@/lib/utils'

const HEADLINE = 'Run the whole build from one place.'

const clamp = (n: number, a: number, b: number) => Math.min(Math.max(n, a), b)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// The signature intro: a busy Projects screen fills the viewport, settles into
// a monitor as you scroll, then cross-fades to the headline and CTAs.
//
// ONE COPY OF EACH, AND THE WORDS COME FIRST IN THE DOM. This used to be two
// heroes - a phone one and a desktop one, swapped with `md:hidden` - each with
// its own Projects screen, and the screen sat ABOVE the h1. So the first thing
// a crawler read on the homepage was "Maple Street Residences", and the whole
// invented project list (addresses, client names) appeared twice as body copy:
// a model summarising the page could name an invented client as a customer.
// Now there is one headline block (eyebrow, h1, the definition, the buttons)
// and then one screen, and only the CLASSES differ by breakpoint - the desktop
// choreography is driven by CSS variables read under `md:`.
//
// THE SCREEN IS A PICTURE, NOT CONTENT. The first fix wrapped the live HTML in
// aria-hidden + data-nosnippet, and a plain fetch still returned 120 lines of
// sidebar, counters and "0, $0, $0" (the count-up started at zero and waited
// for a scroll no crawler makes). It is an image now (ProjectsMock ->
// MockImage), with alt text, so the text layer is the headline, the one
// definition and the two buttons - and nothing else.
export function ScrollHero() {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true)
      return
    }
    const desktop = window.matchMedia('(min-width: 768px)')
    let raf = 0
    const onScroll = () => {
      // A phone gets the plain hero, so there is nothing to re-render for.
      if (!desktop.matches) return
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
  const textProg = clamp((p - 0.44) / 0.28, 0, 1) // headline in 0.44 → 0.72
  const vars = {
    '--hero-scale': lerp(1.14, 0.94, zoom),
    '--hero-app-o': 1 - clamp((p - 0.32) / 0.18, 0, 1), // app fades 0.32 → 0.50
    '--hero-text-o': textProg,
    '--hero-text-y': `${lerp(28, 0, textProg)}px`,
    '--hero-hint-o': 1 - clamp(p / 0.08, 0, 1),
  } as CSSProperties

  // Reduced motion skips the choreography at every width: the plain hero.
  const animate = !reduced

  return (
    <div
      ref={ref}
      style={animate ? vars : undefined}
      className={cn('relative', animate ? 'md:h-[175vh]' : 'mx-auto max-w-2xl md:max-w-5xl')}
    >
      <div className={cn(animate && 'md:sticky md:top-0 md:h-screen md:overflow-hidden md:bg-surface')}>
        {/* Blueprint paper behind the whole choreography */}
        {animate && <BlueprintGrid className="hidden md:block" />}

        {/* The words: eyebrow, h1, the definition, the two buttons. */}
        <section
          className={cn(
            'relative z-10 px-4 pt-12 pb-10 text-center',
            animate && [
              'md:absolute md:inset-0 md:flex md:flex-col md:items-center md:justify-center md:py-0',
              'md:[opacity:var(--hero-text-o)] md:[transform:translateY(var(--hero-text-y))]',
              textProg <= 0.5 && 'md:pointer-events-none',
            ],
          )}
        >
          <div className={cn('mb-4', animate && 'md:mb-6')}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-fg">
              <Sparkles className="h-3.5 w-3.5 text-accent-fg" /> AI-powered jobsite management
            </span>
          </div>
          <h1
            className={cn(
              'text-[2.1rem] font-extrabold tracking-tight text-ink leading-[1.08]',
              animate && 'md:text-5xl md:max-w-4xl md:leading-[1.02] lg:text-[4.4rem]',
            )}
          >
            {HEADLINE}
          </h1>
          <p className={cn('mt-4 text-base text-muted-fg leading-relaxed', animate && 'md:mt-6 md:text-lg md:max-w-2xl')}>
            {SYTENAV_DEFINITION}
          </p>
          <div className={cn('mt-7 flex flex-col gap-2.5', animate && 'md:mt-8 md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-3')}>
            <Link href={appHref('/signup')} className={cn('inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3.5 hover:bg-accent/90 transition-colors', animate && 'md:py-3')}>
              Request access <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/features" className={cn('inline-flex items-center justify-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3.5 hover:bg-panel transition-colors', animate && 'md:py-3')}>
              See everything it does
            </Link>
          </div>
          {animate && SHOW_TRACTION_STATS && (
            <p className="hidden md:block mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              140+ contractors · $42M tracked · 1,800+ jobs
            </p>
          )}
        </section>

        {/* The Projects screen. On a phone it sits under the buttons in a
            browser frame; on a desktop it fills the viewport and settles into a
            monitor. Wide enough to feel screen-filling on large displays; the
            mock overfills the screen and clips, so the monitor never shows
            empty glass. */}
        <div
          className={cn(
            'px-4 pb-14',
            animate && 'md:absolute md:inset-0 md:flex md:items-center md:justify-center md:p-0 md:[opacity:var(--hero-app-o)]',
          )}
        >
          <div className={cn(animate && 'md:w-full md:will-change-transform md:[transform:scale(var(--hero-scale))]')}>
            <div className={cn(animate && 'md:mx-auto md:w-[1500px] md:max-w-[90vw]')}>
              <div
                className={cn(
                  'rounded-xl border border-line bg-panel shadow-2xl overflow-hidden',
                  animate && 'md:rounded-2xl md:border-[10px] md:border-[#202126] md:bg-[#202126] md:shadow-black/30',
                )}
              >
                {/* Browser chrome on a phone; the monitor bezel replaces it on a desktop */}
                <div aria-hidden="true" className={cn('flex items-center gap-2 px-3 py-2 border-b border-line-soft bg-surface', animate && 'md:hidden')}>
                  <span className="h-3 w-3 rounded-full bg-danger-solid/70" />
                  <span className="h-3 w-3 rounded-full bg-warn/70" />
                  <span className="h-3 w-3 rounded-full bg-success-solid/70" />
                  {/* The address is drawn by CSS, so it is not a word in the page. */}
                  <div className="ml-3 flex-1 max-w-md mx-auto rounded-md bg-panel border border-line px-3 py-1 text-[11px] text-faint text-center truncate before:content-['app.sytenav.com/projects']" />
                </div>
                {/* Capped so the mock always overfills the glass, even on tall displays */}
                <div className={cn('h-[380px] overflow-hidden bg-surface', animate && 'md:h-[76vh] md:max-h-[940px] md:rounded-lg')}>
                  <ProjectsMock priority />
                </div>
              </div>
              {animate && (
                <>
                  <div className="hidden md:block mx-auto h-5 w-28 bg-[#202126]/85" />
                  <div className="hidden md:block mx-auto h-2 w-56 rounded-full bg-[#202126]/50" />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        {animate && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center text-faint [opacity:var(--hero-hint-o)]"
            aria-hidden
          >
            {/* CSS-drawn for the same reason: "Scroll" was an orphan word in the text. */}
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] mb-1 before:content-['Scroll']" />
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </div>
        )}
      </div>
    </div>
  )
}
