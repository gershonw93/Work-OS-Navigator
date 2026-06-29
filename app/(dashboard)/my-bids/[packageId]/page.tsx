'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, MapPin, Calendar, Users, Clock, DollarSign, Paperclip, CheckCircle2, AlertCircle, XCircle, ListChecks, MessageSquare, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { ScopeBuilder, ScopeCategory, scopeTotal } from '@/components/ui/scope-builder'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface ComplianceDoc { type: string; status: string; expiry_date: string | null }

const COMPLIANCE_LABELS: Record<string, string> = {
  coi: 'Certificate of Insurance',
  license: 'License',
  w9: 'W-9',
  workers_comp: 'Workers Comp',
}

function ComplianceIcon({ status }: { status: string }) {
  if (status === 'approved') return <CheckCircle2 className="h-4 w-4 text-success" />
  if (status === 'expired') return <XCircle className="h-4 w-4 text-danger" />
  return <AlertCircle className="h-4 w-4 text-amber-400" />
}

export default function BidDetailPage({ params }: { params: { packageId: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Form state
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [crewSize, setCrewSize] = useState('')
  const [startDate, setStartDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [proposalFile, setProposalFile] = useState<File | null>(null)
  const [scopeCategories, setScopeCategories] = useState<ScopeCategory[]>([])

  // RFI state
  const [rfis, setRfis] = useState<any[]>([])
  const [showRfiForm, setShowRfiForm] = useState(false)
  const [rfiSubject, setRfiSubject] = useState('')
  const [rfiDescription, setRfiDescription] = useState('')
  const [rfiIsChangeOrder, setRfiIsChangeOrder] = useState(false)
  const [rfiCoDescription, setRfiCoDescription] = useState('')
  const [rfiCoAmount, setRfiCoAmount] = useState('')
  const [rfiSubmitting, setRfiSubmitting] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  useEffect(() => {
    async function load() {
      const token = await getToken()
      const res = await fetch(`/api/my-bids/${params.packageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setLoading(false); return }
      const d = await res.json()
      setData(d)
      // Pre-fill if already submitted
      if (d.myBid) {
        setAmount(d.myBid.amount?.toString() ?? '')
        setNotes(d.myBid.notes ?? '')
        setDurationDays(d.myBid.duration_days?.toString() ?? '')
        setCrewSize(d.myBid.crew_size?.toString() ?? '')
        setStartDate(d.myBid.earliest_start_date ?? '')
        setPaymentTerms(d.myBid.payment_terms ?? '')
        if (d.myBid.scope_categories) setScopeCategories(d.myBid.scope_categories)
        // Load RFIs if bid exists
        if (d.pkg?.projects?.id) {
          const rfiRes = await fetch(`/api/projects/${d.pkg.projects.id}/rfis`, { headers: { Authorization: `Bearer ${token}` } })
          if (rfiRes.ok) setRfis((await rfiRes.json()).rfis ?? [])
        }
      }
      setLoading(false)
    }
    load()
  }, [params.packageId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const token = await getToken()
    const form = new FormData()
    form.append('amount', amount)
    form.append('notes', notes)
    if (durationDays) form.append('duration_days', durationDays)
    if (crewSize) form.append('crew_size', crewSize)
    if (startDate) form.append('earliest_start_date', startDate)
    if (paymentTerms) form.append('payment_terms', paymentTerms)
    if (scopeCategories.length > 0) form.append('scope_categories', JSON.stringify(scopeCategories))
    if (proposalFile) form.append('proposal', proposalFile)

    const res = await fetch(`/api/my-bids/${params.packageId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error)
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
    // Reload data to show updated bid
    const token2 = await getToken()
    const res2 = await fetch(`/api/my-bids/${params.packageId}`, { headers: { Authorization: `Bearer ${token2}` } })
    if (res2.ok) setData(await res2.json())
  }

  async function fetchRfis(projectId: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${projectId}/rfis`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setRfis((await res.json()).rfis ?? [])
  }

  async function submitRfi(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setRfiSubmitting(true)
    const token = await getToken()
    const { data: { session } } = await supabase.auth.getSession()
    const projectId = data.pkg.projects?.id
    await fetch(`/api/projects/${projectId}/rfis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subject: rfiSubject, description: rfiDescription,
        is_change_order: rfiIsChangeOrder,
        change_order_description: rfiIsChangeOrder ? rfiCoDescription : null,
        change_order_amount: rfiIsChangeOrder && rfiCoAmount ? parseFloat(rfiCoAmount) : null,
        submitted_by_name: session?.user?.email ?? 'Sub',
        company_name: null, company_id: null,
      }),
    })
    setRfiSubject(''); setRfiDescription(''); setRfiIsChangeOrder(false)
    setRfiCoDescription(''); setRfiCoAmount('')
    setShowRfiForm(false); setRfiSubmitting(false)
    fetchRfis(projectId)
  }

  const scopeAutoTotal = scopeTotal(scopeCategories)

  // Auto-fill bid amount from scope total
  useEffect(() => {
    if (scopeAutoTotal > 0) setAmount(scopeAutoTotal.toString())
  }, [scopeAutoTotal])

  if (loading) return <div className="p-6 text-sm text-faint">Loading...</div>
  if (!data) return <div className="p-6 text-sm text-danger">Bid not found or you are not invited.</div>

  const { pkg, myBid, compliance } = data
  const project = pkg.projects
  const attachments = pkg.bid_package_attachments ?? []
  const isOpen = pkg.status === 'open'
  const isAwarded = myBid?.status === 'awarded'
  const isRevisionRequested = myBid?.status === 'revision_requested'
  const canSubmit = isOpen || isRevisionRequested
  const allComplianceTypes = ['coi', 'license', 'w9', 'workers_comp']
  const complianceMap = Object.fromEntries((compliance as ComplianceDoc[]).map(c => [c.type, c]))

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {/* Back */}
      <Link href="/my-bids" className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-ink-soft">
        <ArrowLeft className="h-4 w-4" /> Back to My Bids
      </Link>

      {/* Banners */}
      {submitted && (
        <div className="rounded-xl bg-success-tint border border-success/30 px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <p className="text-sm font-medium text-success">Your bid has been submitted successfully.</p>
        </div>
      )}
      {isRevisionRequested && (
        <div className="rounded-xl bg-warn-tint border border-warn/30 px-5 py-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-warn shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warn">Revision Requested</p>
            {myBid?.revision_note && <p className="text-sm text-warn mt-1 whitespace-pre-wrap">{myBid.revision_note}</p>}
            <p className="text-xs text-warn mt-2">Please update your bid below and resubmit.</p>
          </div>
        </div>
      )}
      {isAwarded && (
        <div className="rounded-xl bg-accent-tint border border-accent/40 px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-accent-fg shrink-0" />
          <p className="text-sm font-medium text-accent-fg">Congratulations — you have been awarded this contract!</p>
        </div>
      )}

      {/* Package header */}
      <div className="bg-panel rounded-xl border border-line p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-ink">{pkg.scope}</h1>
              {pkg.trade && <span className="text-xs bg-muted text-muted-fg rounded-full px-2.5 py-0.5">{pkg.trade}</span>}
              <Badge variant={getStatusVariant(pkg.status)}>{pkg.status}</Badge>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-fg">
              <MapPin className="h-3.5 w-3.5" />
              <span>{project?.name} — {project?.address}</span>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm shrink-0">
            {pkg.due_date && (
              <div className="text-right">
                <p className="text-xs text-faint">Bid Due</p>
                <p className="font-semibold text-ink-soft">{new Date(pkg.due_date).toLocaleDateString()}</p>
              </div>
            )}
            {project?.type && (
              <div className="text-right">
                <p className="text-xs text-faint">Type</p>
                <p className="font-semibold text-ink-soft capitalize">{project.type.replace('_', ' ')}</p>
              </div>
            )}
            {/* Compliance quick view */}
            <div className="text-right">
              <p className="text-xs text-faint mb-1">Compliance</p>
              <div className="flex gap-1">
                {allComplianceTypes.map(type => {
                  const doc = complianceMap[type]
                  const status = doc?.status ?? 'missing'
                  return <ComplianceIcon key={type} status={status} />
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Scope + specs inline */}
        {(pkg.description || pkg.specifications || pkg.requirements) && (
          <div className="mt-4 pt-4 border-t border-line-soft grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-1">Scope</p>
              <p className="text-ink-soft whitespace-pre-wrap leading-relaxed">{pkg.description}</p>
            </div>
            {pkg.specifications && (
              <div>
                <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-1">Specifications</p>
                <p className="text-ink-soft whitespace-pre-wrap leading-relaxed">{pkg.specifications}</p>
              </div>
            )}
            {pkg.requirements && (
              <div>
                <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-1">Requirements</p>
                <p className="text-ink-soft whitespace-pre-wrap leading-relaxed">{pkg.requirements}</p>
              </div>
            )}
          </div>
        )}

        {/* Attached plans */}
        {attachments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-line-soft">
            <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">
              <Paperclip className="inline h-3 w-3 mr-1" />Attached Plans
            </p>
            <div className="flex flex-wrap gap-2">
              {attachments.map((a: any) => (
                <a key={a.id} href={a.project_plans?.file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs border border-line rounded-lg px-3 py-1.5 text-muted-fg hover:border-accent hover:text-accent-fg transition-colors">
                  <FileText className="h-3 w-3" />
                  {a.project_plans?.name}
                  <span className="text-faint capitalize">({a.project_plans?.plan_type})</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bid Form */}
      {canSubmit && (
        <div className="bg-panel rounded-xl border border-line p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-ink">
              {isRevisionRequested ? 'Revise & Resubmit' : myBid ? 'Update Your Bid' : 'Submit Your Bid'}
            </h2>
            {scopeAutoTotal > 0 && (
              <div className="text-right">
                <p className="text-xs text-faint">Scope total</p>
                <p className="text-lg font-bold text-accent-fg">${scopeAutoTotal.toLocaleString()}</p>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Row 1: Amount + Duration + Crew + Start */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5 md:col-span-1">
                <Label htmlFor="amount">Bid Amount <span className="text-danger">*</span></Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                  <Input id="amount" type="number" step="0.01" placeholder="0.00" value={amount}
                    onChange={e => setAmount(e.target.value)} required className="pl-8" />
                </div>
                {scopeAutoTotal > 0 && (
                  <p className="text-xs text-faint">Auto-calculated from scope</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duration">
                  <Clock className="inline h-3.5 w-3.5 mr-1 text-faint" />Duration (days)
                </Label>
                <Input id="duration" type="number" placeholder="e.g. 30" value={durationDays} onChange={e => setDurationDays(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crew">
                  <Users className="inline h-3.5 w-3.5 mr-1 text-faint" />Crew Size
                </Label>
                <Input id="crew" type="number" placeholder="e.g. 4" value={crewSize} onChange={e => setCrewSize(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="startDate">
                  <Calendar className="inline h-3.5 w-3.5 mr-1 text-faint" />Earliest Start
                </Label>
                <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
            </div>

            {/* Scope Breakdown */}
            <div className="space-y-2">
              <div>
                <Label>
                  <ListChecks className="inline h-3.5 w-3.5 mr-1 text-faint" />
                  Scope Breakdown
                </Label>
                <p className="text-xs text-faint mt-0.5">Add categories and line items with qty + unit price. Included items become trackable tasks when awarded.</p>
              </div>
              <ScopeBuilder value={scopeCategories} onChange={setScopeCategories} />
            </div>

            {/* Payment Terms + Notes side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="paymentTerms">Payment Terms</Label>
                <textarea id="paymentTerms" rows={4} placeholder={`e.g.\n10% Mobilization\n40% Rough complete\n30% Finish complete\n20% Final`}
                  value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                  className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
                <p className="text-xs text-faint">Becomes your payment schedule if awarded</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Proposal Notes</Label>
                <textarea id="notes" rows={4}
                  placeholder="e.g. Price excludes fire alarm. Based on plans dated June 3."
                  value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
              </div>
            </div>

            {/* Proposal Upload */}
            <div className="space-y-1.5">
              <Label>Attach Proposal <span className="text-faint font-normal">(optional)</span></Label>
              <label className={cn('flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors',
                  proposalFile ? 'border-accent bg-accent-tint' : 'border-line hover:border-accent hover:bg-accent-tint')}>
                <Paperclip className="h-4 w-4 text-faint shrink-0" />
                <span className="text-sm text-muted-fg">
                  {proposalFile ? proposalFile.name : (myBid?.proposal_url ? 'Replace existing proposal' : 'Upload PDF, Word, or Excel')}
                </span>
                {myBid?.proposal_url && !proposalFile && (
                  <a href={myBid.proposal_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className="ml-auto text-xs text-accent-fg hover:underline">View current</a>
                )}
                <input ref={fileInputRef} type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx"
                  onChange={e => setProposalFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            {myBid && myBid.status === 'submitted' && !isRevisionRequested && (
              <p className="text-xs text-center text-faint">Your bid has been submitted. The GC will notify you if changes are needed.</p>
            )}

            <Button type="submit" className="w-full"
              disabled={submitting || (myBid?.status === 'submitted' && !isRevisionRequested)}>
              {submitting ? 'Submitting...' : myBid ? 'Update Bid' : 'Submit Bid'}
            </Button>
          </form>
        </div>
      )}

      {/* Submitted, package closed */}
      {!canSubmit && myBid && (
        <div className="bg-panel rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-ink-soft mb-3">Your Submitted Bid</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-faint">Amount</p><p className="font-semibold text-ink">${Number(myBid.amount).toLocaleString()}</p></div>
            {myBid.duration_days && <div><p className="text-faint">Duration</p><p className="font-semibold text-ink">{myBid.duration_days} days</p></div>}
            {myBid.crew_size && <div><p className="text-faint">Crew Size</p><p className="font-semibold text-ink">{myBid.crew_size}</p></div>}
            {myBid.earliest_start_date && <div><p className="text-faint">Start Date</p><p className="font-semibold text-ink">{new Date(myBid.earliest_start_date).toLocaleDateString()}</p></div>}
            {myBid.notes && <div className="col-span-2 md:col-span-4"><p className="text-faint">Notes</p><p className="text-ink-soft">{myBid.notes}</p></div>}
            {myBid.proposal_url && <div className="col-span-2 md:col-span-4"><a href={myBid.proposal_url} target="_blank" rel="noopener noreferrer" className="text-accent-fg hover:underline text-sm flex items-center gap-1"><FileText className="h-3.5 w-3.5" />View Proposal</a></div>}
          </div>
        </div>
      )}

      {/* RFIs — only show when bid is submitted/awarded */}
      {myBid && (
        <div className="bg-panel rounded-xl border border-line p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-ink-soft">RFIs & Change Orders</h2>
              <p className="text-xs text-faint mt-0.5">Questions or change order requests to the GC</p>
            </div>
            {!showRfiForm && (
              <button onClick={() => setShowRfiForm(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-accent-fg hover:text-accent-fg">
                <Plus className="h-3.5 w-3.5" /> Submit RFI
              </button>
            )}
          </div>

          {showRfiForm && (
            <form onSubmit={submitRfi} className="space-y-3 mb-4 rounded-lg border border-accent/40 bg-accent-tint p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-soft">Subject</label>
                <input type="text" required value={rfiSubject} onChange={e => setRfiSubject(e.target.value)}
                  placeholder="e.g. Clarify panel location on 2nd floor"
                  className="w-full rounded-md border border-muted2 px-3 py-1.5 text-sm focus:border-accent focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-soft">Description</label>
                <textarea required rows={3} value={rfiDescription} onChange={e => setRfiDescription(e.target.value)}
                  placeholder="Describe your question in detail..."
                  className="w-full rounded-md border border-muted2 px-3 py-1.5 text-sm focus:border-accent focus:outline-none resize-none" />
              </div>
              <button type="button" onClick={() => setRfiIsChangeOrder(!rfiIsChangeOrder)}
                className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  rfiIsChangeOrder ? 'border-purple-400 bg-special-tint text-special' : 'border-line bg-panel text-muted-fg hover:border-purple-300')}>
                <DollarSign className="h-3.5 w-3.5" />
                {rfiIsChangeOrder ? 'Change Order Included' : 'Include Change Order Request'}
              </button>
              {rfiIsChangeOrder && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-xs font-medium text-ink-soft">Change Order Description</label>
                    <textarea rows={2} value={rfiCoDescription} onChange={e => setRfiCoDescription(e.target.value)}
                      placeholder="What additional work is required and why..."
                      className="w-full rounded-md border border-muted2 px-3 py-1.5 text-sm focus:border-accent focus:outline-none resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink-soft">Proposed Amount</label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-faint" />
                      <input type="number" step="0.01" value={rfiCoAmount} onChange={e => setRfiCoAmount(e.target.value)}
                        placeholder="0.00" className="w-full rounded-md border border-muted2 pl-7 pr-3 py-1.5 text-sm focus:border-accent focus:outline-none" />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowRfiForm(false)} className="text-xs text-muted-fg hover:text-ink-soft px-3 py-1.5">Cancel</button>
                <button type="submit" disabled={rfiSubmitting}
                  className="rounded-lg bg-accent text-accent-ink text-xs font-medium px-4 py-1.5 hover:bg-accent disabled:opacity-50">
                  {rfiSubmitting ? 'Submitting...' : 'Submit RFI'}
                </button>
              </div>
            </form>
          )}

          {rfis.length === 0 ? (
            <p className="text-xs text-faint text-center py-4">No RFIs submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {rfis.map(rfi => (
                <div key={rfi.id} className={cn('rounded-lg border px-3 py-3 text-sm',
                  rfi.status === 'open' ? 'border-accent/40 bg-accent-tint/50' : 'border-line')}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-faint">RFI-{String(rfi.rfi_number).padStart(3, '0')}</span>
                    <span className="font-medium text-ink-soft">{rfi.subject}</span>
                    {rfi.is_change_order && <span className="text-xs bg-special-tint border border-special/30 text-special rounded-full px-1.5 py-0.5">CO</span>}
                    <span className={cn('ml-auto text-xs font-medium rounded-full px-2 py-0.5',
                      rfi.status === 'open' ? 'text-accent-fg' : 'text-success')}>
                      {rfi.status}
                    </span>
                  </div>
                  {rfi.response && (
                    <div className="mt-2 rounded bg-success-tint border border-green-100 px-2.5 py-2 text-xs text-success">
                      <p className="font-medium text-success mb-0.5">Response from GC</p>
                      {rfi.response}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Project Info */}
      <div className="bg-panel rounded-xl border border-line p-5">
        <h2 className="text-sm font-semibold text-ink-soft mb-3">Project Info</h2>
        <div className="space-y-2 text-sm">
          <div><p className="text-faint text-xs">Project</p><p className="font-medium text-ink-soft">{project?.name}</p></div>
          <div><p className="text-faint text-xs">Address</p><p className="text-ink-soft">{project?.address}</p></div>
          <div><p className="text-faint text-xs">Type</p><p className="text-ink-soft capitalize">{project?.type?.replace('_', ' ')}</p></div>
          {project?.start_date && <div><p className="text-faint text-xs">Project Start</p><p className="text-ink-soft">{new Date(project.start_date).toLocaleDateString()}</p></div>}
        </div>
      </div>
    </div>
  )
}
