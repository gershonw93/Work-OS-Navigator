-- ─────────────────────────────────────────────────────────────────────────────
-- Requested AND completed at the same time.
--
-- THE BUG, reported from a screenshot: a card reading "Requested" with
-- "Completed Sep 24, 2026" beside it and a Book it button underneath.
--
-- The inspector's-card scan reads the date printed on the paperwork and wrote
-- it straight onto the row, while asking about the RESULT as a separate step.
-- Decline "the card looks PASSED, mark it passed?" and the date stayed behind
-- on an inspection nobody had marked finished. `clearsCompletion` never saw it,
-- because that rule fires on a status MOVE and no status moved.
--
-- The code fix is `canCarryCompletion` (lib/inspection-status.ts), asked by the
-- scan, the PATCH route and the form. This clears the rows that got in first.
--
-- VOIDED ROWS ARE LEFT ALONE, deliberately. Voiding preserves whatever the row
-- held - that is the point of keeping it - and the restore path READS
-- `completed_date` to decide whether an inspection comes back as `passed` or as
-- `not_scheduled`. Clearing it here would silently change what a restore does.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE inspections
   SET completed_date = NULL
 WHERE completed_date IS NOT NULL
   AND status NOT IN ('passed', 'failed', 'void');
