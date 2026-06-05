'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export default function SignupPage() {
  const router = useRouter()
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

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

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

    // Create company + profile via server-side API (bypasses RLS)
    const res = await fetch('/api/complete-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, companyType, fullName, email }),
    })

    if (!res.ok) {
      const { error: apiError } = await res.json()
      setError(apiError ?? 'Failed to create account. Please try again.')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Create account</h1>
        <p className="mt-1 text-sm text-slate-400">Get started with WorkOS Navigator</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-slate-300">
            Full Name
          </Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Jane Smith"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="companyName" className="text-slate-300">
            Company Name
          </Label>
          <Input
            id="companyName"
            type="text"
            placeholder="Smith Construction Co."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="companyType" className="text-slate-300">
            Company Type
          </Label>
          <Select
            id="companyType"
            value={companyType}
            onChange={(e) => setCompanyType(e.target.value as 'gc' | 'subcontractor')}
            className="bg-slate-700 border-slate-600 text-white focus:border-orange-500"
          >
            <option value="gc">General Contractor</option>
            <option value="subcontractor">Subcontractor</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-slate-300">
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-slate-300">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-2.5">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-orange-400 hover:text-orange-300 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  )
}
