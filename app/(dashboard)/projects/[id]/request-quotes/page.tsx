'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Plus, X, FileText, Send, Link2, Copy, Trash2, Scale, Loader2, CheckCircle2, Mail, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const STATUS: Record<string, string> = {
  invited: 'bg-muted text-muted-fg', viewed: 'bg-info-tint text-info',
  submitted: 'bg-success-tint text-success', declined: 'bg-danger-tint text-danger',
}

export default function RequestQuotesPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [requests, setRequests] = useState<any[]>([])
  const [subs, setSubs] = useState<{ id: string; name: string; email?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [origin, setOrigin] = useState('')

  // new request form
  const [title, setTitle] = useState('')
  const [trade, setTrade] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const planRef = useRef<HTMLInputElement>(null)
  const [savedPlans, setSavedPlans] = useState<{ id: string; name: string; file_url: string }[]>([])
  const [selectedPlans, setSelectedPlans] = useState<Set<string>>(new Set())

  // invite inputs per request
  const [inviteSub, setInviteSub] = useState<Record<string, string>>({})
  const [inviteName, setInviteName] = useState<Record<string, string>>({})
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [pulling, setPulling] = useState<string | null>(null)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const [r, d, p] = await Promise.all([
      fetch(`/api/projects/${params.id}/bid-requests`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch('/api/directory', { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`/api/projects/${params.id}/plans`, { headers: { Authorization: `Bearer ${t}` } }),
    ])
    if (r.ok) setRequests((await r.json()).requests ?? [])
    if (d.ok) setSubs(((await d.json()).companies ?? []).filter((c: any) => c.type === 'subcontractor' || c.type === 'supplier').map((c: any) => ({ id: c.id, name: c.name, email: c.contact_email })))
    if (p.ok) setSavedPlans(((await p.json()).plans ?? []).map((pl: any) => ({ id: pl.id, name: pl.name, file_url: pl.file_url })))
    setLoading(false)
  }
  useEffect(() => { setOrigin(window.location.origin); load() }, [params.id])

  async function createRequest() {
    if (!title.trim()) return
    setCreating(true)
    const t = await token()
    const form = new FormData()
    form.append('title', title); if (trade) form.append('trade', trade)
    if (description) form.append('description', description); if (dueDate) form.append('due_date', dueDate)
    const chosen = savedPlans.filter(p => selectedPlans.has(p.id)).map(p => ({ file_url: p.file_url, file_name: p.name }))
    if (chosen.length) form.append('existing_attachments', JSON.stringify(chosen))
    files.forEach(f => form.append('attachments', f))
    const res = await fetch(`/api/projects/${params.id}/bid-requests`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form })
    setCreating(false)
    if (res.ok) { setTitle(''); setTrade(''); setDescription(''); setDueDate(''); setFiles([]); setSelectedPlans(new Set()); setShowNew(false); load() }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not create')
  }

  async function addInvite(reqId: string) {
    const subId = inviteSub[reqId]
    const sub = subs.find(s => s.id === subId)
    const name = sub?.name || inviteName[reqId]
    const email = (sub?.email && !sub.email.includes('placeholder')) ? sub.email : inviteEmail[reqId]
    if (!name && !email) return
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/bid-requests/${reqId}/invites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ invitees: [{ company_id: subId || null, name, email }] }),
    })
    if (res.ok) { setInviteSub(p => ({ ...p, [reqId]: '' })); setInviteName(p => ({ ...p, [reqId]: '' })); setInviteEmail(p => ({ ...p, [reqId]: '' })); load() }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not invite')
  }

  async function removeInvite(reqId: string, inviteId: string) {
    const t = await token()
    await fetch(`/api/projects/${params.id}/bid-requests/${reqId}/invites?inviteId=${inviteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
    load()
  }

  async function deleteRequest(reqId: string) {
    if (!confirm('Delete this request and its invites?')) return
    const t = await token()
    await fetch(`/api/projects/${params.id}/bid-requests/${reqId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
    load()
  }

  async function pullToComparison(reqId: string) {
    setPulling(reqId)
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/bid-requests/${reqId}/to-comparison`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } })
    setPulling(null)
    if (res.ok) router.push(`/projects/${params.id}/quotes`)
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not pull to comparison')
  }

  function linkFor(token: string) { return `${origin}/bid/${token}` }
  function copy(text: string, key: string) { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500) }
  function emailFor(req: any, inv: any) {
    const subject = `Request for Quote — ${req.title}`
    const body = `Hi ${inv.vendor_name ?? ''},\n\nWe'd like your quote for: ${req.title}${req.trade ? ` (${req.trade})` : ''}.\nView the scope and plans, and submit your quote here (no account needed):\n${linkFor(inv.token)}\n\n${req.due_date ? `Please respond by ${new Date(req.due_date + 'T00:00:00').toLocaleDateString()}.\n\n` : ''}Thank you.`
    return { subject, body, mailto: `mailto:${inv.vendor_email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` }
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  return (
    <div className="space-y-6">
      <input ref={planRef} type="file" multiple className="sr-only" onChange={e => { if (e.target.files) setFiles(p => [...p, ...Array.from(e.target.files!)]) }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Request Quotes</h1>
          <p className="text-sm text-muted-fg mt-0.5">Send plans to subs for pricing. Each sub gets a private link — no account needed — and responses are tracked here.</p>
        </div>
        <Button onClick={() => setShowNew(v => !v)} className="gap-1.5"><Plus className="h-4 w-4" /> New Request</Button>
      </div>

      {showNew && (
        <div className="bg-panel rounded-xl border border-accent/40 p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Title <span className="text-danger">*</span></Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Electrical rough-in" autoFocus /></div>
            <div className="space-y-1.5"><Label>Trade</Label><Input value={trade} onChange={e => setTrade(e.target.value)} placeholder="e.g. Electrical" /></div>
          </div>
          <div className="space-y-1.5"><Label>Scope / instructions</Label>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="What you need quoted, requirements, etc."
              className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Upload new files <span className="text-faint font-normal">(optional)</span></Label>
              <Button type="button" variant="outline" onClick={() => planRef.current?.click()} className="w-full gap-1.5"><Paperclip className="h-4 w-4" /> {files.length ? `${files.length} file(s)` : 'Attach files'}</Button>
            </div>
          </div>

          {/* Pick from saved project plans */}
          <div className="space-y-1.5">
            <Label>Attach saved plans <span className="text-faint font-normal">— from this project's Plans</span></Label>
            {savedPlans.length === 0 ? (
              <p className="text-xs text-faint">No saved plans on this project yet. Upload plans on the Plans tab, or attach files above.</p>
            ) : (
              <div className="rounded-lg border border-line max-h-40 overflow-y-auto divide-y divide-line-soft">
                {savedPlans.map(pl => {
                  const checked = selectedPlans.has(pl.id)
                  return (
                    <label key={pl.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface">
                      <input type="checkbox" className="accent-[#C9F24A]" checked={checked}
                        onChange={() => setSelectedPlans(prev => { const n = new Set(prev); checked ? n.delete(pl.id) : n.add(pl.id); return n })} />
                      <FileText className="h-3.5 w-3.5 text-faint shrink-0" />
                      <span className="text-ink-soft truncate">{pl.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-ink-soft"><FileText className="h-3 w-3" />{f.name}<button onClick={() => setFiles(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3 text-faint" /></button></span>)}</div>}
          <div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button><Button onClick={createRequest} disabled={creating || !title.trim()}>{creating ? 'Creating…' : 'Create Request'}</Button></div>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center"><Send className="h-8 w-8 text-faint mx-auto mb-3" /><p className="text-sm text-muted-fg">No bid requests yet. Create one, attach the plans, and invite your subs.</p></div>
      ) : requests.map(req => {
        const invites = req.bid_invites ?? []
        const submissions = req.bid_submissions ?? []
        return (
          <div key={req.id} className="bg-panel rounded-xl border border-line overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-ink-soft">{req.title}</h2>
                <p className="text-xs text-faint">{req.trade ? `${req.trade} · ` : ''}{invites.length} invited · {submissions.length} responded{req.due_date ? ` · due ${new Date(req.due_date + 'T00:00:00').toLocaleDateString()}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {submissions.length > 0 && (
                  <Button size="sm" disabled={pulling === req.id} onClick={() => pullToComparison(req.id)}>
                    {pulling === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />} Compare quotes
                  </Button>
                )}
                <button onClick={() => deleteRequest(req.id)} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {(req.bid_request_attachments?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {req.bid_request_attachments.map((a: any) => <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-accent-fg hover:bg-surface"><FileText className="h-3.5 w-3.5" />{a.file_name ?? 'Plan'}</a>)}
                </div>
              )}

              {/* Invites */}
              <div className="rounded-lg border border-line-soft divide-y divide-line-soft">
                {invites.length === 0 && <p className="px-3 py-2 text-xs text-faint">No subs invited yet.</p>}
                {invites.map((inv: any) => {
                  const sub = submissions.find((s: any) => s.bid_invite_id === inv.id)
                  const em = emailFor(req, inv)
                  return (
                    <div key={inv.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-ink-soft">{inv.vendor_name ?? inv.vendor_email ?? 'Vendor'}</span>
                        {sub && <span className="text-xs text-success ml-2">{money(sub.amount)}{sub.file_name ? ' · file' : ''}</span>}
                      </div>
                      <span className={cn('text-[10px] font-medium rounded-full px-1.5 py-0.5 capitalize', STATUS[inv.status] ?? 'bg-muted text-muted-fg')}>{inv.status}</span>
                      <button onClick={() => copy(linkFor(inv.token), `l${inv.id}`)} title="Copy link" className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-ink">{copied === `l${inv.id}` ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />} Link</button>
                      <button onClick={() => copy(`${em.subject}\n\n${em.body}`, `e${inv.id}`)} title="Copy email" className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-ink">{copied === `e${inv.id}` ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />} Email</button>
                      {inv.vendor_email && <a href={em.mailto} className="inline-flex items-center gap-1 text-xs text-accent-fg hover:underline"><Mail className="h-3.5 w-3.5" /> Send</a>}
                      <button onClick={() => removeInvite(req.id, inv.id)} className="text-faint hover:text-danger"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )
                })}
              </div>

              {/* Add invitee */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[160px]">
                  <SearchableSelect value={inviteSub[req.id] ?? ''} onChange={e => setInviteSub(p => ({ ...p, [req.id]: e.target.value }))}>
                    <option value="">Pick from directory…</option>
                    {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </SearchableSelect>
                </div>
                {!inviteSub[req.id] && (
                  <>
                    <Input className="w-32" placeholder="Name" value={inviteName[req.id] ?? ''} onChange={e => setInviteName(p => ({ ...p, [req.id]: e.target.value }))} />
                    <Input className="w-44" placeholder="Email (optional)" value={inviteEmail[req.id] ?? ''} onChange={e => setInviteEmail(p => ({ ...p, [req.id]: e.target.value }))} />
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => addInvite(req.id)}><Plus className="h-3.5 w-3.5" /> Invite</Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
