'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, MapPin, Calendar, Users, Clock, DollarSign, Paperclip, CheckCircle2, AlertCircle, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, getStatusVariant } from '@/components/ui/badge'
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
  if (status === 'approved') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'expired') return <XCircle className="h-4 w-4 text-red-400" />
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

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading...</div>
  if (!data) return <div className="p-6 text-sm text-red-500">Bid not found or you are not invited.</div>

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
    <div className="p-6 max-w-4xl">
      {/* Back */}
      <Link href="/my-bids" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <ArrowLeft className="h-4 w-4" /> Back to My Bids
      </Link>

      {/* Success banner */}
      {submitted && (
        <div className="mb-5 rounded-xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          <p className="text-sm font-medium text-green-800">Your bid has been submitted successfully.</p>
        </div>
      )}

      {isRevisionRequested && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Revision Requested</p>
              {myBid?.revision_note && (
                <p className="text-sm text-amber-700 mt-1 whitespace-pre-wrap">{myBid.revision_note}</p>
              )}
              <p className="text-xs text-amber-600 mt-2">Please update your bid below and resubmit.</p>
            </div>
          </div>
        </div>
      )}

      {isAwarded && (
        <div className="mb-5 rounded-xl bg-orange-50 border border-orange-200 px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-orange-500 shrink-0" />
          <p className="text-sm font-medium text-orange-800">Congratulations — you have been awarded this contract!</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Package Details */}
        <div className="lg:col-span-2 space-y-5">

          {/* Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl font-bold text-slate-900">{pkg.scope}</h1>
                  {pkg.trade && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">{pkg.trade}</span>}
                  <Badge variant={getStatusVariant(pkg.status)}>{pkg.status}</Badge>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{project?.name} — {project?.address}</span>
                </div>
              </div>
              {pkg.due_date && (
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-400">Bid Due</p>
                  <p className="text-sm font-semibold text-slate-800">{new Date(pkg.due_date).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Scope of Work */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Scope of Work</h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{pkg.description}</p>
            {pkg.specifications && (
              <>
                <h2 className="text-sm font-semibold text-slate-700 mt-4 mb-2">Specifications</h2>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{pkg.specifications}</p>
              </>
            )}
            {pkg.requirements && (
              <>
                <h2 className="text-sm font-semibold text-slate-700 mt-4 mb-2">Requirements</h2>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{pkg.requirements}</p>
              </>
            )}
          </div>

          {/* Attached Plans */}
          {attachments.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                <Paperclip className="inline h-3.5 w-3.5 mr-1.5 text-slate-400" />
                Attached Plans
              </h2>
              <div className="space-y-2">
                {attachments.map((a: any) => (
                  <a key={a.id} href={a.project_plans?.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:border-orange-300 hover:bg-orange-50 transition-colors group">
                    <FileText className="h-4 w-4 text-slate-400 group-hover:text-orange-500" />
                    <span className="text-sm font-medium text-slate-700 flex-1">{a.project_plans?.name}</span>
                    <span className="text-xs text-slate-400 capitalize">{a.project_plans?.plan_type}</span>
                    <span className="text-xs text-orange-500 font-medium opacity-0 group-hover:opacity-100">Download</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Bid Form */}
          {canSubmit && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">
                {isRevisionRequested ? 'Revise & Resubmit' : myBid ? 'Update Your Bid' : 'Submit Your Bid'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Bid Amount */}
                <div className="space-y-1.5">
                  <Label htmlFor="amount">
                    Bid Amount <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input id="amount" type="number" step="0.01" placeholder="87,500.00" value={amount}
                      onChange={e => setAmount(e.target.value)} required className="pl-8" />
                  </div>
                </div>

                {/* Duration + Crew */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="duration">
                      <Clock className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                      Estimated Duration (days)
                    </Label>
                    <Input id="duration" type="number" placeholder="e.g. 15" value={durationDays}
                      onChange={e => setDurationDays(e.target.value)} />
                    <p className="text-xs text-slate-400">Used to build the project schedule</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="crew">
                      <Users className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                      Crew Size
                    </Label>
                    <Input id="crew" type="number" placeholder="e.g. 4" value={crewSize}
                      onChange={e => setCrewSize(e.target.value)} />
                    <p className="text-xs text-slate-400">Number of workers on site</p>
                  </div>
                </div>

                {/* Earliest Start Date */}
                <div className="space-y-1.5 max-w-xs">
                  <Label htmlFor="startDate">
                    <Calendar className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                    Earliest Start Date
                  </Label>
                  <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  <p className="text-xs text-slate-400">When can you mobilize?</p>
                </div>

                {/* Payment Terms */}
                <div className="space-y-1.5">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <textarea id="paymentTerms" rows={3} placeholder={`e.g.\n10% Mobilization\n40% Rough complete\n30% Finish complete\n20% Final`}
                    value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none" />
                  <p className="text-xs text-slate-400">This will become your default payment schedule if awarded</p>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Proposal Notes</Label>
                  <textarea id="notes" rows={4}
                    placeholder="e.g. Price excludes fire alarm. Price based on plans dated June 3. Owner-supplied fixtures not included."
                    value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none" />
                </div>

                {/* Proposal Upload */}
                <div className="space-y-1.5">
                  <Label>Attach Proposal <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors',
                      proposalFile ? 'border-orange-300 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                    )}>
                    <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-600">
                      {proposalFile ? proposalFile.name : (myBid?.proposal_url ? 'Replace existing proposal' : 'Upload PDF, Word, or Excel')}
                    </span>
                    {myBid?.proposal_url && !proposalFile && (
                      <a href={myBid.proposal_url} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="ml-auto text-xs text-orange-600 hover:underline">View current</a>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => setProposalFile(e.target.files?.[0] ?? null)} />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Submitting...' : myBid ? 'Update Bid' : 'Submit Bid'}
                </Button>
              </form>
            </div>
          )}

          {/* Already submitted, package closed */}
          {!canSubmit && myBid && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Your Submitted Bid</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-slate-400">Amount</p><p className="font-semibold text-slate-900">${Number(myBid.amount).toLocaleString()}</p></div>
                {myBid.duration_days && <div><p className="text-slate-400">Duration</p><p className="font-semibold text-slate-900">{myBid.duration_days} days</p></div>}
                {myBid.crew_size && <div><p className="text-slate-400">Crew Size</p><p className="font-semibold text-slate-900">{myBid.crew_size}</p></div>}
                {myBid.earliest_start_date && <div><p className="text-slate-400">Start Date</p><p className="font-semibold text-slate-900">{new Date(myBid.earliest_start_date).toLocaleDateString()}</p></div>}
                {myBid.notes && <div className="col-span-2"><p className="text-slate-400">Notes</p><p className="text-slate-700">{myBid.notes}</p></div>}
                {myBid.proposal_url && <div className="col-span-2"><a href={myBid.proposal_url} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline text-sm flex items-center gap-1"><FileText className="h-3.5 w-3.5" />View Proposal</a></div>}
              </div>
            </div>
          )}
        </div>

        {/* Right: Compliance Snapshot */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Your Compliance</h2>
            <p className="text-xs text-slate-400 mb-4">GC reviews this before awarding</p>
            <div className="space-y-3">
              {allComplianceTypes.map(type => {
                const doc = complianceMap[type]
                const status = doc?.status ?? 'missing'
                return (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{COMPLIANCE_LABELS[type]}</span>
                    <div className="flex items-center gap-1.5">
                      <ComplianceIcon status={status} />
                      <span className={cn('text-xs font-medium capitalize',
                        status === 'approved' ? 'text-green-600' :
                        status === 'expired' ? 'text-red-500' : 'text-amber-600'
                      )}>
                        {status}
                        {doc?.expiry_date && status === 'approved' && (
                          <span className="text-slate-400 font-normal ml-1">
                            · exp {new Date(doc.expiry_date).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Upload compliance documents in <Link href="/settings" className="text-orange-500 hover:underline">Settings</Link>.
            </p>
          </div>

          {/* Project Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Project Info</h2>
            <div className="space-y-2 text-sm">
              <div><p className="text-slate-400 text-xs">Project</p><p className="font-medium text-slate-800">{project?.name}</p></div>
              <div><p className="text-slate-400 text-xs">Address</p><p className="text-slate-700">{project?.address}</p></div>
              <div><p className="text-slate-400 text-xs">Type</p><p className="text-slate-700 capitalize">{project?.type?.replace('_', ' ')}</p></div>
              {project?.start_date && <div><p className="text-slate-400 text-xs">Project Start</p><p className="text-slate-700">{new Date(project.start_date).toLocaleDateString()}</p></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
