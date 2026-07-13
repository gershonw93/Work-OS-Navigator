'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Upload, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'

interface DocReq { type: string; label: string; uploaded: boolean }
interface Data {
  vendor_name: string | null
  project_name: string | null
  project_address: string | null
  status: string
  docs: DocReq[]
}

export default function CompliancePortal({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<Record<string, File>>({})
  const [expiry, setExpiry] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [justSent, setJustSent] = useState<string[]>([])
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  async function load() {
    const res = await fetch(`/api/compliance/${params.token}`)
    if (res.ok) setData(await res.json())
    else setError((await res.json().catch(() => ({}))).error ?? 'This link is no longer valid.')
    setLoading(false)
  }
  useEffect(() => { load() }, [params.token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (Object.keys(files).length === 0) { setError('Attach at least one document.'); return }
    setError(''); setSubmitting(true)
    const form = new FormData()
    for (const [type, file] of Object.entries(files)) {
      form.append(`file_${type}`, file)
      if (expiry[type]) form.append(`expiry_${type}`, expiry[type])
    }
    const res = await fetch(`/api/compliance/${params.token}`, { method: 'POST', body: form })
    setSubmitting(false)
    if (res.ok) {
      const d = await res.json()
      setJustSent(d.uploaded ?? Object.keys(files))
      setFiles({}); setExpiry({})
      await load()   // refresh so uploaded docs show as "on file" and remaining stay open
    } else {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not submit. Try again.')
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-surface py-6 px-4 sm:py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <SyteNavLogo size={26} />
          <ThemeToggle />
        </div>
        {children}
        <div className="mt-6 rounded-xl border border-line bg-panel px-4 py-4 text-center">
          <p className="text-sm text-muted-fg">Want all your jobs, docs, and compliance in one place?</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Link href="/signup" className="rounded-lg bg-accent text-accent-ink text-sm font-semibold px-4 py-2 hover:bg-accent/90">Create free account</Link>
            <Link href="/login" className="rounded-lg border border-line text-sm font-medium text-ink-soft px-4 py-2 hover:bg-surface">Log in</Link>
          </div>
        </div>
        <p className="text-center text-xs text-faint mt-3">No account needed to upload - this secure link is just for you.</p>
      </div>
    </div>
  )

  if (loading) return <Shell><div className="text-center text-muted-fg py-16">Loading…</div></Shell>
  if (error && !data) return <Shell><div className="rounded-xl bg-panel border border-line p-8 text-center text-ink"><AlertTriangle className="h-8 w-8 text-warn mx-auto mb-3" />{error}</div></Shell>
  if (!data) return null

  const remainingDocs = data.docs.filter((d) => !d.uploaded)
  const allDone = remainingDocs.length === 0

  return (
    <Shell>
      <div className="rounded-2xl bg-panel border border-line overflow-hidden text-ink">
        <div className="px-5 py-5 border-b border-line-soft">
          <p className="text-xs uppercase tracking-wide text-accent-fg font-semibold mb-1">Document Request</p>
          <h1 className="text-xl font-bold leading-tight">Upload your compliance documents</h1>
          <p className="text-sm text-muted-fg mt-1">
            {data.vendor_name ? `${data.vendor_name} · ` : ''}{data.project_name}{data.project_address ? ` · ${data.project_address}` : ''}
          </p>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Progress banner after any upload */}
          {justSent.length > 0 && (
            <div className={cn('rounded-xl border px-4 py-3', allDone ? 'bg-success-tint border-success/30' : 'bg-info-tint border-info/30')}>
              <p className="text-sm font-semibold text-ink inline-flex items-center gap-1.5">
                <CheckCircle2 className={cn('h-4 w-4', allDone ? 'text-success' : 'text-info')} />
                Received {justSent.map((t) => data.docs.find((d) => d.type === t)?.label ?? t).join(', ')}
              </p>
              {!allDone && (
                <p className="text-sm text-muted-fg mt-1">
                  Still needed: <span className="font-medium text-ink-soft">{remainingDocs.map((d) => d.label).join(', ')}</span>. You can upload the rest below now, or come back to this same link later.
                </p>
              )}
            </div>
          )}

          {allDone ? (
            <div className="rounded-xl bg-success-tint border border-success/30 px-4 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="font-semibold text-ink">All documents received - thank you!</p>
              <p className="text-sm text-muted-fg mt-1">The contractor has everything they requested.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-xs uppercase tracking-wide text-faint font-semibold">Requested documents</p>
              {data.docs.map((doc) => {
                const chosen = files[doc.type]
                return (
                  <div key={doc.type} className="rounded-xl border border-line p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-soft">{doc.label}</span>
                      {doc.uploaded && !chosen && <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> on file</span>}
                    </div>
                    <input
                      ref={(el) => { refs.current[doc.type] = el }}
                      type="file" accept="application/pdf,image/*" className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        setFiles((prev) => {
                          const next = { ...prev }
                          if (f) next[doc.type] = f; else delete next[doc.type]
                          return next
                        })
                      }}
                    />
                    <button type="button" onClick={() => refs.current[doc.type]?.click()}
                      className="w-full flex items-center gap-2 rounded-lg border border-dashed border-muted2 px-3 py-2.5 text-sm text-muted-fg hover:bg-surface">
                      <Upload className="h-4 w-4 shrink-0" /> <span className="truncate">{chosen ? chosen.name : 'Choose PDF or image'}</span>
                    </button>
                    {chosen && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-faint whitespace-nowrap">Expires (optional)</label>
                        <input type="date" value={expiry[doc.type] ?? ''} onChange={(e) => setExpiry((p) => ({ ...p, [doc.type]: e.target.value }))}
                          className="flex-1 rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
                      </div>
                    )}
                  </div>
                )
              })}
              {error && <p className="text-sm text-danger">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full rounded-xl bg-accent text-accent-ink font-bold py-3.5 text-base hover:bg-accent/90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</> : 'Submit Documents'}
              </button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  )
}
