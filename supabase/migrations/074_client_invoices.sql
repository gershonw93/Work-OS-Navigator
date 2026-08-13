-- ===== 074_client_invoices.sql =====
-- Billing the CLIENT on a simple-billing job.
--
-- Until now there was no way to produce a bill to send a client on a job that
-- is not AIA - Pay Apps covers that, and Payments & Escrow only records money
-- that has already arrived. 43 of 44 projects are simple-billing, so this was
-- the common case, not an edge.
--
-- A client invoice is built from cost that has already been recorded: approved
-- sub invoices and material receipts, each carrying its own markup. Nothing is
-- retyped, and the amounts cannot drift from the costs they came from because
-- they are copied at the moment of billing and then left alone.

CREATE TABLE IF NOT EXISTS client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  /**
   * Whether the client sees the cost and your markup broken out, or a single
   * figure per line. Cost-plus contracts usually require the former - the
   * client is entitled to see what things cost. A fixed-price or "our price"
   * job shows the latter, and showing the markup there would be handing over
   * your margin.
   */
  show_markup boolean NOT NULL DEFAULT false,
  notes text,
  terms text,
  /** Copied at issue so a later change to the project rate cannot rewrite history. */
  markup_pct numeric(6, 3),
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_invoices_project ON client_invoices (project_id);

-- One row per cost being billed on. cost/markup/amount are SNAPSHOTS - the
-- source invoice can later be edited, deleted or re-marked-up, and none of that
-- should silently change a bill the client has already been sent.
CREATE TABLE IF NOT EXISTS client_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_invoice_id uuid NOT NULL REFERENCES client_invoices (id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  /** Where this came from, so the same cost is never billed twice. */
  source_invoice_id uuid REFERENCES invoices (id) ON DELETE SET NULL,
  source_material_id uuid REFERENCES material_purchases (id) ON DELETE SET NULL,
  budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL,
  cost numeric(15, 2) NOT NULL DEFAULT 0,
  markup_pct numeric(6, 3) NOT NULL DEFAULT 0,
  markup numeric(15, 2) NOT NULL DEFAULT 0,
  amount numeric(15, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_client_invoice_lines_invoice ON client_invoice_lines (client_invoice_id);
-- A cost can only appear on one client invoice. This is the guard against
-- billing the same electrician's bill twice, which is the failure that costs
-- a relationship rather than just a correction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invoice_line_source_invoice
  ON client_invoice_lines (source_invoice_id) WHERE source_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invoice_line_source_material
  ON client_invoice_lines (source_material_id) WHERE source_material_id IS NOT NULL;
