-- ===== 054_auto_logout.sql =====
-- Company security policy: sign users out after this many minutes of
-- inactivity. 0 = never (default, matches current behavior).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_logout_minutes integer NOT NULL DEFAULT 0;
