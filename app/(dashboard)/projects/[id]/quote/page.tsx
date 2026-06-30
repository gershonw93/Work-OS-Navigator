'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Upload, FileText, Loader2, Sparkles, CheckCircle2, ExternalLink, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Line { id: string; description: string; budgeted_amount: number; progress_pct: number }
interface QProject { status: string; quote_file_url: string | null; quote_file_name: string | null; quote_total: number | null }

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function QuotePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [project, setProject] = useState<QProject | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [converting, setConverting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/quote`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) { const d = await res.json(); setProject(d.project); setLines(d.line_items ?? []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [params.id])

  async function upload(file: File) {
    setUploading(true)
    const t = await token()
    const form = new FormData(); form.append('file', file)
    const res = await fetch(`/api/projects/${params.id}/quote`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form })
    setUploading(false)
    if (res.ok) load()
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not read the quote')
  }

  async function convert() {
    setConverting(true)
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/quote`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ action: 'convert' }),
    })
    setConverting(false)
    if (res.ok) load()
    else alert('Could not convert')
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const isPending = project?.status === 'planning'
  const total = project?.quote_total ?? lines.reduce((s, l) => s + Number(l.budgeted_amount || 0), 0)

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Quote</h1>
          <p className="text-sm text-muted-fg mt-0.5">Upload the quote you sent the client. AI reads it into line items — then convert it to an active job.</p>
        </div>
        <span className={cn('text-xs font-semibold rounded-full px-2.5 py-1', isPending ? 'bg-warn-tint text-warn' : 'bg-success-tint text-success')}>
          {isPending ? 'Quote · Pending' : 'Active job'}
        </span>
      </div>

      {/* Quote file */}
      {project?.quote_file_url ? (
        <div className="bg-panel rounded-xl border border-line p-4 flex flex-wrap items-center justify-between gap-3">
          <a href={project.quote_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-accent-fg hover:underline">
            <FileText className="h-4 w-4" /> {project.quote_file_name ?? 'Quote'} <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-fg">Total <span className="font-bold text-ink">{money(total)}</span></span>
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> Replace</>}
            </Button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full bg-panel rounded-xl border-2 border-dashed border-line p-10 text-center hover:border-accent hover:bg-surface transition-colors">
          {uploading ? <Loader2 className="h-8 w-8 text-accent-fg mx-auto mb-3 animate-spin" /> : <Upload className="h-8 w-8 text-faint mx-auto mb-3" />}
          <p className="text-sm font-medium text-ink-soft">{uploading ? 'Reading your quote…' : 'Upload your quote (PDF or photo)'}</p>
          <p className="text-xs text-faint mt-1 inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI scans it into line items automatically</p>
        </button>
      )}

      {/* Line items */}
      {lines.length > 0 && (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Line items ({lines.length})</p>
            <p className="text-xs text-faint">From your quote · also feeds Budget &amp; Progress</p>
          </div>
          <div className="divide-y divide-line-soft">
            {lines.map(l => (
              <div key={l.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm text-ink-soft truncate">{l.description}</span>
                <span className="text-sm font-medium text-ink shrink-0">{money(l.budgeted_amount)}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t-2 border-line bg-surface flex items-center justify-between text-sm font-bold text-ink-soft">
            <span>Total</span><span>{money(total)}</span>
          </div>
        </div>
      )}

      {/* Convert */}
      {isPending && (
        <div className="rounded-xl border border-accent/40 bg-accent-tint/40 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold text-ink-soft">Quote approved by the client?</p>
            <p className="text-muted-fg text-xs mt-0.5">Convert it to an active job to start tracking schedule, tasks, progress, and time.</p>
          </div>
          <Button disabled={converting} onClick={convert} className="gap-1.5">
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Convert to active job
          </Button>
        </div>
      )}
      {!isPending && project && (
        <p className="text-sm text-success inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> This job is active. Track it in the other tabs.</p>
      )}
    </div>
  )
}
