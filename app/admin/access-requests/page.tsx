'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminGet } from '@/lib/admin-fetch'
import { Check, X, Copy, Mail, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccessRequest {
  id: string; name: string; email: string; company_name: string | null
  company_type: string | null; phone: string | null; message: string | null
  status: string; invite_token: string | null; created_at: string
}

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-warn-tint text-warn',
  approved: 'bg-success-tint text-success',
  rejected: 'bg-danger-tint text-danger',
}

export default function AccessRequestsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function load() {
    const d = await adminGet<{ requests: AccessRequest[] }>('/api/admin/access-requests')
    setRequests(d?.requests ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function act(id: string, action: 'approve' | 'reject' | 'reset') {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/access-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id, action }),
    })
    if (res.ok) {
      const { request } = await res.json()
      setRequests(prev => prev.map(r => r.id === id ? request : r))
    }
  }

  const inviteLink = (r: AccessRequest) => `${window.location.origin}/signup?invite=${r.invite_token}`
  function copyLink(r: AccessRequest) {
    navigator.clipboard?.writeText(inviteLink(r))
    setCopiedId(r.id); setTimeout(() => setCopiedId(null), 1500)
  }
  function mailto(r: AccessRequest) {
    const subject = "You're in - your SyteNav invite"
    const body = `Hi ${r.name.split(' ')[0]},\n\nYour SyteNav access request is approved. Create your account with this personal invite link:\n${inviteLink(r)}\n\nWelcome aboard!`
    return `mailto:${r.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const pending = requests.filter(r => r.status === 'pending')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Access Requests</h1>
        <p className="text-sm text-faint mt-0.5">
          {pending.length ? `${pending.length} waiting for review.` : 'No pending requests.'} Approve to mint a personal invite link, then email it.
        </p>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-faint">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="py-12 text-center text-sm text-faint">No requests yet - they&apos;ll appear here when someone fills the Request Access form.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-white">{r.name}</span>
                <span className="text-sm text-faint">{r.email}</span>
                {r.company_name && <span className="text-sm text-faint">· {r.company_name}</span>}
                {r.company_type && <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300 uppercase">{r.company_type === 'gc' ? 'GC' : 'Sub'}</span>}
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_CLS[r.status] ?? '')}>{r.status}</span>
                <span className="ml-auto text-xs text-faint">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {(r.message || r.phone) && (
                <p className="mt-1 text-sm text-slate-300">{r.message}{r.phone ? ` · ${r.phone}` : ''}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => act(r.id, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent/90">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button onClick={() => act(r.id, 'reject')} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-danger hover:border-danger/50">
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </>
                )}
                {r.status === 'approved' && r.invite_token && (
                  <>
                    <button onClick={() => copyLink(r)} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700">
                      <Copy className="h-3.5 w-3.5" /> {copiedId === r.id ? 'Copied!' : 'Copy invite link'}
                    </button>
                    <a href={mailto(r)} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent/90">
                      <Mail className="h-3.5 w-3.5" /> Email invite
                    </a>
                    <button onClick={() => act(r.id, 'reset')} className="inline-flex items-center gap-1 text-xs text-faint hover:text-danger" title="Revoke the invite link">
                      <RotateCcw className="h-3 w-3" /> Revoke
                    </button>
                  </>
                )}
                {r.status === 'rejected' && (
                  <button onClick={() => act(r.id, 'reset')} className="inline-flex items-center gap-1 text-xs text-faint hover:text-white">
                    <RotateCcw className="h-3 w-3" /> Move back to pending
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
