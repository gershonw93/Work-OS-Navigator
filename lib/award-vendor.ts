// ─────────────────────────────────────────────────────────────────────────────
// What awarding a quote may write onto a Directory row that already exists.
//
// The award fills in a vendor's contact details from the quote it read. That
// used to OVERWRITE them: a quote carrying an estimator's name and a generic
// sales@ address replaced the contact the GC had typed in by hand, so the next
// bill, compliance request and invite went to whoever wrote the quote. The
// quote is a document about one price, read by a model; the Directory row is
// the GC's record of who to call. A field the GC already filled in is theirs.
//
// So: blanks only. A field with anything in it is left alone, and the answer is
// the patch to apply - empty when there is nothing to fill.
// ─────────────────────────────────────────────────────────────────────────────

export type VendorContact = { contact_name?: string | null; contact_email?: string | null; phone?: string | null }
export type QuoteContact = { name?: string | null; email?: string | null; phone?: string | null }

const blank = (v: unknown): boolean => String(v ?? '').trim() === ''

export function contactBackfill(row: VendorContact, quote: QuoteContact): VendorContact {
  const patch: VendorContact = {}
  if (!blank(quote.name) && blank(row.contact_name)) patch.contact_name = String(quote.name).trim()
  if (!blank(quote.email) && blank(row.contact_email)) patch.contact_email = String(quote.email).trim()
  if (!blank(quote.phone) && blank(row.phone)) patch.phone = String(quote.phone).trim()
  return patch
}
