'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export default function SignupPage() {
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState<'gc' | 'subcontractor'>('gc')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Step 1: Create the auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    const userId = authData.user?.id
    if (!userId) {
      setError('Signup failed. Please try again.')
      setLoading(false)
      return
    }

    // Step 2: Sign in immediately to get a valid session token
    // (signUp alone may not issue a session if email confirmation is enabled)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError || !signInData.session) {
      setError('Account created but could not sign in automatically. Please sign in manually.')
      setLoading(false)
      return
    }

    const token = signInData.session.access_token

    // Step 3: Create company + profile server-side using service role key
    const res = await fetch('/api/complete-signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ companyName, companyType, fullName, email, userId }),
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
        <h1 className="text-2xl font-bold text-white">Create account</h1>
        <p className="mt-1 text-sm text-faint">Get started with SyteNav</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-faint">Full Name</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Jane Smith"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="companyName" className="text-faint">Company Name</Label>
          <Input
            id="companyName"
            type="text"
            placeholder="Smith Construction Co."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="companyType" className="text-faint">Company Type</Label>
          <Select
            id="companyType"
            value={companyType}
            onChange={(e) => setCompanyType(e.target.value as 'gc' | 'subcontractor')}
            className="bg-slate-700 border-slate-600 text-white focus:border-accent"
          >
            <option value="gc">General Contractor</option>
            <option value="subcontractor">Subcontractor</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-faint">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-faint">Password</Label>
          <PasswordInput
            id="password"
            toggleClassName="text-slate-400 hover:text-white"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent"
          />
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
        <Link href="/login" className="font-medium text-accent-fg hover:text-accent transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  )
}
