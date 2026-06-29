'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, Phone, Mail, HardHat, Building2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
}

interface Sub {
  id: string
  scope: string
  trade: string | null
  companies: { name: string; contact_email: string | null; phone: string | null } | null
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

export function TeamQuickView({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/projects/${projectId}/team`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members ?? [])
        setSubs(data.subcontracts ?? [])
      }
      setLoaded(true)
    }
    load()
  }, [projectId])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const totalCount = members.length + subs.length
  if (!loaded || totalCount === 0) return null

  // Build avatar preview (first 4)
  const avatarItems = [
    ...members.map((m) => ({ key: `m-${m.id}`, label: m.name, type: 'member' as const })),
    ...subs.map((s) => ({ key: `s-${s.id}`, label: s.companies?.name ?? s.scope, type: 'sub' as const })),
  ]
  const preview = avatarItems.slice(0, 4)
  const extra = totalCount - preview.length

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-panel px-2 py-1 hover:border-accent hover:bg-accent-tint transition-colors"
      >
        <div className="flex -space-x-2">
          {preview.map((a) => (
            <span
              key={a.key}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white',
                a.type === 'member' ? 'bg-accent-tint text-accent-fg' : 'bg-muted2 text-muted-fg',
              )}
              title={a.label}
            >
              {initials(a.label)}
            </span>
          ))}
          {extra > 0 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-fg ring-2 ring-white">
              +{extra}
            </span>
          )}
        </div>
        <span className="hidden sm:flex items-center gap-1 text-sm font-medium text-muted-fg">
          <Users className="h-4 w-4" />
          Team
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-xl">
          {members.length > 0 && (
            <div className="p-3">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-faint flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5" /> My Team
              </p>
              <ul className="space-y-1">
                {members.map((m) => (
                  <li key={m.id} className="rounded-lg px-2 py-2 hover:bg-surface">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-fg">
                        {initials(m.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                        {m.role && <p className="truncate text-xs text-muted-fg">{m.role}</p>}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2 pl-10">
                      {m.phone && (
                        <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 rounded-md bg-success-tint px-2 py-1 text-xs font-medium text-success hover:bg-success-tint">
                          <Phone className="h-3 w-3" /> {m.phone}
                        </a>
                      )}
                      {m.email && (
                        <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 rounded-md bg-info-tint px-2 py-1 text-xs font-medium text-info hover:bg-info-tint">
                          <Mail className="h-3 w-3" /> Email
                        </a>
                      )}
                      {!m.phone && !m.email && <span className="text-xs text-faint">No contact info</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {subs.length > 0 && (
            <div className="border-t border-line-soft p-3">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-faint flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Subcontractors
              </p>
              <ul className="space-y-1">
                {subs.map((s) => {
                  const name = s.companies?.name ?? s.scope
                  const phone = s.companies?.phone
                  const email = s.companies?.contact_email
                  return (
                    <li key={s.id} className="rounded-lg px-2 py-2 hover:bg-surface">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted2 text-xs font-semibold text-muted-fg">
                          {initials(name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{name}</p>
                          <p className="truncate text-xs text-muted-fg">{s.trade ?? s.scope}</p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2 pl-10">
                        {phone && (
                          <a href={`tel:${phone}`} className="inline-flex items-center gap-1 rounded-md bg-success-tint px-2 py-1 text-xs font-medium text-success hover:bg-success-tint">
                            <Phone className="h-3 w-3" /> {phone}
                          </a>
                        )}
                        {email && !email.includes('placeholder.com') && (
                          <a href={`mailto:${email}`} className="inline-flex items-center gap-1 rounded-md bg-info-tint px-2 py-1 text-xs font-medium text-info hover:bg-info-tint">
                            <Mail className="h-3 w-3" /> Email
                          </a>
                        )}
                        {!phone && (!email || email.includes('placeholder.com')) && <span className="text-xs text-faint">No contact info</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
