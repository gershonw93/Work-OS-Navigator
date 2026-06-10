'use client'

import { useEffect, useState } from 'react'
import { X, History, Package, Users, Award, RotateCcw, Bell, FileText, Upload, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface ActivityItem {
  id: string
  actor_name: string
  type: string
  message: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  package_created: { icon: Package,    color: 'text-blue-600',   bg: 'bg-blue-50' },
  subs_invited:    { icon: Users,      color: 'text-violet-600', bg: 'bg-violet-50' },
  bid_submitted:   { icon: ChevronRight, color: 'text-orange-600', bg: 'bg-orange-50' },
  bid_updated:     { icon: ChevronRight, color: 'text-orange-500', bg: 'bg-orange-50' },
  bid_revised:     { icon: RotateCcw,  color: 'text-amber-600',  bg: 'bg-amber-50' },
  revision_requested: { icon: RotateCcw, color: 'text-amber-600', bg: 'bg-amber-50' },
  bid_awarded:     { icon: Award,      color: 'text-green-600',  bg: 'bg-green-50' },
  reminder_sent:   { icon: Bell,       color: 'text-slate-500',  bg: 'bg-slate-100' },
  plan_uploaded:   { icon: Upload,     color: 'text-teal-600',   bg: 'bg-teal-50' },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
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
    else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })

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
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-full sm:w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-900">Job History</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <History className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">No activity yet</p>
              <p className="text-xs text-slate-400 mt-1">Every action on this project will appear here.</p>
            </div>
          ) : (
            <div className="pb-6">
              {Object.entries(groups).map(([label, groupItems]) => (
                <div key={label}>
                  <div className="px-5 py-2.5 sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {groupItems.map(item => {
                      const config = TYPE_CONFIG[item.type] ?? { icon: FileText, color: 'text-slate-500', bg: 'bg-slate-100' }
                      const Icon = config.icon
                      return (
                        <div key={item.id} className="flex gap-3.5 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5', config.bg)}>
                            <Icon className={cn('h-3.5 w-3.5', config.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 leading-snug">{item.message}</p>
                            {item.type === 'revision_requested' && item.metadata?.revision_note != null && (
                              <p className="text-xs text-slate-500 mt-1 italic line-clamp-2">"{String(item.metadata.revision_note)}"</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-medium text-slate-500">{item.actor_name}</span>
                              <span className="text-slate-300">·</span>
                              <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
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
    </>
  )
}
