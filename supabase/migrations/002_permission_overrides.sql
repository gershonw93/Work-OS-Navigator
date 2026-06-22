-- Per-user permission overrides.
-- Effective permission = role default (defined in code) unless a value here overrides it.
-- Shape: { "<resource>": { "view": true, "create": false, ... }, ... }
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permission_overrides jsonb DEFAULT '{}'::jsonb;
