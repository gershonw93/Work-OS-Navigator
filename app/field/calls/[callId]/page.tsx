'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CallDetail } from '@/components/service-calls/call-detail'

// Field Mode's call: the same screen as the office's (components/service-calls/
// call-detail.tsx), and the server decides what a crew member may do on it.
export default function FieldCallPage({ params }: { params: { callId: string } }) {
  return (
    <div className="p-6 space-y-4 max-w-lg mx-auto">
      <Link href="/field/calls" className="inline-flex items-center gap-1 text-sm text-muted-fg">
        <ChevronLeft className="h-4 w-4" /> My calls
      </Link>
      <CallDetail callId={params.callId} narrow />
    </div>
  )
}
