'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Eye, Loader2, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { fetchProblem } from '@/lib/fetch-error'
import { copyProblem } from '@/lib/email-copy'

// ─────────────────────────────────────────────────────────────────────────────
// Every email SyteNav sends, with its words editable.
//
// THE CODE IS THE DEFAULT AND THE DATABASE IS AN OVERRIDE, and this screen has
// to make that visible or the whole arrangement becomes the "two homes" bug it
// was designed to avoid. Every card says which it is showing, and every edited
// one can be put back.
//
// WHAT IS NOT HERE, ON PURPOSE: when an email goes, who it reaches, and whether
// it goes at all. Those live in lib/onboarding-nudges.ts and lib/trial-warning.ts
// where they are pinned. A console that can edit conditions is a console that
// can send "create your first job" to somebody with three of them.
// ─────────────────────────────────────────────────────────────────────────────

interface Tag { tag: string; label: string; sample: string }
interface Fields { subject: string; body: string; cta?: string | null }
interface Email {
  slug: string
  label: string
  group: string
  when: string
  hasCta: boolean
  tags: string[]
  fallback: Fields
  current: Fields & { source: 'stored' | 'default'; updatedByName?: string | null; updatedAt?: string | null }
  html: string
}

async function headers(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession()
  const t = data?.session?.access_token
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' }
}

export default function MarketingPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [problem, setProblem] = useState('')
  const [emails, setEmails] = useState<Email[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Fields | null>(null)
  const [busy, setBusy] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const notice = useNotice()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/email-copy', { headers: await headers() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(body?.error ?? 'Could not load the emails.'); setState('failed'); return }
      setEmails(body.emails ?? [])
      setTags(body.tags ?? [])
      setState('ready')
    } catch (e) {
      setProblem(fetchProblem(e, 'load the emails')); setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  function edit(e: Email) {
    setOpen(e.slug)
    setDraft({ subject: e.current.subject, body: e.current.body, cta: e.current.cta ?? null })
    setPreview(e.html)
  }

  async function save(e: Email) {
    if (!draft) return
    // ASKED AT THE FIELD, with the same function the route uses - so a refusal
    // lands on the box rather than arriving as a failed request.
    const bad = copyProblem(e.slug, draft)
    if (bad) { notice(bad); return }

    setBusy(e.slug)
    try {
      const res = await fetch('/api/admin/email-copy', {
        method: 'PUT', headers: await headers(),
        body: JSON.stringify({ slug: e.slug, ...draft }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { notice(out?.error ?? 'That did not save.'); return }
      notice('Saved. This is what goes out from now on.', { tone: 'success' })
      setPreview(out.html ?? null)
      await load()
    } catch (err) {
      notice(fetchProblem(err, 'save that'))
    } finally { setBusy('') }
  }

  async function reset(e: Email) {
    setBusy(e.slug)
    try {
      const res = await fetch(`/api/admin/email-copy?slug=${encodeURIComponent(e.slug)}`, {
        method: 'DELETE', headers: await headers(),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { notice(out?.error ?? 'That did not reset.'); return }
      notice('Back to the built-in wording.', { tone: 'success' })
      setOpen(null); setDraft(null); setPreview(null)
      await load()
    } catch (err) {
      notice(fetchProblem(err, 'reset that'))
    } finally { setBusy('') }
  }

  if (state === 'loading') {
    return <p className="flex items-center gap-2 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" /> Loading the emails...</p>
  }
  if (state === 'failed') {
    return (
      <div className="rounded-xl border border-warn/30 bg-warn-tint p-4">
        <p className="flex items-start gap-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span>{problem} Nothing has changed - this screen just could not read them.</span>
        </p>
        <Button variant="outline" onClick={load} className="mt-3 gap-2"><RefreshCw className="h-4 w-4" /> Try again</Button>
      </div>
    )
  }

  const groups = Array.from(new Set(emails.map(e => e.group)))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink">Emails</h1>
        <p className="mt-0.5 text-sm text-faint">
          The words every customer gets. Editing one here changes what goes out - no deploy.
        </p>
        {/* SAID PLAINLY, because the thing people will try next is editing the
            schedule, and it is not here. */}
        <p className="mt-2 text-xs text-muted-fg">
          When each one sends, and who it reaches, stays in the code where it is tested. This is the copy.
        </p>
      </div>

      {groups.map(group => (
        <section key={group}>
          <h2 className="mb-3 text-sm font-semibold text-ink">{group}</h2>
          <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-panel">
            {emails.filter(e => e.group === group).map(e => (
              <div key={e.slug} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      <span className="truncate">{e.current.subject}</span>
                      {e.current.source === 'stored' && (
                        <span className="whitespace-nowrap rounded-full bg-info-tint px-2 py-0.5 text-xs font-medium text-info">
                          Edited
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-fg">{e.when}</p>
                    {e.current.source === 'stored' && e.current.updatedByName && (
                      <p className="mt-1 text-xs text-faint">Changed by {e.current.updatedByName}</p>
                    )}
                  </div>
                  <div className="row-even lg:flex lg:flex-wrap gap-2">
                    <Button variant="outline" onClick={() => (open === e.slug ? setOpen(null) : edit(e))}>
                      {open === e.slug ? 'Close' : 'Edit'}
                    </Button>
                    {e.current.source === 'stored' && (
                      <Button variant="outline" disabled={busy === e.slug} onClick={() => reset(e)} className="gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" /> Reset
                      </Button>
                    )}
                  </div>
                </div>

                {open === e.slug && draft && (
                  <div className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`s-${e.slug}`}>Subject *</Label>
                      <Input id={`s-${e.slug}`} value={draft.subject}
                        onChange={ev => setDraft({ ...draft, subject: ev.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`b-${e.slug}`}>Body *</Label>
                      <textarea id={`b-${e.slug}`} rows={8} value={draft.body}
                        onChange={ev => setDraft({ ...draft, body: ev.target.value })}
                        className="w-full rounded-lg border border-muted2 bg-panel px-3 py-2 text-base text-ink focus:border-accent focus:outline-none lg:text-sm" />
                      <p className="text-xs text-faint">A blank line starts a new paragraph.</p>
                    </div>
                    {e.hasCta && (
                      <div className="space-y-1.5">
                        <Label htmlFor={`c-${e.slug}`}>Button label *</Label>
                        <Input id={`c-${e.slug}`} value={draft.cta ?? ''}
                          onChange={ev => setDraft({ ...draft, cta: ev.target.value })} />
                      </div>
                    )}

                    {/* The tags this one can actually fill. Offering a tag
                        nothing supplies is how {{first_name}} reaches an inbox. */}
                    <div>
                      <p className="text-xs font-medium text-ink-soft">You can use:</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {tags.filter(t => e.tags.includes(t.tag.replace(/[{}]/g, ''))).map(t => (
                          <button key={t.tag} type="button"
                            onClick={() => setDraft({ ...draft, body: `${draft.body}${t.tag}` })}
                            className="whitespace-nowrap rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-muted">
                            {t.tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="row-even lg:flex lg:flex-wrap gap-2">
                      <Button disabled={busy === e.slug} onClick={() => save(e)} className="gap-1.5">
                        {busy === e.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setPreview(e.html)} className="gap-1.5">
                        <Eye className="h-4 w-4" /> Show the built-in one
                      </Button>
                    </div>

                    {/* Sandboxed: this is email HTML and it is not running here. */}
                    {preview && (
                      <div className="overflow-hidden rounded-lg border border-line">
                        <iframe title="Email preview" sandbox="" srcDoc={preview} className="h-[28rem] w-full bg-white" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
