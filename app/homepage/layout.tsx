import { ReactNode } from 'react'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}
