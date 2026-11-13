'use client'

import { useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShareFilesModal } from '@/components/files/share-files-modal'
import { fetchProblem } from '@/lib/fetch-error'
import { hireProblem } from '@/lib/permit-expediter'

/**
 * Hire the expediter: "they send the survey and their proposal, you sign the
 * proposal and send it back". This records the signed copy and their fee as
 * their subcontract on the job - which is what puts the fee on the budget - and
 * then offers to email the signed copy to them.
 *
 * TWO ACTS, IN ORDER. Recording the hire and sending the email can each be
 * refused for their own reasons, so they are two requests: the record first
 * (the fact about the job), and the email after, from the Sharing link the
 * rest of the app uses for exactly this - paperwork to an expediter who will
 * never have an account. Nothing here claims an email went that did not.
 */
export function HireExpediterDialog({ base, projectId, expediter, expediterEmail, onClose, onHired }: {
  /** `/api/projects/<id>/permits/<permitId>` */
  base: string
  projectId: string
  expediter: string
  expediterEmail: string | null
  onClose: () => void
  onHired: () => void
}) {
  const [fee, setFee] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // After it saved: the signed copy, ready to send.
  const [hired, setHired] = useState<{ url: string | null; reused: boolean; amount: number | null } | null>(null)
  const [sharing, setSharing] = useState(false)

  async function save() {
    // Asked here and at the route, and answered - never a greyed-out button.
    const problem = hireProblem({ fee, hasFile: !!file })
    if (problem) { setError(problem); return }
    setError(''); setSaving(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const form = new FormData()
      form.set('fee', fee)
      form.set('proposal', file as File)
      const res = await fetch(`${base}/hire`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, body: form })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? `That did not save (${res.status}). Try again.`); return }
      const sub = out.subcontract ?? {}
      setHired({ url: sub.proposal_url ?? null, reused: out.reused === true, amount: sub.contract_amount != null ? Number(sub.contract_amount) : null })
      onHired()
    } catch (e) {
      setError(fetchProblem(e, 'saving the hire'))
    } finally {
      setSaving(false)
    }
  }

  if (sharing && hired?.url) {
    return (
      <ShareFilesModal
        files={[{ id: hired.url, name: 'Signed proposal', file_url: hired.url, source: 'Proposal' }]}
        preselected={[hired.url]} projectId={projectId}
        defaultTitle={`Signed proposal - ${expediter}`}
        suggested={expediterEmail ? [{ label: 'The expediter', name: expediter, email: expediterEmail }] : []}
        onClose={onClose} onShared={onClose} />
    )
  }

  const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="w-full min-w-0 max-w-full overflow-y-auto rounded-xl bg-panel shadow-xl sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
          <h2 className="min-w-0 truncate font-semibold text-ink">Hire {expediter}</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:text-ink lg:h-9 lg:w-9">
            <X className="h-5 w-5" />
          </button>
        </div>

        {hired ? (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-ink">
              {hired.reused
                ? `${expediter} was already hired on this job, so their contract there stands - nothing new was added to the budget.`
                : `Hired. ${hired.amount != null ? `Their ${money(hired.amount)} fee` : 'Their fee'} is on the budget as their contract, and their bills go against it.`}
            </p>
            <p className="text-sm text-muted-fg">Next: send them the plans to file. That is the next step on this permit.</p>
            <div className="row-even gap-2 lg:flex lg:flex-wrap lg:justify-end">
              <Button variant="outline" className="min-h-11" onClick={onClose}>Done</Button>
              {hired.url && <Button className="min-h-11" onClick={() => setSharing(true)}>Email them the signed copy</Button>}
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-ink-soft">
              {expediter} sends the survey and their proposal. Sign the proposal, then record it here - their fee goes on the budget as their contract.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="hire-fee">Their fee *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-fg">$</span>
                <Input id="hire-fee" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} placeholder="4500" />
              </div>
              <p className="text-xs text-muted-fg">The total on their proposal.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Signed proposal *</Label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-muted2 px-3 py-2 text-sm text-ink-soft hover:bg-surface">
                <Paperclip className="h-4 w-4 shrink-0 text-faint" />
                <span className="min-w-0 truncate">{file ? file.name : 'Attach the signed copy'}</span>
                <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <p className="text-xs text-muted-fg">
              The lot survey they sent goes on the <a href={`/projects/${projectId}/plans`} className="underline underline-offset-2">Plans tab</a>, as a Survey - everybody asks for it with the plans.
            </p>
            {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
            <div className="row-even gap-2 lg:flex lg:flex-wrap lg:justify-end">
              <Button variant="outline" className="min-h-11" onClick={onClose}>Cancel</Button>
              <Button className="min-h-11" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Record the hire'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
