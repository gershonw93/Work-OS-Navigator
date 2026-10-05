-- THE COMP SENTENCE WAS WRITTEN FOR US AND SHOWN TO THEM.
--
-- Migration 118 comped every company that was in the product before billing
-- existed, with:
--
--   comped_reason  = 'Beta - in the product before billing existed, free while they are in it'
--   comped_by_name = 'Migration 118'
--
-- Both of those render in Settings -> Billing, under a gift icon, to the
-- customer - on the web as well as in the app. All twenty rows carry them, so
-- it is not an edge case: it is what every SyteNav customer has been reading.
-- "free while THEY are in it" is the tell - that sentence is written ABOUT the
-- customer, for the staff console, and it ended up addressed TO them.
--
-- `comped_reason` was one column doing two jobs: the audit answer to "why has
-- this company never been charged", and a sentence somebody reads about their
-- own account. This fixes the half that is customer-facing.
--
-- THE ATTRIBUTION IS NOT TOUCHED. `comped_by_name` stays as it is, because
-- /admin/billing prints it and that is where the audit belongs - with
-- `comped_at`, "Migration 118" still answers the question six weeks later. The
-- route stops SENDING it to a customer instead: `comped_by` (the FK to
-- profiles) is NULL on a machine-written comp and set on one a person granted,
-- so a real name still shows and a migration's does not.
--
-- Matched on the old sentence rather than on status, so this is idempotent and
-- cannot overwrite a reason somebody has since typed by hand in the console.
UPDATE company_billing
SET comped_reason = 'Beta - free while you''re in it',
    updated_at = NOW()
WHERE comped_reason = 'Beta - in the product before billing existed, free while they are in it';
