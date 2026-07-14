'use client'

import { useEffect, useState } from 'react'

// Sticky in-page navigation for long pages (Features, How it works).
// Highlights the section you're reading: the last section whose top has
// scrolled past the header line. Scroll-position based rather than an
// IntersectionObserver, because with very tall sections the observer only
// reports edge crossings, so the highlight drifted one section ahead while
// you were still reading the previous one.
export function SideNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id)

  useEffect(() => {
    const HEADER_OFFSET = 140 // sticky header height plus breathing room

    function update() {
      let current = items[0]?.id
      for (const { id } of items) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= HEADER_OFFSET) current = id
        else break
      }
      // At the very bottom of the page the last section wins even if its top
      // never reaches the header line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = items[items.length - 1]?.id ?? current
      }
      setActive(current)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [items])

  return (
    <nav aria-label="On this page" className="hidden lg:block sticky top-28 self-start w-52 shrink-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-4">On this page</p>
      <ul className="space-y-1 border-l border-line">
        {items.map(item => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? 'true' : undefined}
              className={[
                'block -ml-px border-l-2 pl-4 py-1.5 text-sm transition-colors',
                active === item.id
                  ? 'border-accent text-ink font-semibold'
                  : 'border-transparent text-muted-fg hover:text-ink',
              ].join(' ')}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
