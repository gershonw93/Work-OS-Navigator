'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { fetchProblem } from '@/lib/fetch-error'
import { JOB_ROLES, missingMember, type AddMode } from '@/lib/team-member'

// ─────────────────────────────────────────────────────────────────────────────
// "Add to this job" - ONE dialog for every door that adds a person to a job's
// team: the header's team panel and the Subs & Team page.
//
// Asked for from the team panel: "an add members button, and if someone's not
// on the platform you can add them as well". Both halves already existed on
// the Subs & Team page as two separate modals - "Add Company Member" and "Add
// Member" - so this is those two as tabs of one dialog, not a third copy.
//
// "Not on SyteNav" is a real answer, not a workaround: a crew member does not
// need an account to be on the job. Their name, role, phone and email show in
// the team list, so anybody on the job can call them.
// ─────────────────────────────────────────────────────────────────────────────

interface Teammate { id: string; full_name: string | null; email: string | null; role: string | null }

export function AddTeamMemberDialog({
  projectId, onClose, onAdded, existingEmails = [],
}: {
  projectId: string
  onClose: () => void
  onAdded: () => void
  /** Emails already on the job, so the picker does not offer them twice. */
  existingEmails?: string[]
}) {
  const [mode, setMode] = useState<AddMode>('teammate')
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [teammatesState, setTeammatesState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [profileId, setProfileId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function token() {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? ''
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/settings/teammates', { headers: { Authorization: `Bearer ${await token()}` } })
        if (!res.ok) throw new Error(`error ${res.status}`)
        const data = await res.json()
        if (!live) return
        const onJob = new Set(existingEmails.map(e => e.toLowerCase()))
        const list: Teammate[] = (data.teammates ?? []).filter((t: Teammate) => !t.email || !onJob.has(t.email.toLowerCase()))
        setTeammates(list)
        setTeammatesState('ready')
        // Nobody left to pick from your company - the other tab is the answer.
        if (!list.length) setMode('outside')
      } catch {
        if (live) setTeammatesState('failed')
      }
    })()
    return () => { live = false }
    // existingEmails is read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const missing = missingMember({ mode, profileId, name, role, phone, email })
    if (missing) { setProblem(missing); return }
    const picked = teammates.find(t => t.id === profileId)
    const body = mode === 'teammate'
      ? { name: picked?.full_name || picked?.email || 'Teammate', role, email: picked?.email ?? null, phone: null }
      : { name: name.trim(), role, phone: phone.trim() || null, email: email.trim() || null }
    setSaving(true)
    setProblem(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setProblem(d.error ?? `Could not add them (error ${res.status}).`)
        return
      }
      onAdded()
      onClose()
    } catch (err) {
      setProblem(fetchProblem(err, 'adding them to the job'))
    } finally {
      setSaving(false)
    }
  }

  const tab = (m: AddMode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => { setMode(m); setProblem(null) }}
      className={cn(
        'flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
        mode === m ? 'bg-panel text-ink shadow-sm' : 'text-muted-fg hover:text-ink',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => { if (!saving) onClose() }}>
      <div className="bg-panel rounded-xl shadow-xl w-full max-w-md min-w-0" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-lg font-semibold text-ink">Add to this job</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-muted-fg shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="px-4 sm:px-6 py-5 space-y-4">
            <div role="tablist" className="flex gap-1 rounded-lg bg-surface p-1">
              {tab('teammate', 'From your team')}
              {tab('outside', 'Not on SyteNav')}
            </div>

            {mode === 'teammate' ? (
              teammatesState === 'loading' ? (
                <p className="text-sm text-faint py-2">Loading your team…</p>
              ) : teammatesState === 'failed' ? (
                <p className="text-sm text-danger py-2">Could not load your team. Close this and try again, or use Not on SyteNav.</p>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="atm-person">Who <span className="text-danger">*</span></Label>
                  <Select id="atm-person" value={profileId} onChange={e => setProfileId(e.target.value)}>
                    <option value="">-- Select --</option>
                    {teammates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.full_name || t.email || 'Unnamed'}{t.role ? ` (${t.role.replace(/_/g, ' ')})` : ''}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-faint">People with a SyteNav login at your company.</p>
                </div>
              )
            ) : (
              <>
                <p className="text-xs text-muted-fg">
                  They do not need a SyteNav account. Their name, role and contact details show in the
                  team list, so anyone on the job can reach them.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="atm-name">Name <span className="text-danger">*</span></Label>
                  <Input id="atm-name" autoFocus={autoFocusOnDesktop()} autoComplete="off" placeholder="Mike Torres"
                    value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="atm-phone">Phone <span className="text-faint font-normal">(optional)</span></Label>
                    <Input id="atm-phone" type="tel" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="atm-email">Email <span className="text-faint font-normal">(optional)</span></Label>
                    <Input id="atm-email" type="email" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="atm-role">Role on this job <span className="text-danger">*</span></Label>
              <Select id="atm-role" value={role} onChange={e => setRole(e.target.value)}>
                <option value="">-- Select --</option>
                {JOB_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>

            {problem && <p className="text-sm text-danger">{problem}</p>}
          </div>
          <div className="row-even px-4 sm:px-6 py-4 border-t border-line-soft lg:flex lg:flex-wrap gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add to job'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
