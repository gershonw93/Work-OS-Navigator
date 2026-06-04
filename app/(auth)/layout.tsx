import { HardHat } from 'lucide-react'
import { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex items-center justify-center w-9 h-9 rounded-md bg-orange-500">
          <HardHat className="h-5 w-5 text-white" />
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-xl font-bold text-orange-400">WorkOS</span>
          <span className="text-xl font-medium text-white">Navigator</span>
        </div>
      </div>

      {/* Card container */}
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-slate-700 bg-slate-800 shadow-xl px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
