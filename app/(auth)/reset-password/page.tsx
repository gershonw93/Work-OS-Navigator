'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isInvite = searchParams.get('type') === 'invite'
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  // 'checking' until we know whether the reset link gave us a valid session.
  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>('checking')

  // Establish a session from the reset link before showing the form. Handles
  // both the PKCE flow (?code=) and the implicit flow (#access_token=...), and
  // the invite path where /auth/callback already set the session.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')

        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        } else if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
        }

        // Clean tokens out of the URL bar either way.
        if (code || accessToken) window.history.replaceState({}, '', '/reset-password' + (isInvite ? '?type=invite' : ''))

        const { data: { session } } = await supabase.auth.getSession()
        if (active) setLinkState(session ? 'ready' : 'invalid')
      } catch {
        if (active) setLinkState('invalid')
      }
    })()
    return () => { active = false }
  }, [supabase, isInvite])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Use at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const { error: authError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/dashboard')
    }, 2000)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{isInvite ? 'Welcome! Set your password' : 'Reset password'}</h1>
        <p className="mt-1 text-sm text-faint">
          {isInvite
            ? 'Create a password to activate your account'
            : 'Enter your new password below'}
        </p>
      </div>

      {linkState === 'checking' ? (
        <div className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-800/40 px-4 py-3">
          <div className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-sm text-faint">Verifying your link…</p>
        </div>
      ) : linkState === 'invalid' ? (
        <div className="space-y-3">
          <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-3">
            <p className="text-sm text-danger">This reset link is invalid or has expired. Reset links are single-use and time out - please request a new one.</p>
          </div>
          <Link href="/forgot-password" className="inline-block text-sm font-medium text-accent-fg hover:text-accent">
            Send a new reset link
          </Link>
        </div>
      ) : success ? (
        <div className="rounded-md bg-green-900/40 border border-green-700 px-4 py-3">
          <p className="text-sm text-success">Password updated! Redirecting…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-faint">
              New Password
            </Label>
            <PasswordInput
              id="password"
              toggleClassName="text-slate-400 hover:text-white"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="bg-slate-700 border-slate-600 text-white placeholder:text-muted-fg focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-faint">
              Confirm Password
            </Label>
            <PasswordInput
              id="confirmPassword"
              toggleClassName="text-slate-400 hover:text-white"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
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
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
