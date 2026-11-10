-- Fake-data additions the seed does not make, so every narrated step has
-- something to show. Idempotent; local database only.
-- Line 06 (cascade) needs linked trades: Framing -> HVAC -> Drywall on Maple Street.
WITH p AS (SELECT id FROM projects WHERE name = 'Maple Street Residences' LIMIT 1),
     li AS (SELECT s.id, c.trade FROM schedule_items s JOIN subcontracts c ON c.id = s.subcontract_id, p WHERE s.project_id = p.id),
     pairs(pred, succ) AS (VALUES ('Framing', 'HVAC'), ('HVAC', 'Drywall'))
INSERT INTO schedule_dependencies (project_id, task_id, predecessor_task_id, lag_days)
SELECT p.id, s.id, pr.id, 0 FROM pairs, p, li s, li pr
WHERE s.trade = pairs.succ AND pr.trade = pairs.pred
  AND NOT EXISTS (SELECT 1 FROM schedule_dependencies d WHERE d.task_id = s.id AND d.predecessor_task_id = pr.id);

-- Line 08 (inspections) talks about a countdown: give Maple Street's booked
-- Rough Electrical visit a date a few days ahead of whenever this runs.
UPDATE inspections SET scheduled_date = current_date + 5, ready_reminder_sent_at = NULL
WHERE type = 'Rough Electrical' AND status = 'scheduled'
  AND project_id = (SELECT id FROM projects WHERE name = 'Maple Street Residences' LIMIT 1);

-- The seed leaves schedule_items.trade empty, and the cascade review names a
-- line by its trade, so every row there read "an unnamed line".
UPDATE schedule_items s SET trade = c.trade
FROM subcontracts c WHERE c.id = s.subcontract_id AND (s.trade IS NULL OR s.trade = '');
