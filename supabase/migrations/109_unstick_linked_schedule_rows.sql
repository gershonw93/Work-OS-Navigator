-- Release the rows one save marked hand-dated a second after linking them.
--
-- THE REPORT: "a row with a saved explicit 80% link is excluded when the
-- predecessor moves - the review says 'dates were set by hand' while the two
-- general-linked rows shift correctly."
--
-- The dialog commits staged links and THEN saves the dates, so a save that did
-- both wrote "this line follows Sheetrock" and, a second later, "this line's
-- dates are hand-set, ignore Sheetrock". The second won. It only ever bit the
-- percent-gate rows because setting a gate is when somebody also fixes that
-- line's dates; a plain "After: Sheetrock" leaves the dates alone and never
-- stamped the flag at all.
--
-- The code fix stops it happening again, in two places: the apply route takes
-- an explicit "this is not a hand override" from the one caller that knows it
-- just linked, and the cascade now weighs the flag against the link's own
-- timestamp rather than letting the flag always win.
--
-- NEITHER OF THOSE REACHES A ROW ALREADY CARRYING THE FLAG, and a stuck row
-- looks exactly like a working one until a predecessor moves. So this clears
-- the ones the contradiction produced - and ONLY those: a flag stamped within
-- two minutes of one of that line's own links being created. A deliberate
-- override is a separate sitting, minutes or days after the link, and is left
-- alone. Idempotent: it is a no-op once the rows are clear.

UPDATE schedule_items si
SET dates_overridden_at = NULL
WHERE si.dates_overridden_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM schedule_dependencies sd
    WHERE sd.task_id = si.id
      AND si.dates_overridden_at >= sd.created_at
      AND si.dates_overridden_at < sd.created_at + INTERVAL '2 minutes'
  );
