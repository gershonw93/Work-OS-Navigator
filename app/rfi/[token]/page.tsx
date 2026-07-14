'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Upload, CheckCircle2, Loader2, AlertTriangle, MessageSquare } from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface Data {
  rfi: {
    rfi_number: number
    subject: string
    description: string | null
    attachments: { file_url: string; file_name?: string | null }[]
    status: string
    response: string | null
    responded_by_name: string | null
    requested_name: string | null
    created_at: string
  }
  project: { name: string | null; address: string | null }
}

export default function RfiAnswerPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [response, setResponse] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/rfi/${params.token}`)
      if (res.ok) {
        const d = await res.json()
        setData(d)
        setName(d.rfi?.requested_name ?? '')
      } else {
        setError((await res.json().catch(() => ({}))).error ?? 'This link is no longer valid.')
      }
      setLoading(false)
    })()
  }, [params.token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSubmitting(true)
    const form = new FormData()
    form.append('name', name)
    form.append('response', response)
    for (const f of files) form.append('files', f)
    const res = await fetch(`/api/rfi/${params.token}`, { method: 'POST', body: form })
    setSubmitting(false)
    if (res.ok) setDone(true)
    else setError((await res.json().catch(() => ({}))).error ?? 'Could not submit. Try again.')
  }

  const inputCls = 'w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none'

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-surface py-6 px-4 sm:py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <SyteNavLogo size={26} />
          <ThemeToggle />
        </div>
        {children}
        <p className="text-center text-xs text-faint mt-4">No account needed to answer - this secure link is just for you.</p>
      </div>
    </div>
  )

  if (loading) return <Shell><div className="text-center text-muted-fg py-16">Loading…</div></Shell>
  if (error && !data) return <Shell><div className="rounded-xl bg-panel border border-line p-8 text-center text-ink"><AlertTriangle className="h-8 w-8 text-warn mx-auto mb-3" />{error}</div></Shell>
  if (!data) return null

  const r = data.rfi
  const alreadyAnswered = r.status !== 'open' && !!r.response

  return (
    <Shell>
      <div className="rounded-2xl bg-panel border border-line overflow-hidden text-ink">
        <div className="px-5 py-5 border-b border-line-soft">
          <p className="text-xs uppercase tracking-wide text-accent-fg font-semibold mb-1 flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Request for Information</p>
          <h1 className="text-xl font-bold leading-tight">RFI-{String(r.rfi_number).padStart(3, '0')} · {r.subject}</h1>
          <p className="text-sm text-muted-fg mt-1">{data.project.name}{data.project.address ? ` · ${data.project.address}` : ''}</p>
        </div>

        <div className="px-5 py-5 space-y-5">
          {r.description && (
            <div>
              <p className="text-xs uppercase tracking-wide text-faint font-semibold mb-1">Question</p>
              <p className="text-sm text-ink-soft whitespace-pre-wrap">{r.description}</p>
            </div>
          )}

          {r.attachments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-faint font-semibold mb-2">Attachments</p>
              <div className="space-y-1.5">
                {r.attachments.map((a, i) => (
                  <a key={i} href={a.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-accent-fg hover:bg-surface">
                    <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{a.file_name ?? 'Attachment'}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {(done || alreadyAnswered) && (
            <div className="rounded-xl bg-success-tint border border-success/30 px-4 py-5 text-center">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="font-semibold text-ink">Answer submitted. Thank you!</p>
              {!done && r.response && <p className="text-sm text-muted-fg mt-1 whitespace-pre-wrap">{r.response}</p>}
              {!done && r.responded_by_name && <p className="text-xs text-faint mt-1">Answered by {r.responded_by_name}</p>}
            </div>
          )}

          {!done && (
            <form onSubmit={submit} className="space-y-4">
              {alreadyAnswered ? (
                <div className="border-t border-line-soft pt-5">
                  <h2 className="text-lg font-bold text-ink">Need to revise the answer?</h2>
                  <p className="text-sm text-muted-fg mt-1">Submit again below and it replaces the current answer.</p>
                </div>
              ) : (
                <p className="text-xs uppercase tracking-wide text-faint font-semibold">Your answer</p>
              )}
              <div className="space-y-1.5">
                <label className="text-sm text-ink-soft">Your name / firm</label>
                <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="e.g. Klein Architecture PC" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-ink-soft">Answer</label>
                <textarea rows={5} value={response} onChange={e => setResponse(e.target.value)} className={`${inputCls} resize-none`} placeholder="Your response to the question above…" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-ink-soft">Attach drawings / documents (optional)</label>
                <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="sr-only"
                  onChange={e => setFiles(Array.from(e.target.files ?? []))} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-muted2 px-3 py-3 text-sm text-muted-fg hover:bg-surface">
                  <Upload className="h-4 w-4 shrink-0" />
                  <span className="truncate">{files.length ? files.map(f => f.name).join(', ') : 'Choose files (up to 5)'}</span>
                </button>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full rounded-xl bg-accent text-accent-ink font-bold py-3.5 text-base hover:bg-accent/90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</> : 'Submit Answer'}
              </button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  )
}
