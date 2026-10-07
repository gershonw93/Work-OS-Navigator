import type { ReactNode } from 'react'
import Link from 'next/link'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { CANONICAL_ORIGIN } from '@/lib/canonical'
import { APP_URL } from '@/lib/hosts'
import { helpHref } from '@/lib/help-host'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support-email'

// The public Help Center's own chrome - NOT the marketing layout.
//
// The marketing nav links with relative paths ('/pricing'), which is right on
// www and wrong here: on help.sytenav.com every path is rewritten into
// /help-center, so '/pricing' would be a 404 inside our own header. Everything
// that leaves the Help Center is therefore ABSOLUTE, and everything inside it
// goes through `helpHref`, which knows which host it is on.
//
// No phone menu on purpose: two links fit on a phone, and a menu that covers
// the page is an overlay with all the rules that brings.
const SITE = CANONICAL_ORIGIN
// Sign-in lives on the app host once the split is on, and on the one site
// before it. Absolute either way: a relative '/login' on the help host is
// rewritten into a page that does not exist.
const SIGN_IN = `${APP_URL || CANONICAL_ORIGIN}/login`

export default function HelpCenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="pt-safe border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href={helpHref('/')} className="flex min-w-0 items-center gap-2.5" aria-label="SyteNav Help Center home">
            <SyteNavLogo size={26} />
            <span className="hidden whitespace-nowrap border-l border-line pl-2.5 text-sm font-semibold text-muted-fg sm:inline">
              Help Center
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href={`${SITE}/`} className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-fg hover:text-ink sm:inline-flex">
              sytenav.com
            </a>
            <ThemeToggle />
            <a href={SIGN_IN} className="inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <SyteNavLogo size={22} />
            <p className="mt-3 text-sm text-muted-fg">Construction management built for the field.</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-ink">Still stuck?</p>
            <a href={supportMailto('SyteNav support')} className="mt-2 inline-block text-accent-fg hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <a href={`${SITE}/guides`} className="text-muted-fg hover:text-ink">Guides</a>
            <a href={`${SITE}/security`} className="text-muted-fg hover:text-ink">Security</a>
            <a href={`${SITE}/privacy`} className="text-muted-fg hover:text-ink">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
