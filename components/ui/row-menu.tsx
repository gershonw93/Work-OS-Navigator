'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { hintPosition } from '@/lib/hint-position'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// One action reads as THE action; the rest are here when you go looking.
//
// WHY THIS IS A COMPONENT AND NOT A THIRD COPY. A sent invoice carried seven
// controls in a row - View, Copy link, Email, By hand, Mark paid, a QuickBooks
// chip and Void - all the same size and weight, with the one you want and the
// one you never want sitting next to each other. An invited sub carried four,
// two of which were copy buttons and one of which opened a panel containing
// another button with the same word on it. Same disease, same cure, and the
// second screen to need it is where a pattern becomes a component.
//
// AT MODULE SCOPE, ALWAYS. Declared inside a list component, every render makes
// a new component type and React remounts the open menu shut.
//
// NOT AN OVERLAY. It is `absolute` inside a `relative` parent, so it travels
// with the page rather than being pinned to a measured position - which is why
// it needs no `data-overlay` and must not freeze the app behind it. A menu you
// cannot scroll away from is a dialog wearing a menu's clothes.
//
// ...BUT IT STILL HAS TO KNOW WHERE THE SCREEN ENDS. Reported as "I can't
// scroll down to see the whole card": the panel was `z-20`, always `mt-1` below
// the trigger, with no flip and no idea how much room was left. The phone tab
// bar is `fixed bottom-0 z-30`, so a menu opened near the bottom painted UNDER
// it and its last items - Void, in the case reported - could not be reached at
// all. Scrolling does not help, because the bar is pinned to the viewport.
//
// So: flip above the trigger when there is no room below, and stop counting the
// strip the bottom nav is sitting on as room. `z-40` clears that bar and the
// desktop sidebar (both `z-30`) and stays under the phone drawer (`z-50`).
// ─────────────────────────────────────────────────────────────────────────────

/** The visible strip, minus any fixed bottom nav parked on top of it. */
function usableHeight(): number {
  if (typeof window === 'undefined') return 0
  const h = window.innerHeight
  const nav = document.querySelector('[data-bottom-nav]')
  if (!nav) return h
  const r = nav.getBoundingClientRect()
  // Only when it is actually parked at the bottom of THIS viewport.
  return r.height > 0 && r.bottom >= h - 1 ? Math.max(0, r.top) : h
}

export function RowMenu({
  label,
  align = 'right',
  children,
}: {
  /** What the trigger is for, since it is an icon. */
  label: string
  /** Which edge the panel hangs from. */
  align?: 'left' | 'right'
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Measured before paint, or the menu is drawn in the wrong place and jumps.
  useLayoutEffect(() => {
    if (!open) return
    const t = triggerRef.current?.getBoundingClientRect()
    const p = panelRef.current?.getBoundingClientRect()
    if (!t || !p) return
    // `hintPosition` already decides fits-below / fits-above, and it was
    // written for the tooltip that had this exact fault. Only its verdict is
    // used: this panel is `absolute` and anchored to an edge, so it works out
    // its own horizontal place.
    const { above: flip } = hintPosition(
      { left: t.left, top: t.top, right: t.right, bottom: t.bottom },
      { width: p.width, height: p.height },
      { width: window.innerWidth, height: usableHeight() },
    )
    setAbove(flip)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        // 44px on a phone like every other control; the desktop keeps the
        // compact chip it had.
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line text-muted-fg hover:bg-surface lg:h-auto lg:w-auto lg:px-2 lg:py-1"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          className={cn(
            'absolute z-40 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-lg lg:rounded-lg',
            above ? 'bottom-full mb-1' : 'top-full mt-1',
            // A fixed `w-52` hanging off the right edge ran off the LEFT of a
            // narrow row. It takes the space it needs and no more than the
            // screen, and the viewport gutter is the floor.
            'max-w-[calc(100vw-2rem)] min-w-[13rem]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  onClick, href, newTab, danger, children,
}: {
  onClick?: () => void
  href?: string
  newTab?: boolean
  danger?: boolean
  children: ReactNode
}) {
  // `min-h-11` rather than padding alone: a menu row is a touch target and 30px
  // of `py-2 text-xs` is not one. It shrinks at lg, where a mouse is doing the
  // aiming.
  const cls = cn(
    'flex w-full min-h-11 items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-surface lg:min-h-0 lg:text-xs',
    danger ? 'text-danger' : 'text-muted-fg',
  )
  return href
    ? (
      <a role="menuitem" href={href} onClick={onClick} className={cls}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    )
    : <button role="menuitem" type="button" onClick={onClick} className={cls}>{children}</button>
}
