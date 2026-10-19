# QuickBooks Online on production

Step 2 of the QuickBooks work: take the one-way push from the Intuit sandbox to
real QuickBooks companies. This file has three parts: where things stand, what
to enter in Intuit's production form, and the pilot to run once keys exist.

## Where it stands (checked 19 Oct 2026)

| Question | Answer | How it was checked |
| --- | --- | --- |
| Production keys in Vercel? | **Almost certainly not.** | The Vercel connector could not list env vars (403), so this is inferred from the data. The only QuickBooks connection ever made is `environment = sandbox` (realm 9341454915437215, "Sandbox Company_US_1"). Production code last refreshed its token on 8 Oct, and the callback stamps `QBO_ENV` onto every connection, so production runs `QBO_ENV=sandbox` with Development keys. |
| Intuit app status / review stage | **Unknown from here.** | developer.intuit.com does not resolve from the build container, and there is no Intuit login in this session. Check: Intuit Developer → your app → **Keys & credentials → Production**. |
| Privacy policy covers QuickBooks | **Yes, as of this change** | `/privacy` → "QuickBooks data" |
| Terms / EULA cover QuickBooks | **Yes, as of this change** | `/terms` → "QuickBooks Online" |
| Disconnect landing page | **Yes, as of this change** | `/auth/quickbooks/disconnected` |
| Scopes | `com.intuit.quickbooks.accounting` only | `lib/quickbooks.ts` `SCOPES` |

What you need to tell me (or check yourself): whether the Production section
of the Intuit app shows the questionnaire not started, in review, or keys issued.

## What Intuit asks for, and what to enter

As I understand Intuit's process (the portal is the source of truth if it
differs): production keys are issued after you complete the app profile and
the **app assessment questionnaire** under Keys & credentials → Production.
Listing on the QuickBooks App Store is a separate, optional, longer review.
SyteNav does not need the listing to connect its own customers' QuickBooks
companies.

Replace `APP` below with the app's real origin: `NEXT_PUBLIC_APP_URL` if set
(`https://app.sytenav.com`), otherwise `https://www.sytenav.com`. The Settings
card prints the exact redirect URI while QuickBooks is not configured, so you
can copy it from there.

| Intuit field | Value |
| --- | --- |
| Host domain | `sytenav.com` (plus `app.sytenav.com` if the app host is live) |
| Launch URL | `APP/settings?tab=integrations` |
| Connect / Reconnect URL | `APP/settings?tab=integrations` |
| Disconnect URL | `APP/auth/quickbooks/disconnected` |
| Redirect URI (Production) | `APP/api/quickbooks/callback`. **Must match exactly.** |
| End-user license agreement URL | `https://www.sytenav.com/terms` |
| Privacy policy URL | `https://www.sytenav.com/privacy` |
| Scopes | Accounting only |
| Platform | Web (plus the iOS app, which opens the same web flow in Safari) |
| Category | Construction / project management |
| Where hosted | Vercel (US), database on Supabase (US) |

Answers for the security part of the questionnaire, each true of the code:

- **OAuth 2.0 with a `state` parameter.** It is single-use, tied to the
  company, and deleted on return (`quickbooks_oauth_states`).
- **Tokens are stored server-side only and encrypted at rest** with AES-256-GCM,
  using a key held only in the environment (`lib/qbo-token-crypto.ts`). They
  are never sent to a browser or device.
- **Tokens refresh automatically** before they expire, and a daily job renews
  every sign-in (`/api/cron/quickbooks-refresh`). If Intuit refuses a refresh,
  the account sees "Reconnect QuickBooks".
- **Disconnecting revokes the token with Intuit** (`/v2/oauth2/tokens/revoke`)
  and then deletes it here.
- **Only a company admin can connect or disconnect.**
- **One QuickBooks company per SyteNav account**, and one SyteNav account per
  QuickBooks company.
- **Errors are logged with Intuit's code and detail** and shown to the
  customer under Recent sync activity.
- **Data use:** a one-way push of customers, vendors, invoices, payments,
  bills and bill payments. Lookups are limited to what the push needs. Nothing
  is sold or used for advertising or AI training.

Intuit's reviewers usually also look at the **Connect button**. Intuit
publishes an official "Connect to QuickBooks" button image. The card uses a
plain button labelled "Connect to QuickBooks", so if the review asks for the
official asset, swap it in.

## Vercel settings once keys are issued

Set these on the **Production** environment only, so previews never touch
real books:

| Variable | Value |
| --- | --- |
| `QBO_ENV` | `production` |
| `QBO_PRODUCTION_CLIENT_ID` / `QBO_PRODUCTION_CLIENT_SECRET` | from Intuit → Keys & credentials → Production |
| `QBO_TOKEN_KEY` | 32 random bytes: `openssl rand -hex 32`. **Keep a copy.** Losing it means every account has to reconnect. |

Keep the Development keys on Preview, either as `QBO_SANDBOX_CLIENT_ID` /
`_SECRET` or the existing `QBO_CLIENT_ID` / `_SECRET`, with `QBO_ENV` unset.
Production never reads those names, so the two sets cannot cross. Without
`QBO_TOKEN_KEY`, production treats QuickBooks as **not configured** rather than
store a real company's token in clear.

When `QBO_ENV` flips, the demo company's existing sandbox connection stops
being used. Its card will say the records were sent to a test company and
offer **Start fresh**.

## Pilot: one real QuickBooks company

Use a QuickBooks company that is yours or a test one, never a client's books
without their yes. A spare QuickBooks Online trial company works.

1. **Pick the SyteNav account.**
   - *Option A:* a fresh SyteNav test company, with no history to worry about.
   - *Option B:* the demo company. Press **Start fresh** first. Its 400-odd
     sandbox links are archived to `quickbooks_id_archive`, and Sync then only
     sends money recorded from that moment on.
2. **Connect.** Settings → Integrations → Connect to QuickBooks, sign in, and
   pick the company. The card should read "Linked to <company> · sign-in renewed <today>".
3. **Push the four records** on one job:
   - **Client invoice:** send a client invoice. In QuickBooks, an Invoice with
     the SyteNav number, the customer, the due date and the line amounts.
   - **Client payment:** record a payment against that invoice. In QuickBooks,
     a Payment applied to it, with your reference number and method, on the
     right date. The invoice shows paid or part paid.
   - **Sub bill:** approve a bill from a sub. In QuickBooks, a Bill with the
     vendor, the amount, an `SN-` number and the job in the line description.
   - **Bill payment:** mark that bill paid. In QuickBooks, a Bill Payment from
     the default bank account, applied to that Bill, which then shows paid.
   - **Duplicates:** if the customer or sub already existed in QuickBooks under
     the same name, it is linked rather than duplicated. The log says "Matched to …".
4. **Void each one:**
   - void the client invoice (its payment comes off and stays as credit);
   - delete the client payment;
   - mark the bill unpaid (voids the Bill Payment);
   - delete the bill (deletes the Bill).
   Check each in QuickBooks, then read Settings → Recent sync activity.
5. **Survive a day.** The next morning (the cron runs at 09:20 UTC) the card
   should show the sign-in renewed that day, and a new push should still work
   with nobody touching anything. To check in the database:
   `select last_refreshed_at, last_refresh_error, status from quickbooks_connections`.
6. **Disconnect and reconnect.**
   - Disconnect in SyteNav. SyteNav should disappear from QuickBooks →
     Settings → Apps (or Connected apps).
   - Reconnect the same company. Nothing should be re-created.
   - Disconnect from inside QuickBooks instead. You should land on the
     Disconnect URL page, and the next morning SyteNav should show "Reconnect QuickBooks".
