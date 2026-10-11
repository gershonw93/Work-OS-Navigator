// A DEVELOPMENT: the container Bulk Add makes - a street of houses, a set of
// lots, a building of units or floors - holding a job per house. In the data it
// is a project with `is_site = true`, and its jobs point at it with
// `parent_project_id`. "Site" was the word in the code and on a badge, "group"
// in half the copy, and neither was what a builder calls it; the screens say
// Development now. The columns keep their names - renaming a column is a
// migration and a dozen readers, for a word nobody sees.
//
// Pure: the word, and the rules for what may move where. Every door that moves
// a job in or out - the development's own page, Project Settings, and making a
// development out of jobs you already have - asks these, so they cannot
// disagree about what is allowed.

export const DEVELOPMENT = 'Development'
export const DEVELOPMENT_LOWER = 'development'

export interface MovableJob {
  id: string
  name?: string | null
  is_site?: boolean | null
  parent_project_id?: string | null
}

/**
 * Why this job cannot go into that development, or null.
 *
 * A job already IN the target is not a problem - asking again is a no-op, not
 * an error, so a second tab or a double press does nothing rather than shout.
 */
export function attachProblem(job: MovableJob, developmentId: string): string | null {
  if (job.id === developmentId) return 'A development cannot go inside itself.'
  if (job.is_site) return `${job.name || 'That'} is a development itself - a development cannot go inside another one.`
  return null
}

/** What a new job in a development needs before it is made. */
export function newJobProblem(draft: { name?: string | null; address?: string | null }): string | null {
  if (!String(draft.name ?? '').trim() && !String(draft.address ?? '').trim()) {
    return 'Give the job a name or an address.'
  }
  return null
}

/** The name a new job gets when only an address was typed. */
export function newJobName(draft: { name?: string | null; address?: string | null }): string {
  const name = String(draft.name ?? '').trim()
  if (name) return name
  // "12 Oak Ln, Palm Coast, FL 32164" -> "12 Oak Ln": the street is how a lot
  // is talked about; the town is the same for every house in the development.
  return String(draft.address ?? '').split(',')[0].trim()
}

/** What a development made from existing jobs needs. */
export function newDevelopmentProblem(draft: { name?: string | null; projectIds?: string[] | null }): string | null {
  if (!String(draft.name ?? '').trim()) return 'Name the development.'
  if (!draft.projectIds?.length) return 'Pick at least one job to put in it.'
  return null
}
