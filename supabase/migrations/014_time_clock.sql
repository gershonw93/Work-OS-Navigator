-- Worker time clock: auto-timestamped punches, GPS distance check (flag, not block),
-- and a required selfie at punch so no one clocks in for someone else.

-- Cache geocoded job-site coordinates on the project.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles (id) ON DELETE SET NULL,
  worker_name TEXT,

  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_in_lat DOUBLE PRECISION,
  clock_in_lng DOUBLE PRECISION,
  clock_in_distance_m INTEGER,
  clock_in_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  clock_in_selfie_url TEXT,

  clock_out_at TIMESTAMPTZ,
  clock_out_lat DOUBLE PRECISION,
  clock_out_lng DOUBLE PRECISION,
  clock_out_distance_m INTEGER,
  clock_out_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  clock_out_selfie_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_profile ON time_entries (profile_id);
