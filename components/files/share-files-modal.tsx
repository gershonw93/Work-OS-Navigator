'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { cn } from '@/lib/utils'
import { X, Check, Copy, Mail, Search, FileText, Send } from 'lucide-react'

export interface ShareableFile {
  id: string
  name: string
  file_url: string
  file_type?: string | null
  size_bytes?: number | null
  category?: string | null
}

interface Contact { id: string; name: string; email: string | null; company?: string | null; kind: string }

/**
 * Send a set of documents to one person outside the company.
 *
 * The case this exists for: pulling permits. You send the expeditor the plans
 * and forms, and they send the approved permit back - all with someone who is
 * never going to have an account. So it produces a link, not an invitation, and
 * the return trip is on the same link.
 */
export function ShareFilesModal({
  files, preselected, projectId, onClose, onShared,
}: {
  files: ShareableFile[]
  preselected?: string[]
  projectId?: string
  onClose: () => void
  onShared?: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'compose' | 'done'>('compose')
  const [picked, setPicked] = useState<Set<string>>(new Set(preselected ?? []))
  const [q, setQ] = useState('')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [allowUpload, setAllowUpload] = useState(true)
  const [uploadPrompt, setUploadPrompt] = useState('')
  const [expires, setExpires] = useState('30')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function token() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // People you already work with: saved contacts plus companies in your
  // directory. Typing a fresh address still works - an expeditor you use once
  // shouldn't have to be filed first.
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/directory', { headers: { Authorization: `Bearer ${await token()}` } })
      if (!res.ok) return
      const d = await res.json()
      const list: Contact[] = [
        ...(d.contacts ?? []).map((c: any) => ({
          id: `contact:${c.id}`, name: c.name, email: c.email ?? null, company: c.company ?? null, kind: c.type || 'Contact',
        })),
        ...(d.companies ?? []).map((c: any) => ({
          id: `company:${c.id}`, name: c.name, email: c.email ?? null, company: null, kind: c.type || 'Company',
        })),
      ].filter(c => c.name)
      setContacts(list)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chooseContact(id: string) {
    setContactId(id)
    const c = contacts.find(x => x.id === id)
    if (c) { setName(c.name); setEmail(c.email ?? '') }
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return files
    return files.filter(f => f.name.toLowerCase().includes(s) || (f.category ?? '').toLowerCase().includes(s))
  }, [files, q])

  function toggle(id: string) {
    setPicked(p => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function share() {
    const chosen = files.filter(f => picked.has(f.id))
    if (!chosen.length) { setError('Pick at least one document'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/file-shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({
        name: title.trim() || `Documents for ${name || 'you'}`,
        message: message.trim() || null,
        project_id: projectId ?? null,
        recipient_name: name.trim() || null,
        recipient_email: email.trim() || null,
        allow_upload: allowUpload,
        upload_prompt: allowUpload ? (uploadPrompt.trim() || null) : null,
        expires_days: Number(expires) || null,
        files: chosen.map(f => ({
          name: f.name, url: f.file_url, type: f.file_type ?? null, size: f.size_bytes ?? null,
        })),
      }),
    })
    setSaving(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not create the link'); return }
    const d = await res.json()
    setUrl(d.share.url)
    setStep('done')
    onShared?.()
  }

  const mailto = () => {
    const body = [
      message.trim() || `Here are the documents you need.`,
      '',
      url,
      '',
      allowUpload ? 'You can send documents back on the same link.' : '',
    ].filter(Boolean).join('\n')
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(title || 'Documents')}&body=${encodeURIComponent(body)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-2xl rounded-xl bg-panel shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="text-base font-semibold text-ink">
            {step === 'compose' ? 'Share documents' : 'Link ready'}
          </h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {step === 'compose' ? (
          <div className="p-5 space-y-5">
            {/* Who */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Send to</Label>
                <SearchableSelect value={contactId} onChange={e => chooseContact(e.target.value)}>
                  <option value="">Pick from your contacts…</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.company ? ` · ${c.company}` : ''}{c.email ? ` · ${c.email}` : ''}
                    </option>
                  ))}
                </SearchableSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dave at City Permits" />
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-faint font-normal">(optional)</span></Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="dave@expeditor.com" />
              </div>
            </div>

            {/* What */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Documents <span className="text-faint font-normal">({picked.size} selected)</span></Label>
                {files.length > 4 && (
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-faint" />
                    <Input className="pl-8 h-8 text-xs" placeholder="Find a file…" value={q} onChange={e => setQ(e.target.value)} />
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-line max-h-56 overflow-y-auto divide-y divide-line-soft">
                {shown.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-faint">No files here yet.</p>
                ) : shown.map(f => (
                  <label key={f.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface cursor-pointer">
                    <input type="checkbox" className="accent-[#C9F24A]" checked={picked.has(f.id)} onChange={() => toggle(f.id)} />
                    <FileText className="h-4 w-4 text-faint shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-ink-soft truncate">{f.name}</span>
                    {f.category && <span className="text-[10px] text-faint shrink-0">{f.category}</span>}
                  </label>
                ))}
              </div>
            </div>

            {/* Context */}
            <div className="space-y-1.5">
              <Label>What is this?</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Permit package - 19 Shady Nook Ave" />
            </div>
            <div className="space-y-1.5">
              <Label>Message <span className="text-faint font-normal">(optional)</span></Label>
              <textarea
                value={message} onChange={e => setMessage(e.target.value)} rows={3}
                placeholder="Anything they need to know."
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>

            {/* Return trip */}
            <div className="rounded-lg border border-line bg-surface px-4 py-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-soft cursor-pointer">
                <input type="checkbox" className="accent-[#C9F24A]" checked={allowUpload} onChange={e => setAllowUpload(e.target.checked)} />
                Let them send documents back on the same link
              </label>
              {allowUpload && (
                <Input value={uploadPrompt} onChange={e => setUploadPrompt(e.target.value)}
                  placeholder="What you need back, e.g. the approved permit" className="text-sm" />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Link expires after</Label>
              <SearchableSelect value={expires} onChange={e => setExpires(e.target.value)} className="w-full">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="0">Never</option>
              </SearchableSelect>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={share} disabled={saving || picked.size === 0} className="gap-1.5">
                <Send className="h-4 w-4" /> {saving ? 'Creating…' : 'Create link'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-fg">
              Anyone with this link can see {picked.size} document{picked.size !== 1 ? 's' : ''}
              {allowUpload ? ' and send documents back' : ''}. No account needed.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
              <span className="flex-1 min-w-0 text-sm font-mono text-ink-soft truncate">{url}</span>
              <button
                onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-accent-fg hover:underline"
              >
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {email && (
                <a href={mailto()} className={cn('inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-muted')}>
                  <Mail className="h-4 w-4" /> Open in email
                </a>
              )}
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
