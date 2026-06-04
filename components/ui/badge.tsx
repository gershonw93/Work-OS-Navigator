import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-orange-100 text-orange-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  muted: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-100 text-blue-800',
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

// Helper to map domain statuses to badge variants
export function getStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    // Project statuses
    active: 'success',
    planning: 'info',
    on_hold: 'warning',
    completed: 'muted',
    cancelled: 'danger',
    // Bid statuses
    open: 'success',
    draft: 'muted',
    closed: 'muted',
    awarded: 'success',
    submitted: 'info',
    pending: 'warning',
    rejected: 'danger',
    // Invoice statuses
    approved: 'success',
    paid: 'success',
    // Permit / inspection
    issued: 'success',
    passed: 'success',
    failed: 'danger',
    requested: 'info',
    scheduled: 'info',
    expired: 'danger',
    not_started: 'muted',
    // Compliance
    missing: 'danger',
    // Subcontract
    terminated: 'danger',
    // RFI
    answered: 'success',
    // Task
    in_progress: 'info',
    complete: 'success',
    not_started_task: 'muted',
    // Insurance
    'active-insurance': 'success',
    'expired-insurance': 'danger',
  }
  return map[status] ?? 'muted'
}
