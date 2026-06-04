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
  iconColor = 'text-orange-500',
  className,
}: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white p-6', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
          {delta && (
            <p
              className={cn(
                'text-xs font-medium',
                deltaPositive ? 'text-green-600' : 'text-red-500'
              )}
            >
              {deltaPositive ? '↑' : '↓'} {delta}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-lg bg-slate-50 p-2.5', iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  )
}
