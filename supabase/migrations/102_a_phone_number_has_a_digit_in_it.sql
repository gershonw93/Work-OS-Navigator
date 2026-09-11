-- ─────────────────────────────────────────────────────────────────────────────
-- A phone number that is a surname.
--
-- THE BUG, reported as "why's the first name by the name and the last name by
-- the phone number". The inspector picker's Quick add form has two boxes -
-- Full name and Phone - and validated neither, so a surname typed into the
-- second one saved without a word:
--
--     name: 'John'   type: 'inspector'   phone: 'Dohr'
--
-- It does not stay an untidy row, either. The inspections card offers every
-- inspector's number as a tap-to-call link, so that record became
-- `<a href="tel:Dohr">` on every inspection on the job: a control that looks
-- like a phone number and dials nothing.
--
-- `quickAddProblem` (lib/contact-quick-add.ts) stops the next one, at the form
-- AND at the route. This clears the ones already stored.
--
-- THE NAME IS LEFT ALONE. "John" is missing a surname and that is somebody's
-- record to correct - guessing which word belongs where is how the row got
-- wrong in the first place. Only the claim that is actionable and false - a
-- callable number - is removed.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE companies
   SET phone = NULL
 WHERE phone IS NOT NULL
   AND phone !~ '[0-9]';
