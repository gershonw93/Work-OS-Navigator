-- 170: Service calls and dispatch - a sub runs his own business in SyteNav.
--
-- Spec "Sub company login + dispatch", items 3-5 (Nov 24, 2026). A pool guy,
-- an HVAC tech, an electrician takes a call, puts a crew member on it, and the
-- crew member drives there, works it and closes it out from a phone.
--
-- THE RULES THE SCHEMA CARRIES:
--   - A call belongs to the SUB's company (`company_id`, CASCADE - a call is a
--     fact about that business alone).
--   - A call tied to a GC's job is a LINK only (`gc_project_id`, SET NULL):
--     the job stays the GC's, the call stays the sub's. The GC reads its
--     status through one narrow route and never these tables.
--   - Crew see only calls assigned to them - enforced by the routes, which are
--     service-role, so every table has RLS ON and NO policies: the browser
--     cannot read a row of any of them.
--   - One assignee per call (`assigned_to`, SET NULL so a departed crew member
--     leaves the call unassigned rather than taking it with him).
--   - No money. A call carries no price, so there is nothing for a GC to see
--     by accident; invoicing a call is a status, not an amount.
--
-- ADDITIVE ONLY: new tables, nothing existing changes.

CREATE TABLE IF NOT EXISTS service_calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  call_number      integer NOT NULL,
  customer_id      uuid REFERENCES customers (id) ON DELETE SET NULL,
  customer_name    text NOT NULL,
  site_address     text NOT NULL,
  -- From the address, once, at create/edit (lib/geocode.ts). Null when the
  -- address could not be placed: the punch then says the site is unmapped
  -- rather than measuring against a guess (lib/punch-location.ts).
  site_lat         double precision,
  site_lng         double precision,
  contact_name     text,
  contact_phone    text,
  contact_email    text,
  issue            text NOT NULL,
  priority         text NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  -- `new` is the state a call STARTS in. Every other state is written by the
  -- route that does the thing it names (lib/service-calls.ts).
  status           text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'scheduled', 'en_route', 'on_site', 'done', 'invoiced')),
  source           text NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'gc_job')),
  gc_project_id    uuid REFERENCES projects (id) ON DELETE SET NULL,
  notes            text,
  assigned_to      uuid REFERENCES profiles (id) ON DELETE SET NULL,
  scheduled_start  timestamptz,
  scheduled_end    timestamptz,
  completion_notes text,
  completed_at     timestamptz,
  completed_by     uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_by       uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_calls_window CHECK (
    scheduled_start IS NULL OR scheduled_end IS NULL OR scheduled_end > scheduled_start
  ),
  CONSTRAINT service_calls_number_unique UNIQUE (company_id, call_number)
);
CREATE INDEX IF NOT EXISTS service_calls_company_status_idx ON service_calls (company_id, status);
CREATE INDEX IF NOT EXISTS service_calls_assignee_idx ON service_calls (assigned_to, scheduled_start);
CREATE INDEX IF NOT EXISTS service_calls_gc_project_idx ON service_calls (gc_project_id) WHERE gc_project_id IS NOT NULL;
ALTER TABLE service_calls ENABLE ROW LEVEL SECURITY;

-- The history of a call: created, assigned, every status move, notes and
-- photos. A status a GC is shown is read from the call; this is the record of
-- how it got there, and a retraction (a move BACK) is an event too.
CREATE TABLE IF NOT EXISTS service_call_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid NOT NULL REFERENCES service_calls (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('created', 'assigned', 'unassigned', 'status', 'note', 'photo', 'punch_in', 'punch_out')),
  status      text,
  note        text,
  actor_id    uuid REFERENCES profiles (id) ON DELETE SET NULL,
  actor_name  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_call_events_call_idx ON service_call_events (call_id, created_at);
ALTER TABLE service_call_events ENABLE ROW LEVEL SECURITY;

-- Time on a call, with where the phone was. Its own table rather than a row in
-- time_entries, whose project_id every timesheet screen and export reads: a
-- call has no project, and a NULL there is a timesheet row nobody can place.
CREATE TABLE IF NOT EXISTS service_call_time (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id      uuid NOT NULL REFERENCES service_calls (id) ON DELETE CASCADE,
  -- SET NULL with the name kept: a record of work outlives the attribution.
  profile_id   uuid REFERENCES profiles (id) ON DELETE SET NULL,
  person_name  text,
  clock_in     timestamptz NOT NULL DEFAULT now(),
  clock_out    timestamptz,
  in_lat       double precision,
  in_lng       double precision,
  in_accuracy  double precision,
  in_fix       text CHECK (in_fix IS NULL OR in_fix IN ('ok', 'far', 'no_fix', 'no_site')),
  out_lat      double precision,
  out_lng      double precision,
  out_accuracy double precision,
  out_fix      text CHECK (out_fix IS NULL OR out_fix IN ('ok', 'far', 'no_fix', 'no_site')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_call_time_order CHECK (clock_out IS NULL OR clock_out >= clock_in)
);
-- One open punch per person: two taps on Clock in are one punch, not two.
CREATE UNIQUE INDEX IF NOT EXISTS service_call_time_one_open
  ON service_call_time (profile_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS service_call_time_call_idx ON service_call_time (call_id);
ALTER TABLE service_call_time ENABLE ROW LEVEL SECURITY;

-- Photos, in the daily-log-photos bucket under service-calls/<company>/<call>/.
-- The PATH is stored, never a signed URL: a URL is signed fresh on every read.
CREATE TABLE IF NOT EXISTS service_call_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id       uuid NOT NULL REFERENCES service_calls (id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text,
  uploaded_by   uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_call_photos_call_idx ON service_call_photos (call_id);
ALTER TABLE service_call_photos ENABLE ROW LEVEL SECURITY;
