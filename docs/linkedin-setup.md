# LinkedIn auto-posting (owner setup)

SyteNav can post to **one** LinkedIn business page — yours. It's a
platform-wide, owner-only feature: you connect a single page from the admin
console and it's never exposed to customer companies.

- **Where:** `/admin` → **LinkedIn** tab (super admin only, behind the PIN gate).
- **What it does:** compose a post and publish it now, schedule it for later, or
  save a draft. A daily cron publishes any scheduled post that's come due and
  sends you an in-app notification when it goes out (or fails).

## One-time server setup

The connection runs through your own LinkedIn Developer app.

1. Create an app at <https://developers.linkedin.com> and link it to your
   company page.
2. Request the **Community Management API** product. LinkedIn reviews this
   manually and it can take a few days, so start early. It grants the two
   scopes we use: `w_organization_social` (post as the page) and
   `r_organization_admin` (list the pages you administer).
3. Add the redirect URL to the app's **Auth** settings. It must exactly match:
   `https://<your-domain>/api/admin/linkedin/callback`
   (override with `LINKEDIN_REDIRECT_URI` if needed).
4. Add these environment variables in Vercel:
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`
   - `LINKEDIN_API_VERSION` *(optional; defaults to a recent `YYYYMM` version)*

Until the client ID/secret are set, the console shows a "not set up on the
server yet" notice.

## Connecting

1. Open `/admin` → **LinkedIn** and click **Connect LinkedIn**.
2. Sign in with a LinkedIn account that administers your business page.
3. If you admin exactly one page it's selected automatically; otherwise pick
   which page to post as (or paste the numeric ID from your admin URL,
   `linkedin.com/company/12345678/admin`).

## Scheduling & timing

Scheduled posts publish on the **next cron run at or after** their time. The
built-in Vercel cron (`vercel.json`) runs `/api/cron/linkedin-posts` once a day.
For tighter timing you have two options:

- Tighten the schedule in `vercel.json` (needs a Vercel plan that allows more
  frequent crons), **or**
- Ping it from a free external scheduler (e.g. cron-job.org) every 15 minutes:
  `https://<your-domain>/api/cron/linkedin-posts?secret=<CRON_SECRET>`
  (set `CRON_SECRET` in the env; the route also accepts Vercel's cron header).

## Notes & limits

- **Token expiry:** LinkedIn access tokens last ~60 days. If the console shows
  "Expired — reconnect", click **Reconnect LinkedIn** once and scheduled posting
  resumes. (Refresh tokens are only issued to apps LinkedIn has approved for
  them; without one, reconnecting is the refresh.)
- **Text only** for now — hashtags work; image/link attachments are on the
  roadmap. 3,000-character limit.
- Removing a post from the queue never deletes anything already on LinkedIn.

## Database

Ships in migration `058_linkedin.sql` (also folded into
`_combined_008-058.sql`): a singleton `linkedin_connection`, `linkedin_oauth_states`,
and the `linkedin_posts` queue. Run the combined SQL in the Supabase SQL editor.
