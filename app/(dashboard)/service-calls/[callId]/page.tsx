'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CallDetail } from '@/components/service-calls/call-detail'

export default function ServiceCallPage({ params }: { params: { callId: string } }) {
  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <Link href="/service-calls" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Service calls
      </Link>
      <CallDetail callId={params.callId} />
    </div>
  )
}
