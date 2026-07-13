'use client'

import { useEffect, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Calendar, DollarSign, CheckCircle2, Clock,
  XCircle, AlertCircle, Plus, X, Phone, Trash2, Paperclip, TrendingUp, Zap,
  ShieldCheck, Upload, RefreshCw, AlertTriangle, FileWarning, Pencil,
  Cloud, FileCheck, Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Tab = 'overview' | 'tasks' | 'rfis' | 'inspections' | 'invoices' | 'compliance'

interface CoItem { description: string; qty: string; unit_price: string }

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-surface border-line text-muted-fg',
  in_progress: 'bg-info-tint border-info/30 text-info',
  completed: 'bg-success-tint border-success/30 text-success',
  pending: 'bg-warn-tint border-warn/30 text-warn',
  paid: 'bg-success-tint border-success/30 text-success',
  approved: 'bg-success-tint border-success/30 text-success',
  denied: 'bg-danger-tint border-danger/30 text-danger',
  revision_requested: 'bg-warn-tint border-warn/30 text-warn',
  sent: 'bg-special-tint border-special/30 text-special',
  pending_approval: 'bg-warn-tint border-warn/30 text-warn',
  passed: 'bg-success-tint border-success/30 text-success',
  failed: 'bg-danger-tint border-danger/30 text-danger',
  scheduled: 'bg-info-tint border-info/30 text-info',
  not_scheduled: 'bg-surface border-line text-muted-fg',
}

const CO_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  denied: 'Denied',
  revision_requested: 'Revision Requested',
}

export default function SubJobDetailPage({ params }: { params: { projectId: string } }) {
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [rfiError, setRfiError] = useState('')
  const [selectedRfi, setSelectedRfi] = useState<any>(null)
  const [selectedInspection, setSelectedInspection] = useState<any>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskSaving, setTaskSaving] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [billingProgress, setBillingProgress] = useState<Record<string, string>>({})
  const [billingLoading, setBillingLoading] = useState<string | null>(null)
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null)
  const [billingError, setBillingError] = useState<Record<string, string>>({})

  // Edit project
  const [showEditProject, setShowEditProject] = useState(false)
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectAddress, setEditProjectAddress] = useState('')
  const [editProjectStatus, setEditProjectStatus] = useState('')
  const [editProjectSaving, setEditProjectSaving] = useState(false)

  // Compliance
  const [complianceDocs, setComplianceDocs] = useState<any[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [openComplianceForm, setOpenComplianceForm] = useState<string | null>(null) // `${docType}`
  const [complianceFormState, setComplianceFormState] = useState<Record<string, { status: string; expiry: string; fileUrl: string; notes: string; saving: boolean; error: string }>>({})

  // Invoice form
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [invoiceSubId, setInvoiceSubId] = useState('')
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false)
  const [invoiceError, setInvoiceError] = useState('')

  // Daily log form
  const [showLogForm, setShowLogForm] = useState(false)
  const [logDate, setLogDate] = useState('')
  const [logNotes, setLogNotes] = useState('')
  const [logWeather, setLogWeather] = useState('')
  const [logHasIssues, setLogHasIssues] = useState(false)
  const [logIssue, setLogIssue] = useState('')
  const [logSubmitting, setLogSubmitting] = useState(false)
  const [logError, setLogError] = useState('')

  // Compliance file upload
  const [complianceUploading, setComplianceUploading] = useState<Record<string, boolean>>({})

  // Lien waiver
  const [lienWaiverUploading, setLienWaiverUploading] = useState<Record<string, boolean>>({})
  const [lienWaiverError, setLienWaiverError] = useState<Record<string, string>>({})

  // RFI form
  const [showRfiForm, setShowRfiForm] = useState(false)
  const [rfiSubject, setRfiSubject] = useState('')
  const [rfiDescription, setRfiDescription] = useState('')
  const [rfiIsChangeOrder, setRfiIsChangeOrder] = useState(false)
  const [rfiCoDescription, setRfiCoDescription] = useState('')
  const [rfiCoItems, setRfiCoItems] = useState<CoItem[]>([{ description: '', qty: '1', unit_price: '' }])
  const [rfiFiles, setRfiFiles] = useState<File[]>([])
  const [rfiSubmitting, setRfiSubmitting] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/my-jobs/${params.projectId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      setData(await res.json())
    } else {
      const err = await res.json().catch(() => ({}))
      setData({ error: err.error || `HTTP ${res.status}` })
    }
    setLoading(false)
  }

  async function loadCompliance() {
    setComplianceLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.projectId}/compliance`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const json = await res.json()
      setComplianceDocs(json.docs ?? [])
    }
    setComplianceLoading(false)
  }

  function openEditProject() {
    setEditProjectName(data?.project?.name ?? '')
    setEditProjectAddress(data?.project?.address ?? '')
    setEditProjectStatus(data?.project?.status ?? '')
    setShowEditProject(true)
  }

  async function handleEditProject(e: React.FormEvent) {
    e.preventDefault()
    setEditProjectSaving(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: editProjectName,
        address: editProjectAddress || null,
        status: editProjectStatus || null,
      }),
    })
    setEditProjectSaving(false)
    setShowEditProject(false)
    load()
  }

  useEffect(() => { load() }, [params.projectId])
  useEffect(() => { if (activeTab === 'compliance') loadCompliance() }, [activeTab])

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    setTaskSaving(true)
    const token = await getToken()
    const companyId = data?.subcontracts?.[0]?.company_id ?? null
    const companyName = data?.subcontracts?.[0]?.company_name ?? null
    await fetch(`/api/projects/${params.projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: taskTitle, description: taskDesc || null,
        due_date: taskDue || null, priority: taskPriority,
        assigned_to_company_id: companyId,
        assigned_to_name: companyName,
      }),
    })
    setTaskTitle(''); setTaskDesc(''); setTaskDue(''); setTaskPriority('medium')
    setShowTaskForm(false); setTaskSaving(false); load()
  }

  async function toggleTaskStatus(task: any) {
    const next = task.status === 'completed' ? 'open' : 'completed'
    const token = await getToken()
    await fetch(`/api/projects/${params.projectId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: next }),
    })
    load()
  }

  async function submitBilling(sub: any, billingType: string) {
    setBillingLoading(sub.id)
    setBillingError(prev => ({ ...prev, [sub.id]: '' }))
    const token = await getToken()
    const body: any = { billing_type: billingType }
    if (billingType === 'percent') body.progress_percent = parseFloat(billingProgress[sub.id] ?? '0')
    if (billingType === 'weekly') body.week_start = new Date().toISOString().split('T')[0]

    const res = await fetch(`/api/projects/${params.projectId}/subcontracts/${sub.id}/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      setBillingError(prev => ({ ...prev, [sub.id]: json.error ?? 'Failed to generate invoice' }))
    } else {
      setBillingSuccess(sub.id)
      setTimeout(() => setBillingSuccess(null), 3000)
      load()
    }
    setBillingLoading(null)
  }

  // Auto-generate weekly invoice if billing_type is weekly and no invoice this week
  async function checkWeeklyBilling(sub: any) {
    if (sub.billing_type !== 'weekly' || !sub.weekly_amount) return
    const token = await getToken()
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekStartStr = weekStart.toISOString().split('T')[0]
    // Check if invoice already exists for this week
    const existing = (data?.invoices ?? []).find((inv: any) =>
      inv.subcontract_id === sub.id &&
      inv.description?.includes(weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    )
    if (!existing) {
      await fetch(`/api/projects/${params.projectId}/subcontracts/${sub.id}/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billing_type: 'weekly', week_start: weekStartStr }),
      })
      load()
    }
  }

  function coTotal(items: CoItem[]) {
    return items.reduce((sum, i) => sum + (parseFloat(i.qty || '0') * parseFloat(i.unit_price || '0')), 0)
  }

  async function submitRfi(e: React.FormEvent) {
    e.preventDefault()
    setRfiSubmitting(true)
    setRfiError('')
    const token = await getToken()
    const companyId = data?.subcontracts?.[0]?.company_id ?? null
    const companyName = data?.subcontracts?.[0]?.company_name ?? null

    const items = rfiIsChangeOrder ? rfiCoItems.filter(i => i.description.trim()) : []
    const total = rfiIsChangeOrder ? coTotal(items) : null

    // Upload attachments to Supabase storage
    const attachments: { name: string; url: string; size: number }[] = []
    for (const file of rfiFiles) {
      const path = `${params.projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { data: uploaded, error: upErr } = await supabase.storage.from('rfi-attachments').upload(path, file)
      if (!upErr && uploaded) {
        const { data: { publicUrl } } = supabase.storage.from('rfi-attachments').getPublicUrl(uploaded.path)
        attachments.push({ name: file.name, url: publicUrl, size: file.size })
      }
    }

    const res = await fetch(`/api/projects/${params.projectId}/rfis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subject: rfiSubject,
        description: rfiDescription,
        is_change_order: rfiIsChangeOrder,
        change_order_description: rfiIsChangeOrder ? rfiCoDescription : null,
        change_order_items: rfiIsChangeOrder ? items : null,
        change_order_amount: total,
        attachments: attachments.length > 0 ? attachments : null,
        company_id: companyId,
        company_name: companyName,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setRfiError(err.error || 'Failed to submit RFI. Please try again.')
      setRfiSubmitting(false)
      return
    }

    setRfiSubject(''); setRfiDescription(''); setRfiIsChangeOrder(false)
    setRfiCoDescription(''); setRfiCoItems([{ description: '', qty: '1', unit_price: '' }])
    setRfiFiles([])
    setShowRfiForm(false); setRfiSubmitting(false)
    load()
  }

  async function submitInvoice(e: React.FormEvent) {
    e.preventDefault()
    setInvoiceSubmitting(true)
    setInvoiceError('')
    const token = await getToken()
    const sub = invoiceSubId
      ? data?.subcontracts?.find((s: any) => s.id === invoiceSubId)
      : data?.subcontracts?.[0]
    const res = await fetch(`/api/projects/${params.projectId}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subcontract_id: sub?.id ?? null,
        company_id: sub?.company_id ?? null,
        company_name: sub?.company_name ?? null,
        amount: parseFloat(invoiceAmount),
        description: invoiceDesc || null,
        due_date: invoiceDueDate || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setInvoiceError(err.error || 'Failed to submit invoice. Please try again.')
      setInvoiceSubmitting(false)
      return
    }
    setInvoiceAmount(''); setInvoiceDesc(''); setInvoiceDueDate(''); setInvoiceSubId('')
    setShowInvoiceForm(false); setInvoiceSubmitting(false)
    load()
  }

  async function submitDailyLog(e: React.FormEvent) {
    e.preventDefault()
    setLogSubmitting(true)
    setLogError('')
    const token = await getToken()
    const fd = new FormData()
    fd.append('log_date', logDate)
    if (logWeather) fd.append('weather_condition', logWeather)
    if (logNotes) fd.append('notes', logNotes)
    fd.append('has_issues', logHasIssues ? 'true' : 'false')
    if (logHasIssues && logIssue) fd.append('issue_description', logIssue)
    const res = await fetch(`/api/projects/${params.projectId}/daily-logs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setLogError(err.error || 'Failed to submit daily log.')
      setLogSubmitting(false)
      return
    }
    setLogDate(''); setLogNotes(''); setLogWeather(''); setLogHasIssues(false); setLogIssue('')
    setShowLogForm(false); setLogSubmitting(false)
    load()
  }

  async function uploadLienWaiver(invoiceId: string, file: File, waiverType: 'conditional' | 'unconditional') {
    setLienWaiverUploading(prev => ({ ...prev, [invoiceId]: true }))
    setLienWaiverError(prev => ({ ...prev, [invoiceId]: '' }))
    const token = await getToken()
    const fd = new FormData()
    fd.append('file', file)
    fd.append('waiver_type', waiverType)
    const res = await fetch(`/api/projects/${params.projectId}/invoices/${invoiceId}/lien-waiver`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setLienWaiverError(prev => ({ ...prev, [invoiceId]: err.error || 'Upload failed.' }))
    } else {
      load()
    }
    setLienWaiverUploading(prev => ({ ...prev, [invoiceId]: false }))
  }

  async function markInspectionReady(inspId: string) {
    const token = await getToken()
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/projects/${params.projectId}/inspections/${inspId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ready_marked_by: session?.user?.email ?? 'Sub', ready_marked_at: new Date().toISOString() }),
    })
    load()
  }

  if (loading) return <div className="p-4 sm:p-6 text-sm text-faint py-12 text-center">Loading...</div>
  if (!data || data.error) return <div className="p-4 sm:p-6 text-sm text-danger">Error: {data?.error ?? 'Job not found or access denied.'}</div>

  const { project, subcontracts, tasks, rfis, inspections, invoices, recentLogs } = data
  const totalContractValue = (subcontracts ?? []).reduce((sum: number, s: any) => sum + Number(s.contract_amount ?? 0), 0)
  const openTasks = tasks.filter((t: any) => t.status !== 'completed')
  const openRfis = rfis.filter((r: any) => r.status === 'open')
  const pendingInspections = inspections.filter((i: any) => i.status !== 'passed' && i.status !== 'failed')
  const pendingInvoices = invoices.filter((i: any) => i.status !== 'paid')

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: 'My Tasks', badge: openTasks.length },
    { key: 'rfis', label: 'RFIs', badge: openRfis.length },
    { key: 'inspections', label: 'Inspections', badge: pendingInspections.length },
    { key: 'invoices', label: 'Invoices', badge: pendingInvoices.length },
    { key: 'compliance', label: 'Compliance' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Edit Project Modal */}
      {showEditProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Edit Project</h2>
              <button onClick={() => setShowEditProject(false)} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEditProject}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Project Name <span className="text-danger">*</span></label>
                  <input required value={editProjectName} onChange={e => setEditProjectName(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Address</label>
                  <input value={editProjectAddress} onChange={e => setEditProjectAddress(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Status</label>
                  <SearchableSelect value={editProjectStatus} onChange={e => setEditProjectStatus(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    <option value="">Select status...</option>
                    {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </SearchableSelect>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-line-soft flex gap-2 justify-end">
                <button type="button" onClick={() => setShowEditProject(false)}
                  className="px-4 py-2 text-sm rounded-md border border-muted2 text-muted-fg hover:bg-surface">Cancel</button>
                <button type="submit" disabled={editProjectSaving}
                  className="px-4 py-2 text-sm rounded-md bg-accent hover:bg-accent disabled:opacity-50 text-accent-ink font-medium">
                  {editProjectSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Link href="/my-jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-ink-soft">
        <ArrowLeft className="h-4 w-4" /> Back to My Jobs
      </Link>

      {/* Project header */}
      <div className="bg-panel rounded-xl border border-line p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
              <button onClick={openEditProject} className="p-1.5 text-faint hover:text-muted-fg rounded transition-colors" title="Edit project">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-fg flex-wrap">
              {project.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.address}</span>}
              {project.start_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(project.start_date).toLocaleDateString()}</span>}
              <span className="capitalize">{project.type?.replace('_', ' ')}</span>
            </div>
          </div>
          {subcontracts?.length > 0 && (
            <div className="text-right shrink-0">
              <p className="text-xs text-faint mb-0.5">Total Contract Value</p>
              <p className="text-2xl font-bold text-ink">${totalContractValue.toLocaleString()}</p>
              <p className="text-xs text-muted-fg">{subcontracts.map((s: any) => s.trade).join(' · ')}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-line-soft">
          {[
            { label: 'Open Tasks', value: openTasks.length, color: openTasks.length > 0 ? 'text-info' : 'text-success' },
            { label: 'Open RFIs', value: openRfis.length, color: openRfis.length > 0 ? 'text-accent-fg' : 'text-muted-fg' },
            { label: 'Pending Inspections', value: pendingInspections.length, color: 'text-ink-soft' },
            { label: 'Unpaid Invoices', value: pendingInvoices.length, color: pendingInvoices.length > 0 ? 'text-warn' : 'text-success' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-faint mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0',
              activeTab === t.key ? 'border-b-2 border-accent text-accent-fg -mb-px' : 'text-muted-fg hover:text-ink-soft')}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className={cn('text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[18px] text-center',
                activeTab === t.key ? 'bg-accent-tint text-accent-fg' : 'bg-muted text-muted-fg')}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {(subcontracts ?? []).map((sub: any) => {
            const billingType = sub.billing_type ?? 'milestone'
            const subInvoices = (data?.invoices ?? []).filter((inv: any) => inv.subcontract_id === sub.id)
            const totalBilled = subInvoices.filter((inv: any) => inv.status !== 'rejected').reduce((s: number, inv: any) => s + Number(inv.amount ?? 0), 0)
            const billedPct = sub.contract_amount > 0 ? Math.round(totalBilled / sub.contract_amount * 100) : 0

            return (
              <div key={sub.id} className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-soft">{sub.trade}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className={cn('text-xs rounded-full border px-1.5 py-0.5 font-medium',
                        billingType === 'weekly' ? 'bg-info-tint border-info/30 text-info' :
                        billingType === 'percent' ? 'bg-special-tint border-special/30 text-special' :
                        billingType === 'task' ? 'bg-accent-tint border-accent/40 text-accent-fg' :
                        'bg-surface border-line text-muted-fg')}>
                        {billingType === 'weekly' ? '⟳ Weekly billing' :
                         billingType === 'percent' ? '% Progress billing' :
                         billingType === 'task' ? '✓ Task billing' : 'Milestone billing'}
                      </span>
                      {billingType === 'weekly' && sub.weekly_amount && (
                        <span className="text-xs text-faint">${Number(sub.weekly_amount).toLocaleString()}/week</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-ink">${Number(sub.contract_amount).toLocaleString()}</p>
                    <p className="text-xs text-faint">${totalBilled.toLocaleString()} billed ({billedPct}%)</p>
                  </div>
                </div>

                {/* Progress billing controls */}
                {billingType === 'percent' && (
                  <div className="px-4 sm:px-5 py-4 border-b border-line-soft bg-special-tint/40">
                    <p className="text-xs font-semibold text-special mb-2 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Report Progress & Request Payment</p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <input type="range" min="0" max="100" step="5"
                            value={billingProgress[sub.id] ?? String(billedPct)}
                            onChange={e => setBillingProgress(prev => ({ ...prev, [sub.id]: e.target.value }))}
                            className="flex-1 accent-purple-600" />
                          <span className="text-sm font-bold text-special w-10 text-right">
                            {billingProgress[sub.id] ?? billedPct}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted2 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 transition-all" style={{ width: `${billingProgress[sub.id] ?? billedPct}%` }} />
                        </div>
                        <p className="text-xs text-faint mt-1">
                          Invoice will be for {Math.max(0, Number(billingProgress[sub.id] ?? 0) - billedPct)}% = ${Math.round(Math.max(0, Number(billingProgress[sub.id] ?? 0) - billedPct) / 100 * sub.contract_amount).toLocaleString()}
                        </p>
                      </div>
                      <button onClick={() => submitBilling(sub, 'percent')}
                        disabled={billingLoading === sub.id || Number(billingProgress[sub.id] ?? 0) <= billedPct}
                        className="shrink-0 self-start sm:self-auto flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 transition-colors">
                        <Zap className="h-3.5 w-3.5" />
                        {billingLoading === sub.id ? 'Generating...' : 'Request Payment'}
                      </button>
                    </div>
                    {billingError[sub.id] && <p className="text-xs text-danger mt-1">{billingError[sub.id]}</p>}
                    {billingSuccess === sub.id && <p className="text-xs text-success mt-1">✓ Invoice submitted for GC approval</p>}
                  </div>
                )}

                {billingType === 'weekly' && (
                  <div className="px-4 sm:px-5 py-3 border-b border-line-soft bg-info-tint/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-info font-medium">Weekly invoices auto-generate every Monday for GC approval</p>
                      <button onClick={() => submitBilling(sub, 'weekly')}
                        disabled={billingLoading === sub.id}
                        className="text-xs rounded-lg border border-blue-300 bg-panel text-info px-3 py-1.5 font-medium hover:bg-info-tint transition-colors">
                        {billingLoading === sub.id ? 'Generating...' : 'Generate This Week'}
                      </button>
                    </div>
                    {billingError[sub.id] && <p className="text-xs text-danger mt-1">{billingError[sub.id]}</p>}
                    {billingSuccess === sub.id && <p className="text-xs text-success mt-1">✓ Invoice submitted for GC approval</p>}
                  </div>
                )}

                {/* Payment schedule milestones */}
                {sub.payment_schedule_items?.length > 0 ? (
                  <div className="divide-y divide-line-soft">
                    {sub.payment_schedule_items.map((item: any) => (
                      <div key={item.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                        <div className="shrink-0">
                          {item.status === 'paid'
                            ? <CheckCircle2 className="h-4 w-4 text-success" />
                            : <Clock className="h-4 w-4 text-faint" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-soft">{item.label}</p>
                          {item.percentage && <p className="text-xs text-faint">{item.percentage}% of contract</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-ink">
                            {item.amount ? `$${Number(item.amount).toLocaleString()}` : item.percentage ? `${item.percentage}%` : '-'}
                          </p>
                          <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                            STATUS_COLORS[item.status] ?? STATUS_COLORS.pending)}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-4 text-sm text-faint">No payment milestones set.</p>
                )}
              </div>
            )
          })}

          {/* Daily log submission */}
          <div className="bg-panel rounded-xl border border-line overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-soft">Daily Log</h2>
              {!showLogForm && (
                <button onClick={() => { setShowLogForm(true); setLogError('') }}
                  className="flex items-center gap-1.5 text-xs font-medium text-accent-fg hover:text-accent-fg transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Submit Log
                </button>
              )}
            </div>
            {showLogForm && (
              <form onSubmit={submitDailyLog} className="px-4 sm:px-5 py-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-fg">Date <span className="text-danger">*</span></label>
                    <input required type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                      className="w-full h-8 rounded-md border border-muted2 px-3 text-sm focus:border-accent focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-fg">Weather</label>
                    <SearchableSelect value={logWeather} onChange={e => setLogWeather(e.target.value)}
                      className="w-full h-8 rounded-md border border-muted2 px-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">Select...</option>
                      {['Clear', 'Partly Cloudy', 'Overcast', 'Rain', 'Heavy Rain', 'Snow', 'Windy', 'Hot', 'Cold'].map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-fg">Notes</label>
                  <textarea rows={3} value={logNotes} onChange={e => setLogNotes(e.target.value)}
                    placeholder="Work performed, crew on site, progress notes..."
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setLogHasIssues(!logHasIssues)}
                    className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      logHasIssues ? 'border-red-400 bg-danger-tint text-danger' : 'border-line text-muted-fg hover:border-danger/40')}>
                    <AlertCircle className="h-3.5 w-3.5" />{logHasIssues ? 'Issue Flagged' : 'Flag an Issue'}
                  </button>
                </div>
                {logHasIssues && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-fg">Issue Description</label>
                    <textarea rows={2} value={logIssue} onChange={e => setLogIssue(e.target.value)}
                      placeholder="Describe the issue..."
                      className="w-full rounded-md border border-danger/40 px-3 py-2 text-sm focus:border-danger focus:outline-none resize-none" />
                  </div>
                )}
                {logError && <p className="text-xs text-danger">{logError}</p>}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowLogForm(false)}
                    className="px-3 py-1.5 text-xs rounded-md border border-muted2 text-muted-fg hover:bg-surface">Cancel</button>
                  <button type="submit" disabled={logSubmitting || !logDate}
                    className="px-3 py-1.5 text-xs rounded-md bg-accent hover:bg-accent disabled:opacity-50 text-accent-ink font-medium">
                    {logSubmitting ? 'Submitting...' : 'Submit Log'}
                  </button>
                </div>
              </form>
            )}
            {recentLogs.length > 0 && (
              <div className="divide-y divide-line-soft">
                {recentLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    {log.has_issues
                      ? <AlertCircle className="h-4 w-4 text-danger shrink-0" />
                      : <div className="h-4 w-4 rounded-full bg-success-tint flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-success-solid" /></div>}
                    <span className="font-medium text-ink-soft">
                      {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-faint text-xs">{log.created_by_name}</span>
                    {log.has_issues && <span className="ml-auto text-xs text-danger font-medium">Issue flagged</span>}
                  </div>
                ))}
              </div>
            )}
            {recentLogs.length === 0 && !showLogForm && (
              <p className="px-5 py-4 text-sm text-faint">No logs submitted yet.</p>
            )}
          </div>

        </div>
      )}

      {/* Tasks tab */}
      {activeTab === 'tasks' && (() => {
        const myCompanyId = data?.subcontracts?.[0]?.company_id
        const gcAssigned = tasks.filter((t: any) => t.assigned_to_company_id === myCompanyId)
        const myOwn = tasks.filter((t: any) => t.assigned_to_company_id !== myCompanyId)
        const done = tasks.filter((t: any) => t.status === 'completed').length

        function TaskRow({ task }: { task: any }) {
          const isExpanded = expandedTask === task.id
          const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
          return (
            <div className={cn('border-b border-line-soft last:border-0', task.status === 'completed' && 'opacity-60')}>
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors">
                <button onClick={() => toggleTaskStatus(task)} className="shrink-0">
                  {task.status === 'completed'
                    ? <CheckCircle2 className="h-5 w-5 text-success" />
                    : task.status === 'in_progress'
                    ? <Clock className="h-5 w-5 text-info" />
                    : <div className="h-5 w-5 rounded-full border-2 border-muted2 hover:border-accent transition-colors" />}
                </button>
                <button className="flex-1 min-w-0 text-left" onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                  <p className={cn('text-sm font-medium text-ink-soft', task.status === 'completed' && 'line-through text-faint')}>
                    {task.title}
                  </p>
                  {!isExpanded && task.description && !task.description.startsWith('Category:') && (
                    <p className="text-xs text-faint mt-0.5 truncate">{task.description}</p>
                  )}
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {task.due_date && (
                    <span className={cn('text-xs', isOverdue ? 'text-danger font-medium' : 'text-faint')}>
                      {isOverdue && '⚠ '}
                      {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                    task.priority === 'high' || task.priority === 'urgent' ? 'bg-danger-tint border-danger/30 text-danger' :
                    task.priority === 'medium' ? 'bg-warn-tint border-warn/30 text-warn' :
                    'bg-surface border-line text-faint')}>
                    {task.priority}
                  </span>
                  <button onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    className="text-faint hover:text-muted-fg transition-colors">
                    {isExpanded
                      ? <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      : <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="px-4 sm:px-12 pb-4 space-y-2">
                  {task.description && !task.description.startsWith('Category:') && (
                    <p className="text-sm text-muted-fg whitespace-pre-wrap">{task.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-fg">
                    {task.created_by && <span>Created by: <span className="font-medium text-ink-soft">{task.created_by}</span></span>}
                    {task.due_date && <span>Due: <span className={cn('font-medium', isOverdue ? 'text-danger' : 'text-ink-soft')}>{new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span></span>}
                  </div>
                  <div className="flex gap-2 pt-1">
                    {task.status === 'open' && (
                      <button onClick={() => toggleTaskStatus(task)}
                        className="text-xs rounded-lg border border-info/30 bg-info-tint text-info px-3 py-1.5 font-medium hover:bg-info-tint transition-colors">
                        Mark In Progress
                      </button>
                    )}
                    {task.status !== 'completed' && (
                      <button onClick={async () => { const token = await getToken(); await fetch(`/api/projects/${params.projectId}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'completed' }) }); load() }}
                        className="text-xs rounded-lg border border-success/30 bg-success-tint text-success px-3 py-1.5 font-medium hover:bg-success-tint transition-colors">
                        Mark Complete
                      </button>
                    )}
                    {task.status === 'completed' && (
                      <button onClick={() => toggleTaskStatus(task)}
                        className="text-xs rounded-lg border border-line text-muted-fg px-3 py-1.5 font-medium hover:bg-surface transition-colors">
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div />
              <Button size="sm" variant="outline" onClick={() => setShowTaskForm(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Task
              </Button>
            </div>

            {showTaskForm && (
              <form onSubmit={createTask} className="bg-panel rounded-xl border border-accent/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-soft">New Task</p>
                  <button type="button" onClick={() => setShowTaskForm(false)} className="text-faint hover:text-muted-fg"><X className="h-4 w-4" /></button>
                </div>
                <Input required autoFocus placeholder="Task title..." value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
                <textarea rows={2} placeholder="Details (optional)..." value={taskDesc} onChange={e => setTaskDesc(e.target.value)}
                  className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Due Date</Label>
                    <Input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <SearchableSelect value={taskPriority} onChange={e => setTaskPriority(e.target.value)}
                      className="w-full h-8 rounded-md border border-muted2 px-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </SearchableSelect>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowTaskForm(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={taskSaving || !taskTitle.trim()}>{taskSaving ? 'Saving...' : 'Create'}</Button>
                </div>
              </form>
            )}

            {/* Progress */}
            {tasks.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success-solid rounded-full transition-all"
                    style={{ width: `${tasks.length > 0 ? Math.round(done / tasks.length * 100) : 0}%` }} />
                </div>
                <span className="text-xs font-medium text-muted-fg shrink-0">{done}/{tasks.length} done</span>
              </div>
            )}

            {/* GC-assigned tasks */}
            {gcAssigned.length > 0 && (
              <div className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="px-4 py-3 border-b border-line-soft bg-surface flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">Assigned by GC</p>
                    <p className="text-xs text-faint mt-0.5">Tasks the GC has assigned to your company</p>
                  </div>
                  <span className="text-xs text-muted-fg">{gcAssigned.filter((t: any) => t.status === 'completed').length}/{gcAssigned.length} done</span>
                </div>
                {gcAssigned.map((task: any) => <TaskRow key={task.id} task={task} />)}
              </div>
            )}

            {/* My own tasks */}
            {myOwn.length > 0 && (
              <div className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="px-4 py-3 border-b border-line-soft bg-surface flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">My Tasks</p>
                    <p className="text-xs text-faint mt-0.5">Tasks you've added for yourself</p>
                  </div>
                  <span className="text-xs text-muted-fg">{myOwn.filter((t: any) => t.status === 'completed').length}/{myOwn.length} done</span>
                </div>
                {myOwn.map((task: any) => <TaskRow key={task.id} task={task} />)}
              </div>
            )}

            {tasks.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-line py-12 text-center">
                <p className="text-sm text-faint">No tasks yet. Add your first task above.</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* RFIs tab */}
      {activeTab === 'rfis' && (
        <div className="space-y-3">
          {!showRfiForm && (
            <Button onClick={() => { setShowRfiForm(true); setRfiError('') }} variant="outline">
              <Plus className="h-4 w-4" /> Submit New RFI
            </Button>
          )}

          {showRfiForm && (
            <form onSubmit={submitRfi} className="bg-panel rounded-xl border border-accent/40 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink-soft text-sm">New RFI</h3>
                <button type="button" onClick={() => setShowRfiForm(false)} className="text-faint hover:text-muted-fg"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input required value={rfiSubject} onChange={e => setRfiSubject(e.target.value)} placeholder="e.g. Clarify panel location on 2nd floor" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea required rows={3} value={rfiDescription} onChange={e => setRfiDescription(e.target.value)}
                  placeholder="Describe your question in detail..."
                  className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
              </div>

              {/* Change order toggle */}
              <button type="button" onClick={() => setRfiIsChangeOrder(!rfiIsChangeOrder)}
                className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  rfiIsChangeOrder ? 'border-purple-400 bg-special-tint text-special' : 'border-line text-muted-fg hover:border-purple-300')}>
                <DollarSign className="h-3.5 w-3.5" />{rfiIsChangeOrder ? 'Change Order Included' : 'Include Change Order Request'}
              </button>

              {rfiIsChangeOrder && (
                <div className="space-y-3 rounded-lg bg-special-tint border border-special/30 p-4">
                  <p className="text-xs font-semibold text-special uppercase tracking-wide">Change Order Details</p>
                  <div className="space-y-1.5">
                    <Label>Scope of Extra Work</Label>
                    <textarea rows={2} value={rfiCoDescription} onChange={e => setRfiCoDescription(e.target.value)}
                      placeholder="Describe the additional work required..."
                      className="w-full rounded-md border border-purple-300 bg-panel px-3 py-2 text-sm focus:border-purple-500 focus:outline-none resize-none" />
                  </div>
                  {/* Line items */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_44px_76px_28px] sm:grid-cols-[1fr_60px_90px_28px] gap-2 text-xs font-medium text-special px-1">
                      <span>Description</span><span className="text-center">Qty</span><span className="text-center">Unit Price</span><span />
                    </div>
                    {rfiCoItems.map((item, i) => (
                      <div key={i} className="grid grid-cols-[1fr_44px_76px_28px] sm:grid-cols-[1fr_60px_90px_28px] gap-2 items-center">
                        <Input value={item.description} onChange={e => {
                          const n = [...rfiCoItems]; n[i].description = e.target.value; setRfiCoItems(n)
                        }} placeholder="Labor / material..." className="text-sm h-8" />
                        <Input type="number" min="0" value={item.qty} onChange={e => {
                          const n = [...rfiCoItems]; n[i].qty = e.target.value; setRfiCoItems(n)
                        }} className="text-sm h-8 text-center" />
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-faint text-xs">$</span>
                          <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => {
                            const n = [...rfiCoItems]; n[i].unit_price = e.target.value; setRfiCoItems(n)
                          }} className="text-sm h-8 pl-5" placeholder="0.00" />
                        </div>
                        <button type="button" onClick={() => setRfiCoItems(rfiCoItems.filter((_, j) => j !== i))}
                          className="h-8 w-7 flex items-center justify-center text-faint hover:text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setRfiCoItems([...rfiCoItems, { description: '', qty: '1', unit_price: '' }])}
                      className="text-xs text-special hover:underline font-medium">+ Add line item</button>
                  </div>
                  {coTotal(rfiCoItems) > 0 && (
                    <div className="flex justify-end pt-1 border-t border-special/30">
                      <span className="text-sm font-bold text-purple-900">Total: ${coTotal(rfiCoItems).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments */}
              <div className="space-y-2">
                <Label>Attachments <span className="text-faint font-normal">(optional)</span></Label>
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-muted2 px-4 py-2.5 hover:border-accent transition-colors">
                  <Paperclip className="h-4 w-4 text-faint" />
                  <span className="text-sm text-muted-fg">Attach photos, drawings, or documents</span>
                  <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.dwg" className="sr-only"
                    onChange={e => setRfiFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
                </label>
                {rfiFiles.length > 0 && (
                  <div className="space-y-1">
                    {rfiFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-fg bg-surface rounded px-3 py-1.5">
                        <Paperclip className="h-3 w-3 text-faint shrink-0" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-faint">{(f.size / 1024).toFixed(0)}KB</span>
                        <button type="button" onClick={() => setRfiFiles(rfiFiles.filter((_, j) => j !== i))} className="text-faint hover:text-danger"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {rfiError && <p className="text-sm text-danger">{rfiError}</p>}

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowRfiForm(false)}>Cancel</Button>
                <Button type="submit" disabled={rfiSubmitting}>{rfiSubmitting ? 'Submitting...' : 'Submit RFI'}</Button>
              </div>
            </form>
          )}

          {/* RFI detail modal */}
          {selectedRfi && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between sticky top-0 bg-panel">
                  <div>
                    <p className="text-xs font-mono text-faint">RFI-{String(selectedRfi.rfi_number).padStart(3, '0')}</p>
                    <h3 className="font-semibold text-ink">{selectedRfi.subject}</h3>
                  </div>
                  <button onClick={() => setSelectedRfi(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <p className="text-sm text-ink-soft whitespace-pre-wrap">{selectedRfi.description}</p>
                  {selectedRfi.is_change_order && (
                    <div className="rounded-lg bg-special-tint border border-special/30 px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-special uppercase tracking-wide">Change Order</p>
                        <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                          selectedRfi.change_order_status === 'approved' ? 'bg-success-tint border-success/30 text-success' :
                          selectedRfi.change_order_status === 'denied' ? 'bg-danger-tint border-danger/30 text-danger' :
                          selectedRfi.change_order_status === 'revision_requested' ? 'bg-warn-tint border-warn/30 text-warn' :
                          'bg-special-tint border-special/30 text-special')}>
                          {CO_STATUS_LABELS[selectedRfi.change_order_status ?? 'pending']}
                        </span>
                      </div>
                      {selectedRfi.change_order_description && <p className="text-sm text-special">{selectedRfi.change_order_description}</p>}
                      {(selectedRfi.change_order_items ?? []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs text-special">
                          <span>{item.description} <span className="text-purple-400">×{item.qty}</span></span>
                          <span className="font-medium">${(item.qty * item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      {selectedRfi.change_order_amount && (
                        <div className="flex justify-between text-sm font-bold text-purple-900 pt-1 border-t border-special/30">
                          <span>Total</span><span>${Number(selectedRfi.change_order_amount).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(selectedRfi.attachments ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedRfi.attachments.map((att: any, i: number) => (
                        <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-accent-fg hover:underline bg-accent-tint border border-accent/40 rounded px-2 py-1">
                          <Paperclip className="h-3 w-3" />{att.name}
                        </a>
                      ))}
                    </div>
                  )}
                  {selectedRfi.response ? (
                    <div className="rounded-lg bg-success-tint border border-success/30 px-4 py-3">
                      <p className="text-xs font-semibold text-success mb-1">GC Response</p>
                      <p className="text-sm text-success whitespace-pre-wrap">{selectedRfi.response}</p>
                      <p className="text-xs text-success mt-1.5">- {selectedRfi.responded_by_name}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-faint italic">Awaiting GC response...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {rfis.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-line py-12 text-center">
              <p className="text-sm text-faint">No RFIs submitted yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {rfis.map((rfi: any) => (
                <button key={rfi.id} onClick={() => setSelectedRfi(rfi)}
                  className={cn('bg-panel rounded-xl border p-4 text-left hover:shadow-md transition-all hover:-translate-y-0.5',
                    rfi.status === 'open' ? 'border-accent/40' : 'border-line',
                    rfi.response ? 'ring-1 ring-green-200' : '')}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-mono text-faint">RFI-{String(rfi.rfi_number).padStart(3, '0')}</span>
                    <span className={cn('text-xs font-medium rounded-full border px-1.5 py-0.5 shrink-0',
                      rfi.status === 'open' ? 'bg-accent-tint border-accent/40 text-accent-fg' : 'bg-surface border-line text-muted-fg')}>
                      {rfi.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-ink line-clamp-2 leading-snug">{rfi.subject}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rfi.is_change_order && (
                      <span className={cn('text-xs rounded-full border px-1.5 py-0.5 flex items-center gap-0.5',
                        rfi.change_order_status === 'approved' ? 'bg-success-tint border-success/30 text-success' :
                        rfi.change_order_status === 'denied' ? 'bg-danger-tint border-danger/30 text-danger' :
                        'bg-special-tint border-special/30 text-special')}>
                        <DollarSign className="h-2.5 w-2.5" />{rfi.change_order_amount ? `$${Number(rfi.change_order_amount).toLocaleString()}` : 'CO'}
                      </span>
                    )}
                    {rfi.response && <span className="text-xs text-success font-medium">Responded ✓</span>}
                    {rfi.attachments?.length > 0 && <span className="text-xs text-faint flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{rfi.attachments.length}</span>}
                  </div>
                  <p className="text-xs text-faint mt-2">{new Date(rfi.created_at).toLocaleDateString()}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inspections tab */}
      {activeTab === 'inspections' && (
        <>
          {selectedInspection && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
                <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
                  <h3 className="font-semibold text-ink">{selectedInspection.inspection_type}</h3>
                  <button onClick={() => setSelectedInspection(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-6 py-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedInspection.trade && <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{selectedInspection.trade}</span>}
                    <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[selectedInspection.status] ?? STATUS_COLORS.not_scheduled)}>
                      {selectedInspection.status.replace(/_/g, ' ')}
                    </span>
                    {selectedInspection.ready_marked_by && <span className="text-xs text-success font-medium">Ready ✓</span>}
                  </div>
                  {selectedInspection.scheduled_date && (
                    <p className="text-sm text-ink-soft">Scheduled: <strong>{new Date(selectedInspection.scheduled_date).toLocaleDateString()}</strong></p>
                  )}
                  {selectedInspection.scheduling_phone && (
                    <a href={`tel:${selectedInspection.scheduling_phone}`} className="flex items-center gap-2 text-sm text-accent-fg hover:underline font-medium">
                      <Phone className="h-4 w-4" />Call to schedule: {selectedInspection.scheduling_phone}
                    </a>
                  )}
                  {selectedInspection.inspector_name && (
                    <p className="text-sm text-muted-fg">Inspector: {selectedInspection.inspector_name}
                      {selectedInspection.inspector_phone && <> · <a href={`tel:${selectedInspection.inspector_phone}`} className="text-accent-fg hover:underline">{selectedInspection.inspector_phone}</a></>}
                    </p>
                  )}
                  {selectedInspection.notes && <p className="text-sm text-muted-fg">{selectedInspection.notes}</p>}
                  {selectedInspection.status === 'scheduled' && !selectedInspection.ready_marked_by && (
                    <Button className="w-full mt-2" onClick={() => { markInspectionReady(selectedInspection.id); setSelectedInspection(null) }}>
                      <CheckCircle2 className="h-4 w-4" /> Mark Ready for Inspection
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          {inspections.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-line py-12 text-center">
              <p className="text-sm text-faint">No inspections listed yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {inspections.map((insp: any) => (
                <button key={insp.id} onClick={() => setSelectedInspection(insp)}
                  className="bg-panel rounded-xl border border-line p-4 text-left hover:shadow-md transition-all hover:-translate-y-0.5">
                  <div className="flex items-center justify-between mb-2">
                    {insp.status === 'passed' ? <CheckCircle2 className="h-5 w-5 text-success" /> :
                     insp.status === 'failed' ? <XCircle className="h-5 w-5 text-danger" /> :
                     insp.status === 'scheduled' ? <Calendar className="h-5 w-5 text-info" /> :
                     <Clock className="h-5 w-5 text-faint" />}
                    <span className={cn('text-xs font-medium rounded-full border px-1.5 py-0.5', STATUS_COLORS[insp.status] ?? STATUS_COLORS.not_scheduled)}>
                      {insp.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-ink leading-snug">{insp.inspection_type}</p>
                  {insp.trade && <p className="text-xs text-faint mt-1">{insp.trade}</p>}
                  {insp.scheduled_date && <p className="text-xs text-info mt-1">{new Date(insp.scheduled_date).toLocaleDateString()}</p>}
                  {insp.scheduling_phone && <p className="text-xs text-accent-fg mt-1 flex items-center gap-1"><Phone className="h-3 w-3" />{insp.scheduling_phone}</p>}
                  {insp.ready_marked_by && <p className="text-xs text-success font-medium mt-1">Ready ✓</p>}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Invoices tab */}
      {activeTab === 'invoices' && (() => {
        const totalInvoiced = invoices
          .filter((inv: any) => inv.status !== 'rejected')
          .reduce((s: number, inv: any) => s + Number(inv.amount ?? 0), 0)
        const totalPaid = invoices
          .filter((inv: any) => inv.status === 'paid')
          .reduce((s: number, inv: any) => s + Number(inv.amount ?? 0), 0)
        const outstanding = totalInvoiced - totalPaid
        const paidPct = totalContractValue > 0 ? Math.min(100, Math.round(totalPaid / totalContractValue * 100)) : 0

        const totalRetainage = (subcontracts ?? []).reduce((sum: number, s: any) => {
          if (!s.retainage_percent || s.retainage_percent <= 0) return sum
          const subPaid = invoices
            .filter((inv: any) => inv.subcontract_id === s.id && inv.status === 'paid')
            .reduce((ss: number, inv: any) => ss + Number(inv.amount ?? 0), 0)
          return sum + Math.round(subPaid * s.retainage_percent / 100)
        }, 0)
        const netReceived = totalPaid - totalRetainage

        return (
          <>
            {/* Submit Invoice button + form */}
            {!showInvoiceForm && (
              <div className="flex justify-end">
                <button onClick={() => { setShowInvoiceForm(true); setInvoiceError('') }}
                  className="flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent text-accent-ink text-sm font-medium px-4 py-2 transition-colors">
                  <Plus className="h-4 w-4" /> Submit Invoice
                </button>
              </div>
            )}

            {showInvoiceForm && (
              <form onSubmit={submitInvoice} className="bg-panel rounded-xl border border-accent/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-ink-soft text-sm">New Invoice</h3>
                  <button type="button" onClick={() => setShowInvoiceForm(false)} className="text-faint hover:text-muted-fg">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {(subcontracts ?? []).length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink-soft">Contract / Trade</label>
                    <SearchableSelect value={invoiceSubId} onChange={e => setInvoiceSubId(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">Select contract...</option>
                      {(subcontracts ?? []).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.trade} - ${Number(s.contract_amount).toLocaleString()}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink-soft">Amount <span className="text-danger">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                      <input required type="number" min="0.01" step="0.01" value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-md border border-muted2 pl-7 pr-3 py-2 text-sm focus:border-accent focus:outline-none" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink-soft">Due Date</label>
                    <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink-soft">Description</label>
                  <textarea rows={2} value={invoiceDesc} onChange={e => setInvoiceDesc(e.target.value)}
                    placeholder="Work performed, payment milestone, etc."
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>

                {invoiceError && <p className="text-sm text-danger">{invoiceError}</p>}

                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowInvoiceForm(false)}
                    className="px-4 py-2 text-sm rounded-md border border-muted2 text-muted-fg hover:bg-surface">Cancel</button>
                  <button type="submit" disabled={invoiceSubmitting || !invoiceAmount}
                    className="px-4 py-2 text-sm rounded-md bg-accent hover:bg-accent disabled:opacity-50 text-accent-ink font-medium">
                    {invoiceSubmitting ? 'Submitting...' : 'Submit Invoice'}
                  </button>
                </div>
              </form>
            )}

            {selectedInvoice && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
                  <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-faint">{selectedInvoice.invoice_number}</p>
                      <h3 className="font-semibold text-ink">${Number(selectedInvoice.amount).toLocaleString()}</h3>
                    </div>
                    <button onClick={() => setSelectedInvoice(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="px-6 py-5 space-y-3">
                    <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[selectedInvoice.status] ?? STATUS_COLORS.pending_approval)}>
                      {selectedInvoice.status.replace(/_/g, ' ')}
                    </span>
                    {selectedInvoice.description && <p className="text-sm text-ink-soft">{selectedInvoice.description}</p>}
                    {selectedInvoice.due_date && <p className="text-sm text-muted-fg">Due: {new Date(selectedInvoice.due_date).toLocaleDateString()}</p>}
                    {(selectedInvoice.status === 'approved' || selectedInvoice.status === 'sent') && (
                      <Link href={`/projects/${project.id}/invoices/${selectedInvoice.id}/print`}
                        className="flex items-center justify-center gap-2 w-full mt-2 py-2 text-sm font-medium text-accent-fg border border-accent/40 rounded-lg hover:bg-accent-tint transition-colors">
                        View / Print Invoice
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {invoices.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-line py-12 text-center">
                <p className="text-sm text-faint">No invoices yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {invoices.map((inv: any) => (
                  <button key={inv.id} onClick={() => setSelectedInvoice(inv)}
                    className="bg-panel rounded-xl border border-line p-4 text-left hover:shadow-md transition-all hover:-translate-y-0.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-faint">{inv.invoice_number}</span>
                      <span className={cn('text-xs font-medium rounded-full border px-1.5 py-0.5', STATUS_COLORS[inv.status] ?? STATUS_COLORS.pending_approval)}>
                        {inv.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-ink">${Number(inv.amount).toLocaleString()}</p>
                    {inv.description && <p className="text-xs text-faint mt-1 line-clamp-2">{inv.description}</p>}
                    {inv.due_date && <p className="text-xs text-faint mt-2">{new Date(inv.due_date).toLocaleDateString()}</p>}
                  </button>
                ))}
              </div>
            )}

            {/* Payment Summary */}
            <div className="bg-panel rounded-xl border border-line overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft">
                <h3 className="text-sm font-semibold text-ink-soft">Payment Summary</h3>
              </div>
              <div className="px-4 sm:px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Contract Value', value: `$${totalContractValue.toLocaleString()}`, color: 'text-ink' },
                    { label: 'Total Invoiced', value: `$${totalInvoiced.toLocaleString()}`, color: 'text-ink' },
                    { label: 'Total Paid', value: `$${totalPaid.toLocaleString()}`, color: 'text-success' },
                    { label: 'Outstanding', value: `$${outstanding.toLocaleString()}`, color: outstanding > 0 ? 'text-warn' : 'text-success' },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-xs text-faint">{s.label}</p>
                      <p className={cn('text-lg font-bold mt-0.5', s.color)}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {totalRetainage > 0 && (
                  <div className="rounded-lg bg-warn-tint border border-warn/30 px-4 py-3 flex flex-wrap gap-4">
                    <div>
                      <p className="text-xs text-warn font-medium">Retainage Held</p>
                      <p className="text-lg font-bold text-warn">${totalRetainage.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-fg">Net Received</p>
                      <p className="text-lg font-bold text-ink-soft">${netReceived.toLocaleString()}</p>
                    </div>
                    <p className="w-full text-xs text-warn">Retainage will be released upon project completion per contract terms.</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-fg">Paid vs. contract value</span>
                    <span className="text-xs font-semibold text-ink-soft">{paidPct}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success-solid rounded-full transition-all"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Lien waiver upload */}
            {invoices.filter((inv: any) => inv.status === 'approved' || inv.status === 'paid').length > 0 && (
              <div className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-faint" />
                  <h3 className="text-sm font-semibold text-ink-soft">Lien Waivers</h3>
                </div>
                <div className="divide-y divide-line-soft">
                  {invoices
                    .filter((inv: any) => inv.status === 'approved' || inv.status === 'paid')
                    .map((inv: any) => (
                      <div key={inv.id} className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-soft">{inv.invoice_number}</p>
                          <p className="text-xs text-faint">${Number(inv.amount).toLocaleString()} · {inv.status}</p>
                        </div>
                        {inv.lien_waiver_url ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-success font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {inv.lien_waiver_type === 'unconditional' ? 'Unconditional' : 'Conditional'} waiver uploaded
                            </span>
                            <a href={inv.lien_waiver_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-accent-fg hover:underline">View</a>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors',
                              lienWaiverUploading[inv.id]
                                ? 'border-line text-faint pointer-events-none'
                                : 'border-line text-muted-fg hover:border-accent hover:text-accent-fg')}>
                              <Upload className="h-3.5 w-3.5" />
                              {lienWaiverUploading[inv.id] ? 'Uploading...' : 'Conditional'}
                              <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLienWaiver(inv.id, f, 'conditional'); e.target.value = '' }} />
                            </label>
                            <label className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors',
                              lienWaiverUploading[inv.id]
                                ? 'border-line text-faint pointer-events-none'
                                : 'border-success/30 text-success hover:bg-success-tint')}>
                              <Upload className="h-3.5 w-3.5" />
                              {lienWaiverUploading[inv.id] ? '...' : 'Unconditional'}
                              <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLienWaiver(inv.id, f, 'unconditional'); e.target.value = '' }} />
                            </label>
                          </div>
                        )}
                        {lienWaiverError[inv.id] && (
                          <p className="w-full text-xs text-danger">{lienWaiverError[inv.id]}</p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* Compliance tab */}
      {activeTab === 'compliance' && (() => {
        const myCompanyId = data?.subcontracts?.[0]?.company_id ?? ''
        const myCompanyName = data?.subcontracts?.[0]?.company_name ?? 'My Company'

        const DOC_TYPES = ['coi', 'license', 'w9', 'workers_comp'] as const
        type DocType = typeof DOC_TYPES[number]

        const DOC_LABELS: Record<DocType, string> = {
          coi: 'COI',
          license: 'License',
          w9: 'W-9',
          workers_comp: "Workers' Comp",
        }

        const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
          missing:       { label: 'Missing',       classes: 'bg-danger-tint text-danger' },
          pending:       { label: 'Pending',       classes: 'bg-warn-tint text-warn' },
          approved:      { label: 'Approved',      classes: 'bg-success-tint text-success' },
          expired:       { label: 'Expired',       classes: 'bg-danger-tint text-danger' },
          expiring_soon: { label: 'Expiring Soon', classes: 'bg-accent-tint text-accent-fg' },
        }

        function isExpiringSoon(expiry: string | null): boolean {
          if (!expiry) return false
          const diff = new Date(expiry).getTime() - Date.now()
          return diff > 0 && diff <= 30 * 24 * 60 * 60 * 1000
        }

        function getDoc(type: DocType) {
          return complianceDocs.find((d: any) => d.company_id === myCompanyId && d.type === type) ?? null
        }

        function resolveStatus(type: DocType): string {
          const doc = getDoc(type)
          if (!doc) return 'missing'
          if (doc.status === 'approved' && isExpiringSoon(doc.expiry_date)) return 'expiring_soon'
          return doc.status
        }

        async function saveDoc(type: DocType) {
          const key = type
          const fs = complianceFormState[key]
          if (!fs) return
          setComplianceFormState(prev => ({ ...prev, [key]: { ...prev[key], saving: true, error: '' } }))
          const token = await getToken()
          const res = await fetch(`/api/projects/${params.projectId}/compliance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              company_id: myCompanyId,
              type,
              status: fs.status || 'pending',
              expiry_date: fs.expiry || null,
              notes: fs.notes || null,
              file_url: fs.fileUrl || null,
            }),
          })
          if (res.ok) {
            setOpenComplianceForm(null)
            loadCompliance()
          } else {
            const err = await res.json().catch(() => ({}))
            setComplianceFormState(prev => ({ ...prev, [key]: { ...prev[key], saving: false, error: err.error ?? 'Failed to save' } }))
            return
          }
          setComplianceFormState(prev => ({ ...prev, [key]: { ...prev[key], saving: false } }))
        }

        function openForm(type: DocType) {
          const doc = getDoc(type)
          setComplianceFormState(prev => ({
            ...prev,
            [type]: {
              status: doc?.status ?? 'pending',
              expiry: doc?.expiry_date?.slice(0, 10) ?? '',
              fileUrl: doc?.file_url ?? '',
              notes: doc?.notes ?? '',
              saving: false,
              error: '',
            },
          }))
          setOpenComplianceForm(type)
        }

        const allStatuses = DOC_TYPES.map(resolveStatus)
        const missingCount = allStatuses.filter(s => s === 'missing' || s === 'expired').length
        const expiringCount = allStatuses.filter(s => s === 'expiring_soon').length

        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Required Docs', value: DOC_TYPES.length, icon: ShieldCheck, color: 'text-muted-fg' },
                { label: 'Approved', value: allStatuses.filter(s => s === 'approved').length, icon: CheckCircle2, color: 'text-success' },
                { label: 'Expiring Soon', value: expiringCount, icon: AlertTriangle, color: 'text-accent-fg' },
                { label: 'Missing / Expired', value: missingCount, icon: FileWarning, color: 'text-danger' },
              ].map(s => (
                <div key={s.label} className="bg-panel rounded-xl border border-line p-4 flex items-center gap-3">
                  <s.icon className={cn('h-8 w-8 shrink-0', s.color)} />
                  <div>
                    <p className="text-2xl font-bold text-ink">{s.value}</p>
                    <p className="text-xs text-faint">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Doc cards */}
            {complianceLoading ? (
              <div className="py-12 text-center text-sm text-faint">Loading compliance docs...</div>
            ) : (
              <div className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-soft">{myCompanyName}</h3>
                    <p className="text-xs text-faint mt-0.5">Your compliance documents for this project</p>
                  </div>
                </div>
                <div className="divide-y divide-line-soft">
                  {DOC_TYPES.map((type) => {
                    const doc = getDoc(type)
                    const status = resolveStatus(type)
                    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.missing
                    const isOpen = openComplianceForm === type
                    const fs = complianceFormState[type]

                    return (
                      <div key={type}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 sm:px-5 py-3">
                          <span className="w-24 sm:w-28 text-sm text-muted-fg shrink-0">{DOC_LABELS[type]}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.classes)}>
                            {cfg.label}
                          </span>
                          {doc?.expiry_date && (
                            <span className={cn('text-xs',
                              status === 'expiring_soon' ? 'text-accent-fg font-medium' :
                              status === 'expired' ? 'text-danger' : 'text-faint')}>
                              {status === 'expiring_soon' && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
                              Exp {new Date(doc.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {doc?.file_url && (
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-accent-fg hover:underline">View file</a>
                          )}
                          <div className="ml-auto">
                            <button
                              onClick={() => isOpen ? setOpenComplianceForm(null) : openForm(type)}
                              className={cn(
                                'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                                isOpen
                                  ? 'border-accent bg-accent-tint text-accent-fg'
                                  : 'border-line text-muted-fg hover:border-muted2 hover:text-ink-soft',
                              )}
                            >
                              {doc ? <><RefreshCw className="h-3 w-3" /> Update</> : <><Upload className="h-3 w-3" /> Upload</>}
                            </button>
                          </div>
                        </div>

                        {isOpen && fs && (
                          <div className="px-4 sm:px-5 pb-4">
                            <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-ink-soft">
                                  {doc ? 'Update' : 'Upload'} {DOC_LABELS[type]}
                                </p>
                                <button onClick={() => setOpenComplianceForm(null)} className="text-faint hover:text-muted-fg">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>

                              {/* Status toggles */}
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-fg">Status</p>
                                <div className="flex flex-wrap gap-2">
                                  {(['pending', 'approved', 'expired'] as const).map((s) => (
                                    <button key={s} type="button"
                                      onClick={() => setComplianceFormState(prev => ({ ...prev, [type]: { ...prev[type], status: s } }))}
                                      className={cn(
                                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                        fs.status === s
                                          ? STATUS_CONFIG[s].classes + ' border-transparent'
                                          : 'border-line text-muted-fg hover:border-muted2',
                                      )}>
                                      {STATUS_CONFIG[s].label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Expiry */}
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-fg">Expiry Date <span className="text-faint font-normal">(optional)</span></label>
                                <input type="date" value={fs.expiry}
                                  onChange={e => setComplianceFormState(prev => ({ ...prev, [type]: { ...prev[type], expiry: e.target.value } }))}
                                  className="w-full h-8 rounded-md border border-muted2 px-3 text-sm focus:border-accent focus:outline-none" />
                              </div>

                              {/* File upload */}
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-fg">Document File <span className="text-faint font-normal">(optional)</span></label>
                                {fs.fileUrl ? (
                                  <div className="flex items-center gap-2">
                                    <a href={fs.fileUrl} target="_blank" rel="noopener noreferrer"
                                      className="text-xs text-accent-fg hover:underline flex-1 truncate">View uploaded file</a>
                                    <button type="button"
                                      onClick={() => setComplianceFormState(prev => ({ ...prev, [type]: { ...prev[type], fileUrl: '' } }))}
                                      className="text-xs text-faint hover:text-danger">Remove</button>
                                  </div>
                                ) : (
                                  <label className={cn('flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 cursor-pointer transition-colors',
                                    complianceUploading[type] ? 'border-line text-faint pointer-events-none' : 'border-muted2 text-muted-fg hover:border-accent hover:text-accent-fg')}>
                                    <Upload className="h-3.5 w-3.5 shrink-0" />
                                    <span className="text-xs">{complianceUploading[type] ? 'Uploading...' : 'Upload PDF or image'}</span>
                                    <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png"
                                      onChange={async e => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        setComplianceUploading(prev => ({ ...prev, [type]: true }))
                                        const path = `${params.projectId}/${myCompanyId}/${type}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
                                        const { data: uploaded, error: upErr } = await supabase.storage.from('submittals').upload(path, file)
                                        if (!upErr && uploaded) {
                                          const { data: sd } = await supabase.storage.from('submittals').createSignedUrl(uploaded.path, 315360000)
                                          if (sd?.signedUrl) {
                                            setComplianceFormState(prev => ({ ...prev, [type]: { ...prev[type], fileUrl: sd.signedUrl } }))
                                          }
                                        }
                                        setComplianceUploading(prev => ({ ...prev, [type]: false }))
                                        e.target.value = ''
                                      }} />
                                  </label>
                                )}
                              </div>

                              {/* Notes */}
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-fg">Notes <span className="text-faint font-normal">(optional)</span></label>
                                <textarea rows={2} value={fs.notes} placeholder="Any notes..."
                                  onChange={e => setComplianceFormState(prev => ({ ...prev, [type]: { ...prev[type], notes: e.target.value } }))}
                                  className="w-full rounded-md border border-muted2 px-3 py-1.5 text-sm focus:border-accent focus:outline-none resize-none" />
                              </div>

                              {fs.error && <p className="text-xs text-danger">{fs.error}</p>}

                              <div className="flex gap-2 justify-end pt-1">
                                <button type="button" onClick={() => setOpenComplianceForm(null)}
                                  className="h-7 px-3 text-xs rounded-md border border-muted2 text-muted-fg hover:bg-surface transition-colors">
                                  Cancel
                                </button>
                                <button type="button" onClick={() => saveDoc(type)} disabled={fs.saving}
                                  className="h-7 px-3 text-xs rounded-md bg-accent hover:bg-accent disabled:opacity-50 text-accent-ink font-medium transition-colors">
                                  {fs.saving ? 'Saving...' : doc ? 'Update' : 'Save'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
