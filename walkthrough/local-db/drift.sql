-- Columns production has that the numbered migrations never created (they were
-- added by hand in the original database). Derived by diffing the local
-- schema against production's information_schema (metadata only, no rows).
-- Local-only: never apply this to a hosted project.
CREATE TABLE IF NOT EXISTS public.linkedin_connection (id serial primary key);
CREATE TABLE IF NOT EXISTS public.linkedin_oauth_states (state text primary key);
CREATE TABLE IF NOT EXISTS public.linkedin_posts (id uuid primary key default gen_random_uuid());
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS trade text, ADD COLUMN IF NOT EXISTS requirements text, ADD COLUMN IF NOT EXISTS specifications text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS duration_days int, ADD COLUMN IF NOT EXISTS crew_size int, ADD COLUMN IF NOT EXISTS earliest_start_date date,
  ADD COLUMN IF NOT EXISTS payment_terms text, ADD COLUMN IF NOT EXISTS proposal_url text, ADD COLUMN IF NOT EXISTS proposal_storage_path text,
  ADD COLUMN IF NOT EXISTS revision_note text, ADD COLUMN IF NOT EXISTS scope_categories jsonb;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS permit_type text, ADD COLUMN IF NOT EXISTS description text, ADD COLUMN IF NOT EXISTS issued_date date,
  ADD COLUMN IF NOT EXISTS issuing_authority text, ADD COLUMN IF NOT EXISTS inspector_name text, ADD COLUMN IF NOT EXISTS inspector_phone text,
  ADD COLUMN IF NOT EXISTS notes text, ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE permits ALTER COLUMN type DROP NOT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_company_id uuid, ADD COLUMN IF NOT EXISTS client_portal_token text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS company_id uuid, ADD COLUMN IF NOT EXISTS company_name text, ADD COLUMN IF NOT EXISTS rfi_number int,
  ADD COLUMN IF NOT EXISTS subject text, ADD COLUMN IF NOT EXISTS description text, ADD COLUMN IF NOT EXISTS is_change_order bool,
  ADD COLUMN IF NOT EXISTS change_order_description text, ADD COLUMN IF NOT EXISTS change_order_items jsonb, ADD COLUMN IF NOT EXISTS change_order_amount numeric,
  ADD COLUMN IF NOT EXISTS change_order_status text, ADD COLUMN IF NOT EXISTS attachments jsonb, ADD COLUMN IF NOT EXISTS submitted_by_name text;
ALTER TABLE rfis ALTER COLUMN project_id DROP NOT NULL, ALTER COLUMN question DROP NOT NULL, ALTER COLUMN status DROP NOT NULL,
  ALTER COLUMN created_by DROP NOT NULL, ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS billing_type text, ADD COLUMN IF NOT EXISTS progress_percent numeric,
  ADD COLUMN IF NOT EXISTS weekly_amount numeric, ADD COLUMN IF NOT EXISTS billing_notes text;
NOTIFY pgrst, 'reload schema';
