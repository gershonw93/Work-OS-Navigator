-- PROPOSAL - NOT A MIGRATION. Kept outside supabase/migrations/ on purpose.
-- Would become 156_directory_links.sql (table design approved Oct 26, 2026). See sub-company-link.md.
--
-- Additive only: no existing row changes owner, no row is rewritten, and with
-- no links the product behaves exactly as it does today.

-- ── 1. Directory ownership constraint - SHIPPED as migration 155 ────────────
-- Production already had the FK (ON DELETE SET NULL, unrecorded in any file);
-- 155 kept it and added the not-self check and the index. Not repeated here.

-- ── 2. The link: a GC's Directory entry -> the sub's real company ─────────────
CREATE TABLE IF NOT EXISTS directory_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The GC's own entry. Its notes, spelling and contact overrides stay on it.
  directory_company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  gc_company_id         uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  -- Null until somebody at the sub ACCEPTS. Never filled in by a match.
  sub_company_id        uuid REFERENCES companies (id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'declined', 'revoked')),
  -- Where the invitation was sent. Delivery only - it authorises nothing.
  invited_email         text,
  -- HMAC of the invitation token; the token itself is never stored.
  token_hash            text,
  invited_by            uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  accepted_by           uuid REFERENCES profiles (id) ON DELETE SET NULL,
  accepted_at           timestamptz,
  -- Who ended it and why: the record outlives both the link and the account.
  ended_by              uuid REFERENCES profiles (id) ON DELETE SET NULL,
  ended_by_side         text CHECK (ended_by_side IN ('gc', 'sub')),
  ended_at              timestamptz,
  end_reason            text,
  CHECK (status <> 'active' OR (sub_company_id IS NOT NULL AND accepted_at IS NOT NULL)),
  CHECK (status NOT IN ('revoked', 'declined') OR ended_at IS NOT NULL),
  CHECK (sub_company_id IS DISTINCT FROM gc_company_id),
  CHECK (sub_company_id IS DISTINCT FROM directory_company_id)
);

-- One LIVE link per Directory entry, and one LIVE link per (GC, sub company):
-- a GC with two entries for the same business must choose one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_links_entry_live
  ON directory_links (directory_company_id) WHERE status IN ('pending', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_links_pair_active
  ON directory_links (gc_company_id, sub_company_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_links_token
  ON directory_links (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_directory_links_sub_active
  ON directory_links (sub_company_id) WHERE status = 'active';

-- The shape the table cannot express with a CHECK: the entry is the GC's, and
-- the sub company is a REAL company, not somebody else's Directory entry.
CREATE OR REPLACE FUNCTION directory_links_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE entry_owner uuid; sub_owner uuid; sub_type text;
BEGIN
  SELECT added_by_company_id INTO entry_owner FROM companies WHERE id = NEW.directory_company_id;
  IF entry_owner IS DISTINCT FROM NEW.gc_company_id THEN
    RAISE EXCEPTION 'directory entry % is not in company %''s Directory', NEW.directory_company_id, NEW.gc_company_id;
  END IF;
  IF NEW.sub_company_id IS NOT NULL THEN
    SELECT added_by_company_id, type INTO sub_owner, sub_type FROM companies WHERE id = NEW.sub_company_id;
    IF sub_owner IS NOT NULL THEN
      RAISE EXCEPTION 'company % is a Directory entry, not a business with its own account', NEW.sub_company_id;
    END IF;
    IF sub_type NOT IN ('subcontractor', 'supplier') THEN
      RAISE EXCEPTION 'company % is not a subcontractor or supplier', NEW.sub_company_id;
    END IF;
    -- "No owner" is not proof of a real business: added_by_company_id is
    -- ON DELETE SET NULL, so a deleted GC's entries lose their owner and look
    -- self-owned. A real business is one somebody is signed in to.
    IF NEW.status = 'active' AND NOT EXISTS (SELECT 1 FROM profiles WHERE company_id = NEW.sub_company_id) THEN
      RAISE EXCEPTION 'company % has no account holder, so it cannot be linked', NEW.sub_company_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_directory_links_guard ON directory_links;
CREATE TRIGGER trg_directory_links_guard
  BEFORE INSERT OR UPDATE ON directory_links
  FOR EACH ROW EXECUTE FUNCTION directory_links_guard();

-- ── 3. "Which vendor rows are me" - one answer ────────────────────────────────
-- Mirrored by lib/vendor-identity.ts; both read ACTIVE links only, so a revoke
-- takes effect on the next request.
CREATE OR REPLACE FUNCTION sub_company_ids(actor_company uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
  SELECT actor_company
  UNION
  SELECT directory_company_id FROM directory_links
   WHERE sub_company_id = actor_company AND status = 'active'
$$;

-- ── 4. Who from the sub works a given GC job ─────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_crew (
  subcontract_id uuid NOT NULL REFERENCES subcontracts (id) ON DELETE CASCADE,
  profile_id     uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  added_by       uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subcontract_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_engagement_crew_profile ON engagement_crew (profile_id);

-- ── 5. A compliance document knows who FILED it ──────────────────────────────
-- Null on every existing row = filed by/for the GC, as today.
ALTER TABLE compliance_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_company_id uuid REFERENCES companies (id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Every route is service-role; these keep the anon/authenticated keys out.
ALTER TABLE directory_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_crew ENABLE ROW LEVEL SECURITY;
