'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Building2, MapPin, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Child {
  id: string
  name: string
  status: string | null
  unit: string | null
  floor: string | null
  address: string | null
  budgeted: number
  actual: number
  sellout: number | null
}

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

// The unit list for a site: one building (or street) with a job per unit,
// floor, or house. This is the only place those jobs are listed together, so
// it carries the roll-up the projects list can't show.
export default function UnitsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [children, setChildren] = useState<Child[]>([])
  const [site, setSite] = useState<{ name: string; address: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/projects/${params.id}/children`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      if (res.ok) {
        const d = await res.json()
        setChildren(d.children ?? [])
        setSite(d.site ?? null)
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return children
    return children.filter(c => [c.name, c.unit, c.floor, c.address].some(v => (v ?? '').toLowerCase().includes(s)))
  }, [children, q])

  const totals = useMemo(() => {
    const budgeted = children.reduce((s, c) => s + Number(c.budgeted || 0), 0)
    const sellout = children.reduce((s, c) => s + Number(c.sellout || 0), 0)
    return {
      budgeted,
      actual: children.reduce((s, c) => s + Number(c.actual || 0), 0),
      sellout,
      // Only meaningful once at least one unit has a price on it.
      priced: children.filter(c => c.sellout != null && c.sellout > 0).length,
      profit: sellout - budgeted,
      active: children.filter(c => c.status === 'active').length,
      done: children.filter(c => c.status === 'completed').length,
    }
  }, [children])
  const anyPriced = totals.priced > 0

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <Building2 className="h-5 w-5 text-info" /> Jobs on this site
        </h1>
        <p className="text-sm text-muted-fg mt-0.5">
          {children.length} job{children.length !== 1 ? 's' : ''}
          {site?.address ? ` · ${site.address}` : ''}
        </p>
      </div>

      {children.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Building2 className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">Nothing is grouped under this site yet.</p>
          <p className="text-xs text-faint mt-1">Use Bulk Add on the Projects page to create a batch of units, floors, or houses.</p>
        </div>
      ) : (
        <>
          {/* Total sellout against total cost - the number a developer is
              actually watching across a building. Only shown once units have
              prices; before that it would just read as zero profit. */}
          {anyPriced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-line bg-panel p-4">
                <p className="text-xs font-medium text-muted-fg mb-1">Total sellout</p>
                <p className="text-xl font-bold text-ink">{money(totals.sellout)}</p>
                <p className="text-xs text-faint mt-0.5">
                  {totals.priced} of {children.length} priced
                </p>
              </div>
              <div className="rounded-xl border border-line bg-panel p-4">
                <p className="text-xs font-medium text-muted-fg mb-1">Total cost</p>
                <p className="text-xl font-bold text-ink-soft">{money(totals.budgeted)}</p>
                <p className="text-xs text-faint mt-0.5">{money(totals.actual)} spent</p>
              </div>
              <div className={cn('rounded-xl border p-4', totals.profit < 0 ? 'border-danger/30 bg-danger-tint' : 'border-success/30 bg-success-tint')}>
                <p className={cn('text-xs font-medium mb-1', totals.profit < 0 ? 'text-danger' : 'text-success')}>Projected profit</p>
                <p className={cn('text-xl font-bold', totals.profit < 0 ? 'text-danger' : 'text-success')}>
                  {totals.profit < 0 ? '-' : ''}{money(Math.abs(totals.profit))}
                </p>
                {totals.sellout > 0 && (
                  <p className="text-xs text-muted-fg mt-0.5">
                    {((totals.profit / totals.sellout) * 100).toFixed(1)}% margin
                    {totals.priced < children.length ? ' · partial' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-medium text-muted-fg mb-1">Budgeted across all jobs</p>
              <p className="text-xl font-bold text-ink">{money(totals.budgeted)}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-medium text-muted-fg mb-1">Actual spent</p>
              <p className="text-xl font-bold text-success">{money(totals.actual)}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-medium text-muted-fg mb-1">Active</p>
              <p className="text-xl font-bold text-ink">{totals.active}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-medium text-muted-fg mb-1">Completed</p>
              <p className="text-xl font-bold text-ink">{totals.done}</p>
            </div>
          </div>

          {children.length > 8 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <Input className="pl-9" placeholder="Find a unit…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          )}

          <div className="bg-panel rounded-xl border border-line overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_6rem_8rem_8rem_8rem] gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide">
              <span>Job</span>
              <span>Status</span>
              <span className="text-right">Sellout</span>
              <span className="text-right">Budgeted</span>
              <span className="text-right">Actual</span>
            </div>
            <div className="divide-y divide-line-soft">
              {filtered.map(c => (
                <Link key={c.id} href={`/projects/${c.id}/plans`}
                  className="sm:grid sm:grid-cols-[1fr_6rem_8rem_8rem_8rem] gap-2 items-center block px-4 py-3 hover:bg-surface transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-soft truncate">{c.name}</p>
                    <p className="text-xs text-faint truncate flex items-center gap-1">
                      {c.unit ? `Unit ${c.unit}` : c.floor ? `Floor ${c.floor}` : null}
                      {c.address && <><MapPin className="h-3 w-3 shrink-0" />{c.address}</>}
                    </p>
                  </div>
                  <div className="mt-1.5 sm:mt-0">
                    <Badge variant={getStatusVariant(c.status ?? '')} className="capitalize">
                      {(c.status ?? '').replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex justify-between sm:block sm:text-right text-sm mt-1 sm:mt-0">
                    <span className="sm:hidden text-xs text-faint">Sellout</span>
                    <span className={c.sellout != null ? 'text-ink-soft' : 'text-faint'}>
                      {c.sellout != null ? money(c.sellout) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between sm:block sm:text-right text-sm">
                    <span className="sm:hidden text-xs text-faint">Budgeted</span>
                    <span className="text-ink-soft">{money(c.budgeted)}</span>
                  </div>
                  <div className="flex justify-between sm:block sm:text-right text-sm">
                    <span className="sm:hidden text-xs text-faint">Actual</span>
                    <span className={cn(c.actual > c.budgeted && c.budgeted > 0 ? 'text-danger font-medium' : 'text-muted-fg')}>
                      {money(c.actual)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_6rem_8rem_8rem_8rem] gap-2 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
              <span>Total</span>
              <span />
              <span className="text-right">{anyPriced ? money(totals.sellout) : '-'}</span>
              <span className="text-right">{money(totals.budgeted)}</span>
              <span className="text-right">{money(totals.actual)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
