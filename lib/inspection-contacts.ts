// ─────────────────────────────────────────────────────────────────────────────
// WHO DO I CALL?
//
// THE QUESTION THAT HAD NO ANSWER ON THE SCREEN. A scheduler opened an
// "Inspection to book" notification and there was nothing on the card telling
// them how to book it - no number, and nowhere saying that SyteNav does not
// contact the inspector for you. The requester was supposed to have typed the
// inspector's name and the scheduling phone into the request form, and of
// course a person in the field asking for a framing inspection does not know
// the township's scheduling line by heart.
//
// So the number is GATHERED rather than retyped. It is already in the app in
// two places: every permit on the job carries its issuing authority and the
// inspector who signed it, and the Directory holds `type: 'inspector'` contacts
// (the permits page files them there itself). This assembles both into one
// list, nearest-to-this-inspection first.
//
// Pure, so it can be tested without a database - and shared, so the card and
// the notification cannot end up offering two different numbers.
// ─────────────────────────────────────────────────────────────────────────────

export interface CallTarget {
  /** Who to ask for, or the office to ring. */
  name: string
  phone: string | null
  /** Where we got it, said on screen so nobody wonders why a name is offered. */
  source: string
  /**
   * The inspection types a Directory inspector is marked as doing, so a list
   * built once per JOB can still put the right inspector first for each
   * INSPECTION (`callTargetsFor`). Absent for everything that is not a
   * Directory contact.
   */
  does?: string[]
}

export interface InspectionLike {
  /** Which inspection - used to put an inspector who does this type first. */
  type?: string | null
  inspector_name?: string | null
  inspector_phone?: string | null
  scheduling_phone?: string | null
}

export interface PermitLike {
  permit_type?: string | null
  issuing_authority?: string | null
  inspector_name?: string | null
  inspector_phone?: string | null
}

/**
 * A Directory inspector.
 *
 * THE ROW COMES OUT OF `companies`, NOT `contacts`. This module was written
 * against a `contacts` table that holds zero rows, so for two releases the
 * Directory half of the list returned nothing and looked exactly like "you have
 * not added any inspectors" - see `directoryInspectors` in the inspections
 * route for the whole story. The shape below is the same either way; the table
 * is the thing that was wrong.
 */
export interface ContactLike {
  name?: string | null
  type?: string | null
  phone?: string | null
  extra?: { jurisdiction?: string | null; inspection_types?: unknown } | null
}

/** The types a Directory inspector is marked as doing, cleaned. */
export function inspectorTypes(c: ContactLike | null | undefined): string[] {
  const raw = c?.extra?.inspection_types
  if (!Array.isArray(raw)) return []
  return raw.map(t => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
}

const fold = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Does this target say it does this inspection type? */
export const doesType = (t: CallTarget, type: string | null | undefined): boolean =>
  !!type && !!t.does?.some(d => fold(d) === fold(type))

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

/**
 * A NUMBER WITH NO DIGITS IN IT IS NOT A NUMBER, and it must never become a
 * `tel:` link. A surname saved into the Quick add form's phone box turned into
 * `<a href="tel:Dohr">` on every inspection on the job - a control that looks
 * like a phone number and dials nothing. `quickAddProblem` stops the next one
 * being stored; this stops the ones already stored being offered as callable.
 */
const cleanPhone = (v: unknown): string | null => {
  const s = clean(v)
  return s && /[0-9]/.test(s) ? s : null
}

/** Two entries are the same person when the number matches, or the name does. */
const keyFor = (t: CallTarget) =>
  (t.phone ? `p:${t.phone.replace(/[^0-9]/g, '')}` : `n:${t.name.toLowerCase()}`)

/**
 * Everyone worth ringing about this inspection, best first.
 *
 * An entry with NO phone is still returned when it names an office - "City of
 * Newark Building Dept" with no number is a search term, and it is honest about
 * what we know. An entry with neither a name nor a number is nothing at all and
 * is dropped.
 */
export function whoToCall({ inspection, permits = [], contacts = [] }: {
  inspection?: InspectionLike | null
  permits?: PermitLike[]
  contacts?: ContactLike[]
}): CallTarget[] {
  const out: CallTarget[] = []

  // 1. What this inspection already carries. Whoever raised it may well have
  //    known, and if they did it beats anything inferred.
  const schedulingPhone = cleanPhone(inspection?.scheduling_phone)
  if (schedulingPhone) {
    out.push({
      name: clean(inspection?.inspector_name) ?? 'Scheduling line',
      phone: schedulingPhone,
      source: 'On this inspection',
    })
  }
  const inspPhone = cleanPhone(inspection?.inspector_phone)
  const inspName = clean(inspection?.inspector_name)
  if (inspName || inspPhone) {
    out.push({
      name: inspName ?? 'Inspector',
      phone: inspPhone,
      source: 'On this inspection',
    })
  }

  // 2. The permits on this job. The jurisdiction that issued the permit is the
  //    jurisdiction that inspects against it - that is what a permit IS.
  for (const p of permits) {
    const authority = clean(p.issuing_authority)
    const name = clean(p.inspector_name)
    const phone = cleanPhone(p.inspector_phone)
    if (!authority && !name && !phone) continue
    out.push({
      name: name ?? authority ?? 'Issuing authority',
      phone,
      source: authority && name
        ? `${authority} - from the ${clean(p.permit_type) ?? 'permit'} permit`
        : `From the ${clean(p.permit_type) ?? 'permit'} permit`,
    })
  }

  // 3. Directory inspectors. Last because they are not tied to this job, but
  //    they are the list somebody deliberately built.
  for (const c of contacts) {
    if (c.type !== 'inspector') continue
    const name = clean(c.name)
    if (!name) continue
    const jurisdiction = clean(c.extra?.jurisdiction)
    const does = inspectorTypes(c)
    out.push({
      name,
      phone: cleanPhone(c.phone),
      source: jurisdiction ? `Directory - ${jurisdiction}` : 'Directory',
      ...(does.length ? { does } : {}),
    })
  }

  return dedupe(rankForType(out, inspection?.type))
}

function dedupe(targets: CallTarget[]): CallTarget[] {
  const seen = new Set<string>()
  const named = new Set<string>()
  return targets.filter(t => {
    const k = keyFor(t)
    if (seen.has(k)) return false
    // A NAME WITH NO NUMBER IS NOT A SECOND PERSON. "Ray Diaz" on the
    // scheduling line and "Ray Diaz" with no direct number are one contact, and
    // keying on the digits alone kept both - so the card offered a tappable
    // number and, under it, the same name with nothing to tap.
    const name = t.name.toLowerCase()
    if (!t.phone && named.has(name)) return false
    seen.add(k)
    named.add(name)
    return true
  })
}

/**
 * ONE LIST OF NUMBERS PER CARD, not two.
 *
 * The inspections route sends a PROJECT-level list (the permits and the
 * Directory), and the card was separately printing the inspection's OWN
 * inspector and scheduling phone in its details grid one band above it. Same
 * kind of fact, two places, and on a card the reader is scanning for "who do I
 * call" that reads as two different answers.
 *
 * This puts what the inspection itself carries at the front of the shared list
 * and dedupes across both, so a number written on the inspection and on the
 * permit appears once.
 */
export function callTargetsFor(
  inspection: InspectionLike | null | undefined,
  projectTargets: CallTarget[] = [],
): CallTarget[] {
  return dedupe([...whoToCall({ inspection }), ...rankForType(projectTargets, inspection?.type)])
}

/**
 * An inspector marked as doing THIS type of inspection goes ahead of the rest
 * of the list it is in - not ahead of what the inspection itself carries,
 * which somebody wrote down on purpose. Stable otherwise: the permits still
 * come before the Directory, and nobody is dropped for doing other types.
 */
export function rankForType(targets: CallTarget[], type: string | null | undefined): CallTarget[] {
  if (!type) return targets
  const fits = targets.filter(t => doesType(t, type))
  if (!fits.length) return targets
  const rest = targets.filter(t => !doesType(t, type))
  // Inspection-carried entries keep the front; the matches go right after them.
  const own = rest.filter(t => t.source === 'On this inspection')
  const others = rest.filter(t => t.source !== 'On this inspection')
  // Said on screen, so nobody wonders why this inspector jumped the queue.
  const named = fits.map(t => (/ - does /.test(t.source) ? t : { ...t, source: `${t.source} - does ${type}` }))
  return [...own, ...named, ...others]
}

/**
 * The one-line version for a notification, where there is no room for a list.
 *
 * Returns '' rather than a cheerful guess when we have nothing - a notification
 * that invents a contact is worse than one that does not mention it.
 */
export function callLine(targets: CallTarget[]): string {
  const first = targets.find(t => t.phone)
  if (!first) return ''
  return ` Call ${first.name} on ${first.phone}.`
}
