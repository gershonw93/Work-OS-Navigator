'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const LINKS = [
  { href: '/homepage/features', label: 'Features' },
  { href: '/homepage/about', label: 'About' },
  { href: '/homepage/contact', label: 'Contact' },
]

export function MarketingNav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/homepage"><SyteNavLogo size={26} /></Link>
        <nav className="hidden md:flex items-center gap-7">
          {LINKS.map(l => <Link key={l.href} href={l.href} className="text-sm font-medium text-muted-fg hover:text-ink">{l.label}</Link>)}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium text-ink-soft hover:text-ink">Log in</Link>
          <Link href="/signup" className="rounded-lg bg-accent text-accent-ink text-sm font-semibold px-4 py-2 hover:bg-accent/90">Start free</Link>
        </div>
        <button className="md:hidden text-ink" onClick={() => setOpen(v => !v)}>{open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
      </div>
      {open && (
        <div className="md:hidden border-t border-line bg-panel px-4 py-3 space-y-2">
          {LINKS.map(l => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-sm font-medium text-ink-soft py-1.5">{l.label}</Link>)}
          <div className="flex items-center gap-2 pt-2">
            <Link href="/login" className="flex-1 text-center rounded-lg border border-line text-sm font-medium py-2">Log in</Link>
            <Link href="/signup" className="flex-1 text-center rounded-lg bg-accent text-accent-ink text-sm font-semibold py-2">Start free</Link>
          </div>
        </div>
      )}
    </header>
  )
}
