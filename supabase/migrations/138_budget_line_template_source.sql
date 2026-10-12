-- A house's budget line remembers the template line it was copied from, and
-- the amount it was copied at.
--
-- Applying a house model COPIES its budget template onto each house. A copy
-- cannot tell that the template changed later, and overwriting every house
-- to match would undo a figure somebody changed on purpose on one lot. With
-- these two columns the apply can tell the cases apart (lib/budget-template-line.ts):
-- amount still equal to source_amount -> untouched, follow the template;
-- anything else -> changed by hand, leave it alone.
--
-- SET NULL: deleting a template line must not take the house's line with it -
-- the house keeps its budget, it just stops following.

ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS source_template_item_id uuid REFERENCES budget_template_items (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_amount numeric(14, 2);

CREATE INDEX IF NOT EXISTS idx_budget_line_items_source_item
  ON budget_line_items (source_template_item_id) WHERE source_template_item_id IS NOT NULL;

-- Lines a model already copied, before this column existed: match them to
-- their house model's template by description, folded the way the apply folds
-- it (lib/site-models.ts, foldLine). The copied-at amount is only known when
-- the line still equals the template - anything else may be a hand edit, so
-- it stays NULL, which the apply reads as "cannot tell, leave it alone".
UPDATE budget_line_items b
SET source_template_item_id = ti.id,
    source_amount = CASE WHEN b.budgeted_amount = coalesce(ti.default_amount, 0) THEN b.budgeted_amount ELSE NULL END
FROM projects p
JOIN site_models m ON m.id = p.model_id
JOIN budget_template_items ti ON ti.template_id = m.budget_template_id
WHERE b.project_id = p.id
  AND b.source_template_item_id IS NULL
  AND trim(regexp_replace(lower(b.description), '[^a-z0-9]+', ' ', 'g'))
    = trim(regexp_replace(lower(ti.description), '[^a-z0-9]+', ' ', 'g'));
