'use client'

import { useEffect, useState } from 'react'

// Sticky in-page navigation for long pages (Features). Highlights the section
// currently in view via IntersectionObserver.
export function SideNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id)

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        // Pick the topmost visible section.
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b))
          setActive(top.target.id)
        }
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
    )
    for (const { id } of items) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
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
