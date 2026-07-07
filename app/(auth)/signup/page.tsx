'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

const inputCls = 'bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent'

// Gated beta: /signup is a Request Access form. The real account-creation form
// only unlocks with an approved invite link (/signup?invite=<token>).
export default function SignupPage() {
  const [invite, setInvite] = useState<'checking' | 'valid' | 'none'>('none')
  const [inviteToken, setInviteToken] = useState('')
  const [prefill, setPrefill] = useState<{ name?: string; email?: string; company_name?: string; company_type?: string } | null>(null)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('invite')
    if (!t) return
    setInvite('checking')
    setInviteToken(t)
    ;(async () => {
      const res = await fetch(`/api/access-request?token=${encodeURIComponent(t)}`)
      const d = await res.json().catch(() => ({ valid: false }))
      if (d.valid) { setPrefill(d.request); setInvite('valid') }
      else setInvite('none')
    })()
  }, [])

  if (invite === 'checking') {
    return <p className="py-16 text-center text-sm text-faint">Checking your invite…</p>
  }
  if (invite === 'valid') {
    return <CreateAccountForm inviteToken={inviteToken} prefill={prefill} />
  }
  return <RequestAccessForm />
}

// ── Request access (default) ──────────────────────────────────────────────────
function RequestAccessForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState<'gc' | 'subcontractor'>('gc')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    const res = await fetch('/api/access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, company_name: companyName, company_type: companyType, phone, message }),
    })
    setLoading(false)
    if (res.ok) setSent(true)
    else setError((await res.json().catch(() => ({}))).error ?? 'Could not submit. Try again.')
  }

  if (sent) {
    return (
      <div className="text-center py-8">
        <h1 className="text-2xl font-bold text-white">Request received</h1>
        <p className="mt-3 text-sm text-faint max-w-sm mx-auto">
          Thanks — we review every request personally. You&apos;ll get an email with your invite link as soon as you&apos;re approved.
        </p>
        <p className="mt-6 text-sm text-faint">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent-fg hover:text-accent transition-colors">Sign in</Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Request access</h1>
        <p className="mt-1 text-sm text-faint">SyteNav is in an invite-only beta. Tell us about your company and we&apos;ll get you in.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-faint">Your Name</Label>
          <Input id="name" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-faint">Email address</Label>
          <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="companyName" className="text-faint">Company</Label>
            <Input id="companyName" placeholder="Smith Construction" value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="companyType" className="text-faint">You are a…</Label>
            <Select id="companyType" value={companyType} onChange={e => setCompanyType(e.target.value as 'gc' | 'subcontractor')}
              className="bg-slate-700 border-slate-600 text-white focus:border-accent">
              <option value="gc">General Contractor</option>
              <option value="subcontractor">Subcontractor</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-faint">Phone <span className="font-normal">(optional)</span></Label>
          <Input id="phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="message" className="text-faint">What are you hoping to use SyteNav for? <span className="font-normal">(optional)</span></Label>
          <textarea id="message" rows={2} value={message} onChange={e => setMessage(e.target.value)}
            placeholder="e.g. Residential remodels, 5-person crew, drowning in spreadsheets"
            className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder:text-muted-fg focus:border-accent focus:outline-none resize-none" />
        </div>

        {error && (
          <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-2.5">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending…' : 'Request Access'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-faint">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent-fg hover:text-accent transition-colors">Sign in</Link>
      </p>
    </div>
  )
}

// ── Create account (invite-only) ──────────────────────────────────────────────
function CreateAccountForm({ inviteToken, prefill }: { inviteToken: string; prefill: { name?: string; email?: string; company_name?: string; company_type?: string } | null }) {
  const supabase = createClient()

  const [fullName, setFullName] = useState(prefill?.name ?? '')
  const [companyName, setCompanyName] = useState(prefill?.company_name ?? '')
  const [companyType, setCompanyType] = useState<'gc' | 'subcontractor'>(prefill?.company_type === 'subcontractor' ? 'subcontractor' : 'gc')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    const userId = authData.user?.id
    if (!userId) { setError('Signup failed. Please try again.'); setLoading(false); return }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError || !signInData.session) {
      setError('Account created but could not sign in automatically. Please sign in manually.')
      setLoading(false)
      return
    }

    const res = await fetch('/api/complete-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${signInData.session.access_token}` },
      body: JSON.stringify({ companyName, companyType, fullName, email, userId, inviteToken }),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to set up account. Please contact support.')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">You&apos;re in — create your account</h1>
        <p className="mt-1 text-sm text-faint">Your access request was approved. Welcome to SyteNav.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-faint">Full Name</Label>
          <Input id="fullName" placeholder="Jane Smith" value={fullName} onChange={e => setFullName(e.target.value)} required className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="companyName" className="text-faint">Company Name</Label>
          <Input id="companyName" placeholder="Smith Construction Co." value={companyName} onChange={e => setCompanyName(e.target.value)} required className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="companyType" className="text-faint">Company Type</Label>
          <Select id="companyType" value={companyType} onChange={e => setCompanyType(e.target.value as 'gc' | 'subcontractor')}
            className="bg-slate-700 border-slate-600 text-white focus:border-accent">
            <option value="gc">General Contractor</option>
            <option value="subcontractor">Subcontractor</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-faint">Email address</Label>
          <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-faint">Password</Label>
          <PasswordInput id="password" toggleClassName="text-slate-400 hover:text-white" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className={inputCls} />
        </div>

        {error && (
          <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-2.5">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-faint">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent-fg hover:text-accent transition-colors">Sign in</Link>
      </p>
    </div>
  )
}
