'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { ShareFilesModal, type ShareableFile } from '@/components/files/share-files-modal'
import { useClientContact } from '@/lib/use-client-email'
import { useSwipeDismiss } from '@/lib/use-swipe-dismiss'
import { shrinkImage, shrinkImages } from '@/lib/shrink-image'
import { fetchProblem } from '@/lib/fetch-error'
import { cn } from '@/lib/utils'
import {
  AlertCircle, Check, ChevronDown, ChevronUp, FileText, Loader2, Paperclip, Phone, Sparkles, X,
} from 'lucide-react'
import {
  carryableFiles, cleanItems, dayLabel, permitStage, sortRounds, todayIso, unusedUploads, OUTCOME_LABEL, STEP_NAMES,
  type Group, type Outcome, type PermitItem, type PermitRound, type PermitShare, type PermitStage, type RoundFile, type StandingTone,
} from '@/lib/permit-rounds'
import type { PermitFacts } from '@/lib/permit-rules'

// ─────────────────────────────────────────────────────────────────────────────
// One permit, opened from the list: where it is on its four steps, the ONE
// thing to do next, then its history and details. The redesign's rule is that
// the next step is a single coloured card - checklist and Send when it is your
// move, Record their answer and Call when it is with the city, Close out when
// it is issued - so nobody has to work out from a status what to press.
//
// Docked beside the list on a desktop; on a phone it is the whole screen, with
// the card's buttons pinned under the thumb. Every rule is lib/permit-rounds.ts
// (`permitStage`), the same one the list rows and the development board read.
// ─────────────────────────────────────────────────────────────────────────────

/** The board's chips. Kept beside the panel's own colours so the two agree. */
export const STANDING_CHIP: Record<StandingTone, string> = {
  neutral: 'bg-surface border-line text-muted-fg',
  info: 'bg-info-tint border-info/30 text-info',
  warn: 'bg-warn-tint border-warn/30 text-warn',
  danger: 'bg-danger-tint border-danger/30 text-danger',
  success: 'bg-success-tint border-success/30 text-success',
}

/** One colour per group, used by the count chips, the bar, the path and the card. */
export const GROUP_STYLE: Record<Group | 'bad', { pill: string; card: string; seg: string; dot: string }> = {
  you: { pill: 'bg-accent text-accent-ink', card: 'bg-accent-tint border-accent/50', seg: 'bg-accent', dot: 'bg-accent border-accent' },
  city: { pill: 'bg-info-tint text-info', card: 'bg-info-tint/60 border-info/30', seg: 'bg-info', dot: 'bg-info border-info' },
  iss: { pill: 'bg-success-tint text-success', card: 'bg-success-tint/60 border-success/30', seg: 'bg-success', dot: 'bg-success border-success' },
  bad: { pill: 'bg-danger-tint text-danger', card: 'bg-danger-tint border-danger/30', seg: 'bg-danger', dot: 'bg-danger border-danger' },
}

export interface PanelPermit extends PermitFacts {
  id: string
  project_id?: string
  permit_type: string
  file_url?: string | null
  inspector_name?: string | null
  inspector_phone?: string | null
  notes?: string | null
  created_at?: string | null
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

const styleOf = (st: PermitStage) => GROUP_STYLE[st.stage === 'renew' ? 'bad' : st.group]

/** The four-step bar on a list row. */
export function StepBar({ st, label }: { st: PermitStage; label?: string }) {
  return (
    <div className="flex gap-[3px]" role="img" aria-label={label ?? `Step ${st.step + 1} of 4, ${STEP_NAMES[st.step]}`}>
      {STEP_NAMES.map((_, k) => {
        const done = k < st.step || st.stage === 'closed'
        const now = k === st.step && !done
        return <span key={k} className={cn('h-1.5 w-[19px] rounded-full', done ? 'bg-success' : now ? styleOf(st).seg : 'bg-line')} />
      })}
    </div>
  )
}

function Path({ st }: { st: PermitStage }) {
  const nowSub = { draft: 'Not sent yet', fix: 'Back to you', city: `Round ${st.rounds.length}`, renew: 'Expired', issued: '', closed: '' }[st.stage]
  return (
    <div className="grid grid-cols-4" role="img" aria-label={`Step ${st.step + 1} of 4, ${STEP_NAMES[st.step]}`}>
      {STEP_NAMES.map((name, k) => {
        const done = k < st.step || st.stage === 'closed'
        const now = k === st.step && !done
        return (
          <div key={name} className={cn('relative flex flex-col gap-1.5 text-xs', now ? 'font-semibold text-ink' : 'text-muted-fg')}>
            {k < 3 && <span className={cn('absolute left-7 right-1 top-[10px] h-0.5', done ? 'bg-success' : 'bg-line')} aria-hidden="true" />}
            <span className={cn('flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-white',
              done ? 'border-success bg-success' : now ? styleOf(st).dot : 'border-line bg-panel')}>
              {done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span>{name}{now && nowSub && <span className="block font-medium text-muted-fg">{nowSub}</span>}</span>
          </div>
        )
      })}
    </div>
  )
}

function FileChip({ f, onRemove }: { f: RoundFile; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center rounded-md border border-line bg-panel text-xs">
      <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 px-2 py-1 text-accent-fg hover:bg-surface">
        <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{f.name}</span>
      </a>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Take ${f.name} off`} title="Take it off"
          className="flex h-8 w-8 shrink-0 items-center justify-center text-faint hover:text-danger">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  )
}

function LocalChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center rounded-md border border-line bg-panel text-xs">
      <span className="flex min-w-0 items-center gap-1 px-2 py-1 text-ink"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{name}</span></span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} title="Remove"
        className="flex h-8 w-8 shrink-0 items-center justify-center text-faint hover:text-danger">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/** A hidden file input dressed as a button. */
function AttachButton({ label, onPick, accept, big, multiple = true }: {
  label: string; onPick: (f: File[]) => void; accept?: string; big?: boolean; multiple?: boolean
}) {
  return (
    <label className={cn('inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-muted2 bg-panel px-4 text-sm font-medium text-ink-soft hover:bg-surface',
      big ? 'min-h-11' : 'min-h-9')}>
      <Paperclip className="h-4 w-4 shrink-0" />{label}
      <input type="file" multiple={multiple} className="sr-only" accept={accept ?? '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.dwg'}
        onChange={async e => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; onPick(await shrinkImages(picked)) }} />
    </label>
  )
}

/** Everything on a permit that could be sent: the permit itself first, then each round's files, the fixes, what came back. */
export function permitShareables(permit: PanelPermit, rounds: PermitRound[], items: PermitItem[], shares: PermitShare[]): ShareableFile[] {
  const out: ShareableFile[] = []
  const seen = new Set<string>()
  const add = (f: RoundFile, source: string) => {
    if (!f.url || seen.has(f.url)) return
    seen.add(f.url)
    out.push({ id: f.url, name: f.name, file_url: f.url, file_type: f.type ?? null, size_bytes: f.size ?? null, source })
  }
  if (permit.file_url) add({ name: `${permit.permit_type} permit${permit.permit_number ? ` #${permit.permit_number}` : ''}`, url: permit.file_url }, 'The permit')
  sortRounds(rounds).forEach((r, i) => {
    for (const f of r.sent_files ?? []) add(f, `Round ${i + 1} - sent`)
    for (const f of r.received_files ?? []) add(f, `Round ${i + 1} - came back`)
  })
  for (const it of items) for (const f of it.files ?? []) add(f, 'Fixes')
  for (const s of shares) for (const u of s.uploads) add(u, 'Sent back through a link')
  return out
}

/** A tel: link only out of something with a digit in it (the `whoToCall` rule). */
const telOf = (phone?: string | null) => (phone && /\d/.test(phone) ? `tel:${phone.replace(/[^\d+]/g, '')}` : null)

export interface PanelNav { pos: number; total: number; prev: () => void; next: () => void }

/**
 * The panel. `docked` is the desktop column beside the list; otherwise it is a
 * full-screen drawer that can be swiped away, with the buttons pinned below.
 */
export function PermitPanel({
  projectId, permit, rounds, items, shares, historyOk, canEdit, docked, nav, onChanged, onClose, onEdit, onDelete, title, answerNow,
}: {
  projectId: string
  permit: PanelPermit
  /** Opened from a row's "Their answer": start on the answer choices. */
  answerNow?: boolean
  rounds: PermitRound[]
  items: PermitItem[]
  shares: PermitShare[]
  historyOk: boolean
  canEdit: boolean
  docked: boolean
  nav?: PanelNav
  onChanged: () => void
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
  /** A line above the permit name - the house, on a development's board. */
  title?: string
}) {
  const swipe = useSwipeDismiss(onClose)
  const [sharing, setSharing] = useState(false)
  const body = (
    <PanelBody projectId={projectId} permit={permit} rounds={rounds} items={items} shares={shares} historyOk={historyOk}
      canEdit={canEdit} nav={nav} onChanged={onChanged} onClose={onClose} onEdit={onEdit} onDelete={onDelete}
      onShare={() => setSharing(true)} title={title} answerNow={answerNow} />
  )
  return (
    <>
      {docked ? (
        <aside aria-label="Permit details"
          className="sticky top-4 flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-2xl border border-line bg-panel">
          {body}
        </aside>
      ) : (
        <div className="overlay-drawer bg-black/20" data-overlay onClick={() => { if (!sharing) onClose() }}>
          <aside aria-label="Permit details" onClick={e => e.stopPropagation()}
            {...(sharing ? {} : swipe.handlers)} style={sharing ? undefined : swipe.style}
            className="flex flex-col overflow-hidden border-l border-line bg-panel shadow-2xl">
            {body}
          </aside>
        </div>
      )}
      {sharing && (
        <ShareFor projectId={projectId} permit={permit} rounds={rounds} items={items} shares={shares}
          onClose={() => setSharing(false)} onShared={onChanged} />
      )}
    </>
  )
}

function ShareFor({ projectId, permit, rounds, items, shares, onClose, onShared }: {
  projectId: string; permit: PanelPermit; rounds: PermitRound[]; items: PermitItem[]; shares: PermitShare[]
  onClose: () => void; onShared: () => void
}) {
  const client = useClientContact(projectId)
  const st = permitStage(permit, rounds, items, todayIso())
  const sorted = sortRounds(rounds)
  // Issued: start with the permit itself. Before that: what went in last.
  const preselect = st.group === 'iss' && permit.file_url
    ? [permit.file_url]
    : (sorted[sorted.length - 1]?.sent_files ?? []).map(f => f.url)
  return (
    <ShareFilesModal files={permitShareables(permit, rounds, items, shares)} preselected={preselect}
      projectId={projectId} permitId={permit.id}
      defaultTitle={st.group === 'iss' ? `${permit.permit_type} permit${permit.permit_number ? ` #${permit.permit_number}` : ''}` : `${permit.permit_type} permit - documents`}
      suggested={client.email ? [{ label: 'The client', name: client.name, email: client.email }] : []}
      onClose={onClose} onShared={onShared} />
  )
}

function PanelBody({
  projectId, permit, rounds: roundsIn, items, shares, historyOk, canEdit, nav, onChanged, onClose, onEdit, onDelete, onShare, title, answerNow,
}: {
  projectId: string; permit: PanelPermit; rounds: PermitRound[]; items: PermitItem[]; shares: PermitShare[]
  historyOk: boolean; canEdit: boolean; nav?: PanelNav
  onChanged: () => void; onClose: () => void; onEdit?: () => void; onDelete?: () => void; onShare: () => void; title?: string
  answerNow?: boolean
}) {
  const notify = useNotice()
  const guard = useDeleteGuard()
  const today = todayIso()
  const rounds = sortRounds(roundsIn)
  const st = permitStage(permit, rounds, items, today)
  const s = styleOf(st)
  const sendStage = st.stage === 'draft' || st.stage === 'fix' || st.stage === 'renew'

  // ── what is being sent ──
  const [note, setNote] = useState('')
  const [newAsk, setNewAsk] = useState('')
  const [sendFiles, setSendFiles] = useState<File[]>([])
  const [otherDay, setOtherDay] = useState(false)
  const [sentOn, setSentOn] = useState(today)
  const [expectedBy, setExpectedBy] = useState('')
  const fixes = useMemo(() => carryableFiles(items, rounds), [items, rounds])

  // ── their answer ──
  const [answering, setAnswering] = useState(false)
  const [approving, setApproving] = useState(false)
  const [answeredOn, setAnsweredOn] = useState(today)
  const [fNo, setFNo] = useState(permit.permit_number ?? '')
  const [fIssued, setFIssued] = useState(permit.issued_date ?? '')
  const [fExp, setFExp] = useState(permit.expiry_date ?? '')
  const [permitFile, setPermitFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState('')
  const fromLinks = useMemo(() => unusedUploads(shares, rounds), [shares, rounds])
  const [useLinks, setUseLinks] = useState<Set<string>>(() => new Set(fromLinks.map(u => u.id)))

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  // A different permit, a fresh card: nothing typed for one may be sent with another.
  useEffect(() => {
    setNote(''); setNewAsk(''); setSendFiles([]); setOtherDay(false); setSentOn(todayIso()); setExpectedBy('')
    setAnswering(!!answerNow); setApproving(false); setAnsweredOn(todayIso())
    setFNo(permit.permit_number ?? ''); setFIssued(permit.issued_date ?? ''); setFExp(permit.expiry_date ?? '')
    setPermitFile(null); setReadNote(''); setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permit.id, answerNow])
  useEffect(() => { setUseLinks(new Set(fromLinks.map(u => u.id))) }, [fromLinks])

  const base = `/api/projects/${projectId}/permits/${permit.id}`

  async function json(key: string, url: string, init: RequestInit, action: string): Promise<boolean> {
    setBusy(key); setError('')
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` } })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { notify(out.error ?? `Could not save (${res.status})`); return false }
      return true
    } catch (e) {
      notify(fetchProblem(e, action))
      return false
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  async function form(key: string, url: string, method: string, body: FormData, action: string): Promise<boolean> {
    setBusy(key); setError('')
    try {
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${await token()}` }, body })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? `Could not save (${res.status})`); return false }
      if (out.error) setError(out.error)
      return true
    } catch (e) {
      setError(fetchProblem(e, action))
      return false
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  // ── asks ──
  async function addAsks() {
    const labels = cleanItems(newAsk.split('\n'))
    if (!labels.length) { notify('Type what they asked for first.', { tone: 'info' }); return }
    for (const label of labels) {
      const ok = await json('add', `${base}/items`, { method: 'POST', body: JSON.stringify({ label }) }, 'adding the item')
      if (!ok) return
    }
    setNewAsk('')
  }
  const toggleAsk = (i: PermitItem) => json(i.id, `${base}/items/${i.id}`, { method: 'PATCH', body: JSON.stringify({ done: !i.done_at }) }, 'saving the item')
  const removeAsk = (i: PermitItem) => guard(
    () => { void json(i.id, `${base}/items/${i.id}`, { method: 'DELETE' }, 'removing the item') },
    { title: 'Remove this item?', body: `"${i.label}" comes off the list. Use this for a typo; tick it instead when it is done.`, confirmLabel: 'Remove' },
  )
  async function attachToAsk(i: PermitItem, picked: File[]) {
    if (!picked.length) return
    const fd = new FormData(); picked.forEach(f => fd.append('files', f))
    await form(i.id, `${base}/items/${i.id}/files`, 'POST', fd, 'attaching the file')
  }
  const detachFromAsk = (i: PermitItem, f: RoundFile) => guard(
    () => { void json(i.id, `${base}/items/${i.id}/files`, { method: 'DELETE', body: JSON.stringify({ url: f.url }) }, 'removing the file') },
    { title: 'Take this file off the item?', body: `${f.name} comes off "${i.label}". A submission it already went in with keeps its copy.`, confirmLabel: 'Take it off' },
  )

  // ── send ──
  async function doSend() {
    const fd = new FormData()
    fd.append('submitted_on', otherDay ? sentOn : todayIso())
    if (otherDay && expectedBy) fd.append('expected_by', expectedBy)
    const n = note.trim() || (st.stage === 'renew' ? 'Renewal' : '')
    if (n) fd.append('note', n)
    // The resubmission IS the fixes: everything attached to an item that has not gone in.
    fixes.forEach(f => fd.append('carry', f.url))
    sendFiles.forEach(f => fd.append('files', f))
    const ok = await form('send', `${base}/rounds`, 'POST', fd, 'logging the submission')
    if (ok) { setNote(''); setSendFiles([]); setOtherDay(false); setExpectedBy('') }
  }
  function send() {
    if (st.stage === 'fix' && st.openAsks > 0) {
      guard(() => { void doSend() }, {
        title: `${st.openAsks} not ticked off`,
        body: `${st.openAsks === 1 ? 'One thing they asked for is' : `${st.openAsks} things they asked for are`} not ticked off. Send it to ${st.who} anyway?`,
        confirmLabel: 'Send anyway',
      })
      return
    }
    void doSend()
  }

  // ── answer ──
  async function answer(outcome: Outcome) {
    if (!st.waiting) return
    const fd = new FormData()
    fd.append('outcome', outcome)
    fd.append('outcome_on', answeredOn)
    useLinks.forEach(id => fd.append('share_upload', id))
    if (outcome === 'approved') {
      fd.append('permit_number', fNo)
      fd.append('issued_date', fIssued)
      if (fExp) fd.append('expiry_date', fExp)
      if (permitFile) fd.append('files', permitFile)
    }
    const ok = await form(outcome, `${base}/rounds/${st.waiting.id}`, 'PATCH', fd, 'recording the answer')
    if (ok) { setAnswering(false); setApproving(false); setPermitFile(null); setReadNote('') }
  }

  async function readWithAi(file: File) {
    setReading(true); setReadNote('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/projects/${projectId}/permits/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: fd })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setReadNote(out.error ?? 'Could not read it - fill the boxes in by hand.'); return }
      const f = out.fields ?? {}
      const got: string[] = []
      if (f.permit_number) { setFNo(String(f.permit_number)); got.push('number') }
      if (f.issued_date) { setFIssued(String(f.issued_date)); got.push('issue date') }
      if (f.expiry_date) { setFExp(String(f.expiry_date)); got.push('expiry') }
      setReadNote(got.length ? `Filled in the ${got.join(', ')} from ${file.name}. Check them.` : `Nothing readable in ${file.name} - fill the boxes in by hand.`)
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

  const closeOut = () => guard(
    () => { void json('close', base, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) }, 'closing out the permit') },
    { title: 'Close out this permit?', body: 'It moves to the bottom of Issued and reads Closed out. You can set it back from Edit details.', confirmLabel: 'Close it out' },
  )

  const phone = telOf(permit.inspector_phone)
  const callLabel = `Call ${permit.inspector_name?.trim() || st.who}`

  // The card's buttons. On a phone they are pinned to the bottom of the
  // screen; on a desktop they sit in the card.
  let actions: ReactNode = null
  if (canEdit && historyOk) {
    if (sendStage) {
      actions = (
        <>
          {/* A township's full name does not fit a phone button - "City of
              Brookside - Department of Buildings" ran off the screen. The
              label truncates, and the full name is the button's title. */}
          <Button className="min-h-11 min-w-0 flex-[2_1_0] lg:max-w-[22rem] lg:flex-none" onClick={send} disabled={busy === 'send'}
            title={st.stage === 'renew' ? `Send the renewal to ${st.who}` : `Send to ${st.who}`}>
            <span className="truncate">{busy === 'send' ? 'Saving...' : st.stage === 'renew' ? 'Send renewal' : `Send to ${st.who}`}</span>
          </Button>
          <AttachButton big label="Attach file" onPick={f => setSendFiles(cur => [...cur, ...f])} />
        </>
      )
    } else if (st.stage === 'city' && !answering) {
      actions = (
        <>
          <Button className="min-h-11 flex-[2_1_0] lg:flex-none" onClick={() => setAnswering(true)}>Record their answer</Button>
          {phone && <a href={phone} title={callLabel} className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-muted2 bg-panel px-4 text-sm font-medium text-ink-soft hover:bg-surface lg:max-w-[16rem] lg:flex-none"><Phone className="h-4 w-4 shrink-0" /><span className="truncate">{callLabel}</span></a>}
        </>
      )
    } else if (st.stage === 'city' && approving) {
      actions = (
        <>
          <Button className="min-h-11 flex-[2_1_0] lg:flex-none" onClick={() => void answer('approved')} disabled={busy === 'approved' || reading}>
            {busy === 'approved' ? 'Saving...' : 'Mark issued'}
          </Button>
          <Button variant="outline" className="min-h-11 flex-1 lg:flex-none" onClick={() => setApproving(false)}>Back</Button>
        </>
      )
    } else if (st.stage === 'issued') {
      actions = (
        <>
          <Button variant="outline" className="min-h-11 flex-1 lg:flex-none" onClick={onShare}>Share the permit</Button>
          <Button variant="outline" className="min-h-11 flex-1 lg:flex-none" onClick={closeOut} disabled={busy === 'close'}>Close out permit</Button>
        </>
      )
    }
  }

  const hint = st.stage === 'draft' ? 'Logs it as sent today. Already went in? Set the day below.'
    : st.stage === 'renew' ? 'Logs the renewal as sent today.'
    : !st.asks.length ? 'Add what they asked for, or send it as it is.'
    : st.openAsks ? `Check off ${st.openAsks} more, or send it as it is.`
    : 'Ready to go.'

  const kv: [string, ReactNode][] = ([
    ['Permit #', permit.permit_number],
    ['Issued by', permit.issuing_authority],
    ['Issued', permit.issued_date ? dayLabel(permit.issued_date, today) : null],
    ['Expires', permit.expiry_date ? dayLabel(permit.expiry_date, today) : null],
    ['Inspector', permit.inspector_name],
    ['Phone', permit.inspector_phone ? (telOf(permit.inspector_phone)
      ? <a href={telOf(permit.inspector_phone)!} className="text-accent-fg hover:underline">{permit.inspector_phone}</a>
      : permit.inspector_phone) : null],
  ] as [string, ReactNode][]).filter(([, v]) => v)

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 border-b border-line-soft py-1 pl-4 pr-1 lg:py-2 lg:pr-2">
        <span className="mr-auto min-w-0 truncate text-sm text-muted-fg">{nav ? `${nav.pos} of ${nav.total}` : title ?? ''}</span>
        {nav && (
          <>
            <button type="button" onClick={nav.prev} aria-label="Previous permit" title="Previous permit"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-surface lg:h-9 lg:w-9"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" onClick={nav.next} aria-label="Next permit" title="Next permit"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-surface lg:h-9 lg:w-9"><ChevronDown className="h-4 w-4" /></button>
          </>
        )}
        {canEdit && (
          <RowMenu label="More actions" triggerClassName="h-11 w-11 border-transparent lg:h-9 lg:w-9 lg:p-0">
            {close => (
              <>
                <MenuItem onClick={() => { close(); onShare() }}>Share</MenuItem>
                {onEdit && <MenuItem onClick={() => { close(); onEdit() }}>Edit details</MenuItem>}
                {permit.file_url && <MenuItem href={permit.file_url} newTab>Open the permit</MenuItem>}
                {onDelete && <MenuItem danger onClick={() => { close(); onDelete() }}>Delete permit</MenuItem>}
              </>
            )}
          </RowMenu>
        )}
        <button type="button" onClick={onClose} aria-label="Close" title="Close"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-surface lg:h-9 lg:w-9"><X className="h-5 w-5" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 p-4 lg:p-5">
          <div>
            {nav && title && <p className="mb-1 text-xs text-muted-fg">{title}</p>}
            <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold', s.pill)}>{st.pill}</span>
            <h2 className="mt-1.5 text-[22px] font-bold leading-tight text-ink">{permit.permit_type}</h2>
            <p className="text-sm text-muted-fg">{permit.permit_number || 'No number yet'} · {st.who === 'the reviewer' ? 'No issuer set' : st.who}</p>
          </div>

          {!historyOk ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Could not load this permit&apos;s history. Reload to see where it stands.
            </div>
          ) : (
            <>
              <Path st={st} />

              {/* THE NEXT STEP. One card, one colour, one thing to do. */}
              <section className={cn('flex flex-col gap-3 rounded-xl border p-4', s.card)} aria-label="Next step">
                <div>
                  <h3 className="text-[17px] font-bold leading-snug text-ink">{st.head}</h3>
                  <p className="mt-0.5 text-sm text-ink-soft">{st.sub}</p>
                </div>

                {sendStage && st.stage !== 'renew' && (st.stage === 'fix' || st.asks.length > 0) && (
                  <div className="overflow-hidden rounded-lg border border-line bg-panel">
                    {st.asks.length === 0 && <p className="px-3 py-3 text-sm text-muted-fg">Nothing listed yet. Add each thing they asked for below.</p>}
                    {st.asks.map(i => (
                      <div key={i.id} className="flex flex-wrap items-start gap-x-1 border-line-soft px-1 [&:not(:first-child)]:border-t">
                        {canEdit ? (
                          <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-2 py-3">
                            <input type="checkbox" checked={!!i.done_at} onChange={() => void toggleAsk(i)} disabled={busy === i.id}
                              className="mt-0.5 h-[18px] w-[18px] shrink-0" />
                            <span className={cn('min-w-0 break-words text-sm', i.done_at ? 'text-muted-fg line-through' : 'text-ink')}>{i.label}</span>
                          </label>
                        ) : (
                          <span className={cn('min-w-0 flex-1 break-words px-2 py-3 text-sm', i.done_at ? 'text-muted-fg line-through' : 'text-ink')}>{i.label}</span>
                        )}
                        {canEdit && (
                          <label aria-label={`Attach the fix for "${i.label}"`} title="Attach the fix"
                            className={cn('flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-faint hover:text-ink', busy === i.id && 'pointer-events-none opacity-50')}>
                            {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            <input type="file" multiple className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.dwg"
                              onChange={async e => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; void attachToAsk(i, await shrinkImages(picked)) }} />
                          </label>
                        )}
                        {canEdit && !i.done_at && (
                          <button type="button" onClick={() => removeAsk(i)} aria-label={`Remove "${i.label}"`} title="Remove"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:text-danger"><X className="h-4 w-4" /></button>
                        )}
                        {!!i.files?.length && (
                          <div className="basis-full pb-2 pl-9 pr-2">
                            <div className="flex flex-wrap gap-1.5">
                              {i.files.map(f => <FileChip key={f.url} f={f} onRemove={canEdit ? () => detachFromAsk(i, f) : undefined} />)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {sendStage && canEdit && st.stage !== 'renew' && (
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor={`ask-add-${permit.id}`}>Add what they want</label>
                    <Input id={`ask-add-${permit.id}`} value={newAsk} onChange={e => setNewAsk(e.target.value)} placeholder="They also want..."
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addAsks() } }}
                      onPaste={e => {
                        // A list pasted from their email becomes one item per line.
                        const text = e.clipboardData.getData('text')
                        if (text.includes('\n')) { e.preventDefault(); setNewAsk(text) }
                      }} />
                    <Button type="button" variant="outline" onClick={() => void addAsks()} disabled={busy === 'add'}>Add</Button>
                  </div>
                )}

                {sendStage && canEdit && (
                  <>
                    <div>
                      <label className="sr-only" htmlFor={`send-note-${permit.id}`}>What are you sending</label>
                      <Input id={`send-note-${permit.id}`} value={note} onChange={e => setNote(e.target.value)}
                        placeholder="What are you sending? (optional)" />
                    </div>
                    {(fixes.length > 0 || sendFiles.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {fixes.map(f => <FileChip key={f.url} f={{ ...f, name: `${f.name} (fix)` }} />)}
                        {sendFiles.map((f, k) => <LocalChip key={k} name={f.name} onRemove={() => setSendFiles(cur => cur.filter((_, j) => j !== k))} />)}
                      </div>
                    )}
                    {otherDay && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label>Sent on <span className="text-danger">*</span></Label>
                          <Input type="date" value={sentOn} onChange={e => setSentOn(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Answer expected <span className="font-normal text-faint">(optional)</span></Label>
                          <Input type="date" value={expectedBy} onChange={e => setExpectedBy(e.target.value)} />
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-ink-soft">
                      {hint}{' '}
                      {!otherDay && <button type="button" className="font-medium text-accent-fg underline-offset-2 hover:underline" onClick={() => setOtherDay(true)}>Sent on a different day?</button>}
                    </p>
                  </>
                )}

                {st.stage === 'city' && answering && canEdit && (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Answered on <span className="text-danger">*</span></Label>
                        <Input type="date" value={answeredOn} onChange={e => { setAnsweredOn(e.target.value); if (!fIssued || fIssued === answeredOn) setFIssued(e.target.value) }} />
                      </div>
                    </div>
                    {fromLinks.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-ink-soft">Sent back through the link</p>
                        <div className="overflow-hidden rounded-lg border border-line bg-panel">
                          {fromLinks.map(u => (
                            <label key={u.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 border-line-soft px-3 py-1.5 [&:not(:first-child)]:border-t">
                              <input type="checkbox" checked={useLinks.has(u.id)} className="h-4 w-4 shrink-0"
                                onChange={() => setUseLinks(cur => { const n = new Set(cur); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n })} />
                              <span className="min-w-0 flex-1 truncate text-sm text-ink">{u.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {!approving ? (
                      <>
                        <p className="text-sm font-medium text-ink-soft">What did they say?</p>
                        <div className="grid grid-cols-3 gap-2">
                          <Button variant="outline" className="min-h-11" onClick={() => { setApproving(true); setFIssued(f => f || answeredOn) }}>Approved</Button>
                          <Button variant="outline" className="min-h-11" onClick={() => void answer('corrections')} disabled={busy === 'corrections'}>Needs changes</Button>
                          <Button variant="outline" className="min-h-11" onClick={() => void answer('rejected')} disabled={busy === 'rejected'}>Rejected</Button>
                        </div>
                        <button type="button" className="self-start text-sm text-muted-fg hover:text-ink" onClick={() => setAnswering(false)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <label className={cn('flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-sm',
                            reading ? 'pointer-events-none border-accent bg-accent-tint text-accent-fg' : 'border-accent/50 bg-panel text-accent-fg hover:border-accent')}>
                            {reading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Sparkles className="h-4 w-4 shrink-0" />}
                            <span className="min-w-0 truncate">{reading ? 'Reading the permit...' : permitFile ? permitFile.name : 'Attach the permit - AI fills in the number and dates'}</span>
                            <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp"
                              onChange={async e => {
                                const raw = e.target.files?.[0]; e.target.value = ''
                                if (!raw) return
                                // Shrunk once: the AI read and the save send the same small copy.
                                const f = await shrinkImage(raw)
                                setPermitFile(f); void readWithAi(f)
                              }} />
                          </label>
                          {fromLinks.length > 0 && !permitFile && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {fromLinks.filter(u => /pdf|image/.test(u.type ?? '') || /\.(pdf|jpe?g|png|webp)$/i.test(u.name)).map(u => (
                                <button key={u.id} type="button" onClick={() => void readLinkUpload(u)}
                                  className="min-h-9 max-w-full truncate whitespace-nowrap rounded-full border border-line bg-panel px-3 py-1 text-xs text-accent-fg hover:bg-surface">
                                  Read {u.name} with AI
                                </button>
                              ))}
                            </div>
                          )}
                          {readNote && <p className="text-xs text-ink-soft">{readNote}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <div className="col-span-2 space-y-1 sm:col-span-1">
                            <Label>Permit number <span className="text-danger">*</span></Label>
                            <Input value={fNo} onChange={e => setFNo(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Issued <span className="text-danger">*</span></Label>
                            <Input type="date" value={fIssued} onChange={e => setFIssued(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Expires <span className="font-normal text-faint">(optional)</span></Label>
                            <Input type="date" value={fExp} onChange={e => setFExp(e.target.value)} />
                          </div>
                        </div>
                        <p className="text-xs text-ink-soft">The attached permit becomes the permit itself - what Files shows and what you share.</p>
                      </>
                    )}
                  </div>
                )}

                {error && <p className="flex items-start gap-1 text-sm text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

                {actions && <div className="hidden flex-wrap items-center gap-2 lg:flex">{actions}</div>}
              </section>

              <History rounds={rounds} items={items} who={st.who} today={today} />

              {shares.length > 0 && (
                <section>
                  <h3 className="mb-2.5 text-[13px] font-bold text-ink">Shared</h3>
                  <div className="divide-y divide-line-soft rounded-lg border border-line">
                    {shares.map(sh => (
                      <div key={sh.id} className="px-3 py-2.5">
                        <p className="text-sm text-ink"><span className="font-medium">{sh.recipient_name || sh.recipient_email || 'A link'}</span>
                          <span className="text-muted-fg"> - {sh.name}, sent {dayLabel(sh.created_at.slice(0, 10), today)}</span></p>
                        <p className="text-xs text-muted-fg">
                          {sh.revoked_at ? 'Link turned off' : sh.viewed_at ? `Opened ${dayLabel(sh.viewed_at.slice(0, 10), today)}` : 'Not opened yet'}
                          {sh.uploads.length ? ` · sent back ${sh.uploads.length} file${sh.uploads.length === 1 ? '' : 's'}` : ''}
                        </p>
                        {sh.uploads.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{sh.uploads.map(u => <FileChip key={u.id} f={u} />)}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <section>
            <h3 className="mb-2.5 text-[13px] font-bold text-ink">Details</h3>
            {kv.length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {kv.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-muted-fg">{k}</dt>
                    <dd className="break-words text-sm text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-muted-fg">Nothing filled in yet.</p>}
            {permit.description && <p className="mt-3 break-words text-sm text-ink-soft">{permit.description}</p>}
            {permit.notes && <Notes text={permit.notes} />}
            {permit.file_url && (
              <a href={permit.file_url} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
                <FileText className="h-4 w-4" /> Open the permit
              </a>
            )}
          </section>
        </div>
      </div>

      {/* Phone: the card's buttons, pinned under the thumb. */}
      {actions && (
        <div className="flex shrink-0 gap-2 border-t border-line bg-panel px-4 py-3 lg:hidden [&>*]:min-w-0">
          {actions}
        </div>
      )}
    </>
  )
}

/**
 * The permit's notes, folded past four lines. A permit read by AI fills them
 * with everything on the paper - owner, contractor, valuation, conditions -
 * which pushed the rest of the panel a screen down on a phone.
 */
function Notes({ text }: { text: string }) {
  const [all, setAll] = useState(false)
  const long = text.length > 240
  return (
    <div className="mt-2 rounded-lg bg-surface px-3 py-2">
      <p className={cn('whitespace-pre-line break-words text-sm text-muted-fg', long && !all && 'line-clamp-4')}>{text}</p>
      {long && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-1 min-h-9 text-sm font-medium text-accent-fg hover:underline">
          {all ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

function History({ rounds, items, who, today }: { rounds: PermitRound[]; items: PermitItem[]; who: string; today: string }) {
  if (!rounds.length) return null
  const cls: Record<Outcome, string> = { approved: 'text-success', corrections: 'text-warn', rejected: 'text-danger' }
  return (
    <section>
      <h3 className="mb-2.5 text-[13px] font-bold text-ink">History</h3>
      <ol className="flex flex-col">
        {[...rounds].map((r, i) => ({ r, n: i + 1 })).reverse().map(({ r, n }, k, arr) => {
          const asked = items.filter(it => it.round_id === r.id).map(it => it.label)
          return (
            <li key={r.id} className="relative pb-4 pl-[18px] last:pb-0">
              <span className="absolute left-[3px] top-1.5 h-2 w-2 rounded-full bg-faint" aria-hidden="true" />
              {k < arr.length - 1 && <span className="absolute bottom-0 left-[6.5px] top-[18px] w-px bg-line" aria-hidden="true" />}
              <p className="text-sm font-semibold text-ink">Round {n}</p>
              <p className="text-[13px] text-muted-fg">Sent {dayLabel(r.submitted_on, today)}{r.created_by_name ? ` by ${r.created_by_name}` : ''}</p>
              {r.submitted_note && <p className="break-words text-[13px] text-muted-fg">{r.submitted_note}</p>}
              {!!r.sent_files?.length && <div className="mt-1 flex flex-wrap gap-1.5">{r.sent_files.map(f => <FileChip key={f.url} f={f} />)}</div>}
              <p className={cn('mt-0.5 text-[13px] font-semibold', r.outcome ? cls[r.outcome] : 'text-info')}>
                {r.outcome ? `${OUTCOME_LABEL[r.outcome]} ${dayLabel(r.outcome_on as string, today)}` : `Waiting on ${who}`}
              </p>
              {r.outcome_note && <p className="break-words text-[13px] text-muted-fg">{r.outcome_note}</p>}
              {asked.length > 0 && <p className="break-words text-[13px] text-muted-fg">Asked for: {asked.join(', ')}</p>}
              {!!r.received_files?.length && <div className="mt-1 flex flex-wrap gap-1.5">{r.received_files.map(f => <FileChip key={f.url} f={f} />)}</div>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
