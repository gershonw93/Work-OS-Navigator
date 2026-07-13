'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FileText, Upload, CheckCircle2, Calendar, Loader2, AlertTriangle } from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface Data {
  request: { title: string; trade: string | null; description: string | null; due_date: string | null; status: string; project_name?: string; project_address?: string; attachments: { file_url: string; file_name: string | null }[] }
  invite: { vendor_name: string | null; status: string }
  submission: { amount: number | null; notes: string | null; file_name: string | null; created_at: string } | null
}

export default function BidPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const res = await fetch(`/api/bid/${params.token}`)
    if (res.ok) { const d = await res.json(); setData(d); setName(d.invite?.vendor_name ?? '') }
    else setError((await res.json().catch(() => ({}))).error ?? 'This link is no longer valid.')
    setLoading(false)
  }
  useEffect(() => { load() }, [params.token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSubmitting(true)
    const form = new FormData()
    form.append('name', name)
    if (amount) form.append('amount', amount)
    if (notes) form.append('notes', notes)
    if (file) form.append('file', file)
    const res = await fetch(`/api/bid/${params.token}`, { method: 'POST', body: form })
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
        <div className="mt-6 rounded-xl border border-line bg-panel px-4 py-4 text-center">
          <p className="text-sm text-muted-fg">Want all your jobs, plans, and quotes in one place?</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Link href="/signup" className="rounded-lg bg-accent text-accent-ink text-sm font-semibold px-4 py-2 hover:bg-accent/90">Create free account</Link>
            <Link href="/login" className="rounded-lg border border-line text-sm font-medium text-ink-soft px-4 py-2 hover:bg-surface">Log in</Link>
          </div>
        </div>
        <p className="text-center text-xs text-faint mt-3">No account needed to submit - this secure link is just for you.</p>
      </div>
    </div>
  )

  if (loading) return <Shell><div className="text-center text-muted-fg py-16">Loading…</div></Shell>
  if (error && !data) return <Shell><div className="rounded-xl bg-panel border border-line p-8 text-center text-ink"><AlertTriangle className="h-8 w-8 text-warn mx-auto mb-3" />{error}</div></Shell>
  if (!data) return null

  const r = data.request

  return (
    <Shell>
      <div className="rounded-2xl bg-panel border border-line overflow-hidden text-ink">
        <div className="px-5 py-5 border-b border-line-soft">
          <p className="text-xs uppercase tracking-wide text-accent-fg font-semibold mb-1">Request for Quote</p>
          <h1 className="text-xl font-bold leading-tight">{r.title}</h1>
          <p className="text-sm text-muted-fg mt-1">
            {r.trade ? `${r.trade} · ` : ''}{r.project_name}{r.project_address ? ` · ${r.project_address}` : ''}
          </p>
          {r.due_date && <p className="text-xs text-warn mt-2 inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Due {new Date(r.due_date + 'T00:00:00').toLocaleDateString()}</p>}
        </div>

        <div className="px-5 py-5 space-y-5">
          {r.description && <div><p className="text-xs uppercase tracking-wide text-faint font-semibold mb-1">Scope</p><p className="text-sm text-ink-soft whitespace-pre-wrap">{r.description}</p></div>}

          {r.attachments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-faint font-semibold mb-2">Plans &amp; documents</p>
              <div className="space-y-1.5">
                {r.attachments.map((a, i) => (
                  <a key={i} href={a.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-accent-fg hover:bg-surface">
                    <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{a.file_name ?? 'Document'}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {done || data.submission ? (
            <div className="rounded-xl bg-success-tint border border-success/30 px-4 py-5 text-center">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="font-semibold text-ink">Quote submitted. Thank you!</p>
              <p className="text-sm text-muted-fg mt-1">{name || data.invite.vendor_name}{(data.submission?.amount != null || amount) ? ` · $${Number(data.submission?.amount ?? amount).toLocaleString()}` : ''}</p>
              {data.submission?.created_at && <p className="text-xs text-faint mt-1">Received {new Date(data.submission.created_at).toLocaleDateString()}</p>}
            </div>
          ) : null}

          {/* First submission, or a revision after already submitting. A fresh
              submit this session shows only the banner above. */}
          {!done && (
            <form onSubmit={submit} className="space-y-4">
              {data.submission ? (
                <div className="border-t border-line-soft pt-5">
                  <h2 className="text-lg font-bold text-ink">Need to change something?</h2>
                  <p className="text-sm text-muted-fg mt-1">Submit a revised quote below and it replaces the one you sent.</p>
                </div>
              ) : (
                <p className="text-xs uppercase tracking-wide text-faint font-semibold">Submit your quote</p>
              )}
              <div className="space-y-1.5">
                <label className="text-sm text-ink-soft">Your name / company</label>
                <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-ink-soft">Quote amount ($)</label>
                <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="optional if attaching a file" className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-ink-soft">Attach your quote (PDF / image)</label>
                <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-muted2 px-3 py-3 text-sm text-muted-fg hover:bg-surface">
                  <Upload className="h-4 w-4 shrink-0" /> <span className="truncate">{file ? file.name : 'Choose file'}</span>
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-ink-soft">Notes (inclusions, exclusions, lead time…)</label>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full rounded-xl bg-accent text-accent-ink font-bold py-3.5 text-base hover:bg-accent/90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</> : 'Submit Quote'}
              </button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  )
}
