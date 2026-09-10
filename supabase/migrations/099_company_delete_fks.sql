-- ─────────────────────────────────────────────────────────────────────────────
-- Deleting a contact you invited to the platform.
--
-- THE BUG. Delete on a Directory contact did nothing, and the contact stayed.
-- The visible half was `window.confirm` blocking the page before the request
-- was ever made (fixed in the app), but underneath it Postgres would have
-- refused anyway: `company_invites.company_id` had NO ON DELETE rule at all, so
-- deleting a company you had invited violated the constraint.
--
-- That is why it looked contact-specific. Sub 5 was the only row in the
-- Directory with a company_invites row, because it was the only one anybody had
-- invited to the platform.
--
-- CASCADE is the honest rule: the invite is a fact about that company and about
-- nothing else, and `profiles.company_id` - a much bigger fact - already
-- cascades. Deleting the company was always going to take the person's profile
-- with it; leaving their unclaimed invite behind was never a considered choice.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE company_invites DROP CONSTRAINT IF EXISTS company_invites_company_id_fkey;

ALTER TABLE company_invites
  ADD CONSTRAINT company_invites_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- The same trap, one table over, waiting for the first person to delete a
-- supplier who had ever sent in a submittal.
--
-- SET NULL rather than CASCADE, and the difference matters: a submittal is a
-- record of WORK - a product approved for a job - and removing a company from
-- your directory must not delete the drawing they submitted two years ago. It
-- loses the attribution, which is the correct thing to lose.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE submittals DROP CONSTRAINT IF EXISTS submittals_submitted_by_company_id_fkey;

ALTER TABLE submittals
  ADD CONSTRAINT submittals_submitted_by_company_id_fkey
  FOREIGN KEY (submitted_by_company_id) REFERENCES companies(id) ON DELETE SET NULL;
