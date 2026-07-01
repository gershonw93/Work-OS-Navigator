import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: 'Product',
    links: [
      ['Features', '/homepage/features'],
      ['AI document scanning', '/homepage/ai'],
      ['Mobile & on the go', '/homepage/mobile'],
      ['Pricing', '/homepage/pricing'],
      ['Security', '/homepage/security'],
    ],
  },
  {
    title: "Who it's for",
    links: [
      ['General contractors', '/homepage/contractors'],
      ['Subcontractors', '/homepage/subcontractors'],
      ['Why SyteNav', '/homepage/why'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About', '/homepage/about'],
      ['Contact', '/homepage/contact'],
      ['Log in', '/login'],
      ['Start free', '/signup'],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Privacy Policy', '/homepage/privacy'],
      ['Terms of Service', '/homepage/terms'],
      ['Cookie Policy', '/homepage/cookies'],
      ['Acceptable Use', '/homepage/acceptable-use'],
    ],
  },
]

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-panel">
      {/* Top strip: logo + mini CTA */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-line-soft">
        <div className="space-y-3 max-w-sm">
          <SyteNavLogo size={26} />
          <p className="text-sm text-muted-fg leading-relaxed">
            Construction management built for the field. From the first quote to the final payment, one place to run the build.
          </p>
        </div>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center gap-2 self-start sm:self-center rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors"
        >
          Start free <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Link columns */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map(col => (
          <div key={col.title}>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-4">{col.title}</p>
            <ul className="space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-muted-fg hover:text-ink transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-line-soft">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
          <span>© 2026 SyteNav. All rights reserved.</span>
          <span className="font-mono uppercase tracking-[0.16em]">Built for builders</span>
        </div>
      </div>
    </footer>
  )
}
