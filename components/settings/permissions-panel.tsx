'use client'

import { useCallback, useEffect, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import {
  ACTIONS, RESOURCES, RESOURCE_GROUPS,
  type Action, type PermMap, type OverrideMap,
} from '@/lib/permissions'
import { Check, Shield, User, RotateCcw, Save, Loader2, Plus, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CompanyRole {
  role_key: string
  label: string
  permissions: PermMap
  is_custom: boolean
  is_overridden: boolean
}

interface Teammate { id: string; full_name: string; email: string; role: string }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', project_manager: 'Project Manager',
  office_staff: 'Office Staff', field_supervisor: 'Field Supervisor',
  worker: 'Worker', read_only: 'Field Worker', member: 'Member',
}
const ACTION_LABELS: Record<Action, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' }

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }
}

export function PermissionsPanel({ teammates, onRolesChanged }: { teammates: Teammate[]; onRolesChanged?: () => void }) {
  const [mode, setMode] = useState<'roles' | 'users'>('roles')

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-1 border-b border-line">
        <button
          onClick={() => setMode('roles')}
          className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            mode === 'roles' ? 'border-accent text-accent-fg' : 'border-transparent text-muted-fg hover:text-ink-soft')}>
          <Shield className="h-4 w-4" /> Role Defaults
        </button>
        <button
          onClick={() => setMode('users')}
          className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            mode === 'users' ? 'border-accent text-accent-fg' : 'border-transparent text-muted-fg hover:text-ink-soft')}>
          <User className="h-4 w-4" /> Per-User Overrides
        </button>
      </div>

      {mode === 'roles' ? <RoleDefaultsView onRolesChanged={onRolesChanged} /> : <UserOverridesView teammates={teammates} />}
    </div>
  )
}

// ── Grid renderer (shared) ────────────────────────────────────────────────────
function PermGrid({
  effective, defaults, editable, onToggle,
}: {
  effective: PermMap
  defaults: PermMap
  editable: boolean
  onToggle?: (resource: string, action: Action, value: boolean) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface border-b border-line">
            <th className="text-left px-4 py-2.5 font-medium text-muted-fg sticky left-0 bg-surface min-w-[200px]">Resource</th>
            {ACTIONS.map(a => (
              <th key={a} className="text-center px-3 py-2.5 font-medium text-muted-fg w-20">{ACTION_LABELS[a]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RESOURCE_GROUPS.map(group => {
            const rows = RESOURCES.filter(r => r.group === group)
            if (rows.length === 0) return null
            return (
              <FragmentGroup key={group} group={group}>
                {rows.map((r, i) => (
                  <tr key={r.key} className={i % 2 === 0 ? 'bg-panel' : 'bg-surface/40'}>
                    <td className="px-4 py-2 text-ink-soft sticky left-0 bg-inherit">{r.label}</td>
                    {ACTIONS.map(a => {
                      const on = !!effective[r.key]?.[a]
                      const def = !!defaults[r.key]?.[a]
                      const overridden = on !== def
                      return (
                        <td key={a} className="text-center px-3 py-2">
                          {editable ? (
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={e => onToggle?.(r.key, a, e.target.checked)}
                              className={cn('h-4 w-4 rounded border-muted2 accent-[#C9F24A] cursor-pointer',
                                overridden && 'ring-2 ring-amber-400 ring-offset-1')}
                              title={overridden ? `Overridden (default: ${def ? 'on' : 'off'})` : undefined}
                            />
                          ) : on ? (
                            <Check className="h-4 w-4 text-success mx-auto" />
                          ) : (
                            <span className="text-faint">·</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </FragmentGroup>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FragmentGroup({ group, children }: { group: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-muted/70">
        <td colSpan={ACTIONS.length + 1} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">{group}</td>
      </tr>
      {children}
    </>
  )
}

// ── Role defaults — editable classes, plus create-a-new-class ─────────────────
function RoleDefaultsView({ onRolesChanged }: { onRolesChanged?: () => void }) {
  const [roles, setRoles] = useState<CompanyRole[]>([])
  const [loading, setLoading] = useState(true)
  const [roleKey, setRoleKey] = useState('')
  const [draft, setDraft] = useState<PermMap>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const headers = await authHeaders()
    const res = await fetch('/api/settings/roles', { headers })
    if (res.ok) {
      const data = await res.json()
      const list: CompanyRole[] = data.roles ?? []
      setRoles(list)
      setRoleKey(prev => (prev && list.some(r => r.role_key === prev)) ? prev : (list[0]?.role_key ?? ''))
    } else {
      setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? 'Could not load classes.' })
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const selected = roles.find(r => r.role_key === roleKey) ?? null
  useEffect(() => {
    if (selected) { setDraft(JSON.parse(JSON.stringify(selected.permissions))); setDirty(false) }
  }, [selected?.role_key]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(resource: string, action: Action, value: boolean) {
    setDraft(prev => ({ ...prev, [resource]: { ...(prev[resource] ?? {}), [action]: value } }))
    setDirty(true)
  }

  async function save() {
    if (!selected) return
    setSaving(true); setMsg(null)
    const headers = await authHeaders()
    const res = await fetch('/api/settings/roles', {
      method: 'PUT', headers, body: JSON.stringify({ role_key: selected.role_key, label: selected.label, permissions: draft }),
    })
    setSaving(false)
    if (res.ok) { setMsg({ ok: true, text: `${selected.label} saved.` }); setDirty(false); load() }
    else setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? 'Save failed' })
  }

  async function createClass(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true); setMsg(null)
    const headers = await authHeaders()
    const res = await fetch('/api/settings/roles', { method: 'POST', headers, body: JSON.stringify({ label: newLabel.trim() }) })
    setCreating(false)
    if (res.ok) {
      const { role } = await res.json()
      setNewLabel(''); setShowNew(false)
      await load()
      setRoleKey(role.role_key)
      onRolesChanged?.()
    } else {
      setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? 'Could not create the class.' })
    }
  }

  async function removeClass() {
    if (!selected || !selected.is_custom) return
    if (!confirm(`Delete the "${selected.label}" class? This can't be undone.`)) return
    const headers = await authHeaders()
    const res = await fetch(`/api/settings/roles?role_key=${encodeURIComponent(selected.role_key)}`, { method: 'DELETE', headers })
    if (res.ok) { setMsg({ ok: true, text: 'Class deleted.' }); load(); onRolesChanged?.() }
    else setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? 'Could not delete — reassign members first.' })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-muted-fg">Editing class</label>
          <SearchableSelect value={roleKey} onChange={e => setRoleKey(e.target.value)}
            className="rounded-md border border-muted2 px-3 py-1.5 text-sm bg-panel focus:border-accent focus:outline-none min-w-[200px]">
            {roles.map(r => <option key={r.role_key} value={r.role_key}>{r.label}{r.is_custom ? ' (custom)' : r.is_overridden ? ' (edited)' : ''}</option>)}
          </SearchableSelect>
        </div>
        <button onClick={() => setShowNew(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-surface">
          <Plus className="h-3.5 w-3.5" /> New class
        </button>
      </div>

      {showNew && (
        <form onSubmit={createClass} className="flex flex-wrap items-end gap-2 rounded-lg border border-accent/40 bg-accent-tint/30 p-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted-fg">Class name</label>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Estimator" autoFocus
              className="w-full rounded-md border border-muted2 bg-panel px-3 py-1.5 text-sm focus:border-accent focus:outline-none" />
          </div>
          <button type="submit" disabled={creating || !newLabel.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent disabled:opacity-50">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
          </button>
          <button type="button" onClick={() => { setShowNew(false); setNewLabel('') }} className="p-1.5 text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </form>
      )}

      <p className="text-xs text-muted-fg">
        Toggle what this class can do. Admin always has full access and can&apos;t be edited. New team members can be assigned any class from the Team tab.
      </p>

      {loading ? (
        <p className="py-8 text-center text-sm text-faint flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : !selected ? (
        <p className="py-8 text-center text-sm text-faint">No classes yet.</p>
      ) : (
        <>
          <PermGrid effective={draft} defaults={selected.permissions} editable onToggle={toggle} />
          <div className="flex items-center justify-between gap-3">
            {msg ? <p className={cn('text-sm', msg.ok ? 'text-success' : 'text-danger')}>{msg.text}</p> : <span />}
            <div className="flex gap-2">
              {selected.is_custom && (
                <button onClick={removeClass}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-danger hover:bg-danger-tint">
                  <Trash2 className="h-3.5 w-3.5" /> Delete class
                </button>
              )}
              <button onClick={save} disabled={saving || !dirty}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Per-user overrides (editable) ──────────────────────────────────────────────
function UserOverridesView({ teammates }: { teammates: Teammate[] }) {
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [defaults, setDefaults] = useState<PermMap>({})
  const [effective, setEffective] = useState<PermMap>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setMsg(null)
    const headers = await authHeaders()
    const res = await fetch(`/api/settings/members/${id}/permissions`, { headers })
    if (res.ok) {
      const data = await res.json()
      const def: PermMap = data.defaults ?? {}
      const ov: OverrideMap = data.overrides ?? {}
      // effective = default unless overridden
      const eff: PermMap = JSON.parse(JSON.stringify(def))
      for (const [resource, actions] of Object.entries(ov)) {
        eff[resource] = { ...(eff[resource] ?? {}) }
        for (const [action, val] of Object.entries(actions)) eff[resource][action as Action] = !!val
      }
      setDefaults(def)
      setEffective(eff)
    } else {
      const d = await res.json().catch(() => ({}))
      setMsg({ ok: false, text: d.error ?? 'Failed to load permissions' })
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (selectedId) load(selectedId) }, [selectedId, load])

  function toggle(resource: string, action: Action, value: boolean) {
    setEffective(prev => ({ ...prev, [resource]: { ...(prev[resource] ?? {}), [action]: value } }))
  }

  function resetToDefaults() {
    setEffective(JSON.parse(JSON.stringify(defaults)))
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    // Build overrides = only cells that differ from default
    const overrides: OverrideMap = {}
    for (const r of RESOURCES) {
      for (const a of ACTIONS) {
        const on = !!effective[r.key]?.[a]
        const def = !!defaults[r.key]?.[a]
        if (on !== def) {
          overrides[r.key] = overrides[r.key] ?? {}
          overrides[r.key][a] = on
        }
      }
    }
    const headers = await authHeaders()
    const res = await fetch(`/api/settings/members/${selectedId}/permissions`, {
      method: 'PUT', headers, body: JSON.stringify({ overrides }),
    })
    if (res.ok) {
      setMsg({ ok: true, text: 'Permissions saved.' })
    } else {
      const d = await res.json().catch(() => ({}))
      setMsg({ ok: false, text: `${d.error ?? 'Save failed'}${d.hint ? ` — ${d.hint}` : ''}` })
    }
    setSaving(false)
  }

  const selected = teammates.find(t => t.id === selectedId)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-muted-fg">Select a user</label>
        <SearchableSelect value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="rounded-md border border-muted2 px-3 py-1.5 text-sm bg-panel focus:border-accent focus:outline-none min-w-[220px]">
          <option value="">— Choose a team member —</option>
          {teammates.map(t => (
            <option key={t.id} value={t.id}>{t.full_name || t.email} ({ROLE_LABELS[t.role] ?? t.role})</option>
          ))}
        </SearchableSelect>
        {selected && (
          <span className="text-xs text-muted-fg">Base role: <strong>{ROLE_LABELS[selected.role] ?? selected.role}</strong></span>
        )}
      </div>

      {!selectedId ? (
        <p className="text-sm text-faint py-8 text-center">Choose a team member to view and override their permissions.</p>
      ) : loading ? (
        <p className="text-sm text-faint py-8 text-center flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : (
        <>
          <p className="text-xs text-muted-fg">
            Checkboxes start at this user&apos;s role defaults. Any box you change is an <span className="text-warn font-medium">override</span> (highlighted) and takes priority over the role.
          </p>
          <PermGrid effective={effective} defaults={defaults} editable onToggle={toggle} />
          <div className="flex items-center justify-between gap-3">
            {msg ? (
              <p className={cn('text-sm', msg.ok ? 'text-success' : 'text-danger')}>{msg.text}</p>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={resetToDefaults}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted-fg hover:bg-surface">
                <RotateCcw className="h-3.5 w-3.5" /> Reset to role defaults
              </button>
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
