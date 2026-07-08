'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Menu, X, ChevronDown, Building2, HardHat, Scale } from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/homepage/features', label: 'Features' },
  { href: '/homepage/workflow', label: 'How it works' },
  { href: '/homepage/ai', label: 'AI' },
  { href: '/homepage/mobile', label: 'On the go' },
  { href: '/homepage/pricing', label: 'Pricing' },
]

const AUDIENCE = [
  { href: '/homepage/contractors', label: 'General contractors', desc: 'Run every job, sub, and dollar', icon: Building2 },
  { href: '/homepage/subcontractors', label: 'Subcontractors', desc: 'Quote to paid, without the office work', icon: HardHat },
  { href: '/homepage/why', label: 'Why SyteNav', desc: 'What it replaces and why', icon: Scale },
]

export function MarketingNav() {
  const [open, setOpen] = useState(false)
  const [drop, setDrop] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Close menus on navigation.
  useEffect(() => {
    setOpen(false)
    setDrop(false)
  }, [pathname])

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!drop) return
    const onClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDrop(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrop(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [drop])

  const linkCls = (href: string) =>
    cn(
      'text-sm font-medium transition-colors',
      pathname === href ? 'text-ink' : 'text-muted-fg hover:text-ink'
    )

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/homepage" aria-label="SyteNav home"><SyteNavLogo size={26} /></Link>

        {/* Desktop */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Main">
          <Link href="/homepage/features" className={linkCls('/homepage/features')}>Features</Link>
          <Link href="/homepage/workflow" className={linkCls('/homepage/workflow')}>How it works</Link>
          <Link href="/homepage/ai" className={linkCls('/homepage/ai')}>AI</Link>
          <Link href="/homepage/mobile" className={linkCls('/homepage/mobile')}>On the go</Link>

          {/* Audience dropdown */}
          <div className="relative" ref={dropRef} onMouseEnter={() => setDrop(true)} onMouseLeave={() => setDrop(false)}>
            <button
              onClick={() => setDrop(v => !v)}
              aria-expanded={drop}
              aria-haspopup="true"
              className={cn(
                'inline-flex items-center gap-1 text-sm font-medium transition-colors py-5',
                AUDIENCE.some(a => a.href === pathname) ? 'text-ink' : 'text-muted-fg hover:text-ink'
              )}
            >
              Who it&apos;s for <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', drop && 'rotate-180')} />
            </button>
            {drop && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-80 rounded-2xl border border-line bg-panel shadow-2xl p-2">
                {AUDIENCE.map(a => (
                  <Link key={a.href} href={a.href} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-muted transition-colors">
                    <span className="h-9 w-9 rounded-lg bg-accent-tint flex items-center justify-center shrink-0 mt-0.5">
                      <a.icon className="h-[18px] w-[18px] text-accent-fg" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{a.label}</span>
                      <span className="block text-xs text-muted-fg mt-0.5">{a.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href="/homepage/pricing" className={linkCls('/homepage/pricing')}>Pricing</Link>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium text-ink-soft hover:text-ink">Log in</Link>
          <Link href="/signup" className="rounded-lg bg-accent text-accent-ink text-sm font-semibold px-4 py-2 hover:bg-accent/90 transition-colors">
            Start free
          </Link>
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden flex items-center gap-1">
          <ThemeToggle />
          <button
            className="text-ink p-1.5"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-line bg-panel px-4 py-4 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-[15px] font-medium text-ink-soft py-2.5">
              {l.label}
            </Link>
          ))}
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint pt-3 pb-1">Who it&apos;s for</p>
          {AUDIENCE.map(a => (
            <Link key={a.href} href={a.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 text-[15px] font-medium text-ink-soft py-2.5">
              <a.icon className="h-4 w-4 text-accent-fg" /> {a.label}
            </Link>
          ))}
          <div className="flex items-center gap-2 pt-4 pb-1">
            <Link href="/login" onClick={() => setOpen(false)} className="flex-1 text-center rounded-lg border border-line text-sm font-medium py-2.5 text-ink-soft">
              Log in
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)} className="flex-1 text-center rounded-lg bg-accent text-accent-ink text-sm font-semibold py-2.5">
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
