'use client'

import { useState } from 'react'
import { SignaturePad } from '@/components/ui/signature-pad'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, PenLine } from 'lucide-react'

// Signature + name capture for work signoffs. Caller does the upload:
// onSign receives the signature blob and typed name.
export function SignoffModal({
  title, onSign, onClose, saving,
}: {
  title: string
  onSign: (blob: Blob, name: string) => void
  onClose: () => void
  saving?: boolean
}) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [name, setName] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-ink"><PenLine className="h-5 w-5 text-accent-fg" /> Sign off</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-muted-fg">You're signing off on: <span className="font-medium text-ink-soft">{title}</span></p>
          <div>
            <Label>Signature</Label>
            <SignaturePad onChange={setBlob} />
          </div>
          <div>
            <Label>Your name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!blob || !name.trim() || saving} onClick={() => blob && onSign(blob, name.trim())}>
            {saving ? 'Saving…' : 'Sign off'}
          </Button>
        </div>
      </div>
    </div>
  )
}
