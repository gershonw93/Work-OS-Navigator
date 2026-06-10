'use client'

import { useEffect, useState } from 'react'
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
    <div className="p-6 space-y-6">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-lg">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">New Private Project</h2>
                <p className="text-xs text-slate-500 mt-0.5">A project for your own tracking — not tied to a GC bid.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createProject}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Project Name</Label>
                  <Input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Smith Residence Electrical" />
                </div>
                <div className="space-y-1.5">
                  <Label>Address <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, State" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select value={type} onChange={e => setType(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none capitalize">
                      {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start Date <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Any notes about this project..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Project'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Jobs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Projects you're working on — awarded and your own.</p>
        </div>
        {activeTab === 'own' && (
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New Project</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: 'awarded', label: 'Awarded Jobs', count: awarded.length, icon: Award },
          { key: 'own', label: 'My Projects', count: own.length, icon: FolderOpen },
        ] as const).map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors',
                activeTab === t.key ? 'border-b-2 border-orange-500 text-orange-600 -mb-px' : 'text-slate-500 hover:text-slate-700')}>
              <Icon className="h-4 w-4" />
              {t.label}
              {t.count > 0 && (
                <span className={cn('text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[20px] text-center',
                  activeTab === t.key ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500')}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : activeTab === 'awarded' ? (
        awarded.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
            <Award className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No awarded jobs yet</p>
            <p className="text-xs text-slate-400 mt-1">When a GC awards you a bid, it will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {awarded.map(sub => {
              const proj = sub.projects
              return (
                <Link key={sub.id} href={`/my-jobs/${proj.id}`}
                  className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-orange-300 hover:shadow-sm transition-all group">
                  <div className="h-10 w-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{proj.name}</span>
                      <span className="text-xs bg-orange-50 border border-orange-200 text-orange-700 rounded-full px-2 py-0.5 font-medium">{sub.trade}</span>
                      <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium border',
                        sub.status === 'active' ? 'bg-green-50 border-green-200 text-green-700' :
                        sub.status === 'completed' ? 'bg-slate-50 border-slate-200 text-slate-600' :
                        'bg-amber-50 border-amber-200 text-amber-700')}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                      {proj.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{proj.address}</span>}
                      {proj.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(proj.start_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-slate-900">${Number(sub.contract_amount).toLocaleString()}</p>
                    <p className="text-xs text-slate-400 capitalize">{proj.type?.replace('_', ' ')}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-400 transition-colors shrink-0" />
                </Link>
              )
            })}
          </div>
        )
      ) : (
        own.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
            <FolderOpen className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No private projects yet</p>
            <p className="text-xs text-slate-400 mt-1">Create projects for jobs not coming through the bidding system.</p>
            <button onClick={() => setShowForm(true)} className="mt-4 text-sm text-orange-500 hover:underline font-medium">
              + Create your first project
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {own.map(proj => (
              <Link key={proj.id} href={`/my-jobs/${proj.id}`}
                className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-orange-300 hover:shadow-sm transition-all group">
                <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{proj.name}</span>
                    <span className="text-xs bg-blue-50 border border-blue-100 text-blue-600 rounded-full px-2 py-0.5">Private</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    {proj.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{proj.address}</span>}
                    {proj.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(proj.start_date).toLocaleDateString()}</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-400 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
