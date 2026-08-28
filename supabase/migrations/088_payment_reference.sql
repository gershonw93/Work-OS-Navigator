-- 088: a payment's reference number is its own field, not part of the memo.
--
-- WHY. The form asked for "Memo / check #" - one box doing two jobs - so the
-- check number went to QuickBooks as the MEMO, and QuickBooks' Reference no.
-- got SN-25b82dff, our internal tracking id. Reference no. is the column a
-- bookkeeper matches against a bank statement, so it has to hold the check
-- number. QuickBooks keeps the two apart; now so do we.
--
-- Existing rows keep their memo and get a null reference on purpose. Today's
-- memos are a mix of check numbers ("check1005", "check # 1002") and prose
-- ("Deposit", "Draw 4", "Invoice INV-0004"), and a guess at which is which
-- would put the word "Deposit" in a bank-reconciliation column.

alter table client_payments
  add column if not exists reference text;

comment on column client_payments.reference is
  'The payer''s own reference - a check number, a wire confirmation. Sent to QuickBooks as Reference no. (PaymentRefNum / DocNumber). Falls back to SN-<id8> when blank so a record is never unmatchable.';
