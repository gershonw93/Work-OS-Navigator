'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-faint">Welcome back to SyteNav</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-faint">
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
            className="bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-faint">
            Password
          </Label>
          <PasswordInput
            id="password"
            toggleClassName="text-slate-400 hover:text-white"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent"
          />
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-accent-fg hover:text-accent">
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-2.5">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-faint">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-accent-fg hover:text-accent transition-colors">
          Request access
        </Link>
      </p>
    </div>
  )
}
