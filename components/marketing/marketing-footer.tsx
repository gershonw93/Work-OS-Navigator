import Link from 'next/link'
import { SyteNavLogo } from '@/components/ui/logo'

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-1">
          <SyteNavLogo size={24} />
          <p className="text-sm text-muted-fg max-w-xs">Construction management built for the field, from the quote to the final invoice.</p>
        </div>
        <FooterCol title="Product" links={[['Features', '/homepage/features'], ['Log in', '/login'], ['Start free', '/signup']]} />
        <FooterCol title="Company" links={[['About', '/homepage/about'], ['Contact', '/homepage/contact']]} />
        <FooterCol title="Use it for" links={[['General contractors', '/homepage/features'], ['Subcontractors', '/homepage/features'], ['Remodelers', '/homepage/features']]} />
        <FooterCol title="Legal" links={[['Privacy Policy', '/homepage/privacy'], ['Terms of Service', '/homepage/terms'], ['Cookie Policy', '/homepage/cookies'], ['Acceptable Use', '/homepage/acceptable-use']]} />
      </div>
      <div className="border-t border-line-soft">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
          <span>© {2026} SyteNav. All rights reserved.</span>
          <span>Built for builders.</span>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-3">{title}</p>
      <ul className="space-y-2">
        {links.map(([label, href]) => <li key={label}><Link href={href} className="text-sm text-muted-fg hover:text-ink">{label}</Link></li>)}
      </ul>
    </div>
  )
}
