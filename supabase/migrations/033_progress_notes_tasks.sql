-- Per-progress-line notes, and a two-way link between a quote line item and a task.
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS progress_note TEXT;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS budget_line_item_id UUID REFERENCES budget_line_items (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_line_item ON project_tasks (budget_line_item_id);
ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS progress_status TEXT NOT NULL DEFAULT 'not_started';
