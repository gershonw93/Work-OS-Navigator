import { cn } from '@/lib/utils'

/**
 * SyteNav "Field" mark - a locator arrow ("you are here on the site")
 * knocked out of a rounded tile.
 */
export function SyteNavMark({
  size = 32,
  className,
  tile = true,
}: {
  size?: number
  className?: string
  tile?: boolean
}) {
  if (!tile) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
        <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="rgb(var(--accent))" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="rgb(var(--ink))" />
      <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="rgb(var(--accent))" />
    </svg>
  )
}

/** Full lockup: mark + SYTENAV wordmark (Saira Condensed). */
export function SyteNavLogo({
  size = 28,
  className,
  wordmark = true,
}: {
  size?: number
  className?: string
  wordmark?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <SyteNavMark size={size} />
      {wordmark && (
        <span className="font-display font-bold uppercase tracking-tight leading-none text-ink" style={{ fontSize: size * 0.82 }}>
          SYTE<span className="text-accent-fg">NAV</span>
        </span>
      )}
    </div>
  )
}
