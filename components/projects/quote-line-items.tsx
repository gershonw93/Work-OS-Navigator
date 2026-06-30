'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FileText, ExternalLink, TrendingUp, StickyNote, ListChecks, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LineTask { id: string; title: string; status: string }
interface Line {
  id: string; description: string; budgeted_amount: number; progress_pct: number; progress_status: string
  progress_note: string | null; quantity: number | null; unit_price: number | null; section: string | null; task: LineTask | null
}
interface QProject { status: string; quote_file_url: string | null; quote_file_name: string | null; quote_total: number | null }

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const STATUSES = [
  { key: 'not_started', label: 'Not started' },
  { key: 'working', label: 'Working on it' },
  { key: 'done', label: 'Done' },
]

// Sub's own-job line items, sourced from their uploaded quote.
//  mode 'budget'   — what they quoted (amounts + earned-to-date)
//  mode 'progress' — editable % complete per line + overall amount-weighted bar
export function QuoteLineItems({ projectId, mode }: { projectId: string; mode: 'budget' | 'progress' }) {
  const supabase = createClient()
  const [project, setProject] = useState<QProject | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${projectId}/quote`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) { const d = await res.json(); setProject(d.project); setLines(d.line_items ?? []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [projectId])

  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const [noteSaved, setNoteSaved] = useState<string | null>(null)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [taskFor, setTaskFor] = useState<Line | null>(null)
  const [taskForm, setTaskForm] = useState({ title: '', assigned_to_member_id: '', priority: 'medium', due_date: '' })
  const [taskSaving, setTaskSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'progress') return
    ;(async () => {
      const t = await token()
      const res = await fetch(`/api/projects/${projectId}/tasks`, { headers: { Authorization: `Bearer ${t}` } })
      if (res.ok) setMembers(((await res.json()).members ?? []).map((m: any) => ({ id: m.id, name: m.name })))
    })()
  }, [projectId, mode])

  async function patchLine(id: string, body: Record<string, unknown>) {
    const t = await token()
    return fetch(`/api/projects/${projectId}/quote`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ line_item_id: id, ...body }),
    })
  }

  function setStatus(id: string, status: string) {
    const pct = status === 'done' ? 100 : status === 'working' ? 50 : 0
    setLines(ls => ls.map(l => l.id === id ? { ...l, progress_status: status, progress_pct: pct } : l))
    patchLine(id, { progress_status: status })
  }

  function setNote(id: string, note: string) {
    setLines(ls => ls.map(l => l.id === id ? { ...l, progress_note: note } : l))
  }
  async function saveNote(id: string, note: string) {
    const res = await patchLine(id, { progress_note: note })
    if (res.ok) { setNoteSaved(id); setTimeout(() => setNoteSaved(s => s === id ? null : s), 1500) }
    else alert((await res.json().catch(() => ({}))).error ?? "Couldn't save the note — run the latest DB migration (033).")
  }

  function openTask(l: Line) {
    setTaskForm({ title: l.description, assigned_to_member_id: '', priority: 'medium', due_date: '' })
    setTaskFor(l)
  }
  async function submitTask() {
    if (!taskFor) return
    setTaskSaving(true)
    const member = members.find(m => m.id === taskForm.assigned_to_member_id)
    const t = await token()
    const res = await fetch(`/api/projects/${projectId}/quote`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        action: 'create_task', line_item_id: taskFor.id,
        title: taskForm.title, priority: taskForm.priority, due_date: taskForm.due_date || null,
        assigned_to_member_id: taskForm.assigned_to_member_id || null, assigned_to_name: member?.name ?? null,
      }),
    })
    setTaskSaving(false)
    if (res.ok) { const d = await res.json(); const id = taskFor.id; setLines(ls => ls.map(l => l.id === id ? { ...l, task: d.task } : l)); setTaskFor(null) }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not create task')
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const total = project?.quote_total ?? lines.reduce((s, l) => s + Number(l.budgeted_amount || 0), 0)
  const earned = lines.reduce((s, l) => s + Number(l.budgeted_amount || 0) * (Number(l.progress_pct || 0) / 100), 0)
  const overallPct = total > 0 ? Math.round((earned / total) * 100) : 0

  const sections: { name: string; rows: Line[] }[] = []
  for (const l of lines) {
    const name = l.section ?? ''
    let g = sections.find(s => s.name === name)
    if (!g) { g = { name, rows: [] }; sections.push(g) }
    g.rows.push(l)
  }

  if (lines.length === 0) {
    return (
      <div className="bg-panel rounded-xl border border-line p-10 text-center">
        <FileText className="h-8 w-8 text-faint mx-auto mb-3" />
        <p className="text-sm text-muted-fg">No line items yet. Upload your quote on the <span className="font-medium text-ink-soft">Quote</span> tab — AI reads it into line items.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{mode === 'budget' ? 'Line Items' : 'Progress'}</h1>
          <p className="text-sm text-muted-fg mt-0.5">
            {mode === 'budget' ? 'The line items from the quote you sent the client.' : 'Mark how complete each line item is — overall % is weighted by value.'}
          </p>
        </div>
        {project?.quote_file_url && (
          <a href={project.quote_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent-fg hover:underline">
            <FileText className="h-4 w-4" /> View quote <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Overall */}
      <div className="bg-panel rounded-xl border border-line p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink-soft flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-accent-fg" /> {mode === 'budget' ? 'Quote total' : 'Overall progress'}</p>
          <p className="text-sm font-bold text-ink">{mode === 'budget' ? money(total) : `${overallPct}%`}</p>
        </div>
        <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-success-solid transition-all" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-fg">
          <span>Earned to date {money(earned)}</span><span>of {money(total)}</span>
        </div>
      </div>

      {/* Lines — grouped by section */}
      <div className="bg-panel rounded-xl border border-line overflow-hidden">
        {sections.map(sec => (
          <div key={sec.name}>
            {sec.name && <div className="bg-surface px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-fg border-b border-line-soft">{sec.name}</div>}
            <div className="divide-y divide-line-soft">
              {sec.rows.map(l => (
                <div key={l.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    {/* Checkbox = Done, for the quick "mark complete" path */}
                    {mode === 'progress' && (
                      <input type="checkbox" checked={l.progress_status === 'done'}
                        onChange={e => setStatus(l.id, e.target.checked ? 'done' : 'not_started')}
                        className="h-4 w-4 accent-[#C9F24A] shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={cn('text-sm block truncate', l.progress_status === 'done' ? 'text-faint line-through' : 'text-ink-soft')}>{l.description}</span>
                      {(l.quantity != null || l.unit_price != null) && (
                        <span className="text-xs text-faint">{l.quantity != null ? l.quantity : ''}{l.quantity != null && l.unit_price != null ? ' × ' : ''}{l.unit_price != null ? money(l.unit_price) : ''}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium text-ink w-16 sm:w-20 text-right">{money(l.budgeted_amount)}</span>
                      {mode === 'progress' ? (
                        <select value={l.progress_status} onChange={e => setStatus(l.id, e.target.value)}
                          className={cn('rounded-md border text-xs font-semibold px-1.5 py-1 focus:outline-none focus:border-accent',
                            l.progress_status === 'done' ? 'border-success/40 bg-success-tint text-success' : l.progress_status === 'working' ? 'border-warn/40 bg-warn-tint text-warn' : 'border-line bg-panel text-muted-fg')}>
                          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      ) : (
                        l.progress_pct > 0 && <span className="text-xs text-success w-9 text-right">{l.progress_pct}%</span>
                      )}
                    </div>
                  </div>

                  {/* Progress-only: note + task actions */}
                  {mode === 'progress' && (
                    <div className="flex items-center gap-3 mt-1.5 pl-7">
                      <button onClick={() => setNoteOpen(noteOpen === l.id ? null : l.id)} className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-ink">
                        <StickyNote className="h-3.5 w-3.5" /> {l.progress_note ? 'Note' : 'Add note'}
                      </button>
                      {l.task ? (
                        <Link href={`/projects/${projectId}/tasks`} className="inline-flex items-center gap-1 text-xs text-accent-fg hover:underline">
                          <ListChecks className="h-3.5 w-3.5" /> Task{l.task.status === 'completed' ? ' · done' : ''}
                        </Link>
                      ) : (
                        <button onClick={() => openTask(l)} className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-ink">
                          <ListChecks className="h-3.5 w-3.5" /> Create task
                        </button>
                      )}
                      {noteSaved === l.id && <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Saved</span>}
                    </div>
                  )}
                  {mode === 'progress' && (noteOpen === l.id || l.progress_note) && (
                    <textarea rows={2} value={l.progress_note ?? ''} onChange={e => setNote(l.id, e.target.value)} onBlur={e => saveNote(l.id, e.target.value)}
                      placeholder="Add a note for this line… (saves when you click away)"
                      className="mt-1.5 ml-7 w-[calc(100%-1.75rem)] rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none resize-none" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create task modal */}
      {taskFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !taskSaving && setTaskFor(null)}>
          <div className="w-full max-w-md rounded-xl bg-panel border border-line shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">New task</h2>
              <button onClick={() => setTaskFor(null)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1.5"><Label>Task</Label><Input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <select value={taskForm.assigned_to_member_id} onChange={e => setTaskForm(f => ({ ...f, assigned_to_member_id: e.target.value }))}
                  className="w-full rounded-md border border-muted2 bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
                  <option value="">Unassigned</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {members.length === 0 && <p className="text-xs text-faint">No crew yet — add people on the Team tab.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full rounded-md border border-muted2 bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none capitalize">
                    {['low', 'medium', 'high'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" disabled={taskSaving} onClick={() => setTaskFor(null)}>Cancel</Button>
                <Button disabled={taskSaving || !taskForm.title.trim()} onClick={submitTask}>{taskSaving ? 'Creating…' : 'Create task'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
