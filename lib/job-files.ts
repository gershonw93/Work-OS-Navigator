// The files that live INSIDE jobs, gathered for the company Files page.
//
// "SyteNav QA Test has plenty of files - look at the Fairview Terrace
// Residence job - but the main Files is blank." True: Files read
// `company_files` (what was uploaded on Files itself) and nothing else, while
// 17 plans, 13 quotes, 6 site photos, 6 quote-request attachments, 3
// submittals and 3 bills sat on that company's seven jobs. A page called Files
// that queries one table answers a narrower question than its name promises,
// and the omission is invisible - an empty folder looks exactly like a company
// with no paperwork.
//
// Pure: which kinds exist, what each is called, and which tab of the job it
// opens on. The route does the reading.

export type JobFileKind = 'plan' | 'photo' | 'submittal' | 'quote' | 'rfq' | 'bill'

/**
 * `resource` is the permission that already guards the tab the file lives on.
 * Gathering files onto one page must not hand somebody a document the job
 * screen withholds from them - a worker holds `files: view` and `invoices: N`,
 * so a sub's bill must not reach them through Files.
 */
export const JOB_FILE_KINDS: { kind: JobFileKind; label: string; tab: string; resource: string }[] = [
  { kind: 'plan', label: 'Plans', tab: 'plans', resource: 'plans' },
  { kind: 'photo', label: 'Site photos', tab: 'daily-logs', resource: 'daily-logs' },
  { kind: 'submittal', label: 'Submittals', tab: 'submittals', resource: 'submittals' },
  { kind: 'quote', label: 'Quotes', tab: 'request-quotes', resource: 'quotes' },
  { kind: 'rfq', label: 'Sent with quote requests', tab: 'request-quotes', resource: 'request-quotes' },
  { kind: 'bill', label: 'Bills', tab: 'invoices', resource: 'invoices' },
]

export interface JobFile {
  id: string
  kind: JobFileKind
  name: string
  project_id: string
  project_name: string
  created_at: string
  /** Direct link to the file, or null where the job page is the way to open it. */
  url: string | null
}

/** The job tab a file of this kind lives on. */
export function jobFileHref(f: Pick<JobFile, 'kind' | 'project_id'>): string {
  const tab = JOB_FILE_KINDS.find(k => k.kind === f.kind)?.tab ?? ''
  return `/projects/${f.project_id}${tab ? `/${tab}` : ''}`
}

/** The last segment of a URL path, for a file stored with no name of its own. */
export function nameFromUrl(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    // Uploads are stored as `<timestamp>-<name>`; the timestamp is ours, not theirs.
    return last.replace(/^\d{10,}-/, '') || fallback
  } catch {
    return fallback
  }
}
