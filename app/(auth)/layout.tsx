import { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// THE AUTH CARD IS DARK IN BOTH THEMES, AND IT SAYS SO WITH `.dark`.
//
// It used to say so with hardcoded hex - bg-[#0F1113], bg-[#1F2227],
// border-[#2A2E34], text-[#ECEEF0] - which are the dark palette's values typed
// out by hand. The chrome was therefore always dark while everything INSIDE it
// kept following the document theme, so `<Input>`'s own `bg-panel text-ink`
// resolved light on a light-theme device: white boxes on a black card. Each
// auth page then patched around that with `bg-panel border-muted2
// text-ink` on every single field - raw palette colours this codebase does
// not use anywhere else, kept in four files, and drifting between them.
//
// `.dark` is a bare class in globals.css that redefines the tokens, so putting
// it on this wrapper switches the whole subtree to the Pit palette. Now the
// card and its fields read the SAME tokens, the per-field overrides are gone,
// and the -webkit-autofill rule in globals.css - which paints from those same
// tokens - lands on the right colour here too. That last part is the bug the
// screenshot was of.
// ─────────────────────────────────────────────────────────────────────────────

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="36" height="36" viewBox="0 0 48 48" aria-hidden>
          <rect width="48" height="48" rx="12" fill="#1F2227" />
          <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="#C9F24A" />
        </svg>
        <span className="font-display font-bold uppercase tracking-tight text-2xl leading-none text-ink">
          SYTE<span className="text-accent-fg">NAV</span>
        </span>
      </div>

      {/* Card container */}
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-line bg-muted text-ink shadow-xl px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
