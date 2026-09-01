# Email: two senders, two keys

SyteNav sends mail two different ways, and they are configured in two different
places. Nearly every question about "why didn't that email arrive" comes from
not knowing which of the two a flow uses.

## The split

| Sent by | Which flows | Key lives in |
|---|---|---|
| **SendGrid, directly** (`lib/email.ts`) | Client portal links, quote requests, compliance requests, shared files, client invoices, notifications | `SENDGRID_API_KEY` in the app's environment (Vercel) |
| **Supabase Auth** | Team invites, password resets, signup confirmations | Supabase dashboard → Authentication → Emails → SMTP |

The three Supabase ones are:

- `app/api/invite/route.ts` — `inviteUserByEmail`
- `app/(auth)/forgot-password/page.tsx` — `resetPasswordForEmail`
- `app/(auth)/signup/page.tsx` — `signUp`

They do not touch `lib/email.ts` at all. Setting `SENDGRID_API_KEY` does nothing
for them.

## Why Supabase needs its own SMTP

Without custom SMTP, Supabase sends those three from its own built-in sender,
which is rate-limited to a handful per hour and is documented as being for
testing, not production. The invite route already expects this — it catches
`email rate limit` and records the invite with `emailSent: false`, and Settings →
Team & Users says "Recorded! Email may not have been sent" rather than claiming
success.

**Password reset is the one that actually hurts.** An invite that does not arrive
can be re-sent by an admin. A locked-out user who never gets a reset email has no
way in at all.

## Setting it up

### 1. A separate SendGrid key

SendGrid → Settings → API Keys → Create API Key.

- Name it `Supabase Auth SMTP`.
- **Restricted Access**, with **Mail Send** on Full Access and nothing else.
- Copy it immediately. SendGrid shows a key exactly once and cannot show it
  again — that is by design, not a setting. If you lose it, make another.

Use a key of its own rather than the app's. It can be revoked on its own without
taking down portal and invoice email, SendGrid attributes activity per key so
"did it send?" is answerable, and it needs only one permission.

### 2. Verify the sender

The From address has to be one SendGrid trusts or it refuses the send.

- **Preferred:** Domain Authentication on `sytenav.com` (Settings → Sender
  Authentication). Signs with DKIM and lets any address on the domain send.
- **Quicker:** Single Sender Verification of `noreply@sytenav.com`.

### 3. Supabase → Authentication → Emails → SMTP Settings

Field by field, as the screen presents them:

| Field | Value |
|---|---|
| Sender email address | `noreply@sytenav.com` |
| Sender name | `SyteNav` |
| Host | `smtp.sendgrid.net` |
| Port number | `587` (465 also works) |
| Minimum interval per user | `60` — leave it |
| Username | `apikey` |
| Password | the `SG.…` key from step 1 |

Three of these have a trap in them:

- **Username is the literal word `apikey`.** Not the key, not an email address,
  not your project name. Supabase pre-fills this box with the project name
  ("Work OS Navigator"), which looks plausible and is wrong. This is the step
  people get wrong.
- **Sender email must match what SendGrid verified, exactly.** `noreply@` and
  `no-reply@` are different addresses. If you domain-authenticated
  `sytenav.com`, any address on it works; if you used Single Sender
  Verification, only the one address you verified does.
- **Minimum interval per user** is a throttle between two emails to the *same*
  person, not an overall limit. At 60 it means a user who asks for a second
  password reset within a minute silently gets nothing. Fine in production,
  confusing while testing — if a repeat test "does not send", this is usually
  why.

Sender email and name match the defaults in `lib/email.ts`, so an invite looks
like every other mail the product sends. If you override `EMAIL_FROM` /
`EMAIL_FROM_NAME` in the app, change these to match or the two halves of the
product will mail from different addresses.

### 4. Raise the rate limit

Authentication → Rate Limits → emails per hour. It stays low after enabling
custom SMTP. SendGrid's own limit should be what binds, not Supabase's.

## Checking it worked

1. Invite a throwaway address from Settings → Team & Users. The UI tells the two
   outcomes apart, so this is a real test: "Invite sent" means it left,
   "Recorded! Email may not have been sent…" means SMTP is still wrong.
2. Request a password reset from `/forgot-password` for a real account. Test this
   one explicitly — it is the path with no workaround.
3. SendGrid → Activity should list both as Delivered, attributed to the
   `Supabase Auth SMTP` key. **This is the step that proves it.** Mail arriving
   is not proof on its own; Supabase falling back to its built-in sender looks
   identical from the inbox.
4. Send more than a handful in an hour to confirm the old ceiling is gone.
