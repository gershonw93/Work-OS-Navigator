import type { Metadata } from 'next'
import { PortalAccountSignOut } from './sign-out'

export const metadata: Metadata = { title: 'Your project page', robots: { index: false, follow: false } }

/**
 * Where a client's free login lands if it wanders into the app: it can answer
 * change orders on their project page and nothing else, so say that rather
 * than showing a dashboard full of nothing.
 */
export default function PortalAccountPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-panel p-6">
        <h1 className="text-lg font-semibold text-ink">Your sign-in is for your project page</h1>
        <p className="text-sm text-muted-fg">
          You signed in so you could approve changes to your job. Everything you need is on the
          project page your builder sent you - open that link from your email to see it.
        </p>
        <PortalAccountSignOut />
      </div>
    </div>
  )
}
