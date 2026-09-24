-- AN INVITE LINK THAT REALLY IS GOOD ONCE.
--
-- The email has always said so - "The link is personal to you and only works
-- once" (lib/email.ts) - and nothing enforced either half. `invite_token` was
-- matched on and never cleared, and the email box on the create-account form
-- was editable, so one forwarded link minted unlimited accounts under any
-- address, each one a new company with its own free trial.
--
-- COPY IS A SPEC. The sentence was the promise; this column is what makes it
-- true.
--
-- NULLABLE, and null means "not used yet". A timestamp rather than a boolean
-- because the admin console has to be able to say WHEN somebody signed up -
-- "used" on its own cannot tell a link burnt this morning from one burnt in
-- June, which is the question asked when a customer says the link did not work.
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS invite_used_at TIMESTAMPTZ;

-- Stamped only once the profile exists, never at the point the token is read:
-- a signup that dies half way must leave the link usable, or the way to
-- recover from our own error is to ask us for a new invite.
COMMENT ON COLUMN access_requests.invite_used_at IS
  'When this invite was redeemed into an account. Null means unused. Stamped after the profile is written, never before.';
