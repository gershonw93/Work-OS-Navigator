'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Upload, CheckCircle2, Calendar, MapPin, Loader2, AlertTriangle } from 'lucide-react'

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

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[#0F1113] py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <svg width="32" height="32" viewBox="0 0 48 48" aria-hidden><rect width="48" height="48" rx="11" fill="#1F2227" /><path d="M14 13 L37 22 L26 26 L22 37 Z" fill="#C9F24A" /></svg>
          <span className="font-display font-bold uppercase tracking-tight text-xl text-[#ECEEF0]">SYTE<span className="text-[#C9F24A]">NAV</span></span>
        </div>
        {children}
      </div>
    </div>
  )

  if (loading) return <Shell><div className="text-center text-[#9AA0A8] py-16">Loading…</div></Shell>
  if (error && !data) return <Shell><div className="rounded-xl bg-[#1F2227] border border-[#2A2E34] p-8 text-center text-[#ECEEF0]"><AlertTriangle className="h-8 w-8 text-[#FFB02E] mx-auto mb-3" />{error}</div></Shell>
  if (!data) return null

  const r = data.request

  return (
    <Shell>
      <div className="rounded-2xl bg-[#1F2227] border border-[#2A2E34] overflow-hidden text-[#ECEEF0]">
        <div className="px-6 py-5 border-b border-[#2A2E34]">
          <p className="text-xs uppercase tracking-wide text-[#C9F24A] font-semibold mb-1">Request for Quote</p>
          <h1 className="text-xl font-bold">{r.title}</h1>
          <p className="text-sm text-[#9AA0A8] mt-1">
            {r.trade ? `${r.trade} · ` : ''}{r.project_name}{r.project_address ? ` · ${r.project_address}` : ''}
          </p>
          {r.due_date && <p className="text-xs text-[#FFB02E] mt-2 inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Due {new Date(r.due_date + 'T00:00:00').toLocaleDateString()}</p>}
        </div>

        <div className="px-6 py-5 space-y-5">
          {r.description && <div><p className="text-xs uppercase tracking-wide text-[#6E747C] font-semibold mb-1">Scope</p><p className="text-sm text-[#C2C7CE] whitespace-pre-wrap">{r.description}</p></div>}

          {r.attachments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-[#6E747C] font-semibold mb-2">Plans &amp; documents</p>
              <div className="space-y-1.5">
                {r.attachments.map((a, i) => (
                  <a key={i} href={a.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-[#2A2E34] px-3 py-2 text-sm text-[#C9F24A] hover:bg-[#2A2E34]">
                    <FileText className="h-4 w-4" /> {a.file_name ?? 'Document'}
                  </a>
                ))}
              </div>
            </div>
          )}

          {done || data.submission ? (
            <div className="rounded-xl bg-[#143226] border border-[#2BA56B]/40 px-4 py-5 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#5FD89B] mx-auto mb-2" />
              <p className="font-semibold text-[#ECEEF0]">Quote submitted — thank you!</p>
              <p className="text-sm text-[#9AA0A8] mt-1">{name || data.invite.vendor_name} · {data.submission?.amount != null ? `$${Number(data.submission.amount).toLocaleString()}` : (amount ? `$${Number(amount).toLocaleString()}` : '')}</p>
              {!done && <p className="text-xs text-[#6E747C] mt-2">Need to revise? Just submit again below.</p>}
            </div>
          ) : null}

          {!done && (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-xs uppercase tracking-wide text-[#6E747C] font-semibold">{data.submission ? 'Submit a revised quote' : 'Submit your quote'}</p>
              <div className="space-y-1.5">
                <label className="text-sm text-[#C2C7CE]">Your name / company</label>
                <input value={name} onChange={e => setName(e.target.value)} required
                  className="w-full rounded-lg bg-[#0F1113] border border-[#2A2E34] px-3 py-2 text-sm text-[#ECEEF0] focus:border-[#C9F24A] focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-[#C2C7CE]">Quote amount ($)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="optional if attaching a file"
                  className="w-full rounded-lg bg-[#0F1113] border border-[#2A2E34] px-3 py-2 text-sm text-[#ECEEF0] focus:border-[#C9F24A] focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-[#C2C7CE]">Attach your quote (PDF / image)</label>
                <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-[#3A3F46] px-3 py-2.5 text-sm text-[#9AA0A8] hover:bg-[#2A2E34]">
                  <Upload className="h-4 w-4" /> {file ? file.name : 'Choose file'}
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-[#C2C7CE]">Notes (inclusions, exclusions, lead time…)</label>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-lg bg-[#0F1113] border border-[#2A2E34] px-3 py-2 text-sm text-[#ECEEF0] focus:border-[#C9F24A] focus:outline-none resize-none" />
              </div>
              {error && <p className="text-sm text-[#FF7A5C]">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full rounded-xl bg-[#C9F24A] text-[#0F1113] font-bold py-3 hover:bg-[#C9F24A]/90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</> : 'Submit Quote'}
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-[#6E747C] mt-4">No account needed — this secure link is just for you.</p>
    </Shell>
  )
}
