'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Building2, MapPin, Search, Plus, FolderInput, ArrowRightLeft, LogOut, Home, Banknote } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { lotTag } from '@/lib/lot-details'
import { HouseModelsDrawer } from '@/components/projects/house-models-drawer'
import { DevelopmentPayments, DevelopmentPaymentDialog } from '@/components/projects/development-payment'
import { Button } from '@/components/ui/button'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { usePermissions } from '@/lib/use-permissions'
import { AddJobDialog, AddExistingDialog, MoveJobDialog } from '@/components/projects/development-actions'
import { DEVELOPMENT } from '@/lib/development'

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
  lot?: string | null
  block?: string | null
  /** No pin means the job never reached the map - said on the row. */
  lat?: number | null
  model_id?: string | null
  garage_side?: 'left' | 'right' | null
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
  const [siteBudget, setSiteBudget] = useState<{ budgeted: number; actual: number; lines: number } | null>(null)
  const [modelNames, setModelNames] = useState<Record<string, string>>({})
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [modelsOpen, setModelsOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey(k => k + 1)
  const notify = useNotice()
  const guard = useDeleteGuard()
  // Buttons go once the answer is KNOWN to be no, never on a failed read.
  const perms = usePermissions()
  const known = !perms.loading && !perms.error
  const canAdd = !known || perms.can('projects', 'create')
  const canMove = !known || perms.can('projects', 'edit')
  // Recording a payment is the Payments permission, same as on a single job.
  const canPay = known && perms.can('payments', 'edit')
  const [paying, setPaying] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addingExisting, setAddingExisting] = useState(false)
  const [moving, setMoving] = useState<Child | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/projects/${params.id}/children`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        if (res.ok) {
          const d = await res.json()
          setChildren(d.children ?? [])
          setSite(d.site ?? null)
          setSiteBudget(d.siteBudget ?? null)
          setModelNames(Object.fromEntries((d.models ?? []).map((m: { id: string; name: string }) => [m.id, m.name])))
          setModels(d.models ?? [])
        }
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, reloadKey])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return children
    return children.filter(c => [c.name, c.unit, c.floor, c.address, c.lot ? `lot ${c.lot}` : null].some(v => (v ?? '').toLowerCase().includes(s)))
  }, [children, q])

  const totals = useMemo(() => {
    const houses = children.reduce((s, c) => s + Number(c.budgeted || 0), 0)
    // THE MAIN BUDGET IS PART OF THE COST. Land, roads and sitework sit on the
    // group itself; a profit worked out from the houses alone overstates it by
    // exactly the money every house shares.
    const budgeted = houses + Number(siteBudget?.budgeted || 0)
    const sellout = children.reduce((s, c) => s + Number(c.sellout || 0), 0)
    return {
      budgeted,
      houses,
      actual: children.reduce((s, c) => s + Number(c.actual || 0), 0) + Number(siteBudget?.actual || 0),
      sellout,
      // Only meaningful once at least one unit has a price on it.
      priced: children.filter(c => c.sellout != null && c.sellout > 0).length,
      profit: sellout - budgeted,
      active: children.filter(c => c.status === 'active').length,
      done: children.filter(c => c.status === 'completed').length,
    }
  }, [children, siteBudget])
  const anyPriced = totals.priced > 0

  function takeOut(c: Child) {
    guard(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/projects/${params.id}/children?project=${c.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        if (!res.ok) notify((await res.json().catch(() => ({}))).error ?? 'Could not take it out.')
      } finally {
        reload()
      }
    }, {
      title: 'Take this job out?',
      body: `${c.name} becomes a job on its own. Nothing on it is deleted - it just leaves ${site?.name ?? 'this development'}.`,
      confirmLabel: 'Take it out',
    })
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2 min-w-0">
            <Building2 className="h-5 w-5 shrink-0 text-info" /> <span className="truncate">{site?.name ?? 'Jobs'}</span>
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            {DEVELOPMENT} · {children.length} job{children.length !== 1 ? 's' : ''}
            {site?.address ? ` · ${site.address}` : ''}
          </p>
        </div>
        {/* ADDING HAPPENS HERE, not only from Bulk Add on another page - "I
            don't see anywhere once I am in [one] where I can add another". */}
        <div className="row-even lg:flex lg:flex-wrap gap-2">
          {/* Set-up work, not daily work: behind a button, out from the side. */}
          {canPay && children.length > 0 && (
            <Button variant="outline" onClick={() => setPaying(true)}>
              <Banknote className="h-4 w-4" /> Record payment
            </Button>
          )}
          <Button variant="outline" onClick={() => setModelsOpen(true)}>
            <Home className="h-4 w-4" /> House models{models.length ? ` · ${models.length}` : ''}
          </Button>
            {canMove && (
              <Button variant="outline" onClick={() => setAddingExisting(true)}>
                <FolderInput className="h-4 w-4" /> Add jobs you have
              </Button>
            )}
            {canAdd && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add a job
              </Button>
            )}
        </div>
      </div>

      {children.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Building2 className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No jobs in this development yet.</p>
          <p className="text-xs text-faint mt-1">Add a job, add jobs you already have, or use Bulk Add on the Projects page for a whole batch.</p>
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
              <p className="text-xs font-medium text-muted-fg mb-1">Budgeted, main + houses</p>
              <p className="text-xl font-bold text-ink">{money(totals.budgeted)}</p>
              {/* Both halves named, so the total can be checked by eye. */}
              <p className="text-xs text-faint mt-0.5">
                <Link href={`/projects/${params.id}/budget`} className="hover:underline">Main {money(siteBudget?.budgeted ?? 0)}</Link>
                {' · '}houses {money(totals.houses)}
              </p>
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

          <DevelopmentPayments developmentId={params.id} canEdit={canPay} reloadKey={reloadKey} onChanged={() => setReloadKey(k => k + 1)} />

          {children.length > 8 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <Input className="pl-9" placeholder="Find a unit…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          )}

          {/* NO overflow-hidden: a row menu hangs off this card, and a clipped
              menu in the last row is not shortened, it is gone. */}
          <div className="bg-panel rounded-xl border border-line">
            <div className="hidden sm:grid grid-cols-[1fr_6rem_8rem_8rem_8rem_2.5rem] gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide">
              <span>Job</span>
              <span>Status</span>
              <span className="text-right">Sellout</span>
              <span className="text-right">Budgeted</span>
              <span className="text-right">Actual</span>
              <span />
            </div>
            <div className="divide-y divide-line-soft">
              {filtered.map(c => (
                <div key={c.id} className="flex items-center hover:bg-surface transition-colors">
                <Link href={`/projects/${c.id}/plans`}
                  className="min-w-0 flex-1 sm:grid sm:grid-cols-[1fr_6rem_8rem_8rem_8rem] gap-2 items-center block px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-soft truncate">{c.name}</p>
                    <p className="text-xs text-faint truncate flex items-center gap-1">
                      {c.unit ? `Unit ${c.unit}` : c.floor ? `Floor ${c.floor}` : lotTag(c)}
                      {c.address && <><MapPin className="h-3 w-3 shrink-0" />{c.address}</>}
                      {c.address && c.lat == null && <span className="text-warn"> · not on the map</span>}
                      {c.model_id && modelNames[c.model_id] && <span> · {modelNames[c.model_id]}</span>}
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
                {canMove ? (
                  <div className="w-10 shrink-0 pr-2">
                    <RowMenu label={`More for ${c.name}`}>
                      {close => (
                        <>
                          <MenuItem onClick={() => { setMoving(c); close() }}>
                            <ArrowRightLeft className="h-3.5 w-3.5" /> Move to another development
                          </MenuItem>
                          <MenuItem onClick={() => { close(); takeOut(c) }}>
                            <LogOut className="h-3.5 w-3.5" /> Take out of this development
                          </MenuItem>
                        </>
                      )}
                    </RowMenu>
                  </div>
                ) : <div className="hidden w-10 shrink-0 sm:block" />}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_6rem_8rem_8rem_8rem_2.5rem] gap-2 rounded-b-xl px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
              <span>Total</span>
              <span />
              <span className="text-right">{anyPriced ? money(totals.sellout) : '-'}</span>
              <span className="text-right">{money(totals.budgeted)}</span>
              <span className="text-right">{money(totals.actual)}</span>
              <span />
            </div>
          </div>
        </>
      )}

      {paying && (
        <DevelopmentPaymentDialog developmentId={params.id} onClose={() => setPaying(false)}
          onSaved={said => { setPaying(false); setReloadKey(k => k + 1); notify(said) }} />
      )}
      {modelsOpen && (
        <HouseModelsDrawer siteId={params.id} houses={children}
          // Closing re-reads, so a model made in the drawer counts on the button.
          onClose={() => { setModelsOpen(false); setReloadKey(k => k + 1) }}
          onChanged={() => setReloadKey(k => k + 1)} />
      )}
      {adding && (
        <AddJobDialog
          developmentId={params.id}
          developmentName={site?.name ?? DEVELOPMENT}
          models={models}
          onClose={() => setAdding(false)}
          onDone={(_id, note) => { setAdding(false); reload(); if (note) notify(note) }}
        />
      )}
      {addingExisting && (
        <AddExistingDialog
          developmentId={params.id}
          developmentName={site?.name ?? DEVELOPMENT}
          onClose={() => setAddingExisting(false)}
          onDone={moved => { setAddingExisting(false); reload(); notify(moved ? `${moved} job${moved === 1 ? '' : 's'} added.` : 'Those jobs were already here.') }}
        />
      )}
      {moving && (
        <MoveJobDialog
          job={moving}
          currentDevelopmentId={params.id}
          onClose={() => setMoving(null)}
          onDone={() => { setMoving(null); reload() }}
        />
      )}
    </div>
  )
}
