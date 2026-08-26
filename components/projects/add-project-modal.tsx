'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ProjectForm } from '@/components/projects/project-form'

/**
 * WHY THIS IS A SHARED COMPONENT.
 *
 * There were THREE copies of this form: /projects/new, this modal on a
 * customer's detail page, and an identical one on the customers LIST page. The
 * first fix extracted ProjectForm and updated the detail page - and missed the
 * list page entirely, so the exact same stub survived one file away and the
 * bug looked unfixed.
 *
 * Extracting the form was not enough, because the modal AROUND it was also
 * duplicated. Both pages now mount this, so there is one of each.
 */

export interface AddProjectCustomer { id: string; name: string }

/**
 * Add a project to this customer - either a brand new one, or an existing
 * project that is not linked to anybody yet.
 *
 * The "new" half mounts the SAME ProjectForm as /projects/new. It used to be a
 * private four-field copy that had drifted well behind: it never asked how the
 * job bills or how it pays, so jobs created here started life without the two
 * answers the Budget and Payments tabs are built on. It also offered a
 * "renovation" project type that exists nowhere else in the app.
 *
 * The two halves are deliberately separate <form> elements rather than one
 * form with a branch - ProjectForm brings its own, and nesting forms is
 * invalid HTML that browsers resolve by silently dropping the inner one.
 */
export function AddProjectModal({
  customer,
  token,
  onClose,
  onSuccess,
}: {
  customer: AddProjectCustomer
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState<{ id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState('')

  // Projects not yet linked to any customer, for the "existing" option.
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const d = await res.json()
        setExisting((d.projects ?? []).filter((p: any) => !p.customer_id).map((p: any) => ({ id: p.id, name: p.name })))
      }
    })()
  }, [token])

  async function linkExisting(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) { setError('Choose a project to link.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customer_id: customer.id, client: customer.name }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({})))?.error ?? 'Could not link that project.')
        setSaving(false)
        return
      }
      onSuccess()
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* Taller and scrollable: the real project form is about three times the
          height of the stub it replaced. */}
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-xl bg-panel shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Add project for {customer.name}</h2>
          <button onClick={onClose} className="text-faint hover:text-muted-fg text-xl leading-none">&times;</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mb-4 inline-flex rounded-lg border border-line p-0.5">
            {(['new', 'existing'] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError('') }}
                className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  mode === m ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:text-ink')}>
                {m === 'new' ? 'New project' : 'Existing project'}
              </button>
            ))}
          </div>

          {mode === 'existing' ? (
            <form onSubmit={linkExisting} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Select an existing project</Label>
                <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  <option value="">Choose a project…</option>
                  {existing.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                {existing.length === 0 && <p className="text-xs text-faint">No unassigned projects - every project is already linked to a customer.</p>}
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Link Project'}</Button>
              </div>
            </form>
          ) : (
            <ProjectForm
              lockedCustomer={{ id: customer.id, name: customer.name }}
              submitLabel="Add Project"
              onCreated={onSuccess}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}
