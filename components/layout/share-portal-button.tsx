'use client'

import { useState } from 'react'
import { Share2, X, Copy, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SharePortalButtonProps {
  projectId: string
}

export function SharePortalButton({ projectId }: SharePortalButtonProps) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleOpen() {
    setOpen(true)
    if (portalUrl) return
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await fetch(`/api/projects/${projectId}/portal-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPortalUrl(data.url)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium text-muted-fg hover:border-accent hover:text-accent-fg transition-colors"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Share with Client</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md bg-panel rounded-2xl shadow-xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-accent-tint flex items-center justify-center">
                  <Share2 className="h-4 w-4 text-accent-fg" />
                </div>
                <h2 className="text-base font-semibold text-ink-soft">Share with Client</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-muted-fg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-fg">
              Anyone with this link can view a read-only snapshot of this project — no login required.
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-faint" />
              </div>
            ) : portalUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
                  <span className="flex-1 truncate text-sm text-muted-fg font-mono">{portalUrl}</span>
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-sm text-danger text-center py-4">Failed to generate link. Please try again.</p>
            )}

            <p className="text-xs text-faint text-center">
              This link never expires. Regenerate it from this dialog to invalidate the old one.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
