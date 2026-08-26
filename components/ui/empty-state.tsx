import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Button, buttonClasses } from './button'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /**
   * Give it an onClick OR an href. Both are honoured; neither is not.
   *
   * `href` was declared here and never rendered - only onClick was wired - so
   * a caller who reached for it got a button that looked fine, typechecked,
   * and did nothing. That is exactly how the New Project button on the empty
   * projects list ended up dead, which is the worst place for one: it is the
   * only thing to click on the first screen a new user ever sees.
   */
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-4">
          <Icon className="h-8 w-8 text-faint" />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-fg max-w-sm mb-6">{description}</p>}
      {action && (
        action.href ? (
          <Link href={action.href} className={buttonClasses('default', 'sm')}>
            {action.label}
          </Link>
        ) : (
          <Button onClick={action.onClick} variant="default" size="sm">
            {action.label}
          </Button>
        )
      )}
    </div>
  )
}
