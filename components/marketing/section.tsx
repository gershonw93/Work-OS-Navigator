import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared typographic primitives so every marketing page speaks the same
// visual language: mono eyebrows, big tight headlines, roomy leads.

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('font-mono text-[11px] sm:text-xs uppercase tracking-[0.22em] text-accent-fg', className)}>
      {children}
    </p>
  )
}

export function SectionTitle({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <Tag className={cn('mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]', className)}>
      {children}
    </Tag>
  )
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-5 text-base sm:text-lg text-muted-fg leading-relaxed', className)}>{children}</p>
}

export function SectionHead({
  eyebrow,
  title,
  lead,
  center = false,
  className,
}: {
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  center?: boolean
  className?: string
}) {
  return (
    <div className={cn(center ? 'text-center mx-auto max-w-3xl' : 'max-w-3xl', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <SectionTitle>{title}</SectionTitle>
      {lead && <Lead>{lead}</Lead>}
    </div>
  )
}
