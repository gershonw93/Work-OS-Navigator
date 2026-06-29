'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, FileText, DollarSign, HardHat, Info, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  title: string
  message?: string | null
  link?: string | null
  type: string
  read: boolean
  created_at: string
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 shrink-0'
  if (type === 'rfi') return <FileText className={cn(cls, 'text-info')} />
  if (type === 'bid' || type === 'new_bid') return <HardHat className={cn(cls, 'text-accent-fg')} />
  if (type.startsWith('invoice')) return <DollarSign className={cn(cls, 'text-success')} />
  return <Info className={cn(cls, 'text-faint')} />
}

export function NotificationBell() {
  const supabase = createClient()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = notifications.filter(n => !n.read).length

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [supabase])

  const fetchNotifications = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setNotifications(data.notifications ?? [])
    }
  }, [getToken])

  const markOneRead = useCallback(async (id: string) => {
    const token = await getToken()
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [getToken])

  const markAllRead = useCallback(async () => {
    const token = await getToken()
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [getToken])

  const handleItemClick = useCallback(async (n: Notification) => {
    if (!n.read) await markOneRead(n.id)
    setOpen(false)
    if (n.link) router.push(n.link)
  }, [markOneRead, router])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(o => !o)
          if (!open) fetchNotifications()
        }}
        className="relative p-2 rounded-lg text-muted-fg hover:bg-muted hover:text-ink-soft transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-accent text-accent-ink text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-panel rounded-xl shadow-xl border border-line z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
            <h3 className="font-semibold text-ink">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-accent-fg hover:text-accent-fg font-medium transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-faint">
                All caught up
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    'w-full text-left flex gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-surface transition-colors',
                    !n.read && 'bg-accent-tint',
                  )}
                >
                  <div className="mt-0.5">
                    <TypeIcon type={n.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm leading-snug', !n.read ? 'font-semibold text-ink' : 'font-medium text-ink-soft')}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="text-sm text-muted-fg mt-0.5 leading-snug line-clamp-2">
                        {n.message}
                      </p>
                    )}
                    <p className="text-xs text-faint mt-1">{relativeTime(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
