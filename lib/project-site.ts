// ─────────────────────────────────────────────────────────────────────────────
// Where a job is on the map - and whether that answer may be used.
//
// THE BUG, and it is the plainest kind. A `projects` row carried FOUR columns
// for one fact:
//
//   lat, lng, geocoded_address   migration 047 - written by the address
//                                autocomplete, the bulk creator and
//                                /api/projects/geocode. 94 of 100 rows had them.
//   latitude, longitude          migration 014 - written by the demo seed, and
//                                by one private geocoder inside the punch
//                                route. Nothing else in the app has ever
//                                touched them.
//
// The geofence read `latitude`/`longitude`. So the clock-in check has never
// worked on a real job - not because the addresses could not be geocoded (they
// were, months ago, and the map has been drawing them ever since) but because
// the punch route asked the empty pair. It then blamed the worker: every punch
// came back flagged, and the message said the phone had given no location while
// the worker's latitude sat in the same row.
//
// Same shape as `client`/`client_name` and `contacts`/`companies` in CLAUDE.md:
// a query against the wrong name comes back empty, empty renders as "nothing
// here", and nothing errors. One home for the fact, and one reader for it.
//
// AND A PIN CAN BE WRONG WITHOUT BEING ABSENT. `geocoded_address` records the
// address a pin was resolved FROM. Editing a job's address without picking an
// autocomplete suggestion leaves the old coordinates sitting there, so:
//
//   address            17 Fairview Terrace, Maplewood, NJ 07040
//   geocoded_address   17 Fairview Avenue, Frederick, MD 21701
//
// - a real row, and the pin is two hundred miles from the job. Fourteen of the
// hundred were like this. A stale pin is not a coordinate this module will hand
// out: `coords` is null for it, exactly as it is for a job with no pin at all,
// because a caller that gets a number back will measure against it. What is
// different is what we SAY, and that is what `siteLabel` is for.
// ─────────────────────────────────────────────────────────────────────────────

export type SiteState =
  /** A pin, resolved from the address the job currently has. Usable. */
  | 'mapped'
  /** A pin, but for an address this job no longer has. Not usable. */
  | 'stale'
  /** No pin at all. */
  | 'unmapped'

export interface ProjectSiteRow {
  address?: string | null
  lat?: number | null
  lng?: number | null
  geocoded_address?: string | null
}

export interface ProjectSite {
  state: SiteState
  /**
   * The job site, or null. Non-null ONLY when `state` is 'mapped' - a pin we
   * will not vouch for is not a coordinate, it is a rumour.
   */
  coords: { lat: number; lng: number } | null
  /** The address the current pin was resolved from, when that is not the job's. */
  pinnedTo: string | null
}

/**
 * Two written addresses that mean the same place.
 *
 * Only ever compares a `geocoded_address` with the `address` it was copied
 * from, so byte equality would nearly do; the normalising is for the trailing
 * comma and the double space a hand edit leaves behind, not for understanding
 * that Avenue and Ave are the same word. Where it is unsure it says NOT the
 * same, which costs a re-geocode rather than a wrong pin.
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) =>
    String(s ?? '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a), y = norm(b)
  return x.length > 0 && x === y
}

export function projectSite(row: ProjectSiteRow): ProjectSite {
  const lat = row.lat, lng = row.lng
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return { state: 'unmapped', coords: null, pinnedTo: null }
  }

  const pinnedFor = row.geocoded_address ?? null
  // A pin with NO record of what it was resolved from predates the column (or
  // came from the demo seed). We cannot show it is stale, and calling every one
  // of them stale would take the working geofence off the jobs that have one.
  if (pinnedFor && !sameAddress(pinnedFor, row.address)) {
    return { state: 'stale', coords: null, pinnedTo: pinnedFor }
  }

  return { state: 'mapped', coords: { lat: Number(lat), lng: Number(lng) }, pinnedTo: null }
}

/**
 * ONE sentence, read by the project settings dialog and the Time tab.
 *
 * Written separately in each place is how " · no GPS" came to sit beside a
 * latitude, and the same trap is open here: the settings screen and the time
 * screen are describing one fact from two files.
 */
export function siteLabel(site: ProjectSite): string {
  switch (site.state) {
    case 'mapped':
      return 'This job is on the map. Clock-ins are checked against it.'
    case 'stale':
      return `The map pin is still on ${site.pinnedTo}, which is not this job's address any more, `
        + 'so clock-ins are not being checked against the site.'
    case 'unmapped':
      return 'This job has no place on the map yet, so clock-ins cannot be checked against the site.'
  }
}

/** What the person reading that can do about it. Empty when there is nothing to do. */
export function siteAdvice(site: ProjectSite): string {
  switch (site.state) {
    case 'mapped':
      return ''
    case 'stale':
      return 'Pick the address from the suggestions to move the pin, or set it by hand.'
    case 'unmapped':
      return 'Pick the address from the suggestions, or set the pin by hand from the site.'
  }
}

/** A coordinate a caller sent us: a real place on Earth, not a typo or a swap. */
export function validPin(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  // Before Number(), not after. `Number(null)` is 0 and `Number('')` is 0, and
  // zero is a real latitude - so a body that sent nothing at all would have
  // been accepted as a point on the equator and written to the job.
  for (const v of [lat, lng]) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null
  }
  const a = Number(lat), b = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a < -90 || a > 90 || b < -180 || b > 180) return null
  // 0,0 is in the Atlantic and is what an empty form posts. Nobody builds there.
  if (a === 0 && b === 0) return null
  return { lat: a, lng: b }
}
