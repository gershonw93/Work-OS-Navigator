import { cn } from '@/lib/utils'

// A quiet blueprint-paper grid behind hero content. Decorative only; the
// parent section must be `relative` and content should sit above it.
export function BlueprintGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 bp-grid',
        '[mask-image:radial-gradient(ellipse_75%_80%_at_50%_30%,black_25%,transparent_100%)]',
        className
      )}
    />
  )
}
