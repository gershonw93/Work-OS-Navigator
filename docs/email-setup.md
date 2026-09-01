# Email: one sender, and a fallback

Every email SyteNav sends goes out through **SendGrid, from the app**, using
`SENDGRID_API_KEY` in the Vercel environment. There is nothing to configure
anywhere else for mail to work.

Supabase Auth has its own SMTP settings, and they are a **fallback only** —
used when `SENDGRID_API_KEY` is unset. Worth configuring so the fallback works,
but nothing depends on them day to day.

| Sent by | Which flows |
|---|---|
| SendGrid, via `lib/email.ts` | Client portal links, quote requests, compliance requests, shared files, client invoices, notifications, **team invites**, **password resets** |
| Supabase Auth SMTP | Only when `SENDGRID_API_KEY` is unset |

## How it got this way

Team invites (#351) and password resets (#352) used to be handed to Supabase
Auth to deliver. That needed custom SMTP configured in the Supabase dashboard —
a second mail setup, separate from `SENDGRID_API_KEY`, that nothing in this repo
could see, test, or report on.

The result was a working mail path and a broken one at the same time: a manual
SendGrid send to an address arrived while every invite to that same address
vanished, and nothing on screen could say which half was at fault, because the
app only owned one of them.

Both now mint their link with `generateLink` — which returns the link and sends
nothing — and mail it themselves. **Password reset was the one that mattered
most:** an invite that does not arrive can be re-sent by an admin, but somebody
locked out of their account has no way in and no way to tell anybody.

**Signup confirmation never applied here.** Sign-up is invite-only, and
`app/(auth)/signup/page.tsx` calls `signInWithPassword` immediately after
`signUp` — which fails outright if a project requires email confirmation. So
confirmations are off and there is no confirmation email to move. Turn them on
and this paragraph becomes wrong.

## Two things the app now owns

Taking those flows over meant taking on two things Supabase's mailer had been
doing quietly.

**`/api/auth/reset-password` is throttled, per address, 60 seconds.** It is an
unauthenticated endpoint that sends email; without a limit it is a way to
mail-bomb any address somebody can guess, on your SendGrid quota. The record is
`password_reset_throttle` (migration 093) and the claim is written *before* the
send, so two simultaneous requests cannot both pass the check. If that table is
ever missing, the route hands the send back to Supabase's rate-limited mailer
rather than carrying on unthrottled.

**It never reveals whether an account exists.** Every outcome — unknown address,
throttled, SendGrid down, link refused — returns the same answer. An endpoint
that responds differently for a real address is a way to test who uses this
product, one address at a time. That is why the reasons go to the server log and
not to the screen.

## When mail does not arrive

**Check SendGrid → Activity first**, and note that invites and resets are
attributed to the **app's** `SENDGRID_API_KEY`, not to the fallback key below.

- **Nothing listed at all** — the app never reached SendGrid. Check
  `SENDGRID_API_KEY` is set in Vercel.
- **Bounced or Dropped** — SendGrid sent it and the address refused it. Usually
  the mailbox does not exist: a domain used only for a website has no mailboxes
  on it, so every address there bounces however perfect the config is. Test with
  a Gmail address to separate "config is wrong" from "that mailbox is not real".
- **Delivered** — it is in a spam folder, or forwarding somewhere you are not
  looking.

Then, per flow:

- **An invite.** Settings → Team & Users reports the outcome honestly: "Invite
  sent" means it left; anything else carries SendGrid's own error text, which
  names the problem (e.g. *"The from address does not match a verified Sender
  Identity"*). **Copy link** on the pending invite works regardless of email —
  paste it into your own message and the person can still get in.
- **A password reset.** The page cannot tell you anything, by design (see
  above). Look for `[reset-password]` in the Vercel logs; SendGrid's own words
  are there.

## Configuring the Supabase fallback

Only needed so the fallback works. Skip it and everything still sends.

### 1. A separate SendGrid key

SendGrid → Settings → API Keys → Create API Key.

- Name it `Supabase Auth SMTP`.
- **Restricted Access** (SendGrid labels it *Custom Access* on the create
  screen), with **Mail Send** on Full Access and nothing else.
- Copy it immediately. SendGrid shows a key exactly once and cannot show it
  again — that is by design, not a setting. If you lose it, make another.

A key of its own can be revoked without taking down the app's mail, and SendGrid
attributes activity per key, so "did it send?" stays answerable.

### 2. Verify the sender

The From address has to be one SendGrid trusts or it refuses the send.

- **Preferred:** Domain Authentication on `sytenav.com` (Settings → Sender
  Authentication). Signs with DKIM and lets any address on the domain send.
- **Quicker:** Single Sender Verification of one address.

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

Sender email and name match the defaults in `lib/email.ts`, so a fallback send
looks like every other mail the product sends. If you override `EMAIL_FROM` /
`EMAIL_FROM_NAME` in the app, change these to match.

### 4. Raise the rate limit

Authentication → Rate Limits → emails per hour. It stays low after enabling
custom SMTP. SendGrid's own limit should be what binds, not Supabase's.

## A note on CRON_SECRET

Unrelated to email except that the daily job sends some: `CRON_SECRET` must be
set in the Vercel project's environment (Settings → Environment Variables, all
three environments). Generate one with:

```
openssl rand -base64 32
```

`/api/cron/compliance-reminders` refuses to run without it, returning a 503 that
says so. Vercel attaches the value to its own scheduled invocations
automatically, so setting the variable is the only step — there is nothing to
paste into the cron config.
