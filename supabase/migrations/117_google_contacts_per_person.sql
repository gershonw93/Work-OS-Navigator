-- ===== 117_google_contacts_per_person.sql =====
-- Google Contacts belong to the PERSON who connected them, until they file one.
--
-- WHY. Migration 112 made the connection and the staging list per COMPANY:
-- one admin connected their Google account, and every name, email and phone
-- number in their address book - family, doctor, everybody - appeared in a
-- list that anyone signed in at the company could open, label and import.
-- Asked, once that was noticed: "private until filed". Each person connects
-- their own Google account, sees only their own list, and a contact becomes
-- shared only when its owner imports it into the Directory.
--
-- Every existing row has an owner: a connection's `connected_by`, and for a
-- staged row whose company has since disconnected, the person who imported it.

-- ── the connection: one per PERSON ──────────────────────────────────────────
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS profile_id uuid;
UPDATE google_connections SET profile_id = connected_by WHERE profile_id IS NULL;
-- A connection nobody owns cannot be anybody's; its tokens are dropped.
DELETE FROM google_connections WHERE profile_id IS NULL;
ALTER TABLE google_connections ALTER COLUMN profile_id SET NOT NULL;
-- CASCADE: these are one person's Google tokens. When the person goes, the
-- access to their phone book goes with them - the opposite of 112's SET NULL,
-- which was right only while the connection was the company's.
ALTER TABLE google_connections DROP CONSTRAINT IF EXISTS google_connections_profile_id_fkey;
ALTER TABLE google_connections ADD CONSTRAINT google_connections_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE;
ALTER TABLE google_connections DROP CONSTRAINT IF EXISTS google_connections_pkey;
ALTER TABLE google_connections ADD CONSTRAINT google_connections_pkey PRIMARY KEY (profile_id);
CREATE INDEX IF NOT EXISTS idx_google_connections_company ON google_connections (company_id);

-- ── the staging list: one per PERSON ────────────────────────────────────────
ALTER TABLE google_contact_imports ADD COLUMN IF NOT EXISTS owner_id uuid;
UPDATE google_contact_imports i
   SET owner_id = COALESCE(
     (SELECT c.profile_id FROM google_connections c WHERE c.company_id = i.company_id LIMIT 1),
     i.imported_by)
 WHERE owner_id IS NULL;
DELETE FROM google_contact_imports WHERE owner_id IS NULL;
ALTER TABLE google_contact_imports ALTER COLUMN owner_id SET NOT NULL;
-- CASCADE: an unfiled contact is a line from one person's private phone book.
-- What they IMPORTED lives on in `companies` - only the staging row goes (and
-- with it the Directory's "came from Google" tag on that contact).
ALTER TABLE google_contact_imports DROP CONSTRAINT IF EXISTS google_contact_imports_owner_id_fkey;
ALTER TABLE google_contact_imports ADD CONSTRAINT google_contact_imports_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE;

-- ONE ROW PER GOOGLE PERSON PER OWNER. Two people at one company can both have
-- the same electrician in their phones; each sees their own copy.
DROP INDEX IF EXISTS idx_google_contact_imports_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_contact_imports_owner_unique
  ON google_contact_imports (owner_id, resource_name);
DROP INDEX IF EXISTS idx_google_contact_imports_company_status;
CREATE INDEX IF NOT EXISTS idx_google_contact_imports_owner_status
  ON google_contact_imports (owner_id, status);
