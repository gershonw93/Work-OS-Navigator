'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { SignaturePad } from '@/components/ui/signature-pad'
import {
  Plus, X, ChevronDown, ChevronUp, BookOpen, AlertTriangle,
  CloudRain, Sun, Cloud, CloudSnow, Wind, Thermometer,
  Users, Building2, Camera, Clock, CheckSquare, Trash2, Flag, Pencil,
  ShieldAlert, BadgeCheck, Paperclip, FileText, Download, Send, PenLine,
} from 'lucide-react'

const SURVEY_QUESTIONS = [
  { key: 'accidents', label: 'Safety incidents or injuries today?' },
  { key: 'scheduled_delays', label: 'Did anything push the schedule?' },
  { key: 'weather_delays', label: 'Did weather slow the work?' },
  { key: 'visitors', label: 'Anyone visit the jobsite?' },
  { key: 'areas_blocked', label: 'Any work areas blocked or inaccessible?' },
  { key: 'equipment_rented', label: 'Rental equipment on site today?' },
] as const

const PHOTO_CATEGORIES = ['Work', 'Safety', 'Quality', 'General'] as const

type SurveyAnswer = { answer: 'na' | 'yes' | 'no'; description: string }
function blankSurvey(): Record<string, SurveyAnswer> {
  return Object.fromEntries(SURVEY_QUESTIONS.map(q => [q.key, { answer: 'na', description: '' }]))
}

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
  weather: string | null
  weather_condition: string | null  // alias fallback
  temp_f: number | null
  temperature: string | null        // alias fallback
  notes: string | null
  has_issues: boolean
  issue_description: string | null
  delays: { type: string; description: string }[]
  subs_on_site: { company_id: string; name: string; workers?: number }[]
  workers_on_site: { name: string; role: string }[]
  photos: { url: string; path: string; caption: string }[]
  daily_log_photos?: { id: string; photo_url: string; caption: string | null; subcontract_id: string | null; category: string | null; created_at: string }[]
  survey?: Record<string, SurveyAnswer> | null
  safety_observation?: string | null
  quality_observation?: string | null
  signed_by_name?: string | null
  signature_url?: string | null
  signed_at?: string | null
  daily_log_updates?: { id: string; body: string; created_by_name: string | null; created_at: string }[]
  daily_log_attachments?: { id: string; file_url: string; file_name: string | null }[]
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
  const [subsOnSite, setSubsOnSite] = useState<{ id: string; company_id: string; name: string; workers: number }[]>([])
  const [workersOnSite, setWorkersOnSite] = useState<{ name: string; role: string }[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [photoSubs, setPhotoSubs] = useState<string[]>([]) // subcontract id per photo index
  const [photoCats, setPhotoCats] = useState<string[]>([]) // category per photo index

  // Add-photos-to-existing-log (per expanded log)
  const [moreFiles, setMoreFiles] = useState<File[]>([])
  const [morePreviews, setMorePreviews] = useState<string[]>([])
  const [moreSubs, setMoreSubs] = useState<string[]>([])
  const [moreCats, setMoreCats] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const moreInputRef = useRef<HTMLInputElement>(null)

  // New field-report model
  const [survey, setSurvey] = useState<Record<string, SurveyAnswer>>(blankSurvey())
  const [safetyObs, setSafetyObs] = useState('')
  const [qualityObs, setQualityObs] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw')
  const [sigBlob, setSigBlob] = useState<Blob | null>(null)
  const [sigName, setSigName] = useState('')
  const attachInputRef = useRef<HTMLInputElement>(null)

  // Add-update-through-the-day (per expanded log)
  const [updateDraft, setUpdateDraft] = useState('')
  const [updatePosting, setUpdatePosting] = useState(false)

  // Weather auto-fill
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherChip, setWeatherChip] = useState<string | null>(null)
  const [projectAddress, setProjectAddress] = useState<string | null>(null)

  // Edit log
  const [editingLog, setEditingLog] = useState<DailyLog | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editLogDate, setEditLogDate] = useState('')
  const [editWorkersOnsite, setEditWorkersOnsite] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editWeather, setEditWeather] = useState('')
  const [editTempF, setEditTempF] = useState('')
  const [editSubsOnSite, setEditSubsOnSite] = useState<{ id: string; company_id: string; name: string; workers: number }[]>([])
  const [editCrewOnSite, setEditCrewOnSite] = useState<{ name: string; role: string }[]>([])
  const [editSafety, setEditSafety] = useState('')
  const [editQuality, setEditQuality] = useState('')
  const [editSurvey, setEditSurvey] = useState<Record<string, SurveyAnswer>>(blankSurvey())
  const [editSubmitting, setEditSubmitting] = useState(false)

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
    const body = await res.json()
    if (res.ok) setLogs(body.logs ?? [])
    else setError(`Load failed: ${body.error}`)
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
    setPhotoSubs(prev => [...prev, ...newFiles.map(() => '')])
    setPhotoCats(prev => [...prev, ...newFiles.map(() => '')])
    newFiles.forEach(f => {
      const reader = new FileReader()
      reader.onload = e => setPhotoPreviews(prev => [...prev, e.target?.result as string])
      reader.readAsDataURL(f)
    })
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx))
    setPhotoSubs(prev => prev.filter((_, i) => i !== idx))
    setPhotoCats(prev => prev.filter((_, i) => i !== idx))
  }

  function addMorePhotos(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files)
    setMoreFiles(prev => [...prev, ...arr])
    setMoreSubs(prev => [...prev, ...arr.map(() => '')])
    setMoreCats(prev => [...prev, ...arr.map(() => '')])
    arr.forEach(f => {
      const reader = new FileReader()
      reader.onload = e => setMorePreviews(prev => [...prev, e.target?.result as string])
      reader.readAsDataURL(f)
    })
  }

  function clearMorePhotos() {
    setMoreFiles([]); setMorePreviews([]); setMoreSubs([]); setMoreCats([])
  }

  async function tagPhoto(logId: string, photoId: string, patch: { subcontract_id?: string | null; category?: string | null }) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/daily-logs/${logId}/photos/${photoId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    })
    fetchLogs()
  }

  async function deletePhoto(logId: string, photoId: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/daily-logs/${logId}/photos/${photoId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    fetchLogs()
  }

  async function uploadMorePhotos(logId: string) {
    if (moreFiles.length === 0) return
    setPhotoUploading(true)
    const token = await getToken()
    const form = new FormData()
    moreFiles.forEach((f, i) => {
      form.append('photos', f)
      if (moreSubs[i]) form.append(`subId_${f.name}`, moreSubs[i])
      if (moreCats[i]) form.append(`cat_${f.name}`, moreCats[i])
    })
    try {
      const res = await fetch(`/api/projects/${params.id}/daily-logs/${logId}/photos`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      })
      if (res.ok) { clearMorePhotos(); fetchLogs() }
    } finally {
      setPhotoUploading(false)
    }
  }

  async function postUpdate(logId: string) {
    if (!updateDraft.trim()) return
    setUpdatePosting(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/daily-logs/${logId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: updateDraft }),
    })
    setUpdatePosting(false)
    if (res.ok) { setUpdateDraft(''); fetchLogs() }
  }

  async function downloadPdf(logId: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/daily-logs/${logId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `daily-log.pdf`; a.click()
    URL.revokeObjectURL(url)
  }

  function toggleSubOnSite(sub: SubContract) {
    const name = (sub.companies as any)?.name ?? sub.trade
    const exists = subsOnSite.find(s => s.id === sub.id)
    if (exists) setSubsOnSite(prev => prev.filter(s => s.id !== sub.id))
    else setSubsOnSite(prev => [...prev, { id: sub.id, company_id: sub.company_id ?? sub.id, name, workers: 0 }])
  }

  function setSubWorkers(id: string, workers: number) {
    setSubsOnSite(prev => prev.map(s => s.id === id ? { ...s, workers: Math.max(0, workers || 0) } : s))
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
    setPhotos([]); setPhotoPreviews([]); setPhotoSubs([]); setPhotoCats([]); setError(null)
    setWeatherChip(null)
    setSurvey(blankSurvey()); setSafetyObs(''); setQualityObs('')
    setAttachments([]); setSigBlob(null); setSigName(''); setSigMode('draw')
  }

  async function handleAutoFillWeather() {
    setWeatherLoading(true)
    try {
      let url = ''
      // Try GPS first
      const pos = await new Promise<GeolocationPosition | null>(resolve => {
        if (!navigator.geolocation) { resolve(null); return }
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 5000 })
      })
      if (pos) {
        url = `/api/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`
      } else if (projectAddress) {
        url = `/api/weather?address=${encodeURIComponent(projectAddress)}`
      } else {
        setWeatherLoading(false)
        return
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setWeatherCondition(data.weather)
        setTemperature(String(data.temp_f))
        setWeatherChip(`${data.weather} · ${data.temp_f}°F${data.wind_mph ? ` · ${data.wind_mph}mph` : ''}`)
      }
    } catch {
      // silently fail
    } finally {
      setWeatherLoading(false)
    }
  }

  function openEditLog(log: DailyLog) {
    setEditingLog(log)
    setEditLogDate(log.log_date)
    setEditWorkersOnsite(String(log.workers_on_site?.length ?? ''))
    setEditNotes(log.notes ?? '')
    setEditWeather((log.weather ?? log.weather_condition) ?? '')
    setEditTempF(log.temp_f != null ? String(log.temp_f) : (log.temperature ?? ''))
    setEditSubsOnSite((log.subs_on_site ?? []).map(s => ({ id: (s as any).id ?? s.company_id, company_id: s.company_id, name: s.name, workers: (s as any).workers ?? 0 })))
    setEditCrewOnSite((log.workers_on_site ?? []).map(w => ({ name: w.name, role: w.role })))
    setEditSafety(log.safety_observation ?? '')
    setEditQuality(log.quality_observation ?? '')
    setEditSurvey({ ...blankSurvey(), ...(log.survey ?? {}) })
    setShowEditModal(true)
  }

  function toggleEditSub(sub: SubContract) {
    const name = (sub.companies as any)?.name ?? sub.trade
    const exists = editSubsOnSite.find(s => s.id === sub.id)
    if (exists) setEditSubsOnSite(prev => prev.filter(s => s.id !== sub.id))
    else setEditSubsOnSite(prev => [...prev, { id: sub.id, company_id: sub.company_id ?? sub.id, name, workers: 0 }])
  }
  function setEditSubWorkers(id: string, workers: number) {
    setEditSubsOnSite(prev => prev.map(s => s.id === id ? { ...s, workers: Math.max(0, workers || 0) } : s))
  }

  function toggleEditCrew(m: TeamMember) {
    const exists = editCrewOnSite.find(w => w.name === m.name)
    if (exists) setEditCrewOnSite(prev => prev.filter(w => w.name !== m.name))
    else setEditCrewOnSite(prev => [...prev, { name: m.name, role: m.role }])
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingLog) return
    setEditSubmitting(true)
    const token = await getToken()
    const subWorkerTotal = editSubsOnSite.reduce((t, s) => t + (s.workers || 0), 0)
    const body: Record<string, unknown> = {
      log_date: editLogDate,
      notes: editNotes || null,
      weather: editWeather || null,
      workers_onsite: editCrewOnSite.length + subWorkerTotal,
      temp_f: editTempF !== '' ? Number(editTempF) : null,
      safety_observation: editSafety || null,
      quality_observation: editQuality || null,
      survey: editSurvey,
      subs_on_site: editSubsOnSite.map(s => ({ id: s.id, company_id: s.company_id, name: s.name, workers: s.workers || 0 })),
    }
    await fetch(`/api/projects/${params.id}/daily-logs/${editingLog.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    setShowEditModal(false)
    setEditingLog(null)
    setEditSubmitting(false)
    fetchLogs()
  }

  async function handleDeleteLog(logId: string) {
    if (!window.confirm('Delete this daily log? This cannot be undone.')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/daily-logs/${logId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchLogs()
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
    if (safetyObs) form.append('safety_observation', safetyObs)
    if (qualityObs) form.append('quality_observation', qualityObs)
    form.append('survey', JSON.stringify(survey))
    form.append('subs_on_site', JSON.stringify(subsOnSite))
    form.append('workers_on_site', JSON.stringify(workersOnSite))
    photos.forEach((f, i) => {
      form.append('photos', f)
      if (photoSubs[i]) form.append(`subId_${f.name}`, photoSubs[i])
      if (photoCats[i]) form.append(`cat_${f.name}`, photoCats[i])
    })
    attachments.forEach(f => form.append('attachments', f))
    // Signature
    if (sigMode === 'draw' && sigBlob) form.append('signature', new File([sigBlob], 'signature.png', { type: 'image/png' }))
    if (sigName.trim()) form.append('signed_by_name', sigName.trim())

    try {
      const res = await fetch(`/api/projects/${params.id}/daily-logs`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Save failed (${res.status}). If this persists, the daily-log database migration (012) may not be applied yet.`)
        return
      }
      resetForm()
      setShowForm(false)
      fetchLogs()
    } catch (err: any) {
      setError(err?.message ? `Save failed: ${err.message}` : 'Save failed — please try again.')
    } finally {
      setSubmitting(false)
    }
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

      {/* Edit log modal */}
      {showEditModal && editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Edit Daily Log</h2>
              <button onClick={() => { setShowEditModal(false); setEditingLog(null) }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Date</label>
                  <input type="date" value={editLogDate} onChange={e => setEditLogDate(e.target.value)} required
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Weather</label>
                  <div className="flex flex-wrap gap-2">
                    {WEATHER_OPTIONS.map(w => {
                      const Icon = w.icon
                      const active = editWeather === w.value
                      return (
                        <button key={w.value} type="button" onClick={() => setEditWeather(active ? '' : w.value)}
                          className={cn('flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                            active ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                          <Icon className="h-4 w-4" />
                          {w.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Temp (°F)</label>
                  <input type="number" value={editTempF} onChange={e => setEditTempF(e.target.value)} placeholder="e.g. 72"
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                </div>
                {teamMembers.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-ink-soft">GC Crew on Site</label>
                    <div className="flex flex-wrap gap-2">
                      {teamMembers.map(m => {
                        const active = editCrewOnSite.find(w => w.name === m.name)
                        return (
                          <button key={m.id} type="button" onClick={() => toggleEditCrew(m)}
                            className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                              active ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-accent' : 'bg-muted2')} />
                            {m.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Notes</label>
                  <textarea rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Any notes..."
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>

                {subcontracts.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-ink-soft">Subcontractors on Site</label>
                    <div className="flex flex-wrap gap-2">
                      {subcontracts.map(sub => {
                        const name = (sub.companies as any)?.name ?? sub.trade
                        const active = editSubsOnSite.find(s => s.id === sub.id)
                        return (
                          <button key={sub.id} type="button" onClick={() => toggleEditSub(sub)}
                            className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                              active ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-accent' : 'bg-muted2')} />
                            {name} <span className="text-faint">({sub.trade})</span>
                          </button>
                        )
                      })}
                    </div>
                    {editSubsOnSite.length > 0 && (
                      <div className="rounded-lg border border-line-soft divide-y divide-line-soft mt-1">
                        {editSubsOnSite.map(s => (
                          <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-sm text-ink-soft truncate">{s.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <label className="text-xs text-faint">Workers</label>
                              <input type="number" min={0} value={s.workers || ''} placeholder="0"
                                onChange={e => setEditSubWorkers(s.id, parseInt(e.target.value, 10))}
                                className="w-20 rounded-md border border-muted2 px-2 py-1 text-sm focus:outline-none focus:border-accent" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Site Safety Observation */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5 text-warn" /> Site Safety Observation</label>
                  <textarea rows={2} value={editSafety} onChange={e => setEditSafety(e.target.value)} placeholder="Hazards, near-misses, PPE, corrective actions…"
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>

                {/* Quality Control Observation */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5 text-success" /> Quality Control Observation</label>
                  <textarea rows={2} value={editQuality} onChange={e => setEditQuality(e.target.value)} placeholder="Workmanship, rework, deviations, inspections…"
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>

                {/* Daily survey */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Daily Survey</label>
                  <div className="rounded-lg border border-line divide-y divide-line-soft">
                    {SURVEY_QUESTIONS.map(q => {
                      const a = editSurvey[q.key]
                      return (
                        <div key={q.key} className="p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-ink-soft">{q.label}</span>
                            <div className="inline-flex rounded-lg border border-line overflow-hidden">
                              {(['na', 'yes', 'no'] as const).map(opt => (
                                <button key={opt} type="button"
                                  onClick={() => setEditSurvey(prev => ({ ...prev, [q.key]: { ...prev[q.key], answer: opt } }))}
                                  className={cn('px-3 py-1 text-xs font-medium capitalize transition-colors',
                                    a.answer === opt ? (opt === 'yes' ? 'bg-accent text-accent-ink' : opt === 'no' ? 'bg-muted2 text-ink' : 'bg-muted text-muted-fg') : 'bg-panel text-muted-fg hover:bg-surface')}>
                                  {opt === 'na' ? 'N/A' : opt}
                                </button>
                              ))}
                            </div>
                          </div>
                          {a.answer !== 'na' && (
                            <input type="text" placeholder="Add a description…" value={a.description}
                              onChange={e => setEditSurvey(prev => ({ ...prev, [q.key]: { ...prev[q.key], description: e.target.value } }))}
                              className="w-full rounded-md border border-muted2 px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <button type="button" onClick={() => { setShowEditModal(false); setEditingLog(null) }}
                  className="rounded-md border border-muted2 px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface">Cancel</button>
                <button type="submit" disabled={editSubmitting}
                  className="rounded-md bg-accent hover:bg-accent text-accent-ink px-3 py-2 text-sm font-medium disabled:opacity-60">
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create task modal */}
      {createTaskFromLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Create Task from Issue</h2>
                <p className="text-xs text-muted-fg mt-0.5">Log: {new Date(createTaskFromLog.log_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <button onClick={() => setCreateTaskFromLog(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                {createTaskFromLog.issue_description && (
                  <div className="rounded-lg bg-warn-tint border border-warn/30 px-3 py-2 text-sm text-warn">
                    <p className="font-medium text-xs text-warn mb-0.5">Issue logged</p>
                    {createTaskFromLog.issue_description}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Task Title</Label>
                  <Input autoFocus value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Fix water intrusion on north wall" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Description <span className="text-faint font-normal">(optional)</span></Label>
                  <textarea rows={2} value={taskDescription} onChange={e => setTaskDescription(e.target.value)}
                    placeholder="Additional context..."
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['low', 'medium', 'high', 'urgent'].map(p => (
                        <button key={p} type="button" onClick={() => setTaskPriority(p)}
                          className={cn('rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition-colors',
                            taskPriority === p ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Due Date <span className="text-faint font-normal">(optional)</span></Label>
                    <Input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Assign To <span className="text-faint font-normal">(optional)</span></Label>
                  <div className="flex gap-2 mb-2">
                    {(['', 'member', 'sub'] as const).map(t => (
                      <button key={t} type="button" onClick={() => { setTaskAssigneeType(t); setTaskAssigneeId('') }}
                        className={cn('flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                          taskAssigneeType === t ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                        {t === '' ? 'Unassigned' : t === 'member' ? 'GC Crew' : 'Subcontractor'}
                      </button>
                    ))}
                  </div>
                  {taskAssigneeType === 'member' && teamMembers.length > 0 && (
                    <SearchableSelect value={taskAssigneeId} onChange={e => setTaskAssigneeId(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">Select crew member...</option>
                      {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                    </SearchableSelect>
                  )}
                  {taskAssigneeType === 'sub' && subcontracts.length > 0 && (
                    <SearchableSelect value={taskAssigneeId} onChange={e => setTaskAssigneeId(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">Select subcontractor...</option>
                      {subcontracts.map(s => <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade} — {s.trade}</option>)}
                    </SearchableSelect>
                  )}
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
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
          <h1 className="text-2xl font-bold text-ink">Daily Logs</h1>
          <p className="text-sm text-muted-fg mt-0.5">Field reports, site conditions, and crew activity.</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4" /> New Log
        </Button>
      </div>

      {/* New Log Form */}
      {showForm && (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h2 className="font-semibold text-ink">New Daily Log</h2>
            <button onClick={() => setShowForm(false)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
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
                      <span className="text-xs font-medium bg-accent-tint text-accent-fg border border-accent/40 rounded-full px-2 py-0.5">
                        {weatherChip}
                      </span>
                    )}
                    <button
                        type="button"
                        onClick={handleAutoFillWeather}
                        disabled={weatherLoading}
                        className="text-xs border border-muted2 rounded-md px-2 py-0.5 text-muted-fg hover:border-accent hover:text-accent-fg transition-colors disabled:opacity-50"
                      >
                        {weatherLoading ? 'Fetching...' : 'Auto-fill weather'}
                      </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  {WEATHER_OPTIONS.map(w => {
                    const Icon = w.icon
                    return (
                      <button key={w.value} type="button" onClick={() => setWeatherCondition(weatherCondition === w.value ? '' : w.value)}
                        title={w.label}
                        className={cn('flex-1 flex flex-col items-center gap-0.5 rounded-lg border py-2 text-xs transition-colors',
                          weatherCondition === w.value ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:block">{w.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temperature">
                  <Thermometer className="inline h-3.5 w-3.5 mr-1 text-faint" />Temp (°F)
                </Label>
                <Input id="temperature" type="number" placeholder="e.g. 72" value={temperature} onChange={e => setTemperature(e.target.value)} />
              </div>
            </div>

            {/* Workers on site */}
            {teamMembers.length > 0 && (
              <div className="space-y-2">
                <Label><Users className="inline h-3.5 w-3.5 mr-1 text-faint" />GC Crew on Site</Label>
                <div className="flex flex-wrap gap-2">
                  {teamMembers.map(m => {
                    const active = workersOnSite.find(w => w.name === m.name)
                    return (
                      <button key={m.id} type="button" onClick={() => toggleWorkerOnSite(m)}
                        className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          active ? 'border-blue-400 bg-info-tint text-info' : 'border-line text-muted-fg hover:border-muted2')}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-info-solid' : 'bg-muted2')} />
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
                <Label><Building2 className="inline h-3.5 w-3.5 mr-1 text-faint" />Subcontractors on Site</Label>
                <div className="flex flex-wrap gap-2">
                  {subcontracts.map(sub => {
                    const name = (sub.companies as any)?.name ?? sub.trade
                    const active = subsOnSite.find(s => s.id === sub.id)
                    return (
                      <button key={sub.id} type="button" onClick={() => toggleSubOnSite(sub)}
                        className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          active ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-accent' : 'bg-muted2')} />
                        {name}
                        <span className="text-faint">({sub.trade})</span>
                      </button>
                    )
                  })}
                </div>
                {/* Per-sub worker counts */}
                {subsOnSite.length > 0 && (
                  <div className="rounded-lg border border-line-soft divide-y divide-line-soft mt-1">
                    {subsOnSite.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm text-ink-soft truncate">{s.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-xs text-faint">Workers</label>
                          <input type="number" min={0} value={s.workers || ''} placeholder="0"
                            onChange={e => setSubWorkers(s.id, parseInt(e.target.value, 10))}
                            className="w-20 rounded-md border border-muted2 px-2 py-1 text-sm text-ink-soft focus:outline-none focus:border-accent" />
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-surface text-sm">
                      <span className="font-medium text-ink-soft">Total sub workers</span>
                      <span className="font-semibold text-ink">{subsOnSite.reduce((t, s) => t + (s.workers || 0), 0)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* General notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">General Notes</Label>
              <textarea id="notes" rows={3} placeholder="What happened on site today? Progress made, observations, anything notable..."
                value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
              {/* General-notes attachments */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachments.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-ink-soft">
                      <FileText className="h-3 w-3 text-faint" /> {f.name}
                      <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-faint hover:text-danger"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <label className="inline-flex items-center gap-1.5 text-xs text-accent-fg hover:underline cursor-pointer w-fit">
                <Paperclip className="h-3.5 w-3.5" /> Attach a file
                <input ref={attachInputRef} type="file" multiple className="sr-only"
                  onChange={e => { if (e.target.files) setAttachments(prev => [...prev, ...Array.from(e.target.files!)]) }} />
              </label>
            </div>

            {/* Site Safety Observation */}
            <div className="space-y-1.5">
              <Label><ShieldAlert className="inline h-3.5 w-3.5 mr-1 text-warn" />Site Safety Observation</Label>
              <textarea rows={2} placeholder="Hazards, near-misses, PPE, housekeeping, corrective actions taken…"
                value={safetyObs} onChange={e => setSafetyObs(e.target.value)}
                className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
            </div>

            {/* Quality Control Observation */}
            <div className="space-y-1.5">
              <Label><BadgeCheck className="inline h-3.5 w-3.5 mr-1 text-success" />Quality Control Observation</Label>
              <textarea rows={2} placeholder="Workmanship, rework, deviations from spec, inspections passed/failed…"
                value={qualityObs} onChange={e => setQualityObs(e.target.value)}
                className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
            </div>

            {/* Daily survey */}
            <div className="space-y-2">
              <Label><CheckSquare className="inline h-3.5 w-3.5 mr-1 text-faint" />Daily Survey</Label>
              <div className="rounded-lg border border-line divide-y divide-line-soft">
                {SURVEY_QUESTIONS.map(q => {
                  const a = survey[q.key]
                  return (
                    <div key={q.key} className="p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-ink-soft">{q.label}</span>
                        <div className="inline-flex rounded-lg border border-line overflow-hidden">
                          {(['na', 'yes', 'no'] as const).map(opt => (
                            <button key={opt} type="button"
                              onClick={() => setSurvey(prev => ({ ...prev, [q.key]: { ...prev[q.key], answer: opt } }))}
                              className={cn('px-3 py-1 text-xs font-medium capitalize transition-colors',
                                a.answer === opt
                                  ? (opt === 'yes' ? 'bg-accent text-accent-ink' : opt === 'no' ? 'bg-muted2 text-ink' : 'bg-muted text-muted-fg')
                                  : 'bg-panel text-muted-fg hover:bg-surface')}>
                              {opt === 'na' ? 'N/A' : opt}
                            </button>
                          ))}
                        </div>
                      </div>
                      {a.answer !== 'na' && (
                        <input type="text" placeholder="Add a description…" value={a.description}
                          onChange={e => setSurvey(prev => ({ ...prev, [q.key]: { ...prev[q.key], description: e.target.value } }))}
                          className="w-full rounded-md border border-muted2 px-2.5 py-1.5 text-sm text-ink-soft focus:outline-none focus:border-accent" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Work log photos — taggable per sub */}
            <div className="space-y-2">
              <Label><Camera className="inline h-3.5 w-3.5 mr-1 text-faint" />Work Log Photos</Label>
              {photoPreviews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photoPreviews.map((src, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="relative group">
                        <img src={src} alt="" className="h-24 w-full object-cover rounded-lg border border-line" />
                        <button type="button" onClick={() => removePhoto(i)}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-danger-solid text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <SearchableSelect value={photoSubs[i] ?? ''}
                        onChange={e => setPhotoSubs(prev => prev.map((s, j) => j === i ? e.target.value : s))}
                        className="text-xs">
                        <option value="">No sub</option>
                        {subcontracts.map(s => <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade}</option>)}
                      </SearchableSelect>
                      <SearchableSelect value={photoCats[i] ?? ''}
                        onChange={e => setPhotoCats(prev => prev.map((c, j) => j === i ? e.target.value : c))}
                        className="text-xs">
                        <option value="">Tag part…</option>
                        {PHOTO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </SearchableSelect>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-2.5 text-sm text-faint hover:border-accent hover:text-accent-fg transition-colors cursor-pointer">
                <Camera className="h-4 w-4" /> Add Photos
                <input ref={photoInputRef} type="file" multiple accept="image/*" className="sr-only" onChange={e => addPhoto(e.target.files)} />
              </label>
              <p className="text-xs text-faint">Tag each photo to the sub it belongs to.</p>
            </div>

            {/* Signature — site manager */}
            <div className="space-y-2">
              <Label><PenLine className="inline h-3.5 w-3.5 mr-1 text-faint" />Site Manager Signoff</Label>
              <div className="inline-flex rounded-lg border border-line p-0.5">
                {(['draw', 'type'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setSigMode(m)}
                    className={cn('px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors',
                      sigMode === m ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:text-ink')}>
                    {m === 'draw' ? 'Draw' : 'Type name'}
                  </button>
                ))}
              </div>
              {sigMode === 'draw'
                ? <SignaturePad onChange={setSigBlob} />
                : <Input placeholder="Type full name to sign" value={sigName} onChange={e => setSigName(e.target.value)} />}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Submit Log'}</Button>
            </div>
          </form>
        </div>
      )}

      {/* Logs list */}
      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : logs.length === 0 && !showForm ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <BookOpen className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No logs yet</p>
          <p className="text-xs text-faint mt-1">Submit your first daily log to track site activity.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const isExpanded = expandedLog === log.id
            const dateLabel = new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

            return (
              <div key={log.id} className={cn('rounded-xl border bg-panel overflow-hidden transition-colors',
                log.has_issues ? 'border-danger/30' : 'border-line')}>

                {/* Log row */}
                <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left"
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                  <div className="shrink-0">
                    {log.has_issues
                      ? <AlertTriangle className="h-5 w-5 text-danger" />
                      : <div className="h-5 w-5 rounded-full bg-success-tint flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-success-solid" />
                        </div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-ink">{dateLabel}</span>
                      {(log.weather ?? log.weather_condition) && (
                        <span className="flex items-center gap-1 text-xs text-muted-fg">
                          {weatherIcon(log.weather ?? log.weather_condition)}
                          <span className="capitalize">{log.weather ?? log.weather_condition}</span>
                          {log.temperature && <span>· {log.temperature}°F</span>}
                        </span>
                      )}
                      {log.has_issues && (
                        <span className="text-xs font-medium text-danger bg-danger-tint border border-danger/30 rounded-full px-2 py-0.5">Issue</span>
                      )}
                      {log.delays?.length > 0 && (
                        <span className="text-xs font-medium text-warn bg-warn-tint border border-warn/30 rounded-full px-2 py-0.5">
                          {log.delays.length} delay{log.delays.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-faint mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{log.created_by_name}</span>
                      {log.workers_on_site?.length > 0 && (
                        <span>· {log.workers_on_site.length + (log.subs_on_site?.length ?? 0)} on site</span>
                      )}
                      {(() => {
                        const photoCount = (log.daily_log_photos?.length ?? 0) || (log.photos?.length ?? 0)
                        return photoCount > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-muted border border-line text-muted-fg rounded-full px-2 py-0.5 text-xs font-medium">
                            <Camera className="h-3 w-3" />
                            {photoCount} photo{photoCount !== 1 ? 's' : ''}
                          </span>
                        ) : null
                      })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-faint">
                    <button type="button" onClick={e => { e.stopPropagation(); openEditLog(log) }}
                      className="p-1 text-faint hover:text-muted-fg" title="Edit log">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); handleDeleteLog(log.id) }}
                      className="p-1 text-danger hover:text-danger" title="Delete log">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-line-soft px-5 py-5 space-y-5">

                    {/* Top bar: weather + location */}
                    <div className="flex flex-wrap gap-4 rounded-lg bg-surface border border-line-soft px-4 py-3 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-fg">
                        {weatherIcon(log.weather ?? log.weather_condition)}
                        <span className="capitalize font-medium">{log.weather ?? log.weather_condition ?? 'No weather logged'}</span>
                        {log.temperature && <span className="text-faint">· {log.temperature}°F</span>}
                      </div>
                      <div className="text-faint">|</div>
                      <div className="text-muted-fg text-xs">
                        Logged by <span className="font-medium text-ink-soft">{log.created_by_name}</span>
                        {' '}on {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Export */}
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => downloadPdf(log.id)}>
                        <Download className="h-3.5 w-3.5" /> Download PDF
                      </Button>
                    </div>

                    {/* Safety observation */}
                    {log.safety_observation && (
                      <div className="rounded-lg bg-warn-tint border border-warn/30 px-4 py-3 flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-4">
                        <div className="flex items-start gap-2">
                          <ShieldAlert className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-warn">Site Safety Observation</p>
                            <p className="text-sm text-ink-soft mt-0.5">{log.safety_observation}</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setCreateTaskFromLog(log); setTaskTitle(log.safety_observation ?? '') }}
                          className="shrink-0">
                          <CheckSquare className="h-3.5 w-3.5" /> Create Task
                        </Button>
                      </div>
                    )}

                    {/* Quality observation */}
                    {log.quality_observation && (
                      <div className="rounded-lg bg-success-tint border border-success/30 px-4 py-3 flex items-start gap-2">
                        <BadgeCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-success">Quality Control Observation</p>
                          <p className="text-sm text-ink-soft mt-0.5">{log.quality_observation}</p>
                        </div>
                      </div>
                    )}

                    {/* Daily survey */}
                    {log.survey && Object.keys(log.survey).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">Daily Survey</p>
                        <div className="rounded-lg border border-line-soft divide-y divide-line-soft">
                          {SURVEY_QUESTIONS.map(q => {
                            const a = log.survey?.[q.key]
                            if (!a) return null
                            return (
                              <div key={q.key} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                  <span className="text-ink-soft">{q.label}</span>
                                  {a.description && <p className="text-xs text-faint mt-0.5">{a.description}</p>}
                                </div>
                                <span className={cn('shrink-0 text-xs font-semibold rounded-full px-2 py-0.5',
                                  a.answer === 'yes' ? 'bg-accent-tint text-accent-fg' : a.answer === 'no' ? 'bg-muted text-muted-fg' : 'bg-muted text-faint')}>
                                  {a.answer === 'na' ? 'N/A' : a.answer.toUpperCase()}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Notes */}
                      {log.notes && (
                        <div>
                          <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-1.5">Log Notes</p>
                          <p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">{log.notes}</p>
                        </div>
                      )}

                      {/* Crew */}
                      <div className="space-y-3">
                        {log.workers_on_site?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-1.5">GC Crew on Site</p>
                            <div className="flex flex-wrap gap-1.5">
                              {log.workers_on_site.map((w, i) => (
                                <span key={i} className="text-xs bg-info-tint border border-blue-100 text-info rounded-full px-2.5 py-0.5">
                                  {w.name}{w.role && <span className="text-info ml-1">({w.role})</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {log.subs_on_site?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-1.5">Subs on Site</p>
                            <div className="flex flex-wrap gap-1.5">
                              {log.subs_on_site.map((s, i) => (
                                <span key={i} className="text-xs bg-accent-tint border border-accent/20 text-accent-fg rounded-full px-2.5 py-0.5">
                                  {s.name}{s.workers ? ` · ${s.workers} worker${s.workers !== 1 ? 's' : ''}` : ''}
                                </span>
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
                      const subName = (id: string | null) => {
                        if (!id) return null
                        const s = subcontracts.find(x => x.id === id)
                        return s ? ((s.companies as any)?.name ?? s.trade) : null
                      }
                      const total = dbPhotos.length || legacyPhotos.length
                      return (
                        <div>
                          <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">
                            Work Log Photos <span className="normal-case font-normal text-faint">({total})</span>
                          </p>
                          {dbPhotos.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                              {dbPhotos.map(p => (
                                <div key={p.id} className="space-y-1">
                                  <div className="relative group">
                                    <a href={p.photo_url} target="_blank" rel="noopener noreferrer">
                                      <div className="aspect-square overflow-hidden rounded-lg border border-line">
                                        <img src={p.photo_url} alt={p.caption || 'Photo'} className="h-full w-full object-cover group-hover:opacity-90 transition-opacity" />
                                      </div>
                                    </a>
                                    <button onClick={() => deletePhoto(log.id, p.id)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-danger-solid text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                                  </div>
                                  {/* Tag later: sub + category */}
                                  <div className="grid grid-cols-2 gap-1">
                                    <SearchableSelect value={p.subcontract_id ?? ''} onChange={e => tagPhoto(log.id, p.id, { subcontract_id: e.target.value || null })} className="text-xs h-8">
                                      <option value="">No sub</option>
                                      {subcontracts.map(s => <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade}</option>)}
                                    </SearchableSelect>
                                    <SearchableSelect value={p.category ?? ''} onChange={e => tagPhoto(log.id, p.id, { category: e.target.value || null })} className="text-xs h-8">
                                      <option value="">Tag part…</option>
                                      {PHOTO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </SearchableSelect>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {dbPhotos.length === 0 && legacyPhotos.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                              {legacyPhotos.map((p, i) => (
                                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-line">
                                  <img src={p.url} alt={p.caption || `Photo ${i + 1}`} className="h-full w-full object-cover" />
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Add photos to this log (throughout the day) */}
                          {expandedLog === log.id && (
                            <div className="rounded-lg border border-dashed border-line p-3 space-y-3">
                              {morePreviews.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  {morePreviews.map((src, i) => (
                                    <div key={i} className="space-y-1.5">
                                      <div className="relative group">
                                        <img src={src} alt="" className="h-24 w-full object-cover rounded-lg border border-line" />
                                        <button type="button" onClick={() => {
                                          setMoreFiles(p => p.filter((_, j) => j !== i)); setMorePreviews(p => p.filter((_, j) => j !== i))
                                          setMoreSubs(p => p.filter((_, j) => j !== i)); setMoreCats(p => p.filter((_, j) => j !== i))
                                        }} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-danger-solid text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                                      </div>
                                      <SearchableSelect value={moreSubs[i] ?? ''} onChange={e => setMoreSubs(p => p.map((s, j) => j === i ? e.target.value : s))} className="text-xs">
                                        <option value="">No sub</option>
                                        {subcontracts.map(s => <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade}</option>)}
                                      </SearchableSelect>
                                      <SearchableSelect value={moreCats[i] ?? ''} onChange={e => setMoreCats(p => p.map((c, j) => j === i ? e.target.value : c))} className="text-xs">
                                        <option value="">Tag part…</option>
                                        {PHOTO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                      </SearchableSelect>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted-fg hover:bg-surface cursor-pointer">
                                  <Camera className="h-3.5 w-3.5" /> Add photos
                                  <input ref={moreInputRef} type="file" multiple accept="image/*" className="sr-only" onChange={e => addMorePhotos(e.target.files)} />
                                </label>
                                {moreFiles.length > 0 && (
                                  <Button size="sm" onClick={() => uploadMorePhotos(log.id)} disabled={photoUploading}>
                                    {photoUploading ? 'Uploading…' : `Upload ${moreFiles.length} photo${moreFiles.length !== 1 ? 's' : ''}`}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Attachments */}
                    {(log.daily_log_attachments?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {log.daily_log_attachments!.map(a => (
                            <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:bg-surface">
                              <FileText className="h-3.5 w-3.5 text-faint" /> {a.file_name ?? 'File'}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Updates through the day */}
                    <div>
                      <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">Updates Through the Day</p>
                      <div className="space-y-2">
                        {(log.daily_log_updates ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map(u => (
                          <div key={u.id} className="flex gap-2.5 text-sm">
                            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                            <div className="min-w-0">
                              <p className="text-ink-soft">{u.body}</p>
                              <p className="text-xs text-faint">
                                {new Date(u.created_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                {u.created_by_name ? ` · ${u.created_by_name}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                        {(log.daily_log_updates?.length ?? 0) === 0 && (
                          <p className="text-xs text-faint">No updates yet. Add one as the day goes on.</p>
                        )}
                      </div>
                      {expandedLog === log.id && (
                        <div className="flex gap-2 mt-2">
                          <input type="text" placeholder="Add an update…" value={updateDraft}
                            onChange={e => setUpdateDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); postUpdate(log.id) } }}
                            className="flex-1 rounded-md border border-muted2 px-3 py-1.5 text-sm text-ink-soft focus:outline-none focus:border-accent" />
                          <Button size="sm" onClick={() => postUpdate(log.id)} disabled={updatePosting || !updateDraft.trim()}>
                            <Send className="h-3.5 w-3.5" /> Post
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Signature */}
                    {(log.signature_url || log.signed_by_name) && (
                      <div>
                        <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">Site Manager Signoff</p>
                        {log.signature_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={log.signature_url} alt="Signature" className="h-20 rounded-lg border border-line bg-panel p-1" />
                        )}
                        {log.signed_by_name && <p className="text-sm text-ink-soft mt-1">Signed by {log.signed_by_name}</p>}
                        {log.signed_at && <p className="text-xs text-faint">{new Date(log.signed_at).toLocaleString('en-US')}</p>}
                      </div>
                    )}
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
