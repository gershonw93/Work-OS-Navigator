// ─────────────────────────────────────────────────────────────────────────────
// The published guides, and the one list everything else reads.
//
// A NEW GUIDE IS ONE IMPORT AND ONE ENTRY IN `GUIDES`. Everything that has to
// know about it - the index page, the sitemap, the breadcrumb trail, the host
// router that decides a path is marketing rather than app - derives from this
// array. A page that exists but is not in the sitemap, or is routed to the app
// host and redirects a reader out of the site, is the failure this shape is
// here to make impossible.
//
// The one thing NOT derived from here is `lib/hosts.ts`, which is imported by
// middleware and would otherwise pull every article body into the edge bundle.
// It recognises the `/guides` prefix instead; `lib/__tests__/guides.ts` pins
// the two together.
// ─────────────────────────────────────────────────────────────────────────────

import type { Guide, GuideCategoryKey } from './schema'
import { GUIDE_CATEGORIES, guidePath } from './schema'

import { guide as procoreAlternatives } from './articles/procore-alternatives-small-gcs'
import { guide as softwareForSmallContractors } from './articles/construction-management-software-small-contractors'
import { guide as trackChangeOrders } from './articles/how-to-track-change-orders'
import { guide as changeOrderSoftware } from './articles/change-order-management-software'
import { guide as invoiceVerification } from './articles/construction-invoice-verification'
import { guide as invoiceApproval } from './articles/construction-invoice-approval'
import { guide as jobCostTracking } from './articles/construction-job-cost-tracking'
import { guide as dailyLogApp } from './articles/construction-daily-log-app'
import { guide as changeOrderDocumentation } from './articles/change-order-documentation'
import { guide as spreadsheetVsSoftware } from './articles/construction-spreadsheet-vs-software'
import { guide as schedulingSoftware } from './articles/construction-scheduling-software'

/** Every published guide, in the order the index lists them. */
export const GUIDES: Guide[] = [
  procoreAlternatives,
  softwareForSmallContractors,
  trackChangeOrders,
  changeOrderSoftware,
  invoiceVerification,
  invoiceApproval,
  jobCostTracking,
  dailyLogApp,
  changeOrderDocumentation,
  spreadsheetVsSoftware,
  schedulingSoftware,
]

export { GUIDE_CATEGORIES, guidePath }
export type { Guide, GuideBlock, GuideCategory, GuideCategoryKey, GuideFaq } from './schema'

/** One guide by slug, or undefined - the page turns that into a 404. */
export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug)
}

/** Every guide URL. The sitemap's source. */
export const GUIDE_PATHS: string[] = GUIDES.map(g => guidePath(g.slug))

/** The guides in a category, in publication order. */
export function guidesIn(category: GuideCategoryKey): Guide[] {
  return GUIDES.filter(g => g.category === category)
}

/**
 * The guides a guide links on to.
 *
 * Unknown slugs are DROPPED rather than rendered: a related link is a promise
 * that there is something at the other end, and a typo here would ship a 404
 * from inside our own page. The test asserts the list is empty of typos, so
 * dropping one silently in production is the belt and the test is the braces.
 */
export function relatedTo(g: Guide): Guide[] {
  return g.related
    .filter(slug => slug !== g.slug)
    .map(slug => guideBySlug(slug))
    .filter((x): x is Guide => Boolean(x))
}
