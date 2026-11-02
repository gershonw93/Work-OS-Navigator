'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { fetchProblem } from '@/lib/fetch-error'
import { cn } from '@/lib/utils'
import {
  AlertCircle, Check, CheckCircle2, Circle, Clock, FileText, Paperclip, Plus, Send, X,
} from 'lucide-react'
import {
  cleanItems, openRound, outcomeProblem, permitStanding, shortDay, sortRounds, submitProblem, todayIso,
  OUTCOME_LABEL, type Outcome, type PermitItem, type PermitRound, type RoundFile, type StandingTone,
} from '@/lib/permit-rounds'
import type { PermitFacts } from '@/lib/permit-rules'

// ─────────────────────────────────────────────────────────────────────────────
// A permit's history: every submission, every answer, and what is still owed.
// Rendered in the permit's own panel on the Permits tab AND in the development
// board's drawer, so the two cannot drift. Nothing here decides anything - the
// rules are lib/permit-rounds.ts, asked here before sending and again by the
// route before writing.
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

function FilePicker({ files, onChange, label }: { files: File[]; onChange: (f: File[]) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-faint font-normal">(optional)</span></Label>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-muted2 px-3 py-3 text-sm text-muted-fg hover:border-accent">
        <Paperclip className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{files.length ? files.map(f => f.name).join(', ') : 'Attach the letter, plans or forms'}</span>
        <input type="file" multiple className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
          onChange={e => onChange(Array.from(e.target.files ?? []))} />
      </label>
    </div>
  )
}

/** Log a submission (or a resubmission) for one permit. */
export function SubmitRoundDialog({ projectId, permit, rounds, onClose, onSaved }: {
  projectId: string; permit: ThreadPermit; rounds: PermitRound[]; onClose: () => void; onSaved: () => void
}) {
  const [submittedOn, setSubmittedOn] = useState(todayIso())
  const [expectedBy, setExpectedBy] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
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
            If they gave no date, the permit is flagged for a chase after three weeks with no answer.
          </p>
          <div className="space-y-1.5">
            <Label>What was sent <span className="text-faint font-normal">(optional)</span></Label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder={again ? 'e.g. Revised site plan and energy calc' : 'e.g. Full set, application, survey'}
              className="w-full resize-none rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
          </div>
          <FilePicker files={files} onChange={setFiles} label="Files sent" />
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
export function AnswerRoundDialog({ projectId, permit, round, onClose, onSaved }: {
  projectId: string; permit: ThreadPermit; round: PermitRound; onClose: () => void; onSaved: () => void
}) {
  // EMPTY: which answer they gave is the whole question, and a default is a
  // claim nobody made.
  const [outcome, setOutcome] = useState<Outcome | ''>('')
  const [outcomeOn, setOutcomeOn] = useState(todayIso())
  const [note, setNote] = useState('')
  const [itemsText, setItemsText] = useState('')
  const [permitNumber, setPermitNumber] = useState(permit.permit_number ?? '')
  const [issuedDate, setIssuedDate] = useState(permit.issued_date ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      }
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
          {outcome === 'corrections' && (
            <div className="space-y-1.5">
              <Label>What they asked for <span className="text-danger">*</span></Label>
              <textarea rows={4} value={itemsText} onChange={e => setItemsText(e.target.value)}
                placeholder={'One per line, e.g.\nRevised site plan showing setbacks\nEnergy calc (REScheck)\nHOA approval letter'}
                className="w-full resize-y rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
              <p className="text-xs text-muted-fg">Each line becomes an item to tick off. Pasting a list from their email works.</p>
            </div>
          )}
          {outcome === 'approved' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Permit number <span className="text-danger">*</span></Label>
                <Input value={permitNumber} onChange={e => setPermitNumber(e.target.value)} placeholder="e.g. 2026-BLD-0412" />
              </div>
              <div className="space-y-1.5">
                <Label>Date issued <span className="text-danger">*</span></Label>
                <Input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-faint font-normal">(optional)</span></Label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              className="w-full resize-none rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
          </div>
          <FilePicker files={files} onChange={setFiles} label="What they sent back" />
        </div>
        <div className="space-y-2 border-t border-line-soft px-5 py-4">
          {error && <p className="flex items-start gap-1 text-xs text-danger"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}</p>}
          <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Record answer'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The history panel itself. */
export function PermitThread({ projectId, permit, rounds: roundsIn, items, historyOk, canEdit, onChanged, onDialogChange }: {
  projectId: string
  permit: ThreadPermit
  rounds: PermitRound[]
  items: PermitItem[]
  /** False when the history could not be read - then nothing here may claim "nothing logged". */
  historyOk: boolean
  canEdit: boolean
  onChanged: () => void
  /** Told when a dialog opens or closes, so a swipeable drawer around this can hold still. */
  onDialogChange?: (open: boolean) => void
}) {
  const notify = useNotice()
  const guard = useDeleteGuard()
  const [dialog, setDialog] = useState<'submit' | 'answer' | null>(null)
  const [newItem, setNewItem] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { onDialogChange?.(dialog !== null) }, [dialog, onDialogChange])

  const rounds = sortRounds(roundsIn)
  const waiting = openRound(rounds)
  const standing = permitStanding(permit, rounds, items, todayIso())
  const open = items.filter(i => !i.done_at)
  const closed = items.filter(i => i.done_at)

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
        </div>
      )}

      {(items.length > 0 || canEdit) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">What they asked for</p>
          {items.length === 0 && <p className="text-sm text-muted-fg">Nothing outstanding.</p>}
          {items.length > 0 && (
            <div className="divide-y divide-line-soft rounded-lg border border-line">
              {[...open, ...closed].map(item => (
                <div key={item.id} className="flex items-center gap-2 px-2 py-1">
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
                  <div className="min-w-0 flex-1">
                    <p className={cn('break-words text-sm', item.done_at ? 'text-faint line-through' : 'text-ink')}>{item.label}</p>
                    {item.done_at && item.done_by_name && <p className="text-xs text-faint">Done by {item.done_by_name}</p>}
                  </div>
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

      {dialog === 'submit' && (
        <SubmitRoundDialog projectId={projectId} permit={permit} rounds={rounds}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged() }} />
      )}
      {dialog === 'answer' && waiting && (
        <AnswerRoundDialog projectId={projectId} permit={permit} round={waiting}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged() }} />
      )}
    </div>
  )
}
