'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hintPosition, HINT_PAD } from '@/lib/hint-position'

/**
 * A "?" explainer that waits before it appears, and stays on the screen.
 *
 * No delay makes a page feel twitchy - panels flash open as the pointer crosses
 * the screen on its way somewhere else. The delay is on the way IN only; going
 * out is immediate, because a tooltip that lingers over what you are trying to
 * click is worse than one that never opened. A tap (or keyboard focus) opens it
 * at once - there is no pointer to be crossing anything.
 *
 * THE BOX FLOATS. It used to be an absolutely positioned child of the trigger,
 * hidden with `visibility`. Hidden is not gone: it still had a width, so inside
 * a scrolling sheet it widened the body and a thumb dragged the sheet sideways;
 * and anchored to a trigger near the edge it opened mostly off the phone. Now
 * it is a portal at a fixed position worked out by `hintPosition` (pure, and
 * tested at the sizes that broke), and it closes when the page scrolls, so its
 * measured coordinates can never go stale.
 */
export function InfoHint({
  text,
  className,
  children,
}: {
  text: string
  /** Accepted for old call sites; placement is now worked out from the screen. */
  align?: 'left' | 'right'
  className?: string
  /** Optional trigger. Defaults to a small question mark. */
  children?: React.ReactNode
}) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null } }
  const show = () => { clear(); setOpen(true) }
  const hide = () => { clear(); setOpen(false) }

  // Measure once it exists, then keep it on screen. useLayoutEffect so the
  // first paint is already in the right place rather than a frame at 0,0.
  useLayoutEffect(() => {
    if (!open) return
    const t = triggerRef.current, tip = tipRef.current
    if (!t || !tip) return
    const r = t.getBoundingClientRect()
    const b = tip.getBoundingClientRect()
    setPos(hintPosition(r, { width: b.width, height: b.height }, { width: window.innerWidth, height: window.innerHeight }))
  }, [open, text])

  // The coordinates were measured when it opened. Rather than chase the page,
  // close - a hint is a glance, not a panel.
  useEffect(() => {
    if (!open) return
    const off = () => setOpen(false)
    window.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [open])

  useEffect(() => clear, [])

  return (
    <span className={cn('inline-flex items-center', className)}>
      <span
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-label="More about this"
        className="inline-flex items-center outline-none cursor-help"
        onMouseEnter={() => { clear(); timer.current = window.setTimeout(() => setOpen(true), 1500) }}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={e => { e.stopPropagation(); open ? hide() : show() }}
      >
        {children ?? <HelpCircle className="h-3 w-3 text-faint hover:text-muted-fg" />}
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <span
          ref={tipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos?.left ?? HINT_PAD,
            top: pos?.top ?? HINT_PAD,
            maxWidth: `calc(100vw - ${HINT_PAD * 2}px)`,
            visibility: pos ? 'visible' : 'hidden',
            zIndex: 9999,
          }}
          className="pointer-events-none block w-64 rounded-lg border border-line bg-panel p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-muted-fg shadow-xl whitespace-pre-line"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
