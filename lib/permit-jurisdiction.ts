// ─────────────────────────────────────────────────────────────────────────────
// Who a job applies to, worked out from where the job is.
//
// "if i put in an address to a job, can it connect the dots with which place
// needs to apply with who and suggest?" - and "when you select what the
// inspector does, will it flag if i add it to a different permit?". Two facts
// on a township's Directory card answer both:
//
//   covers  - the townships / counties it is the authority for, picked from a
//             map search (`/api/geo/areas`), never typed, so a name matches.
//   issues  - the permit types it issues (Building, Electrical...). Empty means
//             nobody has said, which restricts nothing.
//
// A job's own area (township, county, state) comes from its address through
// the map service (lib/job-areas.ts). THE TOWNSHIP, NOT THE MAILING TOWN: a
// "Toms River, NJ" address can sit in Berkeley Township, so the municipality
// (Google's administrative_area_level_3) is asked before the postal locality.
//
// IT SUGGESTS; A PERSON DECIDES. A suggestion pre-fills only an EMPTY box, says
// why, and is one click to change. Two cards that fit equally well suggest
// nothing - the wrong township's inbox is worse than an empty box, the same
// rule as `inspectorContactId`. And a warning never blocks.
//
// Pure: the Directory form, Add Permit, Update several houses and the route
// all ask these functions.
// ─────────────────────────────────────────────────────────────────────────────

export type AreaKind = 'municipality' | 'county'

export interface Area {
  name: string
  kind: AreaKind
  /** Two-letter state, when the map service gave one. */
  state: string | null
  placeId?: string | null
}

export interface JobAreas {
  /** The township / borough / city the job is IN. */
  municipality: string | null
  /** The postal town, which is not always the municipality. */
  locality: string | null
  county: string | null
  state: string | null
}

export interface AuthorityCard {
  id: string
  name: string
  covers: Area[]
  issues: string[]
}

const NOISE = /\b(township|twp|borough|boro|city|town|village|of|the|county|charter|municipality|municipal|cdp)\b/g

/** "Toms River Township" and "Township of Toms River" and "Toms River" are one place. */
export function foldArea(name: string | null | undefined): string {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim()
}

const sameState = (a: string | null | undefined, b: string | null | undefined) =>
  !a || !b || a.trim().toUpperCase() === b.trim().toUpperCase()

/** What may be stored in `covers` - a real name and kind, no repeats, a sane number. */
export function cleanAreas(raw: unknown): Area[] {
  if (!Array.isArray(raw)) return []
  const out: Area[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    const name = typeof r?.name === 'string' ? r.name.trim().slice(0, 120) : ''
    const kind: AreaKind | null = r?.kind === 'county' ? 'county' : r?.kind === 'municipality' ? 'municipality' : null
    if (!name || !kind || !foldArea(name)) continue
    const state = typeof r?.state === 'string' && /^[A-Za-z]{2}$/.test(r.state.trim()) ? r.state.trim().toUpperCase() : null
    const key = `${kind}|${foldArea(name)}|${state ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, kind, state, placeId: typeof r?.placeId === 'string' ? r.placeId.slice(0, 300) : null })
    if (out.length >= 40) break
  }
  return out
}

/** What may be stored in `issues` - permit type names, trimmed, no repeats. */
export function cleanIssues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const r of raw) {
    const t = typeof r === 'string' ? r.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
    if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t)
    if (out.length >= 40) break
  }
  return out
}

/** A card's two facts, read off its `extra`. */
export function coverageOf(extra: unknown): { covers: Area[]; issues: string[] } {
  const e = (extra && typeof extra === 'object' ? extra : {}) as Record<string, unknown>
  return { covers: cleanAreas(e.covers), issues: cleanIssues(e.issues) }
}

/** Does this area take in the job? A county covers its whole county; a township its own. */
export function areaCoversJob(area: Area, job: JobAreas | null): boolean {
  if (!job || !sameState(area.state, job.state)) return false
  const a = foldArea(area.name)
  if (!a) return false
  if (area.kind === 'county') return !!job.county && foldArea(job.county) === a
  return (!!job.municipality && foldArea(job.municipality) === a)
    || (!job.municipality && !!job.locality && foldArea(job.locality) === a)
}

const issuesType = (card: AuthorityCard, type: string) =>
  card.issues.some(t => t.toLowerCase() === type.trim().toLowerCase())

/** The words for where the job is, for a sentence. */
export function jobPlace(job: JobAreas | null): string | null {
  return job?.municipality ?? job?.locality ?? job?.county ?? null
}

export interface AuthoritySuggestion { name: string; contactId: string | null; reason: string }

/**
 * Who to apply to for `type` on this job, or null when nothing says so for
 * certain. In order:
 *  1. a card covering the job's township (or county) that issues this type,
 *     township before county;
 *  2. a card covering the job that has not listed what it issues;
 *  3. the one authority already on this job's other permits.
 * A card that lists what it issues and leaves this type out is never
 * suggested for it. Two equally good answers are no answer.
 */
export function suggestAuthority(
  type: string,
  job: JobAreas | null,
  cards: AuthorityCard[],
  usedOnJob: (string | null | undefined)[] = [],
): AuthoritySuggestion | null {
  const t = type.trim()
  if (!t) return null
  const place = jobPlace(job)
  const scored = cards.map(card => {
    const town = card.covers.some(a => a.kind === 'municipality' && areaCoversJob(a, job))
    const county = card.covers.some(a => a.kind === 'county' && areaCoversJob(a, job))
    if (!town && !county) return null
    if (card.issues.length && !issuesType(card, t)) return null
    const score = (card.issues.length ? 4 : 0) + (town ? 2 : 1)
    return { card, score, town }
  }).filter(Boolean) as { card: AuthorityCard; score: number; town: boolean }[]
  if (scored.length) {
    const best = Math.max(...scored.map(s => s.score))
    const top = scored.filter(s => s.score === best)
    if (top.length === 1) {
      const { card, town } = top[0]
      const where = town ? (job?.municipality ?? job?.locality ?? place) : job?.county
      return {
        name: card.name, contactId: card.id,
        reason: card.issues.length
          ? `Covers ${where} and issues ${t} permits, per your Directory.`
          : `Covers ${where}, per your Directory.`,
      }
    }
    return null
  }
  const used = Array.from(new Set(usedOnJob.map(n => (n ?? '').trim()).filter(Boolean)))
  if (used.length === 1) return { name: used[0], contactId: null, reason: 'Already used on this job\'s other permits.' }
  return null
}

/**
 * A word of caution about the authority picked for `type`, or null. Never a
 * refusal: a township's clerk may tell you otherwise, and the card may be
 * incomplete. Only speaks when the card that IS this name says so.
 */
export function authorityWarning(
  type: string,
  chosen: string,
  job: JobAreas | null,
  cards: AuthorityCard[],
): string | null {
  const name = chosen.trim()
  if (!name || !type.trim()) return null
  const key = name.toLowerCase().replace(/\s+/g, ' ')
  const named = cards.filter(c => c.name.trim().toLowerCase().replace(/\s+/g, ' ') === key)
  if (named.length !== 1) return null
  const card = named[0]
  const better = suggestAuthority(type, job, cards)
  const alt = better && better.name.toLowerCase() !== card.name.toLowerCase() ? ` ${better.name} does, per your Directory.` : ''
  if (card.issues.length && !issuesType(card, type)) {
    return `${card.name} is not marked as issuing ${type.trim()} permits.${alt}`
  }
  const place = jobPlace(job)
  if (card.covers.length && job && place && !card.covers.some(a => areaCoversJob(a, job))) {
    return `${card.name} does not cover ${place}, where this job is.${alt}`
  }
  return null
}

// ── Nearby ──────────────────────────────────────────────────────────────────
// "maybe when u select one it should suggest surrounding ones". A township's
// building department usually covers its neighbours too (or a county does), so
// after a pick the map is asked what lies around it: a ring of points a few
// miles out, each reverse-geocoded to the township (or county) it falls in.

/** How far out to look: a township's neighbours sit a few miles off, a county's tens. */
export const NEARBY_KM: Record<AreaKind, number> = { municipality: 7, county: 45 }
export const NEARBY_POINTS = 8

/** `n` points evenly round a circle of `km` about a centre. */
export function ringPoints(lat: number, lng: number, km: number, n = NEARBY_POINTS): { lat: number; lng: number }[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(km > 0) || n < 1) return []
  const dLat = km / 111.32
  const dLng = km / (111.32 * Math.max(0.01, Math.cos(lat * Math.PI / 180)))
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return { lat: lat + dLat * Math.cos(a), lng: lng + dLng * Math.sin(a) }
  })
}

const areaKey = (a: Area) => `${a.kind}|${foldArea(a.name)}|${a.state ?? ''}`

/**
 * What the ring found, as suggestions: same-kind places that are not the one
 * picked, in the order first seen, no repeats - plus the containing county
 * when a township was picked (it often runs the septic and health permits).
 */
export function nearbyAreas(picked: Area, found: (Area | null | undefined)[], county?: Area | null): Area[] {
  const self = areaKey(picked)
  const out: Area[] = []
  const seen = new Set<string>([self])
  const push = (a: Area | null | undefined) => {
    if (!a || !foldArea(a.name)) return
    if (!sameState(a.state, picked.state)) return
    const k = areaKey(a)
    if (seen.has(k)) return
    seen.add(k)
    out.push(a)
  }
  if (picked.kind === 'municipality' && county?.kind === 'county') push(county)
  for (const a of found) if (a?.kind === picked.kind) push(a)
  return out.slice(0, 12)
}

/**
 * Why nothing was suggested, in a sentence - or null when something was (or
 * nothing was asked). "should here suggest? cuz its not": an empty box with
 * no word under it looks exactly like a feature that never shipped. Each
 * answer names the one thing to fix.
 */
export function noSuggestionReason(type: string, job: JobAreas | null, cards: AuthorityCard[]): string | null {
  const t = type.trim()
  if (!t) return null
  const place = jobPlace(job)
  if (!job || !place) return 'Could not place this job\'s address on the map, so nobody is suggested. Check the address on the job.'
  const covering = cards.filter(c => c.covers.some(a => areaCoversJob(a, job)))
  if (!covering.length) return `No township in your Directory covers ${place} yet. Add ${place} to one under "Towns it covers" and it is suggested here.`
  const issuing = covering.filter(c => !c.issues.length || issuesType(c, t))
  if (!issuing.length) return `Nobody in your Directory covering ${place} is marked as issuing ${t} permits.`
  return `More than one Directory card covers ${place} for ${t} permits - pick the one you apply to.`
}
