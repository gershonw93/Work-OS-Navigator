// ─────────────────────────────────────────────────────────────────────────────
// WHAT ACCEPTING A GC'S INVITE DOES TO A SUB - decided here, with no database,
// so every case is a test (lib/__tests__/vendor-link.ts).
//
// A GC invites a vendor from its Directory. The invite used to put the person
// INSIDE that Directory row, which made him a guest in one GC's address book:
// a second GC's invite was refused because he already belonged to the first,
// and a sub who had signed up as his own business could never be invited at
// all. Since migration 169 the Directory row LINKS to the sub's own company
// instead (`companies.linked_company_id`), and nobody's profile moves to make
// a link.
//
// The cases, for the person accepting and the Directory row they were invited
// to:
//
//   no company yet           -> create_company: his own company (light,
//                               `invited_only`), him its admin, then link
//   already in THIS row      -> already: an old-style guest; nothing to do
//   row linked to him        -> already
//   row linked to SOMEBODY   -> refused, row_taken: a GC cannot hand another
//   else                        business's seat to a new person
//   a guest in ANOTHER GC's  -> move_and_link: the old-style seat becomes his
//   row (the old invite)        own company first, the old row links to it,
//                               then this one does. Only on his explicit
//                               accept, and only his login moves - every
//                               record stays on the GC's row, reachable
//                               through the link
//   a sub or supplier company-> link
//   a GC (or anything else)  -> refused, not_a_vendor: one business working as
//                               another's sub is a multi-company question,
//                               not a side effect of an invite
//
// AND A LINK TAKES CONSENT. Setting a password from the invite email is
// consent for the brand-new person (create_company). Somebody who already has
// a company accepts on an explicit card - `/api/invite/accept` must never link
// an existing business on the strength of a password reset, which also runs
// this route.
// ─────────────────────────────────────────────────────────────────────────────

export type VendorRow = {
  id: string
  type: string | null
  added_by_company_id: string | null
  linked_company_id: string | null
}

export type Me = {
  companyId: string | null
  companyType: string | null
  /** His company is itself somebody's Directory row - the old invite's seat. */
  companyIsDirectoryRow: boolean
}

export type LinkPlan =
  | { do: 'create_company' }
  | { do: 'link' }
  | { do: 'move_and_link' }
  | { do: 'already' }
  | { do: 'refuse'; reason: LinkRefusal }

export type LinkRefusal = 'row_taken' | 'not_a_vendor' | 'not_a_directory_row'

const VENDOR_TYPES = new Set(['subcontractor', 'supplier'])

export function linkPlan(me: Me, row: VendorRow): LinkPlan {
  if (!row.added_by_company_id || !VENDOR_TYPES.has(row.type ?? '')) return { do: 'refuse', reason: 'not_a_directory_row' }
  if (me.companyId && me.companyId === row.id) return { do: 'already' }
  if (me.companyId && row.linked_company_id === me.companyId) return { do: 'already' }
  if (row.linked_company_id) return { do: 'refuse', reason: 'row_taken' }
  if (!me.companyId) return { do: 'create_company' }
  if (me.companyIsDirectoryRow) return VENDOR_TYPES.has(me.companyType ?? '') ? { do: 'move_and_link' } : { do: 'refuse', reason: 'not_a_vendor' }
  if (VENDOR_TYPES.has(me.companyType ?? '')) return { do: 'link' }
  return { do: 'refuse', reason: 'not_a_vendor' }
}

/** What the person is told, per refusal. One spelling, read by route and card. */
export const LINK_REFUSAL_TEXT: Record<LinkRefusal | 'duplicate_entry', string> = {
  row_taken: 'That company is already connected to a SyteNav account. Ask them to add you to their team.',
  not_a_vendor: 'Your account belongs to a general contractor, so it cannot also be connected as their subcontractor. Ask them to invite a different address.',
  not_a_directory_row: 'This invite is not for a vendor in their Directory.',
  duplicate_entry: 'They already have your company in their Directory under another name. Ask them to use that entry instead.',
}

/** Is a pending invite a vendor invite? Old rows (no `audience`) are read off the target row. */
export function isVendorInvite(invite: { audience?: string | null }, target: Pick<VendorRow, 'type' | 'added_by_company_id'> | null): boolean {
  if (invite.audience === 'vendor') return true
  if (invite.audience === 'team') return false
  return !!target?.added_by_company_id && VENDOR_TYPES.has(target.type ?? '')
}

/** The same refusals, addressed to the GC sending the invite. */
export const GC_LINK_REFUSAL_TEXT: Record<LinkRefusal, string> = {
  row_taken: 'That vendor is already connected to their own SyteNav account. They add their own teammates.',
  not_a_vendor: 'That address belongs to a general contractor on SyteNav, so it cannot be connected as your vendor. Use a different address.',
  not_a_directory_row: 'That company is not a vendor in your directory.',
}
