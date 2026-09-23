// Adding a person to a job's team - the rules both doors ask.
//
// Two doors used to exist on the Subs & Team page ("Add Company Member" for a
// teammate with a SyteNav login, "Add Member" for anyone else) and the header's
// team panel had none. One dialog now serves all three places
// (components/projects/add-team-member-dialog.tsx), and this is the one answer
// to "what is missing" - asked by the dialog before sending and by the route
// before writing, so the two cannot disagree.

/** The roles a person can hold on a job. */
/**
 * WHO IS ON A JOB - AND IT IS NOT ONLY THE GC'S OWN STAFF.
 *
 * REPORTED: "the quick add doesn't let me add a sub as well". The list was
 * Project Manager through Quality Control - every one of them somebody on the
 * GC's payroll - so the "Not on SyteNav" tab could add a foreman and not the
 * electrician standing next to him. A required picker with no right answer in
 * it is a dead end: the dialog is for anybody on the job who is reachable by
 * phone, which is mostly the trades.
 *
 * THIS IS A LABEL ON A PERSON, NOT A SUBCONTRACT. Adding "Subcontractor" here
 * puts a name and a number on the job's team list; it does not award anybody
 * work, create a subcontract or touch the budget. Awarding is Buyout, and it
 * stays that way - this is the roster, which is the thing somebody on site
 * needs when they have to ring whoever is doing the ductwork.
 */
export const JOB_ROLES = [
  'Project Manager', 'Site Manager', 'Superintendent', 'Foreman',
  'Subcontractor', 'Supplier', 'Inspector', 'Architect', 'Engineer',
  'Laborer', 'Safety Officer', 'Quality Control', 'Other',
] as const

export type AddMode = 'teammate' | 'outside'

export interface NewMemberFields {
  mode: AddMode
  /** teammate mode: the chosen profile's id */
  profileId: string
  name: string
  role: string
  phone: string
  email: string
}

/**
 * The first thing stopping this person being added, as a sentence - or null.
 *
 * Never enforced by a greyed-out button (CLAUDE.md: "A DISABLED BUTTON
 * EXPLAINS NOTHING"); the dialog lets Add fire and shows this.
 */
export function missingMember(f: NewMemberFields): string | null {
  if (f.mode === 'teammate' && !f.profileId) return 'Pick who from your team to add.'
  if (f.mode === 'outside' && !f.name.trim()) return 'Give their name - it is what the team list calls them.'
  if (!f.role.trim()) return 'Pick their role on this job.'
  const email = f.email.trim()
  if (f.mode === 'outside' && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'That email address does not look complete - fix it or leave it blank.'
  }
  return null
}

/** Same rule for the route, which only ever sees a name, role and contact. */
export function missingMemberBody(b: { name?: unknown; role?: unknown }): string | null {
  if (typeof b.name !== 'string' || !b.name.trim()) return 'Give their name - it is what the team list calls them.'
  if (typeof b.role !== 'string' || !b.role.trim()) return 'Pick their role on this job.'
  return null
}
