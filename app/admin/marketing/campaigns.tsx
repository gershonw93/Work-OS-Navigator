'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Eye, Loader2, RefreshCw, Send, CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { fetchProblem } from '@/lib/fetch-error'
import { campaignProblem } from '@/lib/campaign-copy'
import { dayWords } from '@/lib/dates'

// ─────────────────────────────────────────────────────────────────────────────
// Writing one email to a lot of people.
//
// THE COUNT IS ON THE SCREEN BEFORE THE BUTTON IS PRESSED, and the confirmation
// names it again. This is the only control in the product that mails every
// customer at once, and "I did not realise that segment was everybody" is the
// mistake it has to make impossible.
//
// SUBCONTRACTORS ARE NEVER ON A LIST, and the screen says so rather than
// leaving it to be discovered. The rule is enforced in lib/campaign-audience.ts,
// above every segment, so no segment here can forget it.
// ─────────────────────────────────────────────────────────────────────────────

interface Segment { key: string; label: string; describe: string; custom: boolean; count: number | null }
interface Tally { sent: number; failed: number; skipped: number; pending: number }
interface Campaign {
  id: string
  name: string
  subject: string
  segment: string
  status: string
  scheduled_for: string | null
  finished_at: string | null
  created_by_name: string | null
  created_at: string
  tally: Tally
}

async function headers(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession()
  const t = data?.session?.access_token
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' }
}

const STATUS_WORDS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Did not send',
}

export function Campaigns() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [problem, setProblem] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [audience, setAudience] = useState<{ complete: boolean; people: number; suppressed: number } | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [myEmail, setMyEmail] = useState('')

  // A PICKER STARTS EMPTY. A default on a required select is a claim, and the
  // claim this one would make is "send it to everyone".
  const [segment, setSegment] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [custom, setCustom] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  const notice = useNotice()
  const guard = useDeleteGuard()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/campaigns', { headers: await headers() })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(out?.error ?? 'Could not load the campaigns.'); setState('failed'); return }
      setSegments(out.segments ?? [])
      setCampaigns(out.campaigns ?? [])
      setAudience(out.audience ?? null)
      setTags(out.tags ?? [])
      setState('ready')
    } catch (e) {
      setProblem(fetchProblem(e, 'load the campaigns')); setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMyEmail(data?.user?.email ?? ''))
  }, [])

  const chosen = segments.find(s => s.key === segment) ?? null
  const fields = { name, subject, body, segment, customEmails: custom }

  async function post(payload: Record<string, unknown>, label: string) {
    setBusy(label)
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST', headers: await headers(), body: JSON.stringify(payload),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { notice(out?.error ?? 'That did not go.'); return null }
      return out
    } catch (e) {
      notice(fetchProblem(e, label)); return null
    } finally { setBusy('') }
  }

  async function showPreview() {
    const out = await post({ action: 'preview', ...fields }, 'preview it')
    if (out?.html) setPreview(out.html)
  }

  async function sendTest() {
    if (!myEmail) { notice('We do not have an address for you to send a test to.'); return }
    const bad = campaignProblem({ ...fields, segment: 'one-address', customEmails: myEmail })
    if (bad) { notice(bad); return }
    const out = await post({
      action: 'send',
      ...fields,
      name: `Test: ${name || subject}`,
      segment: 'one-address',
      customEmails: myEmail,
    }, 'send the test')
    if (out?.ok) { notice(`On its way to ${myEmail}.`, { tone: 'success' }); await load() }
  }

  function send() {
    // ASKED AT THE FIELD with the same function the route uses, so a refusal
    // lands on the form rather than arriving as a failed request.
    const bad = campaignProblem(fields)
    if (bad) { notice(bad); return }

    const count = chosen?.custom ? null : chosen?.count ?? 0
    guard(async () => {
      const out = await post({ action: 'send', ...fields }, 'send it')
      if (out?.ok) {
        // WHAT ACTUALLY WENT, not what was queued. Most sends finish in this
        // one request; anything past the cap is left pending and the daily run
        // finishes it, and the sentence says which rather than implying
        // everybody has been mailed.
        const parts = [`Sent to ${out.sent} of ${out.recipients}.`]
        if (out.failed) parts.push(`${out.failed} failed - see the list below for why.`)
        if (out.skipped) parts.push(`${out.skipped} had unsubscribed.`)
        if (out.remaining) parts.push(`The last ${out.remaining} go out on tomorrow's run.`)
        notice(parts.join(' '), { tone: out.failed ? 'error' : 'success' })
        setName(''); setSubject(''); setBody(''); setCustom(''); setSegment('')
        await load()
      }
    }, {
      title: 'Send this to everyone in the segment?',
      body: count === null
        ? `It goes to the addresses you typed in. This cannot be taken back once it is sent.`
        : `It goes to ${count} ${count === 1 ? 'person' : 'people'} - "${chosen?.label}". This cannot be taken back once it is sent.`,
      confirmLabel: 'Send it',
    })
  }

  async function schedule() {
    const bad = campaignProblem(fields)
    if (bad) { notice(bad); return }
    if (!when) { notice('Pick a date and time first.'); return }
    const out = await post({ action: 'schedule', ...fields, scheduledFor: new Date(when).toISOString() }, 'schedule it')
    if (out?.ok) {
      notice('Scheduled. It goes out on the daily run after that time, and the list is worked out then rather than now.', { tone: 'success' })
      setName(''); setSubject(''); setBody(''); setCustom(''); setSegment(''); setWhen('')
      await load()
    }
  }

  if (state === 'loading') {
    return <p className="flex items-center gap-2 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" /> Loading the campaigns...</p>
  }
  if (state === 'failed') {
    return (
      <div className="rounded-xl border border-warn/30 bg-warn-tint p-4">
        <p className="flex items-start gap-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span>{problem} Nothing has been sent - this screen just could not read them.</span>
        </p>
        <Button variant="outline" onClick={load} className="mt-3 gap-2"><RefreshCw className="h-4 w-4" /> Try again</Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink">Campaigns</h1>
        <p className="mt-0.5 text-sm text-faint">
          One email, to a list you pick. This is the only thing here that mails everybody at once.
        </p>
        <p className="mt-2 text-xs text-muted-fg">
          Only people at builders using SyteNav. Subcontractors and inspectors are never on a list -
          they were invited onto a job by a customer and never asked to hear from us.
          {audience && ` ${audience.people} people, ${audience.suppressed} unsubscribed.`}
        </p>
        {audience && !audience.complete && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-tint p-3 text-sm text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>
              The counts below are incomplete - one of the reads did not finish. Sending is refused
              until it does, so a list cannot go out missing people.
            </span>
          </p>
        )}
      </div>

      {/* ── compose ────────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-line bg-panel p-4">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Name it *</Label>
          <Input id="c-name" value={name} onChange={e => setName(e.target.value)}
            placeholder="October - schedule dependencies" />
          <p className="text-xs text-faint">Just for you, so you can tell it apart later.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="c-segment">Who gets it *</Label>
          <select id="c-segment" value={segment} onChange={e => setSegment(e.target.value)}
            className="w-full rounded-lg border border-muted2 bg-panel px-3 py-2 text-base text-ink focus:border-accent focus:outline-none lg:text-sm">
            <option value="">-- Select --</option>
            {segments.map(s => (
              <option key={s.key} value={s.key}>
                {s.label}{s.count !== null ? ` (${s.count})` : ''}
              </option>
            ))}
          </select>
          {chosen && <p className="text-xs text-muted-fg">{chosen.describe}</p>}
        </div>

        {chosen?.custom && (
          <div className="space-y-1.5">
            <Label htmlFor="c-custom">Addresses *</Label>
            <textarea id="c-custom" rows={3} value={custom} onChange={e => setCustom(e.target.value)}
              className="w-full rounded-lg border border-muted2 bg-panel px-3 py-2 text-base text-ink focus:border-accent focus:outline-none lg:text-sm" />
            <p className="text-xs text-faint">One per line, or separated by commas.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="c-subject">Subject *</Label>
          <Input id="c-subject" value={subject} onChange={e => setSubject(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="c-body">Body *</Label>
          <textarea id="c-body" rows={10} value={body} onChange={e => setBody(e.target.value)}
            className="w-full rounded-lg border border-muted2 bg-panel px-3 py-2 text-base text-ink focus:border-accent focus:outline-none lg:text-sm" />
          <p className="text-xs text-faint">A blank line starts a new paragraph.</p>
        </div>

        <div>
          <p className="text-xs font-medium text-ink-soft">You can use:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map(t => (
              <button key={t} type="button" onClick={() => setBody(`${body}{{${t}}}`)}
                className="whitespace-nowrap rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-muted">
                {`{{${t}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="row-even lg:flex lg:flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={showPreview} className="gap-1.5">
            <Eye className="h-4 w-4" /> Preview
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={sendTest} className="gap-1.5">
            <Send className="h-4 w-4" /> Send a test to me
          </Button>
          <Button disabled={!!busy} onClick={send} className="gap-1.5">
            {busy === 'send it' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send{chosen && !chosen.custom ? ` to ${chosen.count}` : ''}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="c-when">Or send it later (optional)</Label>
          <div className="row-even lg:flex lg:flex-wrap gap-2">
            <Input id="c-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
            <Button variant="outline" disabled={!!busy || !when} onClick={schedule} className="gap-1.5">
              <CalendarClock className="h-4 w-4" /> Schedule
            </Button>
          </div>
          <p className="text-xs text-faint">
            Who is on the list is worked out when it sends, not now - so anybody who unsubscribes in
            between is already gone. A scheduled campaign goes out on the daily run after the time
            you pick, not to the minute.
          </p>
        </div>

        {/* Sandboxed: this is email HTML and it is not running here. */}
        {preview && (
          <div className="overflow-hidden rounded-lg border border-line">
            <iframe title="Campaign preview" sandbox="" srcDoc={preview} className="h-[28rem] w-full bg-white" />
          </div>
        )}
      </section>

      {/* ── what has gone out ──────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Sent</h2>
        {!campaigns.length ? (
          <p className="text-sm text-muted-fg">Nothing yet.</p>
        ) : (
          <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-panel">
            {campaigns.map(c => (
              <div key={c.id} className="p-4">
                <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  <span className="truncate">{c.name}</span>
                  <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-ink-soft">
                    {STATUS_WORDS[c.status] ?? c.status}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-sm text-muted-fg">{c.subject}</p>
                <p className="mt-1 text-xs text-faint">
                  {c.tally.sent} sent
                  {c.tally.pending ? `, ${c.tally.pending} still going` : ''}
                  {c.tally.failed ? `, ${c.tally.failed} failed` : ''}
                  {c.tally.skipped ? `, ${c.tally.skipped} unsubscribed` : ''}
                  {c.created_by_name ? ` - ${c.created_by_name}` : ''}
                  {/* dayWords, not dateWords - a sentence must not print an
                      object, and this one is a timestamptz. It returns null
                      rather than a placeholder, so the clause drops. */}
                  {dayWords(c.created_at) ? ` - ${dayWords(c.created_at)}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
