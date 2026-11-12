'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Lock, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useSwipeDismiss } from '@/lib/use-swipe-dismiss'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { fetchProblem } from '@/lib/fetch-error'
import { cn } from '@/lib/utils'
import {
  cardProblem, cardDue, checklistProgress, pmLinkHref,
  PM_LINK_TYPES, PM_PRIORITIES, PM_PRIORITY_LABEL, PM_TONES, PM_TONE_CLASS, PM_TONE_LABEL,
  type PmCard, type PmChecklistItem, type PmColumn, type PmLabel, type PmPriority, type PmTone,
} from '@/lib/project-management'

// ─────────────────────────────────────────────────────────────────────────────
// One card, opened: the whole of it, with ONE save. Nothing in here writes on
// its own - a ticked checklist item, a new label and a changed column are all
// staged and committed together by Save, so Cancel always means "nothing
// happened".
//
// `.overlay-drawer` on every width: it slides in from the right, fills a phone,
// and can be slid back the way it came.
// ─────────────────────────────────────────────────────────────────────────────

export type PmApi = (path: string, init?: { method?: string; body?: unknown }) => Promise<any>

interface Props {
  projectId: string
  columns: PmColumn[]
  /** The card being edited, or null for a new one. */
  card: PmCard | null
  /** The column a new card starts in. Null when the button pressed named none. */
  startColumnId: string | null
  linkTypes: string[]
  boardLabels: PmLabel[]
  today: string
  api: PmApi
  onClose: () => void
  onSaved: () => void
}

interface LinkOption { id: string; label: string }

export function CardDrawer({ projectId, columns, card, startColumnId, linkTypes, boardLabels, today, api, onClose, onSaved }: Props) {
  const notice = useNotice()
  const guardDelete = useDeleteGuard()
  const swipe = useSwipeDismiss(onClose)

  const [title, setTitle] = useState(card?.title ?? '')
  const [columnId, setColumnId] = useState(card?.column_id ?? startColumnId ?? '')
  const [priority, setPriority] = useState<PmPriority>(card?.priority ?? 'normal')
  const [due, setDue] = useState(card?.due_date ? String(card.due_date).slice(0, 10) : '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [labels, setLabels] = useState<PmLabel[]>(card?.labels ?? [])
  const [checklist, setChecklist] = useState<PmChecklistItem[]>(card?.checklist ?? [])
  const [labelName, setLabelName] = useState('')
  const [labelTone, setLabelTone] = useState<PmTone>('info')
  const [itemText, setItemText] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')

  // The link: what the card points at now, and what is staged to replace it.
  const [linkType, setLinkType] = useState(card?.link_type ?? '')
  const [linkId, setLinkId] = useState(card?.link_id ?? '')
  const [options, setOptions] = useState<LinkOption[]>([])
  const [optionsState, setOptionsState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const wanted = useRef('')

  useEffect(() => {
    if (!linkType || !linkTypes.includes(linkType)) { setOptions([]); setOptionsState('idle'); return }
    // A response for a kind that is no longer the one chosen is dropped.
    wanted.current = linkType
    setOptionsState('loading')
    api(`/links?kind=${encodeURIComponent(linkType)}`)
      .then(d => { if (wanted.current === linkType) { setOptions(d.options ?? []); setOptionsState('ready') } })
      .catch(() => { if (wanted.current === linkType) setOptionsState('failed') })
    // `api` is a fresh closure per render; the kind is what this follows.
  }, [linkType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const progress = checklistProgress(checklist)
  const dueSays = cardDue({ due_date: due || null, completed_at: null }, today)
  const unused = boardLabels.filter(b => !labels.some(l => l.name.toLowerCase() === b.name.toLowerCase()))
  // A link the card already carries, of a kind this person can no longer list:
  // shown as it is, and left alone unless they remove it.
  const keptLink = !!card?.link_type && card.link_type === linkType && !linkTypes.includes(linkType)

  function addLabel(l: PmLabel) {
    const name = l.name.trim().slice(0, 24)
    if (!name) { setProblem('Type a name for the label first.'); return }
    if (labels.some(x => x.name.toLowerCase() === name.toLowerCase())) { setLabelName(''); return }
    if (labels.length >= 8) { setProblem('A card holds 8 labels.'); return }
    setLabels([...labels, { name, tone: l.tone }]); setLabelName(''); setProblem('')
  }

  function addItem() {
    const text = itemText.trim()
    if (!text) { setProblem('Type the checklist item first.'); return }
    setChecklist([...checklist, { id: `i${Date.now().toString(36)}${checklist.length}`, text: text.slice(0, 200), done: false }])
    setItemText(''); setProblem('')
  }

  async function save() {
    const body: Record<string, unknown> = {
      title, column_id: columnId, priority, due_date: due || null, notes, labels, checklist,
    }
    if (!keptLink) { body.link_type = linkType || null; body.link_id = linkType ? linkId : null }
    const wrong = cardProblem(body)
    if (wrong) { setProblem(wrong); return }
    setSaving(true); setProblem('')
    try {
      if (card) await api(`/cards/${card.id}`, { method: 'PATCH', body })
      else await api('/cards', { method: 'POST', body })
      onSaved()
    } catch (e) {
      setProblem(fetchProblem(e, 'saving the card'))
    } finally {
      setSaving(false)
    }
  }

  function remove() {
    if (!card) return
    guardDelete(async () => {
      try {
        await api(`/cards/${card.id}`, { method: 'DELETE' })
        onSaved()
      } catch (e) {
        notice(fetchProblem(e, 'deleting the card'))
      }
    }, {
      title: 'Delete this card?',
      body: 'Its notes and checklist go with it, and it cannot be undone.',
      confirmLabel: 'Delete card',
    })
  }

  return (
    <div className="overlay-drawer bg-black/40" data-overlay onClick={onClose}>
      <aside
        aria-label={card ? 'Card' : 'New card'}
        onClick={e => e.stopPropagation()}
        {...swipe.handlers}
        style={swipe.style}
        className="flex flex-col overflow-hidden border-l border-line bg-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-fg">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Only you can see this card</span>
          </span>
          <button
            type="button" onClick={onClose} aria-label="Close" title="Close"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 lg:p-5">
          <div className="space-y-1.5">
            <Label htmlFor="pm-title">Title *</Label>
            <Input id="pm-title" value={title} onChange={e => setTitle(e.target.value)}
              autoFocus={autoFocusOnDesktop()} placeholder="What needs doing" />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-ink-soft">Column *</span>
            <div role="group" aria-label="Column" className="flex flex-wrap gap-2">
              {columns.map(c => (
                <button
                  key={c.id} type="button" aria-pressed={columnId === c.id}
                  onClick={() => setColumnId(c.id)}
                  className={cn(
                    'min-h-11 whitespace-nowrap rounded-xl border px-3.5 text-sm lg:min-h-9',
                    columnId === c.id ? 'border-ink bg-ink font-semibold text-panel' : 'border-line bg-panel font-medium text-ink-soft hover:bg-surface',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-due">Due (optional)</Label>
              <Input id="pm-due" type="date" value={due} onChange={e => setDue(e.target.value)} />
              {dueSays && dueSays.tone !== 'plain' && (
                <p className={cn('text-xs font-semibold', dueSays.tone === 'overdue' ? 'text-danger' : 'text-ink')}>{dueSays.text}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-priority">Priority (optional)</Label>
              <Select id="pm-priority" value={priority} onChange={e => setPriority(e.target.value as PmPriority)}>
                {PM_PRIORITIES.map(p => <option key={p} value={p}>{PM_PRIORITY_LABEL[p]}</option>)}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-ink-soft">Labels (optional)</span>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {labels.map(l => (
                  <span key={l.name} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full py-1 pl-2.5 pr-1 text-xs font-semibold', PM_TONE_CLASS[l.tone])}>
                    {l.name}
                    <button type="button" aria-label={`Remove the ${l.name} label`} title="Remove"
                      onClick={() => setLabels(labels.filter(x => x.name !== l.name))}
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {unused.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-fg">Used on this board:</span>
                {unused.map(l => (
                  <button key={l.name} type="button" onClick={() => addLabel(l)}
                    className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', PM_TONE_CLASS[l.tone])}>
                    + {l.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="pm-label-name" className="lg:text-xs">New label</Label>
                <Input id="pm-label-name" value={labelName} maxLength={24} placeholder="Framing, Client, Money"
                  onChange={e => setLabelName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel({ name: labelName, tone: labelTone }) } }} />
              </div>
              <div className="w-28 shrink-0 space-y-1">
                <Label htmlFor="pm-label-tone" className="lg:text-xs">Colour</Label>
                <Select id="pm-label-tone" value={labelTone} onChange={e => setLabelTone(e.target.value as PmTone)}>
                  {PM_TONES.map(t => <option key={t} value={t}>{PM_TONE_LABEL[t]}</option>)}
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={() => addLabel({ name: labelName, tone: labelTone })}>Add</Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-notes">Notes (optional)</Label>
            <textarea id="pm-notes" rows={4} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-ink-soft">Checklist (optional)</span>
              {progress && <span className="text-xs text-muted-fg">{progress.done} of {progress.total} done</span>}
            </div>
            {checklist.length > 0 && (
              <div className="divide-y divide-line-soft rounded-xl border border-line">
                {checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-1 pl-3 pr-1">
                    <label className={cn('flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 text-sm', item.done ? 'text-muted-fg line-through' : 'text-ink')}>
                      <input type="checkbox" checked={item.done} className="h-5 w-5 shrink-0 accent-[rgb(var(--accent-fg))]"
                        onChange={() => setChecklist(checklist.map(x => x.id === item.id ? { ...x, done: !x.done } : x))} />
                      <span className="min-w-0 break-words">{item.text}</span>
                    </label>
                    <button type="button" aria-label={`Remove "${item.text}"`} title="Remove"
                      onClick={() => setChecklist(checklist.filter(x => x.id !== item.id))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-danger">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="pm-item" className="lg:text-xs">New item</Label>
                <Input id="pm-item" value={itemText} maxLength={200} placeholder="One thing to tick off"
                  onChange={e => setItemText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }} />
              </div>
              <Button type="button" variant="outline" onClick={addItem}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
          </div>

          {(linkTypes.length > 0 || keptLink) && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-ink-soft">Linked to (optional)</span>
              {keptLink ? (
                <div className="flex items-center gap-2 rounded-xl border border-line p-3">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{card?.link_label}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setLinkType(''); setLinkId('') }}>Unlink</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="pm-link-kind" className="lg:text-xs">Kind of record</Label>
                    <Select id="pm-link-kind" value={linkType} onChange={e => { setLinkType(e.target.value); setLinkId('') }}>
                      <option value="">Nothing</option>
                      {linkTypes.map(t => <option key={t} value={t}>{PM_LINK_TYPES[t]?.label ?? t}</option>)}
                    </Select>
                  </div>
                  {linkType && (
                    <div className="space-y-1">
                      <Label htmlFor="pm-link-record" className="lg:text-xs">Which one *</Label>
                      {optionsState === 'loading' && <p className="py-2 text-sm text-muted-fg">Loading…</p>}
                      {optionsState === 'failed' && <p className="py-2 text-sm text-danger">Could not load the list. Pick the kind again to retry.</p>}
                      {optionsState === 'ready' && options.length === 0 && (
                        <p className="py-2 text-sm text-muted-fg">This job has none yet.</p>
                      )}
                      {optionsState === 'ready' && options.length > 0 && (
                        <Select id="pm-link-record" value={linkId} onChange={e => setLinkId(e.target.value)}>
                          <option value="">-- Select --</option>
                          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              )}
              {card?.link_type && card.link_type === linkType && card.link_id === linkId && pmLinkHref(projectId, linkType) && (
                <Link href={pmLinkHref(projectId, linkType)!} className="inline-block text-sm font-medium text-accent-fg hover:underline">
                  Go to where it lives on this job →
                </Link>
              )}
              <p className="text-xs text-muted-fg">The link points one way. Nothing about this card shows on the record it points at.</p>
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-line px-4 py-3 lg:px-5">
          {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
          {/* Two choices share a row on a phone; the destructive one sits under them. */}
          <div className="row-even gap-2 lg:flex lg:items-center lg:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving}>
              <Check className="mr-1.5 h-4 w-4" />{saving ? 'Saving…' : 'Save'}
            </Button>
            {card && (
              <Button type="button" variant="ghost" onClick={remove} className="text-danger lg:order-first lg:mr-auto">
                <Trash2 className="mr-1.5 h-4 w-4" />Delete
              </Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
