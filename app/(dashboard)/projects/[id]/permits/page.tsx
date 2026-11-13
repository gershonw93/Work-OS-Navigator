'use client'

import { authorityWarning, noSuggestionReason, type AuthorityCard, type AuthoritySuggestion, type JobAreas } from '@/lib/permit-jurisdiction'
import type { AuthorityHow } from '@/lib/permit-apply'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, FileCheck, FileText, Building, Sparkles, Loader2, AlertCircle, Check, UserPlus, Search } from 'lucide-react'
import { ContactPicker } from '@/components/contact-picker'

import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useNotice } from '@/components/ui/notice'
import { permitProblem } from '@/lib/permit-rules'
import { PERMIT_TYPES } from '@/lib/permit-board'
import type { ExpediterFacts } from '@/lib/permit-expediter'
import { allowedStatuses, permitStage, todayIso, type PermitItem, type PermitRound, type PermitShare } from '@/lib/permit-rounds'
import { PermitPanel } from '@/components/permits/permit-panel'
import { PermitList, type ListRow } from '@/components/permits/permit-list'
import { useMinWidth } from '@/lib/use-min-width'
import type { PermitReply } from '@/lib/permit-reply'
import { shrinkImage } from '@/lib/shrink-image'
import { PermitBoard, type BoardData } from '@/components/permits/permit-board'
import { usePermissions } from '@/lib/use-permissions'
import { fetchProblem } from '@/lib/fetch-error'
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warn-tint border-warn/30 text-warn',
  approved: 'bg-success-tint border-success/30 text-success',
  active: 'bg-info-tint border-info/30 text-info',
  recorded: 'bg-special-tint border-special/30 text-special',
  expired: 'bg-danger-tint border-danger/30 text-danger',
  rejected: 'bg-danger-tint border-danger/30 text-danger',
}

type Permit = {
  id: string; permit_type: string; permit_number: string | null; description: string | null
  status: string; issued_date: string | null; expiry_date: string | null
  issuing_authority: string | null; inspector_name: string | null; inspector_phone: string | null
  notes: string | null; file_url: string | null; created_at: string
} & ExpediterFacts

/**
 * Who files it, when an expediter does: picked from the Directory (companies
 * whose trade says expediter), never typed, so the id is what is saved. A name
 * typed and not picked is answered at Save rather than quietly dropped.
 */
function ExpediterField({ value, onChange }: { value: { id: string | null; name: string }; onChange: (v: { id: string | null; name: string }) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>Through an expediter? <span className="font-normal text-faint">(optional)</span></Label>
      <ContactPicker expediters value={value.name} onChange={(name, c) => onChange({ id: c?.id ?? null, name })}
        placeholder="Search your Directory for the expediter" />
      <p className="text-xs text-muted-fg">They file it for you: Email it goes to them, and hiring them puts their fee on the budget. Leave it empty if you apply yourself.</p>
    </div>
  )
}

export default function PermitsPage({ params }: { params: { id: string } }) {
  const guardDelete = useDeleteGuard()
  const notify = useNotice()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [permits, setPermits] = useState<Permit[]>([])
  // Each permit's submissions and what the reviewer asked for. `historyOk`
  // false means the read failed - then nothing may say "nothing logged".
  const [rounds, setRounds] = useState<PermitRound[]>([])
  const [items, setItems] = useState<PermitItem[]>([])
  const [shares, setShares] = useState<PermitShare[]>([])
  const [replies, setReplies] = useState<PermitReply[]>([])
  // How each township takes applications, off its Directory card.
  const [authorities, setAuthorities] = useState<Record<string, AuthorityHow>>({})
  const [historyOk, setHistoryOk] = useState(true)
  // Set only when this job is a development.
  const [board, setBoard] = useState<BoardData | null>(null)
  const [boardError, setBoardError] = useState('')
  // Buttons go once the answer is KNOWN to be no, never on a failed read.
  const perms = usePermissions()
  const canEdit = perms.loading || !!perms.error || perms.can('permits', 'edit')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // The permit open in the panel, and whether it opened on "Their answer".
  const [openId, setOpenId] = useState<string | null>(null)
  // The docked panel slides shut before it goes. A TIMER, never animationend,
  // which does not fire under reduced motion.
  const [closingPanel, setClosingPanel] = useState(false)
  const closeTimer = useRef<number | null>(null)
  function closePanel() {
    if (!wide) { setOpenId(null); return }
    setClosingPanel(true)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setOpenId(null); setClosingPanel(false) }, 200)
  }
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])
  const [answerNow, setAnswerNow] = useState(false)
  const [q, setQ] = useState('')
  const wide = useMinWidth(1024)
  const [submitting, setSubmitting] = useState(false)

  // Form
  // EMPTY, not 'Building'. A default on a required field is a claim nobody
  // made - and it disarmed the `required` beside it, because a select that
  // starts on a value can never fail constraint validation. A blank submit
  // filed a permit called "Building" that nobody had named.
  const [permitType, setPermitType] = useState('')
  // "Other": the person names the permit, and that name IS the type - a
  // custom permit is a column on the board like any other.
  const [otherType, setOtherType] = useState(false)
  const isListed = (t: string) => t !== 'Other' && PERMIT_TYPES.includes(t)
  const [permitNumber, setPermitNumber] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('pending')
  const [issuedDate, setIssuedDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [issuingAuthority, setIssuingAuthority] = useState('')
  const [expediter, setExpediter] = useState<{ id: string | null; name: string }>({ id: null, name: '' })
  const [inspectorName, setInspectorName] = useState('')
  const [inspectorPhone, setInspectorPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [permitFile, setPermitFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')

  const [submitError, setSubmitError] = useState('')
  // A new permit is usually one you are about to APPLY for: two questions, the
  // type and who issues it. Number, dates and the AI read are for one you
  // already hold, behind "I already have it".
  const [applying, setApplying] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [editingPermit, setEditingPermit] = useState<Permit | null>(null)

  // After saving a permit, offer to save a newly-typed inspector to contacts.
  const [contactPrompt, setContactPrompt] = useState<{ name: string; phone: string } | null>(null)
  const [contactSaving, setContactSaving] = useState(false)
  const [contactSaved, setContactSaved] = useState(false)

  async function maybePromptInspectorContact(name: string, phone: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const token = await getToken()
    // Check whether this inspector already exists in the directory
    const res = await fetch('/api/directory', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const json = await res.json()
      const exists = (json.companies ?? []).some(
        (c: any) => c.type === 'inspector' && c.name?.trim().toLowerCase() === trimmed.toLowerCase()
      )
      if (exists) return
    }
    setContactSaved(false)
    setContactPrompt({ name: trimmed, phone: phone.trim() })
  }

  async function saveInspectorContact() {
    if (!contactPrompt) return
    setContactSaving(true)
    const token = await getToken()
    await fetch('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: contactPrompt.name,
        type: 'inspector',
        phone: contactPrompt.phone || null,
        /* no address on file. NOT `noemail+<ts>@placeholder.com`: an invented address passes every is-this-an-address check, so the review screens listed the sub as emailable and a send would have recorded them TOLD. The column is NOT NULL, and '' is what 22 rows already use for absent. */ contact_email: '',
      }),
    })
    setContactSaving(false)
    setContactSaved(true)
    setTimeout(() => setContactPrompt(null), 1500)
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  const notSite = useRef(false)
  // Who this job applies to, from its address and the Directory's township
  // cards (lib/permit-jurisdiction.ts). A suggestion fills only an empty box,
  // or replaces the one IT put there when the permit type changes.
  const [jur, setJur] = useState<{ areas: JobAreas | null; cards: AuthorityCard[]; suggestions: Record<string, AuthoritySuggestion | null> } | null>(null)
  const lastSuggested = useRef<string | null>(null)
  const [jurFailed, setJurFailed] = useState(false)
  useEffect(() => {
    const type = permitType.trim()
    if (!showForm || editingPermit || !type) return
    let live = true
    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${params.id}/permit-authority?types=${encodeURIComponent(type)}`, { headers: { Authorization: `Bearer ${await getToken()}` } })
        const j = await res.json().catch(() => null)
        if (!live) return
        if (!res.ok || !j) { setJur(null); setJurFailed(true); return }
        setJur(j); setJurFailed(false)
        const sug = j.suggestions?.[type] as AuthoritySuggestion | null | undefined
        setIssuingAuthority(cur => {
          if (sug && (!cur.trim() || cur === lastSuggested.current)) { lastSuggested.current = sug.name; return sug.name }
          return cur
        })
      } catch { if (live) { setJur(null); setJurFailed(true) } }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, editingPermit, permitType, params.id])

  // A notification links to ONE permit (`?permit=`): open it once the list
  // has it - and again when the bell is clicked while already on this page.
  const searchParams = useSearchParams()
  const linkedPermit = searchParams?.get('permit') ?? null
  useEffect(() => {
    if (linkedPermit && permits.some(p => p.id === linkedPermit)) openOne(linkedPermit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPermit, permits.length])

  async function fetchPermits() {
    // A loading state must have a way to end: finally, not a last statement.
    try {
      const token = await getToken()
      // The board loads BESIDE the list, not after it - every save waited for
      // the two one after the other. And a job that is not a development is
      // only asked once.
      const board = notSite.current ? null : fetchBoard(token)
      const res = await fetch(`/api/projects/${params.id}/permits`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setFetchError('')
        setPermits(json.permits ?? [])
        setRounds(json.rounds ?? [])
        setItems(json.items ?? [])
        setShares(json.shares ?? [])
        setReplies(json.replies ?? [])
        setAuthorities(json.authorities ?? {})
        setHistoryOk(json.history !== false)
      } else setFetchError(json.error ?? `Error ${res.status}`)
      await board
    } catch (e) {
      setFetchError(fetchProblem(e, 'loading the permits'))
    } finally {
      setLoading(false)
    }
  }

  async function fetchBoard(token: string) {
    try {
      const res = await fetch(`/api/projects/${params.id}/permit-board`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setBoardError(json.error ?? `Error ${res.status}`); return }
      setBoardError('')
      if (!json.isSite) notSite.current = true
      setBoard(json.isSite ? json as BoardData : null)
    } catch (e) {
      console.error('[permits] board read failed', e)
      setBoardError('Could not load the development board. Reload to try again.')
    }
  }


  useEffect(() => { fetchPermits() }, [params.id])

  function resetForm() {
    setPermitType(''); setOtherType(false); setPermitNumber(''); setDescription(''); setStatus('pending')
    setIssuedDate(''); setExpiryDate(''); setIssuingAuthority(''); setExpediter({ id: null, name: '' })
    setInspectorName(''); setInspectorPhone(''); setNotes(''); setPermitFile(null)
    setAnalyzeError(''); setEditingPermit(null); setApplying(true); lastSuggested.current = null
  }

  function openEdit(permit: Permit) {
    setEditingPermit(permit)
    setPermitType(permit.permit_type)
    setOtherType(!isListed(permit.permit_type))
    setPermitNumber(permit.permit_number ?? '')
    setDescription(permit.description ?? '')
    setStatus(permit.status)
    setIssuedDate(permit.issued_date ?? '')
    setExpiryDate(permit.expiry_date ?? '')
    setIssuingAuthority(permit.issuing_authority ?? '')
    setExpediter({ id: permit.expediter_company_id ?? null, name: permit.expediter_company_id ? permit.expediter_name ?? '' : '' })
    setInspectorName(permit.inspector_name ?? '')
    setInspectorPhone(permit.inspector_phone ?? '')
    setNotes(permit.notes ?? '')
    setPermitFile(null)
    setAnalyzeError('')
    setApplying(false)
    setShowForm(true)
  }

  function handleDeletePermit(permitId: string) {
    guardDelete(async () => {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}/permits/${permitId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchPermits()
    }, { label: 'this permit' })
  }

  async function analyzePermitImage(file: File) {
    setAnalyzing(true)
    setAnalyzeError('')
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${params.id}/permits/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const data = await res.json()
    if (!res.ok || !data.fields) {
      setAnalyzeError(data.error ?? 'Analysis failed. Please fill in the fields manually.')
      setAnalyzing(false)
      return
    }
    const f = data.fields
    if (f.permit_type && PERMIT_TYPES.includes(f.permit_type)) setPermitType(f.permit_type)
    if (f.permit_number) setPermitNumber(f.permit_number)
    if (f.description) setDescription(f.description)
    if (f.status) setStatus(f.status)
    if (f.issued_date) setIssuedDate(f.issued_date)
    if (f.expiry_date) setExpiryDate(f.expiry_date)
    if (f.issuing_authority) setIssuingAuthority(f.issuing_authority)
    if (f.inspector_name) setInspectorName(f.inspector_name)
    if (f.inspector_phone) setInspectorPhone(f.inspector_phone)
    if (f.notes) setNotes(f.notes)
    setAnalyzing(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const lean = applying && !editingPermit
    // A name typed but never picked has no id to save - say so, never drop it.
    if ((lean || editingPermit) && expediter.name.trim() && !expediter.id) {
      setSubmitError('Pick the expediter from your Directory, or add them from that box.'); return
    }
    if (lean) {
      if (!permitType.trim()) { setSubmitError(otherType ? 'Name the permit.' : 'Pick the permit type.'); return }
      if (!issuingAuthority.trim()) { setSubmitError('Who do you apply to? Name the township or department - Email it finds their address from it.'); return }
      setSubmitError(''); setSubmitting(true)
      const form = new FormData()
      form.append('permit_type', permitType.trim())
      form.append('status', 'pending')
      form.append('issuing_authority', issuingAuthority.trim())
      if (expediter.id && expediter.name.trim()) form.append('expediter_company_id', expediter.id)
      const res = await fetch(`/api/projects/${params.id}/permits`, { method: 'POST', headers: { Authorization: `Bearer ${await getToken()}` }, body: form })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setSubmitError(json.error ?? `Save failed (${res.status})`)
        setSubmitting(false)
        return
      }
      resetForm(); setShowForm(false); setSubmitting(false); fetchPermits()
      return
    }
    // The SAME rule the route asks, asked at the field first - a server's answer
    // can only ever arrive as a message about a whole request that did not
    // happen. lib/permit-rules.ts is the one copy.
    const problem = permitProblem({
      permit_type: permitType, permit_number: permitNumber, description,
      issuing_authority: issuingAuthority, status,
      issued_date: issuedDate, expiry_date: expiryDate,
    })
    if (problem) { setSubmitError(problem); return }
    setSubmitError('')
    setSubmitting(true)
    const token = await getToken()

    if (editingPermit) {
      const res = await fetch(`/api/projects/${params.id}/permits/${editingPermit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          permit_type: permitType,
          permit_number: permitNumber || null,
          description: description || null,
          status,
          issued_date: issuedDate || null,
          expiry_date: expiryDate || null,
          issuing_authority: issuingAuthority || null,
          inspector_name: inspectorName || null,
          inspector_phone: inspectorPhone || null,
          notes: notes || null,
          expediter_company_id: expediter.name.trim() ? expediter.id : null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setSubmitError(json.error ?? `Save failed (${res.status})`)
        setSubmitting(false)
        return
      }
      setSubmitError('')
      const insName = inspectorName, insPhone = inspectorPhone
      resetForm(); setShowForm(false); setSubmitting(false); fetchPermits()
      maybePromptInspectorContact(insName, insPhone)
      return
    }

    const form = new FormData()
    form.append('permit_type', permitType)
    if (permitNumber) form.append('permit_number', permitNumber)
    if (description) form.append('description', description)
    form.append('status', status)
    if (issuedDate) form.append('issued_date', issuedDate)
    if (expiryDate) form.append('expiry_date', expiryDate)
    if (issuingAuthority) form.append('issuing_authority', issuingAuthority)
    if (inspectorName) form.append('inspector_name', inspectorName)
    if (inspectorPhone) form.append('inspector_phone', inspectorPhone)
    if (notes) form.append('notes', notes)
    if (permitFile) form.append('file', permitFile)
    const res = await fetch(`/api/projects/${params.id}/permits`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setSubmitError(json.error ?? `Save failed (${res.status})`)
      setSubmitting(false)
      return
    }
    setSubmitError('')
    const insName = inspectorName, insPhone = inspectorPhone
    resetForm(); setShowForm(false); setSubmitting(false); fetchPermits()
    maybePromptInspectorContact(insName, insPhone)
  }

  const roundsFor = (permitId: string) => rounds.filter(r => r.permit_id === permitId)
  const itemsFor = (permitId: string) => items.filter(i => i.permit_id === permitId)
  /** What the dropdown may offer: the history's answer, plus the value already stored so it still renders. */
  const statusesFor = (permitId: string, current: string) => {
    const allowed = allowedStatuses(roundsFor(permitId))
    return allowed.includes(current) ? allowed : [current, ...allowed]
  }

  async function updateStatus(permitId: string, newStatus: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/permits/${permitId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => null)
    if (res && !res.ok) {
      const json = await res.json().catch(() => ({}))
      notify(json.error ?? `Could not change the status (${res.status})`)
    }
    fetchPermits()
  }


  // ── The list and the open permit ──
  const today = todayIso()
  const allRows: ListRow[] = permits.map(p => ({
    id: p.id,
    type: p.permit_type,
    meta: `${p.permit_number || 'No number yet'} · ${p.issuing_authority?.trim() || 'No issuer set'}`,
    st: permitStage(p, roundsFor(p.id), itemsFor(p.id), today),
  }))
  const order = (['you', 'city', 'iss'] as const).flatMap(g =>
    allRows.filter(r => r.st.group === g).sort((a, b) => a.st.sortKey - b.st.sortKey))
  const needle = q.trim().toLowerCase()
  const shownRows = needle
    ? order.filter(r => `${r.type} ${r.meta}`.toLowerCase().includes(needle))
    : order
  const counts = {
    you: order.filter(r => r.st.group === 'you').length,
    city: order.filter(r => r.st.group === 'city').length,
    iss: order.filter(r => r.st.group === 'iss').length,
  }
  const openPermit = openId ? permits.find(p => p.id === openId) ?? null : null
  // Under "who issues it": why it was suggested, or a warning about the pick.
  const suggestedNow = jur?.suggestions?.[permitType.trim()] ?? null
  const authorityWarn = jur && !editingPermit ? authorityWarning(permitType, issuingAuthority, jur.areas, jur.cards) : null
  const authorityHint = authorityWarn
    ? <p className="flex items-start gap-1.5 text-xs font-medium text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{authorityWarn}</p>
    : suggestedNow && !editingPermit && issuingAuthority.trim() === suggestedNow.name
      ? <p className="text-xs text-success">Suggested from the job&apos;s address - {suggestedNow.reason}</p>
      : !editingPermit && !issuingAuthority.trim() && permitType.trim()
        // Nothing suggested: say why, or the empty box reads as a broken feature.
        ? (jurFailed
          ? <p className="text-xs text-muted-fg">Could not check who covers this job right now. Pick who you apply to.</p>
          : jur && !suggestedNow ? <p className="text-xs text-muted-fg">{noSuggestionReason(permitType, jur.areas, jur.cards)}</p> : null)
        : null

  function openOne(id: string, answer = false) {
    // A row pressed while the panel is sliding shut keeps it open on that row.
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
    setClosingPanel(false); setOpenId(id); setAnswerNow(answer)
  }
  function navOf(id: string) {
    const list = shownRows.some(r => r.id === id) ? shownRows : order
    const pos = list.findIndex(r => r.id === id)
    if (pos === -1 || list.length < 2) return undefined
    return {
      pos: pos + 1, total: list.length,
      prev: () => openOne(list[(pos - 1 + list.length) % list.length].id),
      next: () => openOne(list[(pos + 1) % list.length].id),
    }
  }

  return (
    <div className="p-0 lg:p-6 space-y-5">
      {/* Post-save: offer to save a newly-typed inspector to contacts */}
      {contactPrompt && (
        <div className="fixed bottom-4 right-4 z-[60] w-[calc(100%-2rem)] sm:w-96 rounded-xl border border-line bg-panel shadow-2xl p-4">
          {contactSaved ? (
            <p className="text-sm font-medium text-success flex items-center gap-2">
              <Check className="h-4 w-4" /> Added {contactPrompt.name} to contacts
            </p>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent-tint flex items-center justify-center shrink-0">
                  <UserPlus className="h-4 w-4 text-accent-fg" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Save inspector to contacts?</p>
                  <p className="text-xs text-muted-fg mt-0.5 truncate">
                    {contactPrompt.name}{contactPrompt.phone ? ` · ${contactPrompt.phone}` : ''}
                  </p>
                </div>
              </div>
              <div className="row-even lg:flex gap-2 justify-end mt-3">
                <Button variant="outline" size="sm" onClick={() => setContactPrompt(null)}>Not now</Button>
                <Button size="sm" onClick={saveInspectorContact} disabled={contactSaving}>
                  {contactSaving ? 'Saving…' : 'Add contact'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {showForm && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-2xl overflow-y-auto">
            <div className="sticky top-0 bg-panel border-b border-line-soft px-4 sm:px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">{editingPermit ? 'Edit Permit' : board ? 'Add a permit for the whole development' : 'Add Permit'}</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 pb-6 space-y-4">
                {!editingPermit && (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
                    {([[true, 'I need to apply'], [false, 'I already have it']] as const).map(([v, label]) => (
                      <button key={label} type="button" onClick={() => { setApplying(v); setSubmitError('') }}
                        className={cn('min-h-11 rounded-md px-3 text-sm font-medium', applying === v ? 'bg-panel text-ink shadow-sm' : 'text-muted-fg hover:text-ink')}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {applying && !editingPermit ? (<>
                  <div className="space-y-1.5">
                    <Label>Permit type <span className="text-danger">*</span></Label>
                    <SearchableSelect value={otherType ? 'Other' : permitType} onChange={e => {
                        const v = e.target.value
                        if (v === 'Other') { setOtherType(true); if (isListed(permitType)) setPermitType('') }
                        else { setOtherType(false); setPermitType(v) }
                      }}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">-- Select permit type --</option>
                      {PERMIT_TYPES.map(t => <option key={t} value={t}>{t === 'Other' ? 'Other - name it' : t}</option>)}
                    </SearchableSelect>
                    {otherType && (
                      <Input value={permitType} onChange={e => setPermitType(e.target.value)} placeholder="Name the permit, e.g. Tree Removal" maxLength={60} />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Who do you apply to? <span className="text-danger">*</span></Label>
                    <ContactPicker filterType="inspector" value={issuingAuthority} onChange={name => setIssuingAuthority(name)} placeholder="Search your Directory, e.g. Toms River Township" />
                    {authorityHint}
                    <p className="text-xs text-muted-fg">The township or department, from your Directory - Email it uses their address and how they take applications. Not there yet? Add them from this box.</p>
                  </div>
                  <ExpediterField value={expediter} onChange={setExpediter} />
                  <p className="text-sm text-muted-fg">That is all for now. The permit number and dates come when it is approved - drop the approved permit in then and AI fills them.</p>
                </>) : (<>
                {/* Upload first so AI fills the rest */}
                <div className="space-y-1.5">
                  <Label><Sparkles className="inline h-3.5 w-3.5 mr-1 text-accent-fg" />Upload Permit (AI Auto-Fill)</Label>
                  <label className={cn('flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3.5 text-sm transition-colors cursor-pointer',
                      analyzing ? 'border-accent bg-accent-tint text-accent-fg pointer-events-none' :
                      permitFile ? 'border-green-300 bg-success-tint text-success' :
                      'border-accent/40 bg-accent-tint/40 text-accent-fg hover:border-accent')}>
                    {analyzing
                      ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Analyzing permit with AI - filling in fields...</span></>
                      : permitFile
                      ? <><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{permitFile.name}</span><span className="ml-auto text-xs text-success font-medium shrink-0">✓ Fields auto-filled</span></>
                      : <><Sparkles className="h-4 w-4" /><span className="font-medium">Upload a photo or PDF of your permit</span><span className="text-xs ml-1 text-accent-fg">- AI fills the fields automatically</span></>}
                    <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={async e => {
                      // Shrunk ONCE here, so the AI read and the save both send
                      // the small copy - a phone photo went up twice at full size.
                      const raw = e.target.files?.[0] ?? null
                      const file = raw ? await shrinkImage(raw) : null
                      setPermitFile(file)
                      if (file) analyzePermitImage(file)
                    }} />
                  </label>
                  {analyzeError && (
                    <p className="text-xs text-danger flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />{analyzeError}
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line-soft" /></div>
                  <div className="relative flex justify-center"><span className="bg-panel px-2 text-xs text-faint">or fill in manually</span></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Permit Type <span className="text-danger">*</span></Label>
                    <SearchableSelect value={otherType ? 'Other' : permitType} onChange={e => {
                        const v = e.target.value
                        if (v === 'Other') { setOtherType(true); if (isListed(permitType)) setPermitType('') }
                        else { setOtherType(false); setPermitType(v) }
                      }}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">-- Select permit type --</option>
                      {PERMIT_TYPES.map(t => <option key={t} value={t}>{t === 'Other' ? 'Other - name it' : t}</option>)}
                    </SearchableSelect>
                    {otherType && (
                      <Input value={permitType} onChange={e => setPermitType(e.target.value)} placeholder="Name the permit, e.g. Tree Removal" maxLength={60} />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Permit Number</Label>
                    <Input placeholder="e.g. 2024-EL-001234" value={permitNumber} onChange={e => setPermitNumber(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <textarea rows={2} placeholder="What this permit covers..." value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <SearchableSelect value={status} onChange={e => setStatus(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      {/* Once a permit has submissions logged, they decide pending / approved /
                          rejected - the same set the route allows (statusMoveProblem). */}
                      {(editingPermit ? statusesFor(editingPermit.id, editingPermit.status) : allowedStatuses([])).map(s => <option key={s}>{s}</option>)}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date Issued</Label>
                    <Input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expiry Date</Label>
                    <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label><Building className="inline h-3.5 w-3.5 mr-1 text-faint" />Issuing Authority</Label>
                  <ContactPicker filterType="inspector" value={issuingAuthority} onChange={name => setIssuingAuthority(name)} placeholder="Search your Directory, e.g. Toms River Township" />
                    {authorityHint}
                </div>
                {editingPermit && <ExpediterField value={expediter} onChange={setExpediter} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Inspector Name</Label>
                    <ContactPicker
                      filterType="inspector"
                      value={inspectorName}
                      onChange={name => setInspectorName(name)}
                      onPhoneChange={phone => setInspectorPhone(phone)}
                      placeholder="Search inspectors…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Inspector Phone</Label>
                    <Input type="tel" placeholder="(555) 000-0000" value={inspectorPhone} onChange={e => setInspectorPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea rows={2} placeholder="Any additional notes..." value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
                </>)}
              </div>
              <div className="sticky bottom-0 bg-panel border-t border-line-soft px-4 sm:px-6 py-4 space-y-2">
                {submitError && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{submitError}</p>}
                <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm() }}>Cancel</Button>
                <Button type="submit" disabled={submitting || analyzing}>
                  {analyzing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing...</> : submitting ? 'Saving...' : editingPermit ? 'Save Changes' : applying ? 'Add it' : 'Add Permit'}
                </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={cn('lg:grid lg:items-start', openPermit && wide && 'lg:grid-cols-[minmax(0,1fr)_auto]')}>
        <div className="min-w-0 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-ink">Permits</h1>
              {!loading && permits.length > 0 && (
                <p className="mt-1 text-[15px] text-muted-fg">
                  <strong className="font-semibold text-ink">{counts.you ? `${counts.you} ${counts.you === 1 ? 'needs' : 'need'} you.` : 'Nothing needs you.'}</strong>
                  {' '}{counts.city} with the city. {counts.iss} issued.
                </p>
              )}
            </div>
            {canEdit && <Button className="shrink-0" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Permit</Button>}
          </div>

          {boardError && (
            <div className="rounded-lg bg-danger-tint border border-danger/30 px-4 py-3 text-sm text-danger flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{boardError}</span>
            </div>
          )}
          {board && <PermitBoard data={board} canEdit={canEdit} onChanged={fetchPermits} />}
          {board && (
            <div className="pt-2">
              <h2 className="text-lg font-semibold text-ink">For the whole development</h2>
              <p className="text-sm text-muted-fg">Permits that are not for one house - site work, the subdivision, roads and utilities. Add Permit at the top adds one here. For the houses, use Update several houses above.</p>
            </div>
          )}

          {fetchError && (
            <div className="rounded-lg bg-danger-tint border border-danger/30 px-4 py-3 text-sm text-danger flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Could not load permits: <strong>{fetchError}</strong></span>
            </div>
          )}
          {!historyOk && (
            <div className="rounded-lg bg-danger-tint border border-danger/30 px-4 py-3 text-sm text-danger flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Could not load the permits&apos; submissions, so the groups below go by each permit&apos;s status only. Reload to try again.</span>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-faint py-12 text-center">Loading...</div>
          ) : permits.length === 0 && board ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-fg">None yet.</p>
              {canEdit && <Button variant="outline" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add one for the whole development</Button>}
            </div>
          ) : permits.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
              <FileCheck className="h-8 w-8 text-faint mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-fg">No permits added yet</p>
            </div>
          ) : (
            <>
              <div className="relative">
                <label className="sr-only" htmlFor="permit-search">Search permits</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" aria-hidden="true" />
                <Input id="permit-search" type="search" value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Search by type, number, or who issues it" className="h-11 pl-9" />
              </div>
              <PermitList rows={shownRows} openId={openPermit?.id ?? null} compact={!!openPermit && wide} canEdit={canEdit}
                filtering={!!q.trim()} onOpen={id => openOne(id)} onAnswer={id => openOne(id, true)} />
            </>
          )}
        </div>

        {openPermit && (
          <PermitPanel key={wide ? 'docked' : 'drawer'} projectId={params.id} permit={openPermit}
            rounds={roundsFor(openPermit.id)} items={itemsFor(openPermit.id)}
            shares={shares.filter(x => x.permit_id === openPermit.id)} replies={replies.filter(x => x.permit_id === openPermit.id)}
            applyHow={authorities[(openPermit.issuing_authority ?? '').trim()] ?? null}
            historyOk={historyOk} canEdit={canEdit}
            docked={wide} closing={closingPanel} answerNow={answerNow} onChanged={fetchPermits} onClose={closePanel}
            nav={navOf(openPermit.id)}
            onEdit={() => openEdit(openPermit)}
            onDelete={() => { handleDeletePermit(openPermit.id) }} />
        )}
      </div>
    </div>
  )
}
