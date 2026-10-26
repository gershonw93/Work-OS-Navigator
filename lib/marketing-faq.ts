// ─────────────────────────────────────────────────────────────────────────────
// The questions people actually type into a search box or a chat assistant
// about SyteNav, answered ONCE, for the homepage and the pricing page.
//
// The visible answer and the FAQPage structured data are built from the SAME
// entry (components/marketing/faq.tsx), so the markup cannot claim an answer
// the page does not show - Google drops FAQ markup that does not match the
// page, and a model quoting the markup would be quoting something nobody can
// read.
//
// THE RULES EVERY OTHER PUBLIC SENTENCE FOLLOWS APPLY HERE TOO:
//   - prices, project caps, scan allowances and the trial are READ from
//     lib/plans.ts, never typed (plans-and-landing.ts scans for a typed trial);
//   - who it is for comes from lib/guides/sytenav.ts and is a KIND of company,
//     never a size;
//   - nothing here states a fact about another vendor. A comparison claim needs
//     a link to that vendor's own page, and the guides carry those - so the
//     Procore / Buildertrend answer says what SyteNav does and links to them;
//   - "does it work offline" is answered honestly: no (Help, install-the-app),
//     and stops there - advice on when not to use the app is not an answer;
//   - the platforms are read from lib/app-stores.ts: no iPhone listing, no
//     "on iPhone".
// ─────────────────────────────────────────────────────────────────────────────

import { PLANS, TRIAL_DAYS } from './plans'
import { SYTENAV_DEFINITION } from './definition'
import { SYTENAV_FIT } from './guides/sytenav'
import { APP_STORE_URL } from './app-stores'

export interface FaqLink { text: string; href: string }
export interface FaqItem {
  q: string
  /** Plain text - the same string is the visible answer and the schema's. */
  a: string
  /** Shown under the answer; not part of the structured-data answer. */
  links?: FaqLink[]
}

const list = (xs: string[], and = 'and') =>
  xs.length < 3 ? xs.join(` ${and} `) : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`

const prices = list(PLANS.map(p => `$${p.monthly}`))
const caps = list(PLANS.map(p => (p.projectLimit === null ? 'unlimited' : `up to ${p.projectLimit}`)), 'or')
const scans = list(PLANS.map(p => String(p.scans)))

export const FAQ_WHAT_IS: FaqItem = {
  q: 'What is SyteNav?',
  a: `${SYTENAV_DEFINITION} It reads quotes, invoices, permits and plans in with AI, keeps the budget, schedule, daily logs and compliance for every job in one place, and pushes invoices, bills and payments into QuickBooks Online. It runs in a web browser and as an app on ${APP_STORE_URL ? 'iPhone and Android' : 'Android'}.`,
  links: [{ text: 'See everything it does', href: '/features' }],
}

export const FAQ_WHO_FOR: FaqItem = {
  q: 'Who is SyteNav for?',
  a: `SyteNav is built for ${SYTENAV_FIT}, and for the subcontractors who work for them. The general contractor runs the job; subs are invited onto it to quote, see the schedule, submit RFIs and send bills, and clients follow along through a portal. Team members, subs and clients cost nothing extra.`,
  links: [
    { text: 'For general contractors', href: '/contractors' },
    { text: 'For subcontractors', href: '/subcontractors' },
  ],
}

export const FAQ_PRICING: FaqItem = {
  q: 'How much does SyteNav cost?',
  a: `Plans are ${prices} a month, priced by how many projects are active at once (${caps}) rather than by seat. Every plan has the whole product, and finished jobs do not count towards the limit. SyteNav is invite-only: once you are approved your first ${TRIAL_DAYS} days are free, with no card taken.`,
  links: [{ text: 'Pricing', href: '/pricing' }],
}

export const FAQ_OFFLINE: FaqItem = {
  q: 'Does SyteNav work offline?',
  a: 'No. SyteNav needs a connection - it is not an offline app. On a weak signal it is slower, not broken.',
}

export const FAQ_AI_SCAN: FaqItem = {
  q: 'How does the AI scanning work?',
  a: `Upload a PDF or take a photo - a sub's quote, an invoice, a permit, an insurance certificate, a plan. SyteNav reads it into structured data: line items, quantities, rates, totals and payment terms. A scanned quote becomes the job's budget lines and payment schedule, quotes for the same scope are compared side by side with what each one leaves out, and a sub's invoice is checked against the quote they were awarded on. You check what it read, and a sub's bill reaches QuickBooks only after somebody approves it. Scanning is included on every plan: ${scans} scans a month.`,
  links: [{ text: 'The AI in depth', href: '/ai' }],
}

export const FAQ_VS: FaqItem = {
  q: 'How is SyteNav different from Procore or Buildertrend?',
  a: 'SyteNav is built around the money on the job: quotes scanned in so line items are not retyped, budgets that receive sub bills directly, sub invoices checked against the quote they were awarded on, change orders that raise both the budget line and the subcontract, and client invoices built from costs already recorded. You pay by active project, not by seat. Our comparison guides set out where each product fits and where the others are ahead, with links to their own pages.',
  links: [
    { text: 'Buildertrend vs Procore', href: '/guides/buildertrend-vs-procore' },
    { text: 'Procore alternatives', href: '/guides/procore-alternatives-small-gcs' },
    { text: 'Buildertrend alternatives', href: '/guides/buildertrend-alternatives' },
  ],
}

/** The homepage's questions: what, who, how much, offline, AI, the comparison. */
export const HOME_FAQ: FaqItem[] = [FAQ_WHAT_IS, FAQ_WHO_FOR, FAQ_PRICING, FAQ_OFFLINE, FAQ_AI_SCAN, FAQ_VS]

/** FAQPage structured data, built from exactly what the page shows. */
export function faqJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}
