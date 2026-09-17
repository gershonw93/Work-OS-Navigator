-- ===== 111_link_team_members_to_profiles.sql =====
-- Attach existing project_team_members rows to the profiles they describe.
--
-- WHY. A GC builds a project team by typing a name and an email, weeks before
-- anybody signs in, and nothing in the app ever wrote `profile_id` back when
-- they did. 64 of 73 live rows had it empty, so every assigned-only screen -
-- the projects list, its stats, the permission layer, the field feeds - was
-- resolving people by matching strings.
--
-- That cost two things. A capital letter in a typed address ("Jay@..." beside
-- "jay@...") meant NO match, so a field supervisor saw no projects and no
-- error explaining it. And the fallback that matched on NAME ran against the
-- whole table with no company filter, so a namesake at another GC was handed
-- that company's project - 8 such matches existed in this database across 2
-- names.
--
-- EMAIL ONLY, and case-insensitively. An address is an identity: if somebody
-- typed it onto a project team they meant that person, whoever owns the job -
-- which is how a sub or a vendor legitimately appears on a GC's project. A
-- NAME IS NOT A KEY and is deliberately not used here; a row with no email
-- keeps resolving by name, now scoped to its own company.
--
-- Only rows that are not already claimed, so a deliberate link is never
-- overwritten. Idempotent: re-running links nothing new.

UPDATE project_team_members tm
   SET profile_id = p.id
  FROM profiles p
 WHERE tm.profile_id IS NULL
   AND tm.email IS NOT NULL
   AND btrim(tm.email) <> ''
   AND p.email IS NOT NULL
   AND lower(btrim(tm.email)) = lower(btrim(p.email))
   -- A duplicated address across two profiles cannot be resolved to one
   -- person, and guessing is exactly the failure this migration exists to
   -- end. Those rows keep matching by string until somebody sorts them out.
   AND (SELECT count(*) FROM profiles p2
         WHERE p2.email IS NOT NULL
           AND lower(btrim(p2.email)) = lower(btrim(tm.email))) = 1;

-- The lookup this makes hot: "which rows are this person's?"
CREATE INDEX IF NOT EXISTS idx_project_team_members_profile_id
  ON project_team_members (profile_id);
