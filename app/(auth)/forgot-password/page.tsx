'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    setSuccess(true)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Forgot password</h1>
        <p className="mt-1 text-sm text-faint">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      {success ? (
        <div className="rounded-md bg-green-900/40 border border-green-700 px-4 py-3">
          <p className="text-sm text-success">Check your email for a reset link</p>
        </div>
      ) : (
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

          {error && (
            <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-2.5">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-faint">
        <Link href="/login" className="font-medium text-accent-fg hover:text-accent transition-colors">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
