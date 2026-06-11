'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Plus, X, ChevronDown, ChevronUp, BookOpen, AlertTriangle,
  CloudRain, Sun, Cloud, CloudSnow, Wind, Thermometer,
  Users, Building2, Camera, Clock, CheckSquare, Trash2, Flag,
} from 'lucide-react'

const WEATHER_OPTIONS = [
  { value: 'sunny', label: 'Sunny', icon: Sun },
  { value: 'cloudy', label: 'Cloudy', icon: Cloud },
  { value: 'rainy', label: 'Rainy', icon: CloudRain },
  { value: 'snowy', label: 'Snowy', icon: CloudSnow },
  { value: 'windy', label: 'Windy', icon: Wind },
]

const DELAY_TYPES = ['Weather', 'Material Delivery', 'Equipment', 'Labor Shortage', 'Inspection', 'Design Change', 'Other']

interface DailyLog {
  id: string
  log_date: string
  created_by_name: string
  created_at: string
  weather_condition: string | null
  temperature: string | null
  notes: string | null
  has_issues: boolean
  issue_description: string | null
  delays: { type: string; description: string }[]
  subs_on_site: { company_id: string; name: string }[]
  workers_on_site: { name: string; role: string }[]
  photos: { url: string; path: string; caption: string }[]
  daily_log_photos?: { id: string; photo_url: string; created_at: string }[]
}

interface TeamMember { id: string; name: string; role: string }
interface SubContract { id: string; company_id: string; trade: string; companies?: { name: string } }

export default function DailyLogsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [logs, setLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Context data
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [subcontracts, setSubcontracts] = useState<SubContract[]>([])

  // Form state
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [weatherCondition, setWeatherCondition] = useState('')
  const [temperature, setTemperature] = useState('')
  const [notes, setNotes] = useState('')
  const [hasIssues, setHasIssues] = useState(false)
  const [issueDescription, setIssueDescription] = useState('')
  const [delays, setDelays] = useState<{ type: string; description: string }[]>([])
  const [subsOnSite, setSubsOnSite] = useState<{ company_id: string; name: string }[]>([])
  const [workersOnSite, setWorkersOnSite] = useState<{ name: string; role: string }[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  // Weather auto-fill
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherChip, setWeatherChip] = useState<string | null>(null)
  const [projectAddress, setProjectAddress] = useState<string | null>(null)

  // Create task from issue
  const [createTaskFromLog, setCreateTaskFromLog] = useState<DailyLog | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPriority, setTaskPriority] = useState('high')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskAssigneeType, setTaskAssigneeType] = useState<'member' | 'sub' | ''>('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchLogs() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/daily-logs`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
    async function fetchContext() {
      const token = await getToken()
      const [teamRes, subRes, projRes] = await Promise.all([
        fetch(`/api/projects/${params.id}/team`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projects/${params.id}/tasks`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projects/${params.id}/activity`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (teamRes.ok) {
        const d = await teamRes.json()
        setTeamMembers(d.members ?? [])
      }
      if (subRes.ok) {
        const d = await subRes.json()
        setSubcontracts(d.subcontracts ?? [])
      }
      // Fetch project address directly from Supabase
      const supabaseClient = createClient()
      const { data: proj } = await supabaseClient
        .from('projects')
        .select('address')
        .eq('id', params.id)
        .single()
      if (proj?.address) setProjectAddress(proj.address)
    }
    fetchContext()
  }, [params.id])

  function addPhoto(files: FileList | null) {
    if (!files) return
    const newFiles = Array.from(files)
    setPhotos(prev => [...prev, ...newFiles])
    newFiles.forEach(f => {
      const reader = new FileReader()
      reader.onload = e => setPhotoPreviews(prev => [...prev, e.target?.result as string])
      reader.readAsDataURL(f)
    })
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  function toggleSubOnSite(sub: SubContract) {
    const name = (sub.companies as any)?.name ?? sub.trade
    const exists = subsOnSite.find(s => s.company_id === sub.company_id)
    if (exists) setSubsOnSite(prev => prev.filter(s => s.company_id !== sub.company_id))
    else setSubsOnSite(prev => [...prev, { company_id: sub.company_id, name }])
  }

  function toggleWorkerOnSite(m: TeamMember) {
    const exists = workersOnSite.find(w => w.name === m.name)
    if (exists) setWorkersOnSite(prev => prev.filter(w => w.name !== m.name))
    else setWorkersOnSite(prev => [...prev, { name: m.name, role: m.role }])
  }

  function addDelay() {
    setDelays(prev => [...prev, { type: '', description: '' }])
  }

  function resetForm() {
    setLogDate(new Date().toISOString().split('T')[0])
    setWeatherCondition(''); setTemperature(''); setNotes('')
    setHasIssues(false); setIssueDescription('')
    setDelays([]); setSubsOnSite([]); setWorkersOnSite([])
    setPhotos([]); setPhotoPreviews([]); setError(null)
    setWeatherChip(null)
  }

  async function handleAutoFillWeather() {
    if (!projectAddress) return
    setWeatherLoading(true)
    try {
      const res = await fetch(`/api/weather?address=${encodeURIComponent(projectAddress)}`)
      if (res.ok) {
        const data = await res.json()
        setWeatherCondition(data.weather)
        setTemperature(String(data.temp_f))
        setWeatherChip(`${data.temp_f}°F`)
      }
    } catch {
      // silently fail
    } finally {
      setWeatherLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const token = await getToken()
    const form = new FormData()
    form.append('log_date', logDate)
    if (weatherCondition) form.append('weather_condition', weatherCondition)
    if (temperature) form.append('temperature', temperature)
    if (notes) form.append('notes', notes)
    form.append('has_issues', String(hasIssues))
    if (hasIssues && issueDescription) form.append('issue_description', issueDescription)
    form.append('delays', JSON.stringify(delays.filter(d => d.type)))
    form.append('subs_on_site', JSON.stringify(subsOnSite))
    form.append('workers_on_site', JSON.stringify(workersOnSite))
    photos.forEach(f => form.append('photos', f))

    const res = await fetch(`/api/projects/${params.id}/daily-logs`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error)
      setSubmitting(false)
      return
    }
    resetForm()
    setShowForm(false)
    setSubmitting(false)
    fetchLogs()
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!createTaskFromLog) return
    setCreatingTask(true)
    const token = await getToken()

    let assigned_to_member_id = null
    let assigned_to_company_id = null
    let assigned_to_name = null
    if (taskAssigneeType === 'member' && taskAssigneeId) {
      const m = teamMembers.find(m => m.id === taskAssigneeId)
      assigned_to_member_id = taskAssigneeId
      assigned_to_name = m?.name ?? null
    } else if (taskAssigneeType === 'sub' && taskAssigneeId) {
      const s = subcontracts.find(s => s.id === taskAssigneeId)
      assigned_to_company_id = s?.company_id ?? null
      assigned_to_name = (s?.companies as any)?.name ?? s?.trade ?? null
    }

    await fetch(`/api/projects/${params.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: taskTitle,
        description: taskDescription || `From daily log ${new Date(createTaskFromLog.log_date).toLocaleDateString()}: ${createTaskFromLog.issue_description ?? ''}`,
        priority: taskPriority,
        status: 'open',
        due_date: taskDueDate || null,
        assigned_to_member_id,
        assigned_to_company_id,
        assigned_to_name,
      }),
    })
    setCreateTaskFromLog(null)
    setTaskTitle(''); setTaskDescription(''); setTaskDueDate('')
    setTaskAssigneeType(''); setTaskAssigneeId('')
    setCreatingTask(false)
  }

  const weatherIcon = (condition: string | null) => {
    const w = WEATHER_OPTIONS.find(o => o.value === condition)
    if (!w) return null
    const Icon = w.icon
    return <Icon className="h-4 w-4" />
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Create task modal */}
      {createTaskFromLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Create Task from Issue</h2>
                <p className="text-xs text-slate-500 mt-0.5">Log: {new Date(createTaskFromLog.log_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <button onClick={() => setCreateTaskFromLog(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                {createTaskFromLog.issue_description && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    <p className="font-medium text-xs text-amber-500 mb-0.5">Issue logged</p>
                    {createTaskFromLog.issue_description}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Task Title</Label>
                  <Input autoFocus value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Fix water intrusion on north wall" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Description <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <textarea rows={2} value={taskDescription} onChange={e => setTaskDescription(e.target.value)}
                    placeholder="Additional context..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['low', 'medium', 'high', 'urgent'].map(p => (
                        <button key={p} type="button" onClick={() => setTaskPriority(p)}
                          className={cn('rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition-colors',
                            taskPriority === p ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Due Date <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Assign To <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <div className="flex gap-2 mb-2">
                    {(['', 'member', 'sub'] as const).map(t => (
                      <button key={t} type="button" onClick={() => { setTaskAssigneeType(t); setTaskAssigneeId('') }}
                        className={cn('flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                          taskAssigneeType === t ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                        {t === '' ? 'Unassigned' : t === 'member' ? 'GC Crew' : 'Subcontractor'}
                      </button>
                    ))}
                  </div>
                  {taskAssigneeType === 'member' && teamMembers.length > 0 && (
                    <select value={taskAssigneeId} onChange={e => setTaskAssigneeId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      <option value="">Select crew member...</option>
                      {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                    </select>
                  )}
                  {taskAssigneeType === 'sub' && subcontracts.length > 0 && (
                    <select value={taskAssigneeId} onChange={e => setTaskAssigneeId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      <option value="">Select subcontractor...</option>
                      {subcontracts.map(s => <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade} — {s.trade}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setCreateTaskFromLog(null)}>Cancel</Button>
                <Button type="submit" disabled={creatingTask || !taskTitle.trim()}>
                  <CheckSquare className="h-3.5 w-3.5" />
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Field reports, site conditions, and crew activity.</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4" /> New Log
        </Button>
      </div>

      {/* New Log Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">New Daily Log</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-6">

            {/* Date + Weather + Temp */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="logDate">Date</Label>
                <Input id="logDate" type="date" value={logDate} onChange={e => setLogDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5 col-span-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Weather</Label>
                  <div className="flex items-center gap-2">
                    {weatherChip && (
                      <span className="text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2 py-0.5">
                        {weatherChip}
                      </span>
                    )}
                    {projectAddress && (
                      <button
                        type="button"
                        onClick={handleAutoFillWeather}
                        disabled={weatherLoading}
                        className="text-xs border border-slate-300 rounded-md px-2 py-0.5 text-slate-600 hover:border-orange-400 hover:text-orange-600 transition-colors disabled:opacity-50"
                      >
                        {weatherLoading ? 'Fetching...' : 'Auto-fill weather'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {WEATHER_OPTIONS.map(w => {
                    const Icon = w.icon
                    return (
                      <button key={w.value} type="button" onClick={() => setWeatherCondition(weatherCondition === w.value ? '' : w.value)}
                        title={w.label}
                        className={cn('flex-1 flex flex-col items-center gap-0.5 rounded-lg border py-2 text-xs transition-colors',
                          weatherCondition === w.value ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:block">{w.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temperature">
                  <Thermometer className="inline h-3.5 w-3.5 mr-1 text-slate-400" />Temp (°F)
                </Label>
                <Input id="temperature" type="number" placeholder="e.g. 72" value={temperature} onChange={e => setTemperature(e.target.value)} />
              </div>
            </div>

            {/* Workers on site */}
            {teamMembers.length > 0 && (
              <div className="space-y-2">
                <Label><Users className="inline h-3.5 w-3.5 mr-1 text-slate-400" />GC Crew on Site</Label>
                <div className="flex flex-wrap gap-2">
                  {teamMembers.map(m => {
                    const active = workersOnSite.find(w => w.name === m.name)
                    return (
                      <button key={m.id} type="button" onClick={() => toggleWorkerOnSite(m)}
                        className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-blue-500' : 'bg-slate-300')} />
                        {m.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Subs on site */}
            {subcontracts.length > 0 && (
              <div className="space-y-2">
                <Label><Building2 className="inline h-3.5 w-3.5 mr-1 text-slate-400" />Subcontractors on Site</Label>
                <div className="flex flex-wrap gap-2">
                  {subcontracts.map(sub => {
                    const name = (sub.companies as any)?.name ?? sub.trade
                    const active = subsOnSite.find(s => s.company_id === sub.company_id)
                    return (
                      <button key={sub.id} type="button" onClick={() => toggleSubOnSite(sub)}
                        className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          active ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-orange-500' : 'bg-slate-300')} />
                        {name}
                        <span className="text-slate-400">({sub.trade})</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Log Notes</Label>
              <textarea id="notes" rows={3} placeholder="What happened on site today? Progress made, observations, anything notable..."
                value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none" />
            </div>

            {/* Issues */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setHasIssues(!hasIssues)}
                  className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    hasIssues ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-500')}>
                  <Flag className={cn('h-4 w-4', hasIssues ? 'fill-red-400' : '')} />
                  {hasIssues ? 'Issue Flagged' : 'Flag an Issue'}
                </button>
                <span className="text-xs text-slate-400">Flag this log if something needs attention</span>
              </div>
              {hasIssues && (
                <textarea rows={2} placeholder="Describe the issue (e.g. water leak at north wall, missing materials, safety concern...)"
                  value={issueDescription} onChange={e => setIssueDescription(e.target.value)}
                  className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-300 resize-none" />
              )}
            </div>

            {/* Delays */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label><Clock className="inline h-3.5 w-3.5 mr-1 text-slate-400" />Delays</Label>
                <button type="button" onClick={addDelay} className="text-xs text-orange-500 hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add Delay
                </button>
              </div>
              {delays.map((delay, i) => (
                <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
                  <select value={delay.type} onChange={e => setDelays(prev => prev.map((d, j) => j === i ? { ...d, type: e.target.value } : d))}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-orange-400 bg-white w-full sm:w-44 sm:shrink-0">
                    <option value="">Select type</option>
                    {DELAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="text" placeholder="Describe the delay..." value={delay.description}
                    onChange={e => setDelays(prev => prev.map((d, j) => j === i ? { ...d, description: e.target.value } : d))}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
                  <button type="button" onClick={() => setDelays(prev => prev.filter((_, j) => j !== i))}
                    className="text-slate-300 hover:text-red-400 mt-1.5"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>

            {/* Photos */}
            <div className="space-y-2">
              <Label><Camera className="inline h-3.5 w-3.5 mr-1 text-slate-400" />Site Photos</Label>
              {photoPreviews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photoPreviews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt="" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                      <button type="button" onClick={() => removePhoto(i)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-2.5 text-sm text-slate-400 hover:border-orange-300 hover:text-orange-500 transition-colors">
                <Camera className="h-4 w-4" /> Add Photos
              </button>
              <input ref={photoInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e => addPhoto(e.target.files)} />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Submit Log'}</Button>
            </div>
          </form>
        </div>
      )}

      {/* Logs list */}
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : logs.length === 0 && !showForm ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No logs yet</p>
          <p className="text-xs text-slate-400 mt-1">Submit your first daily log to track site activity.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const isExpanded = expandedLog === log.id
            const dateLabel = new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

            return (
              <div key={log.id} className={cn('rounded-xl border bg-white overflow-hidden transition-colors',
                log.has_issues ? 'border-red-200' : 'border-slate-200')}>

                {/* Log row */}
                <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                  <div className="shrink-0">
                    {log.has_issues
                      ? <AlertTriangle className="h-5 w-5 text-red-400" />
                      : <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                        </div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-slate-900">{dateLabel}</span>
                      {log.weather_condition && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          {weatherIcon(log.weather_condition)}
                          <span className="capitalize">{log.weather_condition}</span>
                          {log.temperature && <span>· {log.temperature}°F</span>}
                        </span>
                      )}
                      {log.has_issues && (
                        <span className="text-xs font-medium text-red-500 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">Issue</span>
                      )}
                      {log.delays?.length > 0 && (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          {log.delays.length} delay{log.delays.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{log.created_by_name}</span>
                      {log.workers_on_site?.length > 0 && (
                        <span>· {log.workers_on_site.length + (log.subs_on_site?.length ?? 0)} on site</span>
                      )}
                      {(() => {
                        const photoCount = (log.daily_log_photos?.length ?? 0) || (log.photos?.length ?? 0)
                        return photoCount > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-xs font-medium">
                            <Camera className="h-3 w-3" />
                            {photoCount} photo{photoCount !== 1 ? 's' : ''}
                          </span>
                        ) : null
                      })()}
                    </p>
                  </div>
                  <div className="shrink-0 text-slate-400">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-5 space-y-5">

                    {/* Top bar: weather + location */}
                    <div className="flex flex-wrap gap-4 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-sm">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        {weatherIcon(log.weather_condition)}
                        <span className="capitalize font-medium">{log.weather_condition ?? 'No weather logged'}</span>
                        {log.temperature && <span className="text-slate-400">· {log.temperature}°F</span>}
                      </div>
                      <div className="text-slate-400">|</div>
                      <div className="text-slate-500 text-xs">
                        Logged by <span className="font-medium text-slate-700">{log.created_by_name}</span>
                        {' '}on {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Issue banner */}
                    {log.has_issues && (
                      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-4">
                        <div className="flex items-start gap-2">
                          <Flag className="h-4 w-4 text-red-500 shrink-0 mt-0.5 fill-red-400" />
                          <div>
                            <p className="text-sm font-semibold text-red-700">Issue Flagged</p>
                            {log.issue_description && <p className="text-sm text-red-600 mt-0.5">{log.issue_description}</p>}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setCreateTaskFromLog(log); setTaskTitle(log.issue_description ?? '') }}
                          className="shrink-0 border-red-300 text-red-600 hover:bg-red-50">
                          <CheckSquare className="h-3.5 w-3.5" />
                          Create Task
                        </Button>
                      </div>
                    )}

                    {/* Delays */}
                    {log.delays?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Delays</p>
                        <div className="space-y-1.5">
                          {log.delays.map((d, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 shrink-0">{d.type}</span>
                              <span className="text-slate-600">{d.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Notes */}
                      {log.notes && (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Log Notes</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{log.notes}</p>
                        </div>
                      )}

                      {/* Crew */}
                      <div className="space-y-3">
                        {log.workers_on_site?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">GC Crew on Site</p>
                            <div className="flex flex-wrap gap-1.5">
                              {log.workers_on_site.map((w, i) => (
                                <span key={i} className="text-xs bg-blue-50 border border-blue-100 text-blue-700 rounded-full px-2.5 py-0.5">
                                  {w.name}{w.role && <span className="text-blue-400 ml-1">({w.role})</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {log.subs_on_site?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Subs on Site</p>
                            <div className="flex flex-wrap gap-1.5">
                              {log.subs_on_site.map((s, i) => (
                                <span key={i} className="text-xs bg-orange-50 border border-orange-100 text-orange-700 rounded-full px-2.5 py-0.5">{s.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Photos */}
                    {(() => {
                      const dbPhotos = log.daily_log_photos ?? []
                      const legacyPhotos = log.photos ?? []
                      // Prefer daily_log_photos if populated, else fall back to legacy photos JSONB
                      const photoItems: { url: string; caption?: string }[] =
                        dbPhotos.length > 0
                          ? dbPhotos.map(p => ({ url: p.photo_url }))
                          : legacyPhotos.map(p => ({ url: p.url, caption: p.caption }))
                      if (photoItems.length === 0) return null
                      return (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            Site Photos <span className="normal-case font-normal text-slate-400">({photoItems.length})</span>
                          </p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {photoItems.map((p, i) => (
                              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-slate-200 hover:opacity-90 transition-opacity">
                                <img src={p.url} alt={p.caption || `Photo ${i + 1}`}
                                  className="h-full w-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
