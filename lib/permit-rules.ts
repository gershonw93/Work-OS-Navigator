// ─────────────────────────────────────────────────────────────────────────────
// What a permit record has to say before it is worth having.
//
// THE BUG. Add Permit accepted a fully blank submit and filed a permit reading
// "Building / pending". Nobody typed either of those words - they are the
// `useState` defaults on the two dropdowns, which is exactly why the record did
// not LOOK blank in the list and why nothing caught it. A default on a required
// field is a claim nobody made, and it disarms the `required` sitting next to
// it: a `<select>` that starts on 'Building' can never fail constraint
// validation, so the attribute was decoration.
//
// WHY NOT JUST "REQUIRE THE NUMBER AND THE DATES". Because a permit you have
// APPLIED for has neither, and that is what `pending` means - the strict rule
// would refuse the one case the app most needs to track. So the rule is the
// same shape as `scheduleProblem` next door: a status that CLAIMS something
// must carry what it claims.
//
//   * always - a type, and one fact that identifies this permit rather than
//     any other: its number, a description, or who issued it;
//   * approved / active / recorded - it has been granted, so it has a number
//     and a date it was issued;
//   * expired - something expired, so there is a date it expired on.
//
// Pure, so the form asks it before sending and the route asks it before
// writing, and neither can be the only one that knows.
// ─────────────────────────────────────────────────────────────────────────────

export interface PermitFacts {
  permit_type?: string | null
  permit_number?: string | null
  description?: string | null
  issuing_authority?: string | null
  status?: string | null
  issued_date?: string | null
  expiry_date?: string | null
}

/** Statuses that assert the permit has actually been granted. */
export const GRANTED_STATUSES = ['approved', 'active', 'recorded']

const has = (v: string | null | undefined) => !!(v && String(v).trim())

export function permitProblem(p: PermitFacts): string | null {
  if (!has(p.permit_type)) {
    return 'Pick the permit type - it is the first thing anybody looks for in the list.'
  }

  // The blank record, named. One of these three is what tells a permit apart
  // from every other permit on the job.
  if (!has(p.permit_number) && !has(p.description) && !has(p.issuing_authority)) {
    return 'Add the permit number, a description, or who is issuing it - otherwise there is nothing on this record to tell it apart.'
  }

  const status = (p.status ?? '').trim()

  if (GRANTED_STATUSES.indexOf(status) !== -1) {
    if (!has(p.permit_number)) {
      return `A permit marked "${status}" has been issued, so it has a permit number. Add it, or set the status back to pending.`
    }
    if (!has(p.issued_date)) {
      return `A permit marked "${status}" has a date it was issued. Add it, or set the status back to pending.`
    }
  }

  if (status === 'expired' && !has(p.expiry_date)) {
    return 'A permit marked "expired" has a date it expired on. Add the expiry date.'
  }

  return null
}
