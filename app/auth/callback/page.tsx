'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HardHat } from 'lucide-react'

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
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-orange-500">
            <HardHat className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-orange-400">WorkOS</span>
          <span className="text-2xl font-medium text-white">Navigator</span>
        </div>

        {error ? (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-6 py-4 max-w-sm">
            <p className="text-red-400 text-sm">{error}</p>
            <a href="/login" className="mt-3 inline-block text-sm text-orange-400 hover:text-orange-300 underline">
              Back to login
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-slate-300 text-sm">{message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
