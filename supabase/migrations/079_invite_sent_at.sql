-- ===== 079_invite_sent_at.sql =====
-- When the invite email actually went out.
--
-- Approving an access request minted a token and sent nothing - the link was
-- copied and pasted by hand - so there was no way to answer the only question
-- that matters when somebody says they never got in: was an email ever sent to
-- this person, and when?
--
-- NULL on an approved row means "approved, nothing delivered". That is a real
-- and expected state, not a fault: sending is best-effort and stays unset
-- while the sending domain is unauthenticated, or when a send fails and the
-- admin falls back to copying the link.

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;

COMMENT ON COLUMN access_requests.invite_sent_at IS
  'When the invite email was last successfully sent. NULL means never delivered - the link may still have been shared by hand.';
