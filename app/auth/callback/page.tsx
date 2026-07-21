'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Verifying your link…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function handleCallback() {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const type = params.get('type') as 'invite' | 'recovery' | 'signup' | 'magiclink' | null
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const tokenHash = params.get('token_hash') // PKCE flow

      // PKCE: Supabase may redirect with ?code=... (and ?type=) in the query
      // string rather than tokens in the hash. Exchange it for a session, then
      // route by type just like the implicit flow below.
      const search = new URLSearchParams(window.location.search)
      const code = search.get('code')
      const queryType = search.get('type') as 'invite' | 'recovery' | null
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exErr) {
          setError(`Link error: ${exErr.message}. Please request a new link.`)
          return
        }
        if (queryType === 'invite') { router.replace('/reset-password?type=invite'); return }
        if (queryType === 'recovery') { router.replace('/reset-password'); return }
        router.replace('/dashboard')
        return
      }

      if (!accessToken && !tokenHash) {
        // Maybe Supabase already handled it via onAuthStateChange
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace('/dashboard')
          return
        }
        setError('Invalid or expired link. Please ask to be re-invited.')
        return
      }

      // For invite/recovery tokens use verifyOtp
      if (type === 'invite' || type === 'recovery') {
        // The access_token in invite links IS a valid session token from Supabase
        // Try setSession first; fall back to verifyOtp
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken!,
          refresh_token: refreshToken ?? '',
        })

        if (sessionError) {
          // Try as OTP token
          const emailParam = params.get('email') ?? ''
          const { error: otpError } = await supabase.auth.verifyOtp({
            email: emailParam,
            token: accessToken!,
            type: type === 'invite' ? 'invite' : 'recovery',
          })
          if (otpError) {
            setError(`Link error: ${otpError.message}. Please request a new invite.`)
            return
          }
        }

        setMessage('Redirecting to set your password…')
        router.replace(type === 'invite' ? '/reset-password?type=invite' : '/reset-password')
        return
      }

      // Email confirmation / magic link
      if (accessToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        })
      }
      setMessage('Verified! Redirecting…')
      router.replace('/dashboard')
    }

    handleCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1113] px-4">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden>
            <rect width="48" height="48" rx="12" fill="#1F2227" />
            <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="#C9F24A" />
          </svg>
          <span className="font-display font-bold uppercase tracking-tight text-3xl text-[#ECEEF0]">
            SYTE<span className="text-[#C9F24A]">NAV</span>
          </span>
        </div>

        {error ? (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-6 py-4 max-w-sm">
            <p className="text-danger text-sm">{error}</p>
            <a href="/login" className="mt-3 inline-block text-sm text-accent-fg hover:text-accent underline">
              Back to login
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
            <p className="text-faint text-sm">{message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
