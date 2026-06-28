'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ACTIONS, RESOURCES, RESOURCE_GROUPS, ROLE_DEFAULTS, getRoleDefaults,
  type Action, type PermMap, type OverrideMap,
} from '@/lib/permissions'
import { Check, Shield, User, RotateCcw, Save, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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

export function PermissionsPanel({ teammates }: { teammates: Teammate[] }) {
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

      {mode === 'roles' ? <RoleDefaultsView /> : <UserOverridesView teammates={teammates} />}
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

// ── Role defaults (read-only reference) ────────────────────────────────────────
function RoleDefaultsView() {
  const roles = ['admin', 'project_manager', 'office_staff', 'field_supervisor', 'worker', 'read_only']
  const [role, setRole] = useState('project_manager')
  const defaults = getRoleDefaults(role)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-fg">Showing defaults for</label>
        <select value={role} onChange={e => setRole(e.target.value)}
          className="rounded-md border border-muted2 px-3 py-1.5 text-sm bg-panel focus:border-accent focus:outline-none">
          {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-fg">Role defaults are fixed. To change what a specific person can do, use <strong>Per-User Overrides</strong>.</p>
      <PermGrid effective={defaults} defaults={defaults} editable={false} />
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
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="rounded-md border border-muted2 px-3 py-1.5 text-sm bg-panel focus:border-accent focus:outline-none min-w-[220px]">
          <option value="">— Choose a team member —</option>
          {teammates.map(t => (
            <option key={t.id} value={t.id}>{t.full_name || t.email} ({ROLE_LABELS[t.role] ?? t.role})</option>
          ))}
        </select>
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
