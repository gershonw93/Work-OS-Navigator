'use client'

import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A hover explainer that waits before it appears.
 *
 * No delay makes a page feel twitchy - panels flash open as the pointer crosses
 * the screen on its way somewhere else. The delay is on the way IN only; going
 * out is immediate, because a tooltip that lingers over what you are trying to
 * click is worse than one that never opened.
 */
export function InfoHint({
  text,
  align = 'left',
  className,
  children,
}: {
  text: string
  align?: 'left' | 'right'
  className?: string
  /** Optional trigger. Defaults to a small question mark. */
  children?: React.ReactNode
}) {
  return (
    <span className={cn('group/hint relative inline-flex items-center', className)}>
      <span tabIndex={0} className="inline-flex items-center outline-none cursor-help">
        {children ?? <HelpCircle className="h-3 w-3 text-faint hover:text-muted-fg" />}
      </span>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute top-full z-40 mt-1.5 w-64 rounded-lg border border-line bg-panel p-3',
          'text-xs font-normal normal-case tracking-normal leading-relaxed text-muted-fg whitespace-pre-line text-left shadow-xl',
          'opacity-0 invisible translate-y-0.5',
          'transition-[opacity,visibility,transform] duration-200 delay-0',
          'group-hover/hint:opacity-100 group-hover/hint:visible group-hover/hint:translate-y-0 group-hover/hint:delay-[1500ms]',
          'group-focus-within/hint:opacity-100 group-focus-within/hint:visible group-focus-within/hint:translate-y-0',
          align === 'right' ? 'right-0' : 'left-0',
        )}
      >
        {text}
      </span>
    </span>
  )
}
