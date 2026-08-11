

-- ===== 068_selections.sql =====
-- Homeowner selections: the choices that aren't yours to make.
--
-- Paint colours, roof product, windows, siding, tile, cabinets, fixtures. The
-- GC carries an allowance for each in the budget and then waits. Nobody tracks
-- them anywhere, so they surface as a phone call the week the trade is standing
-- on site: "what colour?"
--
-- Two things have to be true for a selection to be safe: it has a date driven
-- by lead time (not by when the trade shows up), and it has an allowance, so
-- the moment they pick something dearer everyone can see the difference instead
-- of discovering it on the invoice.

CREATE TABLE IF NOT EXISTS project_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,

  category text NOT NULL,          -- Flooring, Plumbing Fixtures, Interior Paint…
  item text NOT NULL,              -- "Master bath floor tile"
  location text,                   -- "Master bath" - same category, different rooms

  -- The money. allowance_amount is what the budget carries; selected_price is
  -- what they actually chose. The difference is a change order.
  allowance_amount numeric(14, 2),
  budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL,

  -- Driven by lead time, not by the schedule. A 6-week window order decided the
  -- week framing finishes is already late.
  needed_by date,
  lead_time_days integer,

  -- pending | waiting | chosen | ordered | installed
  status text NOT NULL DEFAULT 'pending',

  selected_option_id uuid,
  selected_name text,
  selected_price numeric(14, 2),
  selected_at timestamptz,
  selected_by_name text,

  change_order_id uuid REFERENCES change_orders (id) ON DELETE SET NULL,

  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- What they get to choose from. A selection with no options is still valid -
-- plenty of picks are "go to the showroom and tell us what you liked".
CREATE TABLE IF NOT EXISTS selection_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id uuid REFERENCES project_selections (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Installed price for this option, comparable to the allowance.
  price numeric(14, 2),
  vendor text,
  image_url text,
  link_url text,
  -- The one the allowance was based on.
  is_allowance boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_selections_project ON project_selections (project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_selections_needed ON project_selections (project_id, needed_by);
CREATE INDEX IF NOT EXISTS idx_selection_options_selection ON selection_options (selection_id, sort_order);
