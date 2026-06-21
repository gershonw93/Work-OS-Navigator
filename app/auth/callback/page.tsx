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
      // Parse hash fragment manually so we can read type before Supabase consumes it
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const type = params.get('type')
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken) {
        setError('Invalid or expired link. Please request a new one.')
        return
      }

      // Exchange tokens with Supabase
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken ?? '',
      })

      if (sessionError) {
        setError(sessionError.message)
        return
      }

      if (type === 'invite' || type === 'recovery') {
        // Send them to set their password
        setMessage('Redirecting to set your password…')
        router.replace(`/reset-password${type === 'invite' ? '?type=invite' : ''}`)
      } else {
        // email confirmation or other — go to dashboard
        setMessage('Email confirmed! Redirecting…')
        router.replace('/dashboard')
      }
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
            <a
              href="/login"
              className="mt-3 inline-block text-sm text-orange-400 hover:text-orange-300 underline"
            >
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
