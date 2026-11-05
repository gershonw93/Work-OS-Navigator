# Inbound email: the township's reply lands on the permit

Every permit sent with **Email it** carries its own reply address,
`permit-<token>@reply.sytenav.com`. The token is random (16 characters),
minted once per permit and stored in `permits.reply_token` - never the permit
id, so an address cannot be guessed from another one.

When a reply arrives, SendGrid Inbound Parse posts it to
`/api/inbound/email`, which:

1. refuses anything without the shared key in the URL (`?key=`), before the
   body is read;
2. finds the permit by the token in the recipients - an unknown address is
   answered 200 and dropped, so SendGrid does not retry it;
3. **stores the email first** (`permit_inbound_emails`, unique on the
   Message-ID so a retry is a no-op), plain text only - never the HTML;
4. saves up to 10 attachments (15 MB each) to the `permits` bucket;
5. forwards a copy to the person who sent the permit, reply-to the township;
6. asks AI for a suggested answer (one metered `permit-reply` scan) - stored
   as a suggestion, **never recorded**. A person presses Use this answer.

Until both env vars below are set, Email it uses the sender's own address as
the reply-to, exactly as before.

## Setup

1. **DNS** (wherever sytenav.com's DNS is managed): add an MX record
   - host `reply` (i.e. `reply.sytenav.com`)
   - value `mx.sendgrid.net`, priority `10`.

   Do NOT touch the root domain's MX - that is the normal mailbox.
2. **SendGrid -> Settings -> Inbound Parse -> Add Host & URL**
   - subdomain `reply`, domain `sytenav.com`
   - URL `https://www.sytenav.com/api/inbound/email?key=<INBOUND_EMAIL_KEY>`
   - leave "POST the raw, full MIME message" UNTICKED (the route reads the
     parsed fields).

   sytenav.com must already be authenticated under Sender Authentication.
3. **Vercel -> project -> Settings -> Environment Variables** (Production):
   - `REPLY_DOMAIN=reply.sytenav.com`
   - `INBOUND_EMAIL_KEY=<random, at least 16 characters - the same value as in the URL>`

   Then redeploy - env vars reach only a new deployment.
4. **Test**: Email it a permit to your own address, reply from that inbox
   with a PDF attached. Within a minute the permit shows the reply under
   Replies, with a suggestion, and a forwarded copy reaches the sender.

## Rotating the key

Change `INBOUND_EMAIL_KEY` in Vercel and the URL in SendGrid together, then
redeploy. Mail arriving between the two is refused with 401 and SendGrid
retries it for up to three days.
