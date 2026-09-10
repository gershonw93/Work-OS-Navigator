'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, Phone, Mail, HardHat, Building2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { headerIconButton } from './header-icon-button'

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

  const label = `Team (${totalCount})`

  return (
    <div className="relative" ref={wrapperRef}>
      {/* The avatars used to be the button - a stack of initials, a word and a
          chevron, next to two bordered words and a square icon. They are not
          lost: the popover this opens IS the avatars, with names, trades and a
          way to call each one. The button is the icon and the number. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(headerIconButton, 'relative')}
      >
        <Users className="h-4 w-4" />
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
          {totalCount}
        </span>
      </button>

      {/* DESKTOP: a pop-over under the avatars. PHONE: a bottom sheet - the
          pop-over ran off the right edge and past the tab bar. */}
      {open && (
        <div data-overlay className="hidden lg:block absolute right-0 z-50 mt-2 w-80 max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel shadow-xl">
          {members.length > 0 && (
            <div className="p-3">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-faint flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5" /> My Team
              </p>
              <ul className="space-y-1">
                {members.map((m) => (
                  <li key={m.id} className="rounded-lg px-2 py-2 hover:bg-surface">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-fg">
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
                        <span className="whitespace-nowrap flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted2 text-xs font-semibold text-muted-fg">
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
      {open && (
        <div className="overlay-sheet lg:hidden bg-black/40" data-overlay onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="flex flex-col overflow-y-auto overscroll-contain rounded-t-2xl bg-panel shadow-2xl pb-safe">
            <div className="flex items-center justify-between py-2 pl-5 pr-2">
              <h2 className="text-base font-bold text-ink">Team</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
          {members.length > 0 && (
            <div className="p-3">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-faint flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5" /> My Team
              </p>
              <ul className="space-y-1">
                {members.map((m) => (
                  <li key={m.id} className="rounded-lg px-2 py-2 hover:bg-surface">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-fg">
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
                        <span className="whitespace-nowrap flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted2 text-xs font-semibold text-muted-fg">
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
        </div>
      )}
    </div>
  )
}
