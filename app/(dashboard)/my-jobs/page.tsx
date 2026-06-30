'use client'

import { useEffect, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Briefcase, Plus, X, MapPin, ChevronRight, Award, FolderOpen, Calendar } from 'lucide-react'
import Link from 'next/link'

const PROJECT_TYPES = ['residential', 'commercial', 'industrial', 'renovation', 'other']

interface AwardedJob {
  id: string; trade: string; contract_amount: number; status: string
  projects: { id: string; name: string; address: string; type: string; status: string; start_date: string | null }
}

interface OwnProject {
  id: string; name: string; address: string | null; type: string; status: string; start_date: string | null
}

export default function MyJobsPage() {
  const supabase = createClient()
  const [awarded, setAwarded] = useState<AwardedJob[]>([])
  const [own, setOwn] = useState<OwnProject[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'awarded' | 'own'>('awarded')
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)

  // New project form
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [type, setType] = useState('residential')
  const [startDate, setStartDate] = useState('')
  const [description, setDescription] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch('/api/my-jobs', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setAwarded(d.awarded ?? [])
      setOwn(d.own ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const token = await getToken()
    await fetch('/api/my-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, address: address || null, type, start_date: startDate || null, description: description || null }),
    })
    setName(''); setAddress(''); setType('residential'); setStartDate(''); setDescription('')
    setShowForm(false); setCreating(false)
    load()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink">New Project</h2>
                <p className="text-xs text-muted-fg mt-0.5">Create a project you manage directly — permits, inspections, plans, and more.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createProject}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Project Name</Label>
                  <Input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Smith Residence Electrical" />
                </div>
                <div className="space-y-1.5">
                  <Label>Address <span className="text-faint font-normal">(optional)</span></Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, State" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <SearchableSelect value={type} onChange={e => setType(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none capitalize">
                      {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start Date <span className="text-faint font-normal">(optional)</span></Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes <span className="text-faint font-normal">(optional)</span></Label>
                  <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Any notes about this project..."
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-line-soft flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Project'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Jobs</h1>
          <p className="text-sm text-muted-fg mt-0.5">Projects you're working on — awarded and your own.</p>
        </div>
        <Button onClick={() => { setActiveTab('own'); setShowForm(true) }} className="self-start sm:self-auto"><Plus className="h-4 w-4" /> New Project</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {([
          { key: 'awarded', label: 'Awarded Jobs', count: awarded.length, icon: Award },
          { key: 'own', label: 'My Projects', count: own.length, icon: FolderOpen },
        ] as const).map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={cn('shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-5 py-2.5 text-sm font-medium transition-colors',
                activeTab === t.key ? 'border-b-2 border-accent text-accent-fg -mb-px' : 'text-muted-fg hover:text-ink-soft')}>
              <Icon className="h-4 w-4" />
              {t.label}
              {t.count > 0 && (
                <span className={cn('text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[20px] text-center',
                  activeTab === t.key ? 'bg-accent-tint text-accent-fg' : 'bg-muted text-muted-fg')}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : activeTab === 'awarded' ? (
        awarded.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
            <Award className="h-8 w-8 text-faint mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-fg">No awarded jobs yet</p>
            <p className="text-xs text-faint mt-1">When a GC awards you a bid, it will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {awarded.map(sub => {
              const proj = sub.projects
              return (
                <Link key={sub.id} href={`/my-jobs/${proj.id}`}
                  className="flex items-center gap-3 sm:gap-4 bg-panel rounded-xl border border-line px-4 sm:px-5 py-4 hover:border-accent hover:shadow-sm transition-all group">
                  <div className="h-10 w-10 rounded-lg bg-accent-tint border border-accent/20 flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5 text-accent-fg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{proj.name}</span>
                      <span className="text-xs bg-accent-tint border border-accent/40 text-accent-fg rounded-full px-2 py-0.5 font-medium">{sub.trade}</span>
                      <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium border',
                        sub.status === 'active' ? 'bg-success-tint border-success/30 text-success' :
                        sub.status === 'completed' ? 'bg-surface border-line text-muted-fg' :
                        'bg-warn-tint border-warn/30 text-warn')}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-faint">
                      {proj.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{proj.address}</span>}
                      {proj.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(proj.start_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-ink">${Number(sub.contract_amount).toLocaleString()}</p>
                    <p className="text-xs text-faint capitalize">{proj.type?.replace('_', ' ')}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-faint group-hover:text-accent-fg transition-colors shrink-0" />
                </Link>
              )
            })}
          </div>
        )
      ) : (
        own.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
            <FolderOpen className="h-8 w-8 text-faint mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-fg">No projects yet</p>
            <p className="text-xs text-faint mt-1">Create and manage your own projects — permits, inspections, plans, daily logs, and more.</p>
            <button onClick={() => setShowForm(true)} className="mt-4 text-sm text-accent-fg hover:underline font-medium">
              + Create your first project
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {own.map(proj => (
              <Link key={proj.id} href={`/projects/${proj.id}`}
                className="flex items-center gap-4 bg-panel rounded-xl border border-line px-5 py-4 hover:border-accent hover:shadow-sm transition-all group">
                <div className="h-10 w-10 rounded-lg bg-info-tint border border-blue-100 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-5 w-5 text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{proj.name}</span>
                    <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium border',
                      proj.status === 'active' ? 'bg-success-tint border-success/30 text-success' :
                      proj.status === 'completed' ? 'bg-surface border-line text-muted-fg' :
                      'bg-warn-tint border-warn/30 text-warn')}>
                      {proj.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-faint">
                    {proj.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{proj.address}</span>}
                    {proj.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(proj.start_date).toLocaleDateString()}</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-faint group-hover:text-accent-fg transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
