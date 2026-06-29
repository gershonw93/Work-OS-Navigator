import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  delta?: string
  deltaPositive?: boolean
  icon?: LucideIcon
  iconColor?: string
  className?: string
}

export function StatCard({
  label,
  value,
  delta,
  deltaPositive,
  icon: Icon,
  iconColor = 'text-accent-fg',
  className,
}: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-line bg-panel p-6', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-fg font-medium">{label}</p>
          <p className="text-3xl font-bold text-ink">{value}</p>
          {delta && (
            <p
              className={cn(
                'text-xs font-medium',
                deltaPositive ? 'text-success' : 'text-danger'
              )}
            >
              {deltaPositive ? '↑' : '↓'} {delta}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-lg bg-surface p-2.5', iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  )
}
