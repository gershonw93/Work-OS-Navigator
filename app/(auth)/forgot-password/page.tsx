'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Our own endpoint, not supabase.auth.resetPasswordForEmail - the mail goes
    // out through SendGrid like everything else. See app/api/auth/reset-password.
    //
    // It answers { ok: true } for everything, on purpose: an unknown address, a
    // throttled one and a failed send are indistinguishable from here, because
    // an answer that differs is a way to test whether somebody has an account.
    // So the only failure this page can report is not reaching the server at
    // all - and it says exactly that rather than guessing at a cause.
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        setError('Could not reach the server. Check your connection and try again.')
        return
      }
      setSuccess(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      // Always ends, on every path - a loading state with one exit is a
      // spinner somebody eventually reloads the page to escape.
      setLoading(false)
    }
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
          <p className="text-sm text-success">If that address has a SyteNav account, a reset link is on its way. It expires in an hour.</p>
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
