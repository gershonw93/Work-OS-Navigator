// ─────────────────────────────────────────────────────────────────────────────
// Step-by-step walkthroughs - screenshot tours of a flow, one HTML file each in
// `public/tutorials/`, shown from the Help article they illustrate.
//
// A WALKTHROUGH IS PART OF AN ARTICLE, NOT A SECOND LIBRARY. It is reached from
// the article's page, in the app and on the public Help Center, and nowhere
// else - so it inherits the article's gates for free: an app-only article does
// not put its walkthrough on the public site, and a `webOnly` one (it prints a
// price) does not put its walkthrough in the iOS app. A separate /tutorials
// index would be a sixth door that `helpArticleAllowed` never hears about.
//
// The files are self-contained (screenshots inlined), so the registry only
// names them. `title` is the file's own <title>; `lib/__tests__/walkthroughs.ts`
// pins the two together, pins every file to an entry and every entry to an
// article, and scans the files for the recording notes and the real customer
// addresses that came in with the first batch.
// ─────────────────────────────────────────────────────────────────────────────

export interface Walkthrough {
  /** Basename in public/tutorials/, without `.html`. */
  file: string
  /** The file's <title>, which is also its heading. */
  title: string
  /** Help article slugs that show it. The first is its home. */
  articles: string[]
}

export const WALKTHROUGHS: Walkthrough[] = [
  // Getting started
  { file: 'create-your-first-project', title: 'Create your first project', articles: ['create-first-project'] },
  { file: 'use-the-job-setup-checklist', title: 'Use the job setup checklist', articles: ['set-up-existing-job'] },
  { file: 'use-the-gc-dashboard', title: 'Use the GC dashboard', articles: ['what-is-sytenav'] },
  { file: 'set-up-company-defaults', title: 'Set up company defaults', articles: ['set-up-company-profile'] },
  { file: 'manage-your-profile', title: 'Manage your profile', articles: ['set-up-company-profile'] },

  // Projects
  { file: 'find-projects-with-search-and-views', title: 'Find projects with search and views', articles: ['global-search'] },
  { file: 'review-project-settings', title: 'Review project settings', articles: ['project-settings'] },
  { file: 'choose-project-preferences', title: 'Choose project preferences', articles: ['project-settings', 'bulk-add-projects'] },
  { file: 'prepare-unit-and-floor-projects', title: 'Prepare unit and floor projects', articles: ['bulk-add-projects'] },
  { file: 'prepare-a-street-number-development', title: 'Prepare a street-number development', articles: ['bulk-add-projects'] },
  { file: 'prepare-bulk-projects-from-a-list', title: 'Prepare bulk projects from a list', articles: ['bulk-add-projects'] },
  { file: 'group-existing-jobs-in-a-development', title: 'Group existing jobs in a development', articles: ['bulk-add-projects'] },
  { file: 'read-job-history', title: 'Read job history', articles: ['project-tabs-explained', 'job-overview'] },
  { file: 'read-project-progress', title: 'Read project progress', articles: ['project-tabs-explained'] },
  { file: 'review-project-reports', title: 'Review project reports', articles: ['project-tabs-explained'] },
  { file: 'upload-and-organize-plans', title: 'Upload and organize plans', articles: ['plan-pins', 'project-tabs-explained'] },
  { file: 'view-plans-and-prepare-a-task-pin', title: 'View plans and prepare a task pin', articles: ['plan-pins'] },

  // Quotes and buyout
  { file: 'prepare-a-bid-request', title: 'Prepare a bid request', articles: ['request-quotes'] },
  { file: 'add-and-manage-a-subcontractor', title: 'Add and manage a subcontractor', articles: ['add-subcontractor-no-price'] },

  // Money
  { file: 'build-a-budget', title: 'Build a budget', articles: ['add-project-budget'] },
  { file: 'reuse-budget-templates-and-jobs', title: 'Reuse budget templates and jobs', articles: ['budget-templates'] },
  { file: 'set-up-client-selections', title: 'Set up client selections', articles: ['selections'] },
  { file: 'log-a-sub-bill', title: 'Log a sub bill', articles: ['create-invoice', 'scan-sub-invoice'] },
  { file: 'read-the-financial-summary', title: 'Read the financial summary', articles: ['money-overview'] },
  { file: 'understand-client-billing-and-payments', title: 'Understand client billing and payments', articles: ['record-client-payment', 'bill-the-client', 'request-deposit'] },
  { file: 'change-order-start-to-finish', title: 'Change order start to finish', articles: ['change-order-basics', 'change-order-subcontract'] },

  // People and approvals
  { file: 'find-project-rfis', title: 'Find project RFIs', articles: ['rfis'] },
  { file: 'review-the-approvals-queue', title: 'Review the approvals queue', articles: ['approvals-inbox'] },

  // Permits, inspections, submittals
  { file: 'prepare-a-project-permit', title: 'Prepare a project permit', articles: ['permits'] },
  { file: 'prepare-inspection-tracking', title: 'Prepare inspection tracking', articles: ['inspections'] },
  { file: 'prepare-a-submittal', title: 'Prepare a submittal', articles: ['submittals'] },

  // Compliance and sharing
  { file: 'review-subcontractor-compliance', title: 'Review subcontractor compliance', articles: ['compliance-overview'] },
  { file: 'prepare-project-sharing', title: 'Prepare project sharing', articles: ['share-documents'] },

  // Field
  { file: 'build-a-project-schedule', title: 'Build a project schedule', articles: ['schedule-milestones'] },
  { file: 'create-and-track-a-task', title: 'Create and track a task', articles: ['tasks-assign'] },
  { file: 'prepare-a-daily-log', title: 'Prepare a daily log', articles: ['daily-log-create'] },
  { file: 'use-the-time-clock', title: 'Use the time clock', articles: ['time-clock'] },

  // Equipment and materials
  { file: 'track-equipment-checkout', title: 'Track equipment and check it out', articles: ['equipment-checkout', 'equipment-add', 'equipment-repair'] },
  { file: 'prepare-a-material-receipt', title: 'Prepare a material receipt', articles: ['materials-receipt'] },
  { file: 'review-materials-across-jobs', title: 'Review materials across jobs', articles: ['materials-receipt', 'materials-client-paid'] },

  // Directory, customers, files
  { file: 'add-a-directory-contact', title: 'Add a Directory contact', articles: ['directory'] },
  { file: 'add-and-manage-a-customer', title: 'Add and manage a customer', articles: ['customers'] },
  { file: 'find-company-and-job-files', title: 'Find company and job files', articles: ['files'] },
  { file: 'prepare-a-document-packet', title: 'Prepare a document packet', articles: ['files'] },

  // Cross-project
  { file: 'use-the-master-calendar', title: 'Use the Master Calendar', articles: ['master-calendar', 'calendar-subscribe'] },
  { file: 'read-master-money', title: 'Read Master Money', articles: ['master-money'] },

  // Settings
  { file: 'invite-your-team-and-set-roles', title: 'Invite your team and set roles', articles: ['invite-team-member'] },
  { file: 'review-role-permissions', title: 'Review role permissions', articles: ['permissions', 'custom-roles'] },
  { file: 'choose-notification-preferences', title: 'Choose notification preferences', articles: ['notification-preferences', 'who-gets-notified'] },
  { file: 'review-company-security', title: 'Review company security', articles: ['delete-protection', 'auto-signout'] },
  { file: 'prepare-integrations-and-contact-import', title: 'Prepare integrations and contact import', articles: ['connect-quickbooks', 'google-contacts'] },
  // Shows Settings > Billing with the plan grid, so it lives ONLY on the
  // `webOnly` pricing article and never reaches the iOS build.
  { file: 'review-plan-and-usage', title: 'Review plan and usage', articles: ['plans-and-pricing'] },
]

/** Where a walkthrough is served, relative to the site root. */
export const walkthroughPath = (file: string) => `/tutorials/${file}.html`

/** The walkthroughs an article shows, in registry order. */
export function walkthroughsFor(slug: string): Walkthrough[] {
  return WALKTHROUGHS.filter(w => w.articles.includes(slug))
}

/**
 * An article's walkthroughs, ready to render. `origin` is empty in the app
 * (same site); the public Help Center passes the main site's origin once it
 * has its own host, where a relative /tutorials/... would be rewritten into
 * /help-center/tutorials/... and 404.
 */
export function walkthroughLinks(slug: string, origin = '') {
  return walkthroughsFor(slug).map(w => ({ file: w.file, title: w.title, src: `${origin}${walkthroughPath(w.file)}` }))
}
