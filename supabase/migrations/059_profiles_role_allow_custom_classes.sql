-- ===== 059_profiles_role_allow_custom_classes.sql =====
-- profiles.role had a CHECK constraint listing a fixed set of roles. That
-- predates two things:
--   1. the 'worker' role (the mobile field-view role, labeled "Field Worker"),
--      which was never added to the list, and
--   2. custom classes (company_roles), whose keys are generated at runtime
--      as custom_<slug>_<rand> and therefore can never be enumerated here.
-- Assigning either one failed with "violates check constraint
-- profiles_role_check".
--
-- A static CHECK is fundamentally incompatible with user-defined roles, so
-- drop it. Validation lives in the API instead (see isAssignableRole in
-- app/api/settings/members/[memberId]/route.ts): a role must be a built-in
-- from lib/permissions.ts or a company_roles row belonging to that company.
-- Anything unrecognized still resolves to no-access via resolveRoleBase(),
-- so an unexpected value fails closed rather than granting access.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Keep a NOT NULL-ish guarantee without constraining the value set: a blank
-- role should fall back to the view-only default rather than being stored.
UPDATE profiles SET role = 'read_only' WHERE role IS NULL OR btrim(role) = '';
