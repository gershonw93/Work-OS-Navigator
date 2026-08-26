-- ===== 081_merge_bid_packages.sql =====
-- Fold the old bidding system into the live one.
--
-- There were two, and only age explains it:
--
--   bid_packages / bid_invitations / bids        migration 001
--   bid_requests / bid_invites / bid_submissions migration 024
--
-- 001 assumed every sub has an account: bid_invitations has a company_id and
-- nothing else - no token, no email. 024 exists precisely because that was
-- wrong, and nobody merged them. The Bids tab and the Quotes tab were the same
-- job under two names, in two different sections of the app.
--
-- THE DATA DECIDES THE DIRECTION. At the time of writing:
--   old: 5 packages, 3 invitations, 4 bids - last real bid 2026-06-24
--   new: 19 requests, 50 invites, 35 submissions - active yesterday
-- So this is not a reconciliation of two live systems. It is moving twelve
-- rows into the one people actually use.
--
-- NOTHING IS DROPPED. The old tables keep every row; a later change can remove
-- them once this has been live for a while. A migration that deletes is not one
-- you can walk back in a hurry.
--
-- Idempotent via legacy_id: re-running inserts nothing twice.

ALTER TABLE bid_requests    ADD COLUMN IF NOT EXISTS legacy_package_id uuid;
ALTER TABLE bid_invites     ADD COLUMN IF NOT EXISTS legacy_invitation_id uuid;
ALTER TABLE bid_submissions ADD COLUMN IF NOT EXISTS legacy_bid_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_requests_legacy    ON bid_requests (legacy_package_id)    WHERE legacy_package_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_invites_legacy     ON bid_invites (legacy_invitation_id)  WHERE legacy_invitation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_submissions_legacy ON bid_submissions (legacy_bid_id)     WHERE legacy_bid_id IS NOT NULL;

-- ── Packages become requests ────────────────────────────────────────────────
--
-- FOUR STATUS VOCABULARIES FOR TWO CONCEPTS, which is its own evidence of the
-- split. Mapped rather than force-fitted:
--
--   bid_packages    draft | open | closed | awarded
--   bid_requests    open | closed
--   bid_invitations invited | accepted | declined
--   bid_invites     invited | viewed | submitted | declined
--
-- 'awarded' and 'draft' have no home on bid_requests. An awarded package is
-- finished taking prices, so it becomes 'closed' - the award itself lives on
-- quote_comparisons.awarded_subcontract_id, not on this column. A draft was
-- never opened, so 'open' would be a lie and 'closed' is the honest answer.
-- `scope` was the package's name, so it becomes `title`. Everything else maps
-- one to one: package_type, material_by, included, excluded, ask_for and
-- item_list were back-ported onto both tables at some point, which is its own
-- evidence that these were always meant to be one thing.
INSERT INTO bid_requests (
  project_id, title, trade, description, due_date, status, created_at,
  package_type, material_by, included, excluded, ask_for, item_list,
  legacy_package_id
)
SELECT
  bp.project_id,
  COALESCE(NULLIF(bp.scope, ''), 'Untitled package'),
  bp.trade, bp.description, bp.due_date,
  CASE bp.status
    WHEN 'awarded' THEN 'closed'
    WHEN 'draft'   THEN 'closed'
    WHEN 'closed'  THEN 'closed'
    ELSE 'open'
  END,
  bp.created_at,
  bp.package_type, bp.material_by, bp.included, bp.excluded, bp.ask_for, bp.item_list,
  bp.id
FROM bid_packages bp
WHERE NOT EXISTS (SELECT 1 FROM bid_requests r WHERE r.legacy_package_id = bp.id);

-- ── Invitations become invites, and finally get a way to reach somebody ─────
-- THIS IS THE POINT OF THE WHOLE MIGRATION. A bid_invitation is a company_id
-- and nothing more, so an invited sub without a SyteNav account was invited and
-- never told, with no link to open even if they had been. Each one now gets a
-- token and whatever contact address the company has on file.
INSERT INTO bid_invites (
  bid_request_id, token, vendor_company_id, vendor_name, vendor_email,
  status, invited_at, legacy_invitation_id
)
SELECT
  r.id,
  encode(gen_random_bytes(16), 'hex'),
  bi.company_id,
  c.name,
  NULLIF(c.contact_email, ''),
  -- 'accepted' means the sub said they would price it, which is engagement
  -- short of a submission - 'viewed' is the nearest true thing on this table.
  CASE bi.status WHEN 'accepted' THEN 'viewed' WHEN 'declined' THEN 'declined' ELSE 'invited' END,
  bi.invited_at,
  bi.id
FROM bid_invitations bi
JOIN bid_requests r ON r.legacy_package_id = bi.bid_package_id
LEFT JOIN companies c ON c.id = bi.company_id
WHERE NOT EXISTS (SELECT 1 FROM bid_invites v WHERE v.legacy_invitation_id = bi.id);

-- ── Bids become submissions ─────────────────────────────────────────────────
-- Deliberately NOT carried: duration_days, crew_size, earliest_start_date,
-- payment_terms, scope_categories, revision_note. /bid/<token> collects none of
-- them, so they are aspirational columns on four stale rows. "How long, and
-- when can you start" is a good question to ask a sub - it is logged in
-- BACKLOG.md as a feature rather than smuggled in as a migration.
INSERT INTO bid_submissions (
  bid_request_id, bid_invite_id, amount, notes, file_url, file_name,
  submitted_by_name, created_at, priced_items, legacy_bid_id
)
SELECT
  r.id,
  v.id,
  b.amount,
  b.notes,
  b.proposal_url,
  CASE WHEN b.proposal_url IS NOT NULL THEN 'proposal' ELSE NULL END,
  c.name,
  COALESCE(b.submitted_at, b.created_at),
  b.priced_items,
  b.id
FROM bids b
JOIN bid_requests r ON r.legacy_package_id = b.bid_package_id
LEFT JOIN bid_invites v ON v.bid_request_id = r.id AND v.vendor_company_id = b.company_id
LEFT JOIN companies c ON c.id = b.company_id
WHERE NOT EXISTS (SELECT 1 FROM bid_submissions s WHERE s.legacy_bid_id = b.id);

COMMENT ON COLUMN bid_requests.legacy_package_id IS
  'The bid_packages row this came from in migration 081. NULL for anything created since.';
