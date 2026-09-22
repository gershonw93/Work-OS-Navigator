-- THE ADDRESS THE APP INVENTED FOR SOMEBODY WHO HAS NONE.
--
-- `companies.contact_email` is NOT NULL, so five different forms wrote
-- `noemail+<timestamp>@placeholder.com` rather than leave it out. It is a
-- well-formed address that reaches nobody, which is the worst of both worlds:
-- it passes every "is this an address?" check, so every screen asking whether
-- a sub can be written to answered YES.
--
-- REPORTED in QA: a sub with no address was listed on both schedule review
-- screens as an emailable recipient, showing the invented address, with NO
-- "no address on file" warning. Pressing Notify would have logged them as
-- TOLD while the letter went to a dead domain - the sub never hears, and the
-- job history says they were informed. A line with no sub at all WAS flagged;
-- only the no-address case was silent.
--
-- The forms now write '' - which is what 22 company rows already carried for
-- "absent", and which every check correctly reads as no address. This clears
-- the rows the old behaviour already made.
--
-- LOSSLESS. The only thing in the invented address is the millisecond the row
-- was created, which `created_at` already holds.
--
-- Idempotent, and deliberately narrow: it matches the exact shape the forms
-- produced, never a real address that merely mentions the word.
UPDATE companies
SET contact_email = ''
WHERE contact_email ILIKE 'noemail+%@placeholder.com';
