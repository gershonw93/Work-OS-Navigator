-- Company-wide "secret delete key": when enabled, deleting important records
-- (money + files) requires entering the key. Toggleable per company.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS delete_protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delete_key_hash TEXT;
