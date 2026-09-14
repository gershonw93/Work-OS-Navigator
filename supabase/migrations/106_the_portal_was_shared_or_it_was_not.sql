-- ===== 106_the_portal_was_shared_or_it_was_not.sql =====
--
-- "I shared the client portal - this page is if you wanna send docs to
-- someone, and the final 10/10 is to share a file? It's off."
--
-- They had shared it. The setup checklist's last step, "Give the client their
-- link", was counting rows in `file_shares` - which is the SHARING TAB: sending
-- this job's paperwork to an expeditor, an architect, a lender. A different
-- feature, a different audience, a different table. The job in the report:
--
--   client_portal_token   set          <- the portal HAS been shared
--   file_shares           0            <- what the step was counting
--
-- A query against the wrong table comes back empty, and empty renders exactly
-- like "you have not done this yet" - the same fault as `contacts` vs
-- `companies`. The step's link went to the wrong place for the same reason: it
-- pointed at the Sharing tab, so pressing "Share the portal" landed on a page
-- about sending documents.
--
-- WHY A NEW COLUMN RATHER THAN `client_portal_token IS NOT NULL`. The share
-- dialog MINTS a token when there is not one, on open. So the token's existence
-- proves somebody opened the box, not that a client was ever given anything -
-- "a default is a claim", one table over. These columns are written only by the
-- code that actually hands the link over: a confirmed email send, or a copy.
--
-- `portal_shared_how` is 'email' or 'copy'. Nullable with no default, because a
-- row that has never been shared must not claim a method.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS portal_shared_at  timestamptz,
  ADD COLUMN IF NOT EXISTS portal_shared_how text;
