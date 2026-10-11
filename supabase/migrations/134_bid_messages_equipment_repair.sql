-- Two small things, one migration.
--
-- 1. QUOTE MESSAGES. A sub with a question about a quote request could only
--    pick up the phone: the /bid/<token> page takes a price and nothing else.
--    One thread per invite - the sub and the GC who asked them - and the sub
--    side is only open to somebody with a (free) account, because a message
--    needs somebody to be told when the answer comes back, and a link with no
--    person behind it cannot be.
--
--    CASCADE from the invite: removing an invite already kills the sub's link,
--    and a conversation about a request they can no longer open has nowhere to
--    be read. The author is SET NULL - the record of what was said outlives the
--    account that said it - so `author_name` is written beside it.

CREATE TABLE IF NOT EXISTS bid_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_invite_id uuid NOT NULL REFERENCES bid_invites (id) ON DELETE CASCADE,
  bid_request_id uuid NOT NULL REFERENCES bid_requests (id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('gc', 'sub')),
  author_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bid_messages_invite ON bid_messages (bid_invite_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bid_messages_request ON bid_messages (bid_request_id);
ALTER TABLE bid_messages ENABLE ROW LEVEL SECURITY;

-- 2. EQUIPMENT THAT NEEDS FIXING. `status` already had 'maintenance' and
--    'retired' and no control anywhere could set either. "Needs repair" is a
--    FLAG, not a status: a saw with a wobbling fence is still on site in
--    somebody's hands, and the question "is it broken" is a different one from
--    "where is it". 'maintenance' stays the status for "away being fixed".

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_needed_at timestamptz;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_note text;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_reported_by uuid REFERENCES profiles (id) ON DELETE SET NULL;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_reported_by_name text;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS serial_number text;

-- Whatever the status says is now one of four, and nothing else.
DO $$ BEGIN
  ALTER TABLE equipment ADD CONSTRAINT equipment_status_check
    CHECK (status IN ('available', 'checked_out', 'maintenance', 'retired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The condition it came back in, on the check-in itself.
ALTER TABLE equipment_assignments ADD COLUMN IF NOT EXISTS return_condition text;
DO $$ BEGIN
  ALTER TABLE equipment_assignments ADD CONSTRAINT equipment_assignments_return_condition_check
    CHECK (return_condition IS NULL OR return_condition IN ('ok', 'needs_repair'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- What happened to it that was not a checkout: flagged, fixed, sent away,
-- retired, brought back. A flag that is cleared without a record is half an
-- audit trail - a retraction is an event too.
CREATE TABLE IF NOT EXISTS equipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('repair_flagged', 'repaired', 'sent_for_repair', 'retired', 'reactivated')),
  note text,
  actor_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment ON equipment_events (equipment_id, created_at);
ALTER TABLE equipment_events ENABLE ROW LEVEL SECURITY;
