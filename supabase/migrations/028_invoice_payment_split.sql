-- Per-invoice payment source split: how much the client paid the vendor
-- directly vs how much was disbursed from the escrow account.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_paid NUMERIC(14, 2) NOT NULL DEFAULT 0;
