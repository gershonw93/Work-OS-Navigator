// ─────────────────────────────────────────────────────────────────────────────
// SyteNav - What's new
//
// IMPORTANT (working agreement): when you ship something a user would notice,
// add an entry here in the SAME change. Same rule as the Help Center. A feature
// nobody knows about may as well not exist, and a tester who has to guess what
// changed since last week will stop looking.
//
// Not everything belongs here. Internal refactors, build fixes, and anything a
// user could not possibly observe do not go in - this is a list of things that
// changed for THEM, not a commit log.
//
// Newest first. `date` is ISO (YYYY-MM-DD) and drives the "new since you last
// looked" badge, so keep it accurate.
// ─────────────────────────────────────────────────────────────────────────────

export type ReleaseKind = 'new' | 'improved' | 'fixed'

export interface ReleaseItem {
  kind: ReleaseKind
  title: string
  /** Plain-language: what it does for them, not how it was built. */
  text: string
  /** Slug of the Help article that explains it in full. */
  help?: string
  /** Where to go and try it. */
  href?: string
}

export interface Release {
  date: string
  /** The headline for the batch. */
  title: string
  items: ReleaseItem[]
}

export const KIND_LABEL: Record<ReleaseKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
}

export const KIND_TINT: Record<ReleaseKind, string> = {
  new: 'bg-accent-tint text-accent-fg',
  improved: 'bg-info-tint text-info',
  fixed: 'bg-success-tint text-success',
}

export const RELEASES: Release[] = [
  {
    date: '2026-08-11',
    title: 'Selections, item lists, and seeing what you sent',
    items: [
      {
        kind: 'new',
        title: 'Selections board',
        text: 'Every choice the client owes you - paint, tile, flooring, cabinets, fixtures, windows - in one place, each with an allowance and a decide-by date driven by lead time rather than the schedule. They pick on the portal link they already have. When a pick lands over the allowance, one click raises a change order for the difference.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Item lists on a quote request',
        text: 'When you are the one buying the material, send the lines and every supplier prices the same ones. Import a takeoff, paste rows out of a spreadsheet, or type them. Their prices come back line by line, and "Compare line by line" shows you the one item that is triple on one bid and missing on another.',
        help: 'item-list',
      },
      {
        kind: 'improved',
        title: 'Editing the scope on a quote request',
        text: 'Click any line to change its wording, or use the move arrows to send it from Included to Not included and back - it used to mean deleting and retyping. The panel also names which trade template filled it in, and the item list now says plainly whether it is needed on this package or not, so it is clear the two are not doing the same job.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'improved',
        title: 'You can see your own quote request again',
        text: 'An expanded request showed who you invited and what you attached, but not the scope you sent or what you asked for back - you had to open the sub\'s link to find out. There is now a "What you sent" panel on the card.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'improved',
        title: 'Selections you can actually look at',
        text: 'Drop or upload a real PHOTO on any option - a phone shot of the sample board, a screenshot off the supplier site. The color picker is gone; nobody eyeballs Sherwin Williams Alabaster off a color wheel. Instead each selection takes one link to the manufacturer\'s full range, which the client can open and browse. Brand carries over from the last option so you are not retyping it every line, and suppliers come from your Directory instead of a free-text box.',
        help: 'selections',
      },
      {
        kind: 'new',
        title: 'Order a selection, and see it on the budget',
        text: 'Once the client has chosen, "Order it" records the supplier, the amount (already priced from what they picked) and the expected delivery, and books the cost against the budget line. The board also offers to connect each selection to its budget line - it suggests one and you change whatever is wrong before anything saves.',
        help: 'selections',
      },
      {
        kind: 'improved',
        title: 'Clients can change their mind, and see where things stand',
        text: 'Every selection on the client link now shows its status - waiting on you, chosen, ordered, installed. They can change anything not yet ordered, and for something already on order they can send a request instead, which tells them plainly that we will contact them if we cannot make the change.',
      },
      {
        kind: 'improved',
        title: 'Selections match the job you are on',
        text: 'Starting a board now asks which categories this job actually has, already ticked for the kind of job it is. A commercial fit-out gets 41 selections instead of 71 - no sod, no shutters, no bathtub. You can reopen the checklist any time to add a category you skipped.',
        help: 'selections',
      },
      {
        kind: 'fixed',
        title: 'The client link on a project never shared',
        text: 'On a project that had never been shared with a client, the "Copy client link" button on the Selections board was missing entirely. It now creates the link for you.',
      },
      {
        kind: 'fixed',
        title: 'The client name on the portal',
        text: 'The project portal was reading the wrong field, so the "Client:" line never appeared even when the name was filled in.',
      },
    ],
  },
  {
    date: '2026-08-10',
    title: 'Scope templates and document sharing',
    items: [
      {
        kind: 'new',
        title: 'Scope templates per trade',
        text: 'Pick the trade and the quote request fills itself in: who supplies the material, what is included, what is excluded, and what you need back besides a price. Every bidder answers the same questions, which is what makes quotes comparable - no takeoff required.',
        help: 'scope-what-to-send',
      },
      {
        kind: 'new',
        title: 'Send documents to anyone',
        text: 'A Sharing tab under Docs & Legal on every project. Pick files, pick a contact, send a link. They can send documents back on the same link, and you can add more files to a link that is already out there.',
      },
      {
        kind: 'new',
        title: 'Project status is a switch',
        text: 'The status badge on a project is now a dropdown, with a pre-flight checklist before a job goes Active so nothing obvious is missing.',
      },
    ],
  },
  {
    date: '2026-08-09',
    title: 'Preconstruction and the money picture',
    items: [
      {
        kind: 'new',
        title: 'Sellout and projected profit',
        text: 'Put your sellout against the budget and see projected profit as you go, per unit and across a whole site.',
      },
      {
        kind: 'new',
        title: 'Hard and soft costs, split',
        text: 'Soft costs get their own section on the budget with their own subtotal and a standard starter list, so preconstruction reads as its own stage instead of being buried in the trades.',
      },
      {
        kind: 'improved',
        title: 'A planning-stage project menu',
        text: 'A job that has not broken ground no longer shows tabs for things that cannot happen yet. They come back the moment the project goes Active.',
      },
      {
        kind: 'new',
        title: '49 budget categories in build order',
        text: 'Trades listed the way the job actually runs, plus your own custom categories which now stick around from job to job.',
        help: 'add-project-budget',
      },
      {
        kind: 'fixed',
        title: 'Project Settings',
        text: 'The address dropdown no longer opens by itself, and billing method, square footage and job type are editable after setup.',
      },
    ],
  },
]

/** The newest release date, used for the "something new" badge. */
export const LATEST_RELEASE = RELEASES[0]?.date ?? ''

export const SEEN_KEY = 'sytenav-whats-new-seen'

/** True when there's a release the reader hasn't acknowledged yet. */
export function hasUnread(lastSeen: string | null): boolean {
  if (!LATEST_RELEASE) return false
  if (!lastSeen) return true
  return lastSeen < LATEST_RELEASE
}

/** How many releases landed since they last looked. */
export function unreadCount(lastSeen: string | null): number {
  if (!lastSeen) return RELEASES.length
  return RELEASES.filter(r => r.date > lastSeen).length
}
