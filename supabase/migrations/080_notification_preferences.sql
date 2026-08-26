-- ===== 080_notification_preferences.sql =====
-- What each person wants to be told about, and how.
--
-- Settings already had a Notifications tab with eight switches. It persisted
-- nothing: the PATCH handler ended in `void notifications`. Somebody could turn
-- an email off, see the switch move, reload, and find it back on - having been
-- told they had changed something they had not.
--
-- A MISSING ROW MEANS "use the default in lib/notifications.ts". Deliberate:
--   * nothing has to be backfilled for existing people
--   * a new notification type behaves correctly on the day it ships, instead
--     of being silently off for everybody who signed up before it existed
--   * the only rows here are decisions somebody actually made

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  type    text NOT NULL,
  in_app  boolean NOT NULL DEFAULT true,
  email   boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
  ON notification_preferences (user_id);

COMMENT ON TABLE notification_preferences IS
  'Per-person, per-type notification choices. Absence means "use the catalog default in lib/notifications.ts", so nothing needs backfilling.';

-- Two columns that exist in PRODUCTION but in no migration file.
--
-- `title` and `link` were added to the live database by hand at some point and
-- never written down, so the numbered migrations describe a schema that has not
-- been true for a while. lib/notify.ts writes both - a fresh environment built
-- from these files would have failed on the first notification.
--
-- IF NOT EXISTS makes this a no-op on production and a repair everywhere else.
-- `link` is also what every notification email depends on: a mail saying "you
-- have been assigned a task" with nowhere to click is worse than no mail.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN notifications.link IS
  'App-relative path this notification points at, e.g. /projects/<id>/tasks. NULL means there is nowhere specific to go.';
