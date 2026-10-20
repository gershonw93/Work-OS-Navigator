-- Who agreed to the Terms of Service, when, and to which version.
--
-- The Terms page existed from July and nobody ever agreed to it: signup had no
-- box and no link, so the document bound a customer only as far as a page
-- they may never have seen. The create-account form now requires the box and
-- complete-signup records the moment and the version (TERMS_VERSION in
-- lib/legal/terms.ts) - "which terms did this customer accept, and when" is
-- the question this answers, and it is asked long after the fact.
-- On the profile because the person who ticked it is the evidence; the
-- company they signed up is the party.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_version text;
