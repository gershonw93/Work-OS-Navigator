'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ChevronDown, Plus, Check, Search, UserPlus } from 'lucide-react'

interface Contact {
  id: string
  name: string
  type: string
  phone?: string | null
  contact_email?: string | null
  trade?: string | null
  extra?: Record<string, string> | null
}

interface ContactPickerProps {
  /** Filter by company type, e.g. 'inspector', 'subcontractor', 'worker' */
  filterType?: string
  /** Current selected name value */
  value: string
  /** Called when a contact is selected or name is typed */
  onChange: (name: string, contact?: Contact) => void
  placeholder?: string
  label?: string
  /** If provided, phone field will be auto-filled when a contact is picked */
  onPhoneChange?: (phone: string) => void
}

export function ContactPicker({
  filterType,
  value,
  onChange,
  placeholder = 'Search or type a name…',
  onPhoneChange,
}: ContactPickerProps) {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [quickEmail, setQuickEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Keep query in sync when value changes externally (e.g. form reset)
  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/directory', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const json = await res.json()
      let all: Contact[] = json.companies ?? []
      if (filterType) all = all.filter(c => c.type === filterType)
      setContacts(all)
    }
    load()
  }, [filterType])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowQuickAdd(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  )

  function select(c: Contact) {
    setQuery(c.name)
    onChange(c.name, c)
    if (onPhoneChange && c.phone) onPhoneChange(c.phone)
    setOpen(false)
    setShowQuickAdd(false)
  }

  async function handleQuickAdd() {
    if (!quickName.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({
        name: quickName.trim(),
        type: filterType ?? 'other',
        contact_email: quickEmail.trim() || `noemail+${Date.now()}@placeholder.com`,
        phone: quickPhone.trim() || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (json.company) {
      const newContact: Contact = { ...json.company }
      setContacts(prev => [...prev, newContact])
      select(newContact)
    }
    setShowQuickAdd(false)
    setQuickName(''); setQuickPhone(''); setQuickEmail('')
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-orange-500 focus:outline-none bg-white"
          onChange={e => {
            setQuery(e.target.value)
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 && !showQuickAdd && (
            <p className="px-3 py-2 text-xs text-slate-400">
              {query.length > 0 ? `No matches for "${query}"` : 'Start typing to search…'}
            </p>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-50 text-left text-sm transition-colors"
              onClick={() => select(c)}
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', query === c.name ? 'text-orange-500' : 'text-transparent')} />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-800">{c.name}</span>
                {c.trade && <span className="ml-1.5 text-xs text-slate-400">{c.trade}</span>}
              </div>
              {c.phone && <span className="text-xs text-slate-400 shrink-0">{c.phone}</span>}
            </button>
          ))}

          {!showQuickAdd ? (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 hover:bg-slate-50 text-sm text-orange-600 font-medium transition-colors"
              onClick={() => { setShowQuickAdd(true); setQuickName(query) }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Quick add{query ? ` "${query}"` : ''}…
            </button>
          ) : (
            <div className="border-t border-slate-100 px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick Add</p>
              <input
                autoFocus
                type="text"
                placeholder="Full name *"
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={quickPhone}
                onChange={e => setQuickPhone(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={quickEmail}
                onChange={e => setQuickEmail(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  disabled={saving || !quickName.trim()}
                  className="flex-1 rounded bg-orange-500 text-white text-xs font-semibold py-1.5 hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Add & Select'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="rounded border border-slate-200 text-xs text-slate-600 px-3 py-1.5 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
