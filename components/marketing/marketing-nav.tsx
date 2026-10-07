'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Menu, X, ChevronDown, Building2, HardHat, Scale, LayoutGrid, Wallet, Workflow, GitBranch,
  Sparkles, Smartphone, BookOpen, LifeBuoy, type LucideIcon,
} from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { appHref } from '@/lib/hosts'
import { helpHref } from '@/lib/help-host'

// THE TOP BAR IS THREE MENUS AND ONE LINK. It was nine links and a dropdown,
// and the Help Center would have been the tenth - "menu is getting too big".
// Every page is still one hover away, and the phone menu reads the SAME groups,
// so a page added to a group reaches both without a second list to forget.
interface NavItem { href: string; label: string; desc: string; icon: LucideIcon }
interface NavGroup { key: string; label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    key: 'product', label: 'Product', items: [
      { href: '/features', label: 'Features', desc: 'Everything in one place', icon: LayoutGrid },
      { href: '/money', label: 'The money side', desc: 'Budgets, invoices, payments', icon: Wallet },
      { href: '/workflow', label: 'How it works', desc: 'From first quote to final payment', icon: Workflow },
      { href: '/flows', label: 'Flows', desc: 'How work moves between people', icon: GitBranch },
      { href: '/ai', label: 'AI', desc: 'Scan quotes, bills and documents', icon: Sparkles },
      { href: '/mobile', label: 'On the go', desc: 'Run the job from your phone', icon: Smartphone },
    ],
  },
  {
    key: 'audience', label: "Who it's for", items: [
      { href: '/contractors', label: 'General contractors', desc: 'Run every job, sub, and dollar', icon: Building2 },
      { href: '/subcontractors', label: 'Subcontractors', desc: 'Quote to paid, without the office work', icon: HardHat },
      { href: '/why', label: 'Why SyteNav', desc: 'What it replaces and why', icon: Scale },
    ],
  },
  {
    key: 'resources', label: 'Resources', items: [
      { href: '/guides', label: 'Guides', desc: 'Practical guides for contractors', icon: BookOpen },
      // Through helpHref: absolute help.sytenav.com once the subdomain is live.
      { href: helpHref('/'), label: 'Help Center', desc: 'How to use SyteNav, and quick answers', icon: LifeBuoy },
    ],
  },
]

// Hoisted, never declared inside MarketingNav - a component made inside a
// component is a new type every render (CLAUDE.md, layout section).
function NavDropdown({ group, open, active, onOpen, onClose }: {
  group: NavGroup
  open: boolean
  active: boolean
  onOpen: () => void
  onClose: () => void
}) {
  return (
    // HOVER OPENS, SO A CLICK MUST NOT TOGGLE: mouseenter opens it and the
    // click that follows would shut it again. Click OPENS (for touch and the
    // keyboard); closing is a pick, Escape, a click outside, or moving off.
    <div className="relative" data-nav-dropdown onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        onClick={onOpen}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium transition-colors py-5',
          active || open ? 'text-ink' : 'text-muted-fg hover:text-ink'
        )}
      >
        {group.label} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-80 rounded-2xl border border-line bg-panel shadow-2xl p-2">
          {group.items.map(a => (
            <Link key={a.href} href={a.href} onClick={onClose} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-muted transition-colors">
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
  )
}

export function MarketingNav() {
  const [open, setOpen] = useState(false)
  // Which dropdown is open, by group key. One at a time.
  const [drop, setDrop] = useState<string | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Close menus on navigation.
  useEffect(() => {
    setOpen(false)
    setDrop(null)
  }, [pathname])

  // Escape closes the mobile menu. The dropdown below has always had this and
  // the menu never did, which on a keyboard leaves the one panel that covers
  // the whole page as the only thing you cannot dismiss without finding its
  // button again.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!drop) return
    const onClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDrop(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrop(null)
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
        <Link href="/" aria-label="SyteNav home"><SyteNavLogo size={26} /></Link>

        {/* Desktop */}
        <nav ref={dropRef} className="hidden md:flex items-center gap-7" aria-label="Main">
          {GROUPS.map(g => (
            <NavDropdown
              key={g.key}
              group={g}
              open={drop === g.key}
              active={g.items.some(i => i.href === pathname)}
              onOpen={() => setDrop(g.key)}
              onClose={() => setDrop(d => (d === g.key ? null : d))}
            />
          ))}
          <Link href="/pricing" className={linkCls('/pricing')}>Pricing</Link>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href={appHref('/login')} className="text-sm font-medium text-ink-soft hover:text-ink">Log in</Link>
          <Link href={appHref('/signup')} className="rounded-lg bg-accent text-accent-ink text-sm font-semibold px-4 py-2 hover:bg-accent/90 transition-colors">
            Request access
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

      {/* Mobile menu.
          `data-overlay` IS THE SCROLL LOCK. Reported against this menu: it
          opens over the page and the page behind it still scrolls. Nothing
          here is a dialog, so the `.overlay` scan in layout-overflow.ts could
          not see it - but `html:has([data-overlay]) { overflow-y: hidden }` in
          globals.css does not care what a panel is called, only that it says
          it is one. The app's own phone nav has carried it since #388
          (sidebar.tsx, `overlay-full ... data-overlay`); the marketing nav was
          simply never given it.

          AND THE CAP IS NOT `vh`. It was `max-h-[calc(100vh-4rem)]`, and vh
          knows nothing about the browser chrome that collapses as you scroll,
          so the menu was taller than the screen on a phone. `--vv-h` is the
          right answer but it is only mounted by NativeShell, which wraps the
          dashboard and field shells and not this one, so the fallback is what
          actually applies here - `dvh`, which at least tracks the chrome. The
          var stays in front so this needs no edit if marketing ever gets it. */}
      {open && (
        <div
          data-overlay
          className="md:hidden border-t border-line bg-panel px-4 py-4 space-y-1 max-h-[calc(var(--vv-h,100dvh)-4rem)] overflow-y-auto"
        >
          {GROUPS.map(g => (
            <div key={g.key}>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint pt-3 pb-1">{g.label}</p>
              {g.items.map(a => (
                <Link key={a.href} href={a.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 text-[15px] font-medium text-ink-soft py-2.5">
                  <a.icon className="h-4 w-4 text-accent-fg" /> {a.label}
                </Link>
              ))}
            </div>
          ))}
          <Link href="/pricing" onClick={() => setOpen(false)} className="block text-[15px] font-medium text-ink-soft pt-4 pb-2.5">
            Pricing
          </Link>
          <div className="flex items-center gap-2 pt-4 pb-1">
            <Link href={appHref('/login')} onClick={() => setOpen(false)} className="flex-1 text-center rounded-lg border border-line text-sm font-medium py-2.5 text-ink-soft">
              Log in
            </Link>
            <Link href={appHref('/signup')} onClick={() => setOpen(false)} className="flex-1 text-center rounded-lg bg-accent text-accent-ink text-sm font-semibold py-2.5">
              Request access
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
