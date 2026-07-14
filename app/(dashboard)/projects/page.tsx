'use client'

import { useEffect, useMemo, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import Link from 'next/link'
import {
  FolderKanban, Plus, Pencil, Trash2, X, Search, LayoutGrid, List, Map,
  MapPin, User, Calendar, ArrowUpDown, Building2, SlidersHorizontal,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { ProjectsMap } from '@/components/projects/projects-map'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  address: string | null
  client: string | null
  type: string | null
  status: string | null
  start_date: string | null
  end_date: string | null
  lat?: number | null
  lng?: number | null
  interior_sqft?: number | null
  exterior_sqft?: number | null
  billing_mode?: string | null
  default_retainage_pct?: number | null
  created_at: string
}

interface ProjectStat {
  progressPct: number
  contracted: number
  paid: number
  outstanding: number
  taskTotal: number
  taskDone: number
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

const PROJECT_TYPES = ['residential', 'commercial', 'industrial', 'civil', 'other']
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

type SortKey = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'start_desc' | 'start_asc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'start_desc', label: 'Start date (latest)' },
  { value: 'start_asc', label: 'Start date (earliest)' },
]

const TYPE_ACCENT: Record<string, string> = {
  residential: 'from-emerald-500 to-green-600',
  commercial: 'from-blue-500 to-indigo-600',
  industrial: 'from-slate-500 to-slate-700',
  civil: 'from-amber-500 to-accent',
  other: 'from-violet-500 to-purple-600',
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProjectsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Project[]>([])
  const [projectStats, setProjectStats] = useState<Record<string, ProjectStat>>({})
  const [loading, setLoading] = useState(true)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)

  // Controls
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('created_desc')
  const [view, setView] = useState<'grid' | 'list' | 'map'>('grid')

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editType, setEditType] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editInteriorSqft, setEditInteriorSqft] = useState('')
  const [editExteriorSqft, setEditExteriorSqft] = useState('')
  const [editBillingMode, setEditBillingMode] = useState<'simple' | 'aia'>('simple')
  const [editRetainage, setEditRetainage] = useState('10')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchProjects() {
    // Use the API so role-based scoping (assigned-only for field roles) is enforced
    const token = await getToken()
    const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      setItems(data.projects ?? [])
    } else {
      setItems([])
    }
    setLoading(false)
    // Stats are non-blocking - load after the list renders
    fetch('/api/projects/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { stats: {} })
      .then(d => setProjectStats(d.stats ?? {}))
      .catch(() => {})
  }

  useEffect(() => { fetchProjects() }, [])

  // Restore view preference
  useEffect(() => {
    const v = localStorage.getItem('workos_projects_view')
    if (v === 'grid' || v === 'list' || v === 'map') setView(v)
  }, [])
  function changeView(v: 'grid' | 'list' | 'map') {
    setView(v)
    localStorage.setItem('workos_projects_view', v)
  }

  function openEdit(project: Project) {
    setEditProject(project)
    setEditName(project.name)
    setEditAddress(project.address ?? '')
    setEditClient(project.client ?? '')
    setEditType(project.type ?? '')
    setEditStatus(project.status ?? '')
    setEditStartDate(project.start_date ?? '')
    setEditEndDate(project.end_date ?? '')
    setEditInteriorSqft(project.interior_sqft != null ? String(project.interior_sqft) : '')
    setEditExteriorSqft(project.exterior_sqft != null ? String(project.exterior_sqft) : '')
    setEditBillingMode(project.billing_mode === 'aia' ? 'aia' : 'simple')
    setEditRetainage(project.default_retainage_pct != null ? String(project.default_retainage_pct) : '10')
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editProject) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${editProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: editName,
        address: editAddress || null,
        client: editClient || null,
        type: editType || null,
        status: editStatus || null,
        start_date: editStartDate || null,
        end_date: editEndDate || null,
        interior_sqft: editInteriorSqft ? Number(editInteriorSqft) : null,
        exterior_sqft: editExteriorSqft ? Number(editExteriorSqft) : null,
        billing_mode: editBillingMode,
        default_retainage_pct: editBillingMode === 'aia' ? (Number(editRetainage) || 0) : undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(`Could not save: ${d.error ?? res.statusText}`)
      return
    }
    setEditProject(null)
    fetchProjects()
  }

  async function handleDelete(project: Project) {
    if (!window.confirm(`Delete "${project.name}" and all its data?`)) return
    const token = await getToken()
    await fetch(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchProjects()
  }

  // Derived: filtered + sorted
  const filtered = useMemo(() => {
    let list = items
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(p =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.address ?? '').toLowerCase().includes(q) ||
        (p.client ?? '').toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter)
    if (typeFilter !== 'all') list = list.filter(p => p.type === typeFilter)

    const s = (v: string | null | undefined) => v ?? ''
    const sorted = [...list].sort((a, b) => {
      switch (sort) {
        case 'created_asc': return s(a.created_at).localeCompare(s(b.created_at))
        case 'name_asc': return s(a.name).localeCompare(s(b.name))
        case 'name_desc': return s(b.name).localeCompare(s(a.name))
        case 'start_asc': return s(a.start_date).localeCompare(s(b.start_date))
        case 'start_desc': return s(b.start_date).localeCompare(s(a.start_date))
        default: return s(b.created_at).localeCompare(s(a.created_at))
      }
    })
    return sorted
  }, [items, query, statusFilter, typeFilter, sort])

  // Stats
  const stats = useMemo(() => {
    const by = (s: string) => items.filter(p => p.status === s).length
    return {
      total: items.length,
      active: by('active'),
      planning: by('planning'),
      on_hold: by('on_hold'),
      completed: by('completed'),
    }
  }, [items])

  const hasFilters = query.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all'
  function clearFilters() { setQuery(''); setStatusFilter('all'); setTypeFilter('all') }

  if (loading) return <div className="p-4 sm:p-6 text-sm text-faint py-12 text-center">Loading...</div>

  return (
    <div className="p-4 sm:p-6">
      {/* Edit Modal */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Edit Project</h2>
              <button onClick={() => setEditProject(null)} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Project Name <span className="text-danger">*</span></Label>
                  <Input required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Client</Label>
                  <Input value={editClient} onChange={e => setEditClient(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <SearchableSelect value={editType} onChange={e => setEditType(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">Select type...</option>
                      {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <SearchableSelect value={editStatus} onChange={e => setEditStatus(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">Select status...</option>
                      {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </SearchableSelect>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Interior Sq Ft <span className="text-faint font-normal">(under A/C)</span></Label>
                    <Input type="number" min="0" value={editInteriorSqft} onChange={e => setEditInteriorSqft(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Exterior Sq Ft <span className="text-faint font-normal">(under roof)</span></Label>
                    <Input type="number" min="0" value={editExteriorSqft} onChange={e => setEditExteriorSqft(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Billing method</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button type="button" onClick={() => setEditBillingMode('simple')}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${editBillingMode === 'simple' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft'}`}>
                      <span className="font-semibold">Simple invoicing</span>
                      <span className="block text-xs text-muted-fg">Invoices + client payments</span>
                    </button>
                    <button type="button" onClick={() => setEditBillingMode('aia')}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${editBillingMode === 'aia' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft'}`}>
                      <span className="font-semibold">Progress billing (AIA)</span>
                      <span className="block text-xs text-muted-fg">Pay applications + retainage</span>
                    </button>
                  </div>
                  {editBillingMode === 'aia' && (
                    <div className="flex items-center gap-2 pt-1">
                      <Label className="text-sm font-normal text-muted-fg">Default retainage</Label>
                      <Input type="number" step="0.1" value={editRetainage} onChange={e => setEditRetainage(e.target.value)} className="w-24" />
                      <span className="text-sm text-muted-fg">%</span>
                    </div>
                  )}
                  <p className="text-xs text-faint">Switching hides the other money tabs; existing data is kept.</p>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-line-soft flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditProject(null)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PageHeader
        title="Projects"
        subtitle="Manage all your construction projects."
        action={
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        }
      />

      {/* Stats bar */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Total', value: stats.total, accent: 'text-ink', filter: 'all' },
            { label: 'Active', value: stats.active, accent: 'text-success', filter: 'active' },
            { label: 'Planning', value: stats.planning, accent: 'text-info', filter: 'planning' },
            { label: 'On Hold', value: stats.on_hold, accent: 'text-yellow-600', filter: 'on_hold' },
            { label: 'Completed', value: stats.completed, accent: 'text-muted-fg', filter: 'completed' },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.filter)}
              className={cn(
                'rounded-xl border bg-panel px-4 py-3 text-left transition-colors hover:border-accent',
                statusFilter === s.filter ? 'border-accent ring-1 ring-accent/30' : 'border-line',
              )}
            >
              <p className={cn('text-2xl font-bold', s.accent)}>{s.value}</p>
              <p className="text-xs font-medium text-muted-fg mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {items.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, address, or client…"
              className="w-full rounded-lg border border-line bg-panel pl-9 pr-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Type filter */}
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-faint pointer-events-none" />
              <SearchableSelect
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="appearance-none rounded-lg border border-line bg-panel pl-8 pr-7 py-2 text-sm capitalize focus:border-accent focus:outline-none"
              >
                <option value="all">All types</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </SearchableSelect>
            </div>

            {/* Status filter */}
            <div className="relative">
              <SlidersHorizontal className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-faint pointer-events-none" />
              <SearchableSelect
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none rounded-lg border border-line bg-panel pl-8 pr-7 py-2 text-sm capitalize focus:border-accent focus:outline-none"
              >
                <option value="all">All statuses</option>
                {PROJECT_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
              </SearchableSelect>
            </div>

            {/* Sort */}
            <div className="relative">
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-faint pointer-events-none" />
              <SearchableSelect
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="appearance-none rounded-lg border border-line bg-panel pl-8 pr-7 py-2 text-sm focus:border-accent focus:outline-none"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SearchableSelect>
            </div>

            {/* View toggle */}
            <div className="flex rounded-lg border border-line bg-panel p-0.5">
              <button
                onClick={() => changeView('grid')}
                className={cn('rounded-md p-1.5 transition-colors', view === 'grid' ? 'bg-accent text-accent-ink' : 'text-faint hover:text-muted-fg')}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => changeView('list')}
                className={cn('rounded-md p-1.5 transition-colors', view === 'list' ? 'bg-accent text-accent-ink' : 'text-faint hover:text-muted-fg')}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => changeView('map')}
                className={cn('rounded-md p-1.5 transition-colors', view === 'map' ? 'bg-accent text-accent-ink' : 'text-faint hover:text-muted-fg')}
                title="Map view"
              >
                <Map className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result count */}
      {items.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-fg">
            {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
            {hasFilters && <span className="text-faint"> (filtered from {items.length})</span>}
          </p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm font-medium text-accent-fg hover:text-accent-fg">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to start managing plans, bids, and the full construction workflow."
              action={{ label: 'New Project' }}
            />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <Search className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No projects match your filters.</p>
          <button onClick={clearFilters} className="mt-2 text-sm font-medium text-accent-fg hover:text-accent-fg">Clear filters</button>
        </div>
      ) : view === 'map' ? (
        <ProjectsMap projects={filtered as any} />
      ) : view === 'grid' ? (
        /* ───── GRID VIEW ───── */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(project => {
            const accent = TYPE_ACCENT[project.type ?? 'other'] ?? TYPE_ACCENT.other
            return (
              <div key={project.id} className="group relative rounded-xl border border-line bg-panel overflow-hidden hover:border-accent hover:shadow-md transition-all">
                {/* Accent strip */}
                <div className={cn('h-1.5 bg-gradient-to-r', accent)} />
                <Link href={`/projects/${project.id}/plans`} className="block p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink truncate group-hover:text-accent-fg transition-colors">
                        {project.name}
                      </h3>
                      {project.type && (
                        <span className="text-xs font-medium text-faint capitalize">{project.type.replace('_', ' ')}</span>
                      )}
                    </div>
                    <Badge variant={getStatusVariant(project.status ?? '')} className="shrink-0 capitalize">
                      {project.status?.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-muted-fg">
                    {project.address && (
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-faint" />
                        <span className="truncate">{project.address}</span>
                      </div>
                    )}
                    {project.client && (
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-3.5 w-3.5 shrink-0 text-faint" />
                        <span className="truncate">{project.client}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <span>{fmtDate(project.start_date)}{project.end_date ? ` → ${fmtDate(project.end_date)}` : ''}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(() => {
                    const st = projectStats[project.id]
                    const pct = st?.progressPct ?? 0
                    return (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-muted-fg">Progress</span>
                          <span className="font-semibold text-ink-soft">
                            {pct}%{st && st.taskTotal > 0 ? <span className="font-normal text-faint"> · {st.taskDone}/{st.taskTotal} tasks</span> : ''}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-success-solid' : 'bg-accent')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })()}

                  {/* Financial mini-info */}
                  {(() => {
                    const st = projectStats[project.id]
                    if (!st || (st.contracted === 0 && st.paid === 0 && st.outstanding === 0)) return null
                    return (
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-surface py-1.5">
                          <p className="text-xs text-faint">Contract</p>
                          <p className="text-sm font-semibold text-ink-soft">{fmtMoney(st.contracted)}</p>
                        </div>
                        <div className="rounded-lg bg-success-tint py-1.5">
                          <p className="text-xs text-success/70">Paid</p>
                          <p className="text-sm font-semibold text-success">{fmtMoney(st.paid)}</p>
                        </div>
                        <div className="rounded-lg bg-warn-tint py-1.5">
                          <p className="text-xs text-warn/70">Outstanding</p>
                          <p className="text-sm font-semibold text-warn">{fmtMoney(st.outstanding)}</p>
                        </div>
                      </div>
                    )
                  })()}
                </Link>

                {/* Action bar */}
                <div className="flex items-center justify-between border-t border-line-soft px-5 py-2.5">
                  <Link href={`/projects/${project.id}/plans`} className="text-sm font-medium text-accent-fg hover:text-accent-fg">
                    Open →
                  </Link>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(project)} className="p-1.5 text-faint hover:text-muted-fg rounded" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(project)} className="p-1.5 text-faint hover:text-danger rounded" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ───── LIST VIEW ───── */
        <Card>
          <CardContent className="p-0">
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-line-soft">
              {filtered.map((project) => (
                <div key={project.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/projects/${project.id}/plans`} className="font-medium text-ink hover:text-accent-fg">
                      {project.name}
                    </Link>
                    <Badge variant={getStatusVariant(project.status ?? '')} className="capitalize">
                      {project.status?.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-fg">
                    <span className="capitalize">{project.type?.replace('_', ' ')}</span>
                    {project.start_date && <span>{fmtDate(project.start_date)}</span>}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => openEdit(project)} className="text-faint hover:text-muted-fg">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(project)} className="text-faint hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${project.id}/plans`} className="text-accent-fg hover:text-accent-fg hover:underline">
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{project.type?.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(project.status ?? '')} className="capitalize">
                          {project.status?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-fg">{project.client ?? '-'}</TableCell>
                      <TableCell>{fmtDate(project.start_date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link href={`/projects/${project.id}/plans`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
                          <button onClick={() => openEdit(project)} className="p-1.5 text-faint hover:text-muted-fg rounded">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(project)} className="p-1.5 text-faint hover:text-danger rounded">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
