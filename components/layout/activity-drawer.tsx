'use client'

import { useEffect, useState } from 'react'
import { X, History, Package, Users, Award, RotateCcw, Bell, FileText, Upload, ChevronRight, CheckSquare, MessageSquare, Pencil, Trash2, ClipboardCheck, CalendarCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { timeAgo, absoluteTime } from '@/lib/time-ago'

import { formatDate } from '@/lib/dates'
interface ActivityItem {
  id: string
  actor_name: string
  type: string
  message: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  package_created: { icon: Package,    color: 'text-info',   bg: 'bg-info-tint' },
  subs_invited:    { icon: Users,      color: 'text-special', bg: 'bg-special-tint' },
  bid_submitted:   { icon: ChevronRight, color: 'text-accent-fg', bg: 'bg-accent-tint' },
  bid_updated:     { icon: ChevronRight, color: 'text-accent-fg', bg: 'bg-accent-tint' },
  bid_revised:     { icon: RotateCcw,  color: 'text-warn',  bg: 'bg-warn-tint' },
  revision_requested: { icon: RotateCcw, color: 'text-warn', bg: 'bg-warn-tint' },
  bid_awarded:     { icon: Award,      color: 'text-success',  bg: 'bg-success-tint' },
  reminder_sent:   { icon: Bell,       color: 'text-muted-fg',  bg: 'bg-muted' },
  plan_uploaded:   { icon: Upload,     color: 'text-teal-600',   bg: 'bg-teal-50' },
  task_created:    { icon: CheckSquare, color: 'text-info',   bg: 'bg-info-tint' },
  task_updated:    { icon: Pencil,     color: 'text-accent-fg', bg: 'bg-accent-tint' },
  task_note:       { icon: MessageSquare, color: 'text-special', bg: 'bg-special-tint' },
  task_deleted:    { icon: Trash2,     color: 'text-danger',    bg: 'bg-danger-tint' },
  // Inspections logged two events and had no entries here, so both of them fell
  // through to the generic file icon. They now log eight, and an audit trail
  // where every row looks identical is one nobody scans.
  inspection_created:      { icon: ClipboardCheck, color: 'text-info',      bg: 'bg-info-tint' },
  inspection_updated:      { icon: Pencil,         color: 'text-accent-fg', bg: 'bg-accent-tint' },
  inspection_scheduled:    { icon: CalendarCheck,  color: 'text-info',      bg: 'bg-info-tint' },
  inspection_ready:        { icon: ClipboardCheck, color: 'text-warn',      bg: 'bg-warn-tint' },
  inspection_passed:       { icon: CheckSquare,    color: 'text-success',   bg: 'bg-success-tint' },
  inspection_failed:       { icon: X,              color: 'text-danger',    bg: 'bg-danger-tint' },
  inspection_reinspection: { icon: RotateCcw,      color: 'text-warn',      bg: 'bg-warn-tint' },
  inspection_voided:       { icon: Trash2,         color: 'text-danger',    bg: 'bg-danger-tint' },
  inspection_restored:     { icon: RotateCcw,      color: 'text-success',   bg: 'bg-success-tint' },
}

function groupByDate(items: ActivityItem[]) {
  const groups: Record<string, ActivityItem[]> = {}
  for (const item of items) {
    const d = new Date(item.created_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let label: string
    if (d.toDateString() === today.toDateString()) label = 'Today'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
    else label = formatDate(d, { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })

    if (!groups[label]) groups[label] = []
    groups[label].push(item)
  }
  return groups
}

interface ActivityDrawerProps {
  projectId: string
  open: boolean
  onClose: () => void
}

export function ActivityDrawer({ projectId, open, onClose }: ActivityDrawerProps) {
  const supabase = createClient()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    async function load() {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await fetch(`/api/projects/${projectId}/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data.activity)
      }
      setLoading(false)
    }
    load()
  }, [open, projectId])

  const groups = groupByDate(items)

  return (
    <>
      {/* ONE DEFINITION OF A SIDE DRAWER, not a second hand-rolled one.
          This was `fixed top-0 right-0 h-full`, mounted always and slid out of
          frame when closed - and `h-full` is 100% of the LAYOUT viewport, which
          does not shrink for a keyboard and knows nothing about the notch. So
          its header sat under the Dynamic Island and, with a keyboard up, its
          footer sat behind one. `.overlay-drawer` is measured against the
          VISIBLE strip, the same as every other overlay in the app.
          Mounted only while open now, which is also what lets the scroll lock
          (`html:has([data-overlay])`) mean what it says. */}
      {open && (
        <div className="overlay-drawer bg-black/20 backdrop-blur-[1px]" data-overlay onClick={onClose}>
        <div
          onClick={e => e.stopPropagation()}
          className="flex flex-col overflow-hidden bg-panel shadow-2xl border-l border-line"
        >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-line-soft">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-muted-fg" />
            <h2 className="text-base font-semibold text-ink">Job History</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close" title="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:bg-muted hover:text-muted-fg transition-colors lg:h-auto lg:w-auto lg:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="py-12 text-center text-sm text-faint">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <History className="h-10 w-10 text-faint mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-fg">No activity yet</p>
              <p className="text-xs text-faint mt-1">Every action on this project will appear here.</p>
            </div>
          ) : (
            <div className="pb-6">
              {Object.entries(groups).map(([label, groupItems]) => (
                <div key={label}>
                  <div className="px-5 py-2.5 sticky top-0 bg-surface border-b border-line-soft z-10">
                    <span className="text-xs font-semibold text-faint uppercase tracking-wider">{label}</span>
                  </div>
                  <div className="divide-y divide-line-soft">
                    {groupItems.map(item => {
                      const config = TYPE_CONFIG[item.type] ?? { icon: FileText, color: 'text-muted-fg', bg: 'bg-muted' }
                      const Icon = config.icon
                      return (
                        <div key={item.id} className="flex gap-3.5 px-5 py-3.5 hover:bg-surface transition-colors">
                          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5', config.bg)}>
                            <Icon className={cn('h-3.5 w-3.5', config.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ink-soft leading-snug">{item.message}</p>
                            {item.type === 'revision_requested' && item.metadata?.revision_note != null && (
                              <p className="text-xs text-muted-fg mt-1 italic line-clamp-2">"{String(item.metadata.revision_note)}"</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-medium text-muted-fg">{item.actor_name}</span>
                              <span className="text-faint">·</span>
                              <span className="text-xs text-faint" title={absoluteTime(item.created_at)}>{timeAgo(item.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        </div>
      )}
    </>
  )
}
