import { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F1113] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="36" height="36" viewBox="0 0 48 48" aria-hidden>
          <rect width="48" height="48" rx="12" fill="#1F2227" />
          <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="#C9F24A" />
        </svg>
        <span className="font-display font-bold uppercase tracking-tight text-2xl leading-none text-[#ECEEF0]">
          SYTE<span className="text-[#C9F24A]">NAV</span>
        </span>
      </div>

      {/* Card container */}
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-[#2A2E34] bg-[#1F2227] shadow-xl px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
