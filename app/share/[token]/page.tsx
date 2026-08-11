'use client'

import { useEffect, useRef, useState } from 'react'
import {
  FileText, Download, Upload, CheckCircle2, Loader2, AlertTriangle, Paperclip, X,
} from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { DocumentViewer } from '@/components/ui/image-lightbox'

interface SharedFile { name: string; url: string; type?: string | null; size?: number | null; added_at?: string | null }
interface Data {
  name: string
  message: string | null
  files: SharedFile[]
  from_company: string | null
  from_person: string | null
  recipient_name: string | null
  allow_upload: boolean
  upload_prompt: string | null
  sent_at: string
  uploads: { name: string; created_at: string }[]
}

const prettySize = (n?: number | null) =>
  !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

// What the person on the other end sees: the documents, who sent them, and a
// way to send documents back. No account, no sign-up, nothing but this.
export default function SharePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState('')
  const [dragging, setDragging] = useState(false)
  // Which document the viewer is open on. Null means closed.
  const [viewing, setViewing] = useState<number | null>(null)
  const [sent, setSent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/share/${params.token}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error ?? 'This link is not valid.')
      else setData(d)
      setLoading(false)
    })()
  }, [params.token])

  /** Read an error body that might not be JSON - a platform-level rejection isn't. */
  async function errText(res: Response, fallback: string) {
    const raw = await res.text().catch(() => '')
    try { return JSON.parse(raw).error ?? fallback } catch { return raw.slice(0, 200) || fallback }
  }

  /**
   * Upload straight to storage, then tell the API where the files landed.
   *
   * Posting the files through the API meant a serverless body limit of about
   * 4.5MB, which a set of permit drawings blows past without trying.
   */
  async function send() {
    if (!picked.length) return
    setSending(true); setError('')
    try {
      const prep = await fetch(`/api/share/${params.token}/upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: picked.map(f => ({ name: f.name, size: f.size })) }),
      })
      if (!prep.ok) { setError(await errText(prep, 'Could not start the upload')); return }
      const { bucket, targets } = await prep.json()

      const supabase = createClient()
      const done: any[] = []
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i]
        const t = targets[i]
        if (!t) continue
        setProgress(`Uploading ${file.name} (${i + 1} of ${picked.length})…`)
        const { error: upErr } = await supabase.storage.from(bucket)
          .uploadToSignedUrl(t.path, t.token, file)
        if (upErr) { setError(`${file.name}: ${upErr.message}`); return }
        done.push({ name: file.name, path: t.path, type: file.type || null, size: file.size })
      }

      setProgress('Finishing…')
      const res = await fetch(`/api/share/${params.token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploads: done, note: note.trim() || undefined }),
      })
      if (!res.ok) { setError(await errText(res, 'Upload failed')); return }

      setPicked([]); setNote(''); setSent(true)
      // Show it in "Already sent back" without a manual refresh.
      const refreshed = await fetch(`/api/share/${params.token}`)
      if (refreshed.ok) setData(await refreshed.json())
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed')
    } finally {
      setSending(false); setProgress('')
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-panel">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <SyteNavLogo size={24} />
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {loading ? (
          <p className="py-20 text-center text-sm text-faint">
            <Loader2 className="h-5 w-5 animate-spin inline" />
          </p>
        ) : error && !data ? (
          <div className="rounded-2xl border border-danger/30 bg-danger-tint p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-danger mx-auto mb-3" />
            <p className="font-semibold text-ink">{error}</p>
            <p className="mt-1 text-sm text-muted-fg">Ask whoever sent it for a new link.</p>
          </div>
        ) : data ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              {data.from_company ? `Sent by ${data.from_company}` : 'Shared documents'}
              {data.from_person ? ` · ${data.from_person}` : ''}
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">{data.name}</h1>
            {data.recipient_name && (
              <p className="mt-1 text-sm text-muted-fg">For {data.recipient_name}</p>
            )}
            {data.message && (
              <div className="mt-5 rounded-2xl border border-line bg-panel p-4 text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
                {data.message}
              </div>
            )}

            {/* The documents */}
            <h2 className="mt-9 text-sm font-bold uppercase tracking-wide text-muted-fg">
              {data.files.length} document{data.files.length !== 1 ? 's' : ''}
            </h2>
            <div className="mt-3 rounded-2xl border border-line bg-panel divide-y divide-line-soft overflow-hidden">
              {data.files.map((f, i) => (
                // Opens in the viewer rather than a new tab. On a phone the tab
                // meant leaving this page and coming back once per document;
                // here you swipe from one to the next.
                <button key={i} type="button" onClick={() => setViewing(i)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition-colors">
                  <FileText className="h-5 w-5 text-accent-fg shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink truncate">
                      {f.name}
                      {/* Added after the link first went out - worth calling
                          out, since "here's the updated set" is the reason
                          anyone adds to a link they already sent. */}
                      {f.added_at && (
                        <span className="ml-2 rounded-full bg-accent-tint px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg align-middle">
                          Added {new Date(f.added_at).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                    {f.size ? <span className="block text-xs text-faint">{prettySize(f.size)}</span> : null}
                  </span>
                  <Download className="h-4 w-4 text-faint shrink-0" />
                </button>
              ))}
            </div>
            {data.files.length > 1 && (
              <p className="mt-2 text-xs text-faint">Open one and swipe to move through the rest.</p>
            )}

            {/* Send something back */}
            {data.allow_upload && (
              <div className="mt-10 rounded-2xl border border-line bg-panel p-5 sm:p-6">
                <h2 className="text-base font-bold text-ink">Send documents back</h2>
                <p className="mt-1 text-sm text-muted-fg">
                  {data.upload_prompt || 'Attach anything you need to return - it goes straight back to the sender.'}
                </p>

                {sent && (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-success-tint text-success px-3 py-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Sent. You can add more below if you need to.
                  </p>
                )}

                <div className="mt-4 space-y-2">
                  {picked.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                      <Paperclip className="h-4 w-4 text-faint shrink-0" />
                      <span className="flex-1 min-w-0 text-sm text-ink-soft truncate">{f.name}</span>
                      <span className="text-xs text-faint shrink-0">{prettySize(f.size)}</span>
                      <button onClick={() => setPicked(p => p.filter((_, j) => j !== i))}
                        className="text-faint hover:text-danger shrink-0" aria-label={`Remove ${f.name}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* A real label wrapping a real input. The old version called
                    .click() on a hidden input from a button, which in-app
                    browsers - the ones that open a link from an email or
                    WhatsApp - routinely block. Nothing happened and there was
                    nothing on screen to say why. A label needs no script. */}
                <label
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragging(false)
                    setPicked(p => [...p, ...Array.from(e.dataTransfer.files ?? [])])
                  }}
                  className={cn('mt-3 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 cursor-pointer transition-colors',
                    dragging ? 'border-accent bg-accent-tint' : 'border-muted2 hover:bg-surface')}>
                  <input ref={inputRef} type="file" multiple className="sr-only"
                    onChange={e => { setPicked(p => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
                  <Upload className="h-5 w-5 text-faint" />
                  <span className="text-sm font-medium text-ink-soft">Choose files</span>
                  <span className="text-xs text-faint">or drag them here · up to 100MB each</span>
                </label>

                <textarea
                  value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="Add a note (optional)"
                  className="mt-3 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />

                {/* Always here, so it is never a mystery where the button went. */}
                <button onClick={send} disabled={sending || !picked.length}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent text-accent-ink font-semibold px-5 py-2.5 text-sm disabled:opacity-50">
                  {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                    : picked.length ? <>Send {picked.length} file{picked.length !== 1 ? 's' : ''}</>
                      : 'Send'}
                </button>
                {!picked.length && !sending && (
                  <span className="ml-3 text-xs text-faint">Pick a file first</span>
                )}
                {progress && <p className="mt-2 text-xs text-muted-fg">{progress}</p>}

                {error && <p className="mt-3 text-sm text-danger">{error}</p>}

                {data.uploads.length > 0 && (
                  <div className="mt-6 border-t border-line-soft pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-2">Already sent back</p>
                    {data.uploads.map((u, i) => (
                      <p key={i} className="text-sm text-muted-fg flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> {u.name}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="mt-10 text-center text-xs text-faint">
              Shared securely through SyteNav. Only people with this link can see these documents.
            </p>
          </>
        ) : null}
      </main>

      {viewing != null && data && (
        <DocumentViewer
          images={data.files.map(f => ({ url: f.url, name: f.name }))}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
