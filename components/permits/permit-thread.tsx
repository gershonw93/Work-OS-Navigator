'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { ShareFilesModal, type ShareableFile } from '@/components/files/share-files-modal'
import { useClientContact } from '@/lib/use-client-email'
import { fetchProblem } from '@/lib/fetch-error'
import { cn } from '@/lib/utils'
import {
  AlertCircle, Check, CheckCircle2, Circle, Clock, FileText, Loader2, Paperclip, Plus, Send, Share2, Sparkles, X,
} from 'lucide-react'
import {
  carryableFiles, cleanItems, openRound, outcomeProblem, permitStanding, shortDay, sortRounds, submitProblem, todayIso,
  unusedUploads, OUTCOME_LABEL,
  type Outcome, type PermitItem, type PermitRound, type PermitShare, type RoundFile, type StandingTone,
} from '@/lib/permit-rounds'
import type { PermitFacts } from '@/lib/permit-rules'

// ─────────────────────────────────────────────────────────────────────────────
// A permit's history: every submission, every answer, what is still owed, and
// every link sent from it. Rendered in the permit's own panel on the Permits
// tab AND in the development board's drawer, so the two cannot drift. Nothing
// here decides anything - the rules are lib/permit-rounds.ts, asked here
// before sending and again by the route before writing.
// ─────────────────────────────────────────────────────────────────────────────

export const STANDING_CHIP: Record<StandingTone, string> = {
  neutral: 'bg-surface border-line text-muted-fg',
  info: 'bg-info-tint border-info/30 text-info',
  warn: 'bg-warn-tint border-warn/30 text-warn',
  danger: 'bg-danger-tint border-danger/30 text-danger',
  success: 'bg-success-tint border-success/30 text-success',
}

export interface ThreadPermit extends PermitFacts {
  id: string
  permit_type: string
  /** The permit's main document - the latest approved file once there is one. */
  file_url?: string | null
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

function Files({ files }: { files?: RoundFile[] | null }) {
  if (!files?.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {files.map(f => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-accent-fg hover:bg-surface">
          <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{f.name}</span>
        </a>
      ))}
    </div>
  )
}

function FilePicker({ files, onChange, label, hint }: { files: File[]; onChange: (f: File[]) => void; label: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-faint font-normal">(optional)</span></Label>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-muted2 px-3 py-3 text-sm text-muted-fg hover:border-accent">
        <Paperclip className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{files.length ? files.map(f => f.name).join(', ') : (hint ?? 'Attach the letter, plans or forms')}</span>
        <input type="file" multiple className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
          onChange={e => onChange(Array.from(e.target.files ?? []))} />
      </label>
    </div>
  )
}

/** A ticked list of files already in SyteNav that a dialog will include. */
function PickList({ label, hint, files, picked, onToggle }: {
  label: string; hint: string
  files: (RoundFile & { key: string; detail?: string })[]
  picked: Set<string>; onToggle: (key: string) => void
}) {
  if (!files.length) return null
  return (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-faint font-normal">(optional)</span></Label>
      <p className="text-xs text-muted-fg">{hint}</p>
      <div className="divide-y divide-line-soft rounded-lg border border-line">
        {files.map(f => (
          <label key={f.key} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5">
            <input type="checkbox" checked={picked.has(f.key)} onChange={() => onToggle(f.key)} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{f.name}</span>
              {f.detail && <span className="block truncate text-xs text-faint">{f.detail}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

const toggleIn = (set: Set<string>, key: string) => {
  const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n
}

/** Log a submission (or a resubmission) for one permit. */
export function SubmitRoundDialog({ projectId, permit, rounds, items, onClose, onSaved }: {
  projectId: string; permit: ThreadPermit; rounds: PermitRound[]; items: PermitItem[]; onClose: () => void; onSaved: () => void
}) {
  const [submittedOn, setSubmittedOn] = useState(todayIso())
  const [expectedBy, setExpectedBy] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  // The resubmission IS the fixes: every file attached to an item that has
  // not gone in yet starts ticked.
  const fixes = useMemo(() => carryableFiles(items, rounds), [items, rounds])
  const [carry, setCarry] = useState<Set<string>>(() => new Set(fixes.map(f => f.url)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const again = rounds.length > 0

  async function save() {
    const problem = submitProblem({ submitted_on: submittedOn, expected_by: expectedBy || null }, rounds)
    if (problem) { setError(problem); return }
    setSaving(true); setError('')
    try {
      const form = new FormData()
      form.append('submitted_on', submittedOn)
      if (expectedBy) form.append('expected_by', expectedBy)
      if (note.trim()) form.append('note', note.trim())
      carry.forEach(u => form.append('carry', u))
      files.forEach(f => form.append('files', f))
      const res = await fetch(`/api/projects/${projectId}/permits/${permit.id}/rounds`, {
        method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? `Could not save (${res.status})`); return }
      onSaved()
    } catch (e) {
      setError(fetchProblem(e, 'logging the submission'))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="w-full min-w-0 max-w-full sm:max-w-lg overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
          <h2 className="min-w-0 truncate font-semibold text-ink">{again ? 'Log resubmission' : 'Log submission'} - {permit.permit_type}</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:text-ink lg:h-9 lg:w-9">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Submitted on <span className="text-danger">*</span></Label>
              <Input type="date" value={submittedOn} onChange={e => setSubmittedOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Answer expected by <span className="text-faint font-normal">(optional)</span></Label>
              <Input type="date" value={expectedBy} onChange={e => setExpectedBy(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-fg">
            Only the date is needed - it starts the clock. If they gave no answer date, the permit is flagged for a chase after three weeks.
          </p>
          <PickList label="Fixes going in" hint="The files attached to the items they asked for. Untick any that are not going in this time."
            files={fixes.map(f => ({ ...f, key: f.url, detail: `For: ${f.item}` }))}
            picked={carry} onToggle={k => setCarry(c => toggleIn(c, k))} />
          <div className="space-y-1.5">
            <Label>What was sent <span className="text-faint font-normal">(optional)</span></Label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder={again ? 'e.g. Revised site plan and energy calc' : 'e.g. Full set, application, survey'}
              className="w-full resize-none rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
          </div>
          <FilePicker files={files} onChange={setFiles} label={fixes.length ? 'Other files sent' : 'Files sent'} />
        </div>
        <div className="space-y-2 border-t border-line-soft px-5 py-4">
          {error && <p className="flex items-start gap-1 text-xs text-danger"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}</p>}
          <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Log it'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Record the reviewer's answer to the submission waiting on them. */
export function AnswerRoundDialog({ projectId, permit, round, rounds, shares, onClose, onSaved }: {
  projectId: string; permit: ThreadPermit; round: PermitRound; rounds: PermitRound[]; shares: PermitShare[]
  onClose: () => void; onSaved: () => void
}) {
  // EMPTY: which answer they gave is the whole question, and a default is a
  // claim nobody made.
  const [outcome, setOutcome] = useState<Outcome | ''>('')
  const [outcomeOn, setOutcomeOn] = useState(todayIso())
  const [note, setNote] = useState('')
  const [itemsText, setItemsText] = useState('')
  const [permitNumber, setPermitNumber] = useState(permit.permit_number ?? '')
  const [issuedDate, setIssuedDate] = useState(permit.issued_date ?? '')
  const [expiryDate, setExpiryDate] = useState(permit.expiry_date ?? '')
  const [files, setFiles] = useState<File[]>([])
  // What came back through a link sent from this permit, not yet used.
  const fromLinks = useMemo(() => unusedUploads(shares, rounds), [shares, rounds])
  const [useLinks, setUseLinks] = useState<Set<string>>(() => new Set(fromLinks.map(u => u.id)))
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // THE APPROVED PERMIT, READ BY AI. The same reader as Add Permit (one AI
  // scan). It only FILLS the boxes - nothing is saved until Record answer, so
  // a misread number is corrected on the screen, not discovered later.
  async function readWithAi(file: File) {
    setReading(true); setReadNote('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/projects/${projectId}/permits/analyze`, {
        method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setReadNote(json.error ?? 'Could not read it - fill the boxes in by hand.'); return }
      const f = json.fields ?? {}
      const got: string[] = []
      if (f.permit_number) { setPermitNumber(String(f.permit_number)); got.push('number') }
      if (f.issued_date) { setIssuedDate(String(f.issued_date)); got.push('issue date') }
      if (f.expiry_date) { setExpiryDate(String(f.expiry_date)); got.push('expiry') }
      setReadNote(got.length ? `Filled in the ${got.join(', ')} from ${file.name}. Check them before saving.` : `Nothing readable in ${file.name} - fill the boxes in by hand.`)
    } catch (e) {
      setReadNote(fetchProblem(e, 'reading the permit'))
    } finally {
      setReading(false)
    }
  }

  async function readLinkUpload(u: PermitShare['uploads'][number]) {
    try {
      const res = await fetch(u.url)
      if (!res.ok) throw new Error(`Could not open ${u.name}`)
      const blob = await res.blob()
      await readWithAi(new File([blob], u.name, { type: u.type || blob.type }))
    } catch (e) {
      setReadNote(fetchProblem(e, 'opening that file'))
    }
  }

  async function save() {
    const items = cleanItems(itemsText.split('\n'))
    const problem = outcomeProblem(
      { outcome, outcome_on: outcomeOn, items, permit_number: permitNumber || null, issued_date: issuedDate || null },
      round, permit,
    )
    if (problem) { setError(problem); return }
    setSaving(true); setError('')
    try {
      const form = new FormData()
      form.append('outcome', outcome)
      form.append('outcome_on', outcomeOn)
      if (note.trim()) form.append('note', note.trim())
      if (outcome === 'corrections') items.forEach(i => form.append('items', i))
      if (outcome === 'approved') {
        form.append('permit_number', permitNumber)
        form.append('issued_date', issuedDate)
        if (expiryDate) form.append('expiry_date', expiryDate)
      }
      useLinks.forEach(id => form.append('share_upload', id))
      files.forEach(f => form.append('files', f))
      const res = await fetch(`/api/projects/${projectId}/permits/${permit.id}/rounds/${round.id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${await token()}` }, body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? `Could not save (${res.status})`); return }
      if (json.error) setError(json.error)
      onSaved()
    } catch (e) {
      setError(fetchProblem(e, 'recording the answer'))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="w-full min-w-0 max-w-full sm:max-w-lg overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
          <h2 className="min-w-0 truncate font-semibold text-ink">Their answer - {permit.permit_type}</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:text-ink lg:h-9 lg:w-9">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-muted-fg">Submitted {shortDay(round.submitted_on)}{round.submitted_note ? ` - ${round.submitted_note}` : ''}</p>
          <div className="space-y-1.5">
            <Label>What did they say? <span className="text-danger">*</span></Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['corrections', 'approved', 'rejected'] as Outcome[]).map(o => (
                <button key={o} type="button" onClick={() => setOutcome(o)}
                  className={cn('min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium',
                    outcome === o ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Answered on <span className="text-danger">*</span></Label>
            <Input type="date" value={outcomeOn} onChange={e => setOutcomeOn(e.target.value)} />
          </div>

          <PickList label="Sent back through the link" hint="Files they uploaded on a link sent from this permit. Ticked ones become part of this answer."
            files={fromLinks.map(u => ({ ...u, key: u.id, detail: `Uploaded ${shortDay(u.created_at.slice(0, 10))}${u.note ? ` - ${u.note}` : ''}` }))}
            picked={useLinks} onToggle={k => setUseLinks(c => toggleIn(c, k))} />

          {outcome === 'corrections' && (
            <div className="space-y-1.5">
              <Label>What they asked for <span className="text-danger">*</span></Label>
              <textarea rows={4} value={itemsText} onChange={e => setItemsText(e.target.value)}
                placeholder={'One per line, e.g.\nRevised site plan showing setbacks\nEnergy calc (REScheck)\nHOA approval letter'}
                className="w-full resize-y rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
              <p className="text-xs text-muted-fg">Each line becomes a punch-list item. Pasting the list from their email works.</p>
            </div>
          )}
          {outcome === 'approved' && (
            <>
              <div className="space-y-1.5">
                <Label><Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent-fg" />Approved permit <span className="text-faint font-normal">(optional)</span></Label>
                <label className={cn('flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-sm',
                  reading ? 'pointer-events-none border-accent bg-accent-tint text-accent-fg' : 'border-accent/40 bg-accent-tint/40 text-accent-fg hover:border-accent')}>
                  {reading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Sparkles className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 truncate">
                    {reading ? 'Reading the permit...' : files.length ? files.map(f => f.name).join(', ') : 'Drop the PDF or a screenshot - AI fills in the number and dates'}
                  </span>
                  <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setFiles([f])
                      void readWithAi(f)
                    }} />
                </label>
                {fromLinks.length > 0 && !files.length && (
                  <div className="flex flex-wrap gap-2">
                    {fromLinks.filter(u => /pdf|image/.test(u.type ?? '') || /\.(pdf|jpe?g|png|webp)$/i.test(u.name)).map(u => (
                      <button key={u.id} type="button" onClick={() => void readLinkUpload(u)}
                        className="min-h-9 max-w-full truncate whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-accent-fg hover:bg-surface">
                        Read {u.name} with AI
                      </button>
                    ))}
                  </div>
                )}
                {readNote && <p className="text-xs text-muted-fg">{readNote}</p>}
                <p className="text-xs text-muted-fg">The latest approved file becomes the permit itself - what the list, Files and anyone you share it with see.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Permit number <span className="text-danger">*</span></Label>
                  <Input value={permitNumber} onChange={e => setPermitNumber(e.target.value)} placeholder="e.g. 2026-BLD-0412" />
                </div>
                <div className="space-y-1.5">
                  <Label>Date issued <span className="text-danger">*</span></Label>
                  <Input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Expires <span className="text-faint font-normal">(optional)</span></Label>
                  <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-faint font-normal">(optional)</span></Label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              className="w-full resize-none rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
          </div>
          {outcome !== 'approved' && <FilePicker files={files} onChange={setFiles} label="What they sent back" hint="Attach their letter or the marked-up set" />}
        </div>
        <div className="space-y-2 border-t border-line-soft px-5 py-4">
          {error && <p className="flex items-start gap-1 text-xs text-danger"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}</p>}
          <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving || reading}>{saving ? 'Saving...' : 'Record answer'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Everything on a permit that could be sent: the final permit first, then each round's files, then the fixes. */
export function permitShareables(permit: ThreadPermit, rounds: PermitRound[], items: PermitItem[], shares: PermitShare[]): ShareableFile[] {
  const out: ShareableFile[] = []
  const seen = new Set<string>()
  const add = (f: RoundFile, source: string) => {
    if (!f.url || seen.has(f.url)) return
    seen.add(f.url)
    out.push({ id: f.url, name: f.name, file_url: f.url, file_type: f.type ?? null, size_bytes: f.size ?? null, source })
  }
  if (permit.file_url) {
    add({ name: `${permit.permit_type} permit${permit.permit_number ? ` #${permit.permit_number}` : ''}`, url: permit.file_url }, 'The permit')
  }
  sortRounds(rounds).forEach((r, i) => {
    for (const f of r.sent_files ?? []) add(f, `Round ${i + 1} - sent`)
    for (const f of r.received_files ?? []) add(f, `Round ${i + 1} - came back`)
  })
  for (const it of items) for (const f of it.files ?? []) add(f, 'Fixes')
  for (const s of shares) for (const u of s.uploads) add(u, 'Sent back through a link')
  return out
}

/** The history panel itself. */
export function PermitThread({ projectId, permit, rounds: roundsIn, items, shares = [], historyOk, canEdit, onChanged, onDialogChange }: {
  projectId: string
  permit: ThreadPermit
  rounds: PermitRound[]
  items: PermitItem[]
  /** Links sent from this permit, with what came back on them. */
  shares?: PermitShare[]
  /** False when the history could not be read - then nothing here may claim "nothing logged". */
  historyOk: boolean
  canEdit: boolean
  onChanged: () => void
  /** Told when a dialog opens or closes, so a swipeable drawer around this can hold still. */
  onDialogChange?: (open: boolean) => void
}) {
  const notify = useNotice()
  const guard = useDeleteGuard()
  const client = useClientContact(projectId)
  const [dialog, setDialog] = useState<'submit' | 'answer' | 'share' | null>(null)
  const [newItem, setNewItem] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { onDialogChange?.(dialog !== null) }, [dialog, onDialogChange])

  const rounds = sortRounds(roundsIn)
  const waiting = openRound(rounds)
  const standing = permitStanding(permit, rounds, items, todayIso())
  const open = items.filter(i => !i.done_at)
  const closed = items.filter(i => i.done_at)
  const shareables = permitShareables(permit, rounds, items, shares)
  // What a Share starts with: the permit itself once it is approved, otherwise
  // what went in with the latest submission.
  const preselect = standing.court === 'done' && permit.file_url
    ? [permit.file_url]
    : (rounds[rounds.length - 1]?.sent_files ?? []).map(f => f.url)

  async function call(key: string, url: string, init: RequestInit, action: string) {
    setBusy(key)
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { notify(json.error ?? `Could not save (${res.status})`); return false }
      return true
    } catch (e) {
      notify(fetchProblem(e, action))
      return false
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  async function addItem() {
    const label = newItem.trim()
    if (!label) { notify('Type what they asked for first.', { tone: 'info' }); return }
    const ok = await call('add', `/api/projects/${projectId}/permits/${permit.id}/items`,
      { method: 'POST', body: JSON.stringify({ label }) }, 'adding the item')
    if (ok) setNewItem('')
  }

  const toggle = (item: PermitItem) => call(item.id, `/api/projects/${projectId}/permits/${permit.id}/items/${item.id}`,
    { method: 'PATCH', body: JSON.stringify({ done: !item.done_at }) }, 'saving the item')

  const remove = (item: PermitItem) => guard(
    () => { void call(item.id, `/api/projects/${projectId}/permits/${permit.id}/items/${item.id}`, { method: 'DELETE' }, 'removing the item') },
    { title: 'Remove this item?', body: `"${item.label}" comes off the list. Use this for a typo; tick it instead when it is done.`, confirmLabel: 'Remove' },
  )

  // The file that closes an item. Multipart, so not through `call`.
  async function attach(item: PermitItem, picked: File[]) {
    if (!picked.length) return
    setBusy(item.id)
    try {
      const form = new FormData()
      picked.forEach(f => form.append('files', f))
      const res = await fetch(`/api/projects/${projectId}/permits/${permit.id}/items/${item.id}/files`, {
        method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) notify(json.error ?? `Could not attach (${res.status})`)
    } catch (e) {
      notify(fetchProblem(e, 'attaching the file'))
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  const detach = (item: PermitItem, f: RoundFile) => guard(
    () => { void call(item.id, `/api/projects/${projectId}/permits/${permit.id}/items/${item.id}/files`, { method: 'DELETE', body: JSON.stringify({ url: f.url }) }, 'removing the file') },
    { title: 'Take this file off the item?', body: `${f.name} comes off "${item.label}". If it already went in with a submission, that submission keeps its copy.`, confirmLabel: 'Take it off' },
  )

  if (!historyOk) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        Could not load this permit&apos;s submissions. Reload to see who has it.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', STANDING_CHIP[standing.tone])}>
          {standing.chase ? 'Chase' : standing.court === 'them' ? 'With them' : standing.court === 'us' ? 'With us' : standing.court === 'done' ? 'Done' : 'Not logged'}
        </span>
        <span className="min-w-0 text-sm font-medium text-ink">{standing.label}</span>
      </div>

      {canEdit && (
        <div className="row-even lg:flex lg:flex-wrap gap-2">
          {waiting
            ? <Button size="sm" onClick={() => setDialog('answer')}><Check className="h-3.5 w-3.5" /> Record their answer</Button>
            : <Button size="sm" onClick={() => setDialog('submit')}><Send className="h-3.5 w-3.5" /> {rounds.length ? (standing.court === 'done' ? 'Log a revision' : 'Log resubmission') : 'Log submission'}</Button>}
          <Button size="sm" variant="outline" onClick={() => setDialog('share')}><Share2 className="h-3.5 w-3.5" /> Share</Button>
        </div>
      )}

      {(items.length > 0 || canEdit) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">What they asked for</p>
          {items.length === 0 && <p className="text-sm text-muted-fg">Nothing outstanding.</p>}
          {items.length > 0 && (
            <div className="divide-y divide-line-soft rounded-lg border border-line">
              {[...open, ...closed].map(item => (
                <div key={item.id} className="flex items-start gap-2 px-2 py-1">
                  {canEdit ? <button type="button" onClick={() => toggle(item)} disabled={busy === item.id}
                    aria-label={item.done_at ? `Mark "${item.label}" not done` : `Mark "${item.label}" done`}
                    title={item.done_at ? 'Mark not done' : 'Mark done'}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:text-ink lg:h-8 lg:w-8">
                    {item.done_at ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
                  </button> : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-faint">
                      {item.done_at ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1 py-1.5 lg:py-1">
                    <p className={cn('break-words text-sm', item.done_at ? 'text-faint line-through' : 'text-ink')}>{item.label}</p>
                    {item.done_at && item.done_by_name && <p className="text-xs text-faint">Done by {item.done_by_name}</p>}
                    {!!item.files?.length && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {item.files.map(f => (
                          <span key={f.url} className="inline-flex max-w-full min-w-0 items-center rounded-md border border-line text-xs">
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 px-2 py-1 text-accent-fg hover:bg-surface">
                              <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{f.name}</span>
                            </a>
                            {canEdit && (
                              <button type="button" onClick={() => detach(item, f)} aria-label={`Take ${f.name} off`} title="Take it off"
                                className="flex h-8 w-8 shrink-0 items-center justify-center text-faint hover:text-danger">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <label aria-label={`Attach the fix for "${item.label}"`} title="Attach the fix"
                      className={cn('flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-faint hover:text-ink lg:h-8 lg:w-8',
                        busy === item.id && 'pointer-events-none opacity-50')}>
                      {busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                      <input type="file" multiple className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.dwg"
                        onChange={e => { void attach(item, Array.from(e.target.files ?? [])); e.target.value = '' }} />
                    </label>
                  )}
                  {canEdit && !item.done_at && (
                    <button type="button" onClick={() => remove(item)} aria-label={`Remove "${item.label}"`} title="Remove"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:text-danger lg:h-8 lg:w-8">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex gap-2">
              <Input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="They also want..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addItem() } }} />
              <Button type="button" variant="outline" onClick={addItem} disabled={busy === 'add'}><Plus className="h-4 w-4" /> Add</Button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">History</p>
        {rounds.length === 0 ? (
          <p className="text-sm text-muted-fg">No submissions logged. Log the first one when it goes in - from then on this permit says who has it.</p>
        ) : (
          <ol className="space-y-3">
            {rounds.map((r, i) => (
              <li key={r.id} className="rounded-lg border border-line px-3 py-2.5">
                <p className="text-sm text-ink">
                  <span className="font-semibold">Round {i + 1}</span>
                  <span className="text-muted-fg"> - submitted {shortDay(r.submitted_on)}{r.created_by_name ? ` by ${r.created_by_name}` : ''}</span>
                </p>
                {r.submitted_note && <p className="mt-0.5 break-words text-sm text-muted-fg">{r.submitted_note}</p>}
                <Files files={r.sent_files} />
                {r.outcome ? (
                  <div className="mt-2 border-t border-line-soft pt-2">
                    <p className={cn('text-sm font-medium',
                      r.outcome === 'approved' ? 'text-success' : r.outcome === 'rejected' ? 'text-danger' : 'text-warn')}>
                      {OUTCOME_LABEL[r.outcome]} {shortDay(r.outcome_on as string)}
                      {r.outcome_by_name && <span className="font-normal text-faint"> - recorded by {r.outcome_by_name}</span>}
                    </p>
                    {r.outcome_note && <p className="mt-0.5 break-words text-sm text-muted-fg">{r.outcome_note}</p>}
                    <Files files={r.received_files} />
                  </div>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 border-t border-line-soft pt-2 text-sm text-info">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    Waiting on {permit.issuing_authority?.trim() || 'the reviewer'}
                    {r.expected_by ? `, answer expected ${shortDay(r.expected_by)}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {shares.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Shared</p>
          <div className="divide-y divide-line-soft rounded-lg border border-line">
            {shares.map(s => (
              <div key={s.id} className="px-3 py-2.5">
                <p className="text-sm text-ink">
                  <span className="font-medium">{s.recipient_name || s.recipient_email || 'A link'}</span>
                  <span className="text-muted-fg"> - {s.name}, sent {shortDay(s.created_at.slice(0, 10))}</span>
                </p>
                <p className="text-xs text-faint">
                  {s.revoked_at ? 'Link turned off' : s.viewed_at ? `Opened ${shortDay(s.viewed_at.slice(0, 10))}` : 'Not opened yet'}
                  {s.uploads.length ? ` · sent back ${s.uploads.length} file${s.uploads.length === 1 ? '' : 's'}` : ''}
                </p>
                <Files files={s.uploads} />
              </div>
            ))}
          </div>
        </div>
      )}

      {dialog === 'submit' && (
        <SubmitRoundDialog projectId={projectId} permit={permit} rounds={rounds} items={items}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged() }} />
      )}
      {dialog === 'answer' && waiting && (
        <AnswerRoundDialog projectId={projectId} permit={permit} round={waiting} rounds={rounds} shares={shares}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged() }} />
      )}
      {dialog === 'share' && (
        <ShareFilesModal files={shareables} preselected={preselect} projectId={projectId} permitId={permit.id}
          defaultTitle={standing.court === 'done' ? `${permit.permit_type} permit${permit.permit_number ? ` #${permit.permit_number}` : ''}` : `${permit.permit_type} permit - documents`}
          suggested={client.email ? [{ label: 'The client', name: client.name, email: client.email }] : []}
          onClose={() => setDialog(null)} onShared={onChanged} />
      )}
    </div>
  )
}
