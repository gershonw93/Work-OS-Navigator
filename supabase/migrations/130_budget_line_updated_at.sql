-- Budget lines can be sorted by "Last edited", which reads updated_at.
-- Only the line PATCH route ever wrote it: awarding a quote, applying a
-- template, editing from the estimate and signing off all updated the row and
-- left the column at its insert time, so the sort would have put a line
-- changed this morning below one nobody had touched since it was made.
-- A trigger is the one writer every door shares.

CREATE OR REPLACE FUNCTION budget_line_items_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS budget_line_items_touch_updated_at ON budget_line_items;
CREATE TRIGGER budget_line_items_touch_updated_at
  BEFORE UPDATE ON budget_line_items
  FOR EACH ROW EXECUTE FUNCTION budget_line_items_touch_updated_at();
