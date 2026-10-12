# Analytics events

The schema lives in `lib/analytics.ts` (`EVENT_PARAMS`). This page is for
whoever sets up GA4 property 558574295. If the two disagree, the code is right.

## Events, and what each one actually means

| Event | Fires when the server confirmed | Parameters |
| --- | --- | --- |
| `login` | `/login` sign-in succeeded (email + password is the only method) | `method` |
| `sign_up` | `complete-signup` created a NEW account | `method` |
| `trial_start` | `complete-signup` inserted a NEW trial row | `trial_days` |
| `project_created` | a projects route returned the new job(s) | `entry_point`, `project_type`, `project_count` |
| `quote_sent` | a bid/RFQ invite email to a sub was sent | `channel`, `quote_type`, `invitee_count` |
| `sub_invited` | `/api/invite` (vendor) reported `emailSent: true` | `invitation_method`, `role`, `invite_count` |
| `ui_click` | copy bid link / copy email text / send by hand / connect calendar | `action`, `component`, `page_template` |
| `file_download` | timesheet CSV or daily log PDF downloaded | `file_type`, `document_category` |
| `search_used` | a global or Help search settled (1.5s), once per distinct search | `search_area`, `results_count` |

Not implemented, because the app has no such action: Google/magic-link login,
`demo_login` (there is no public demo), a plan on `trial_start` (a new trial has
no plan until Stripe sets one), and a link channel for `quote_sent` /
`sub_invited` (copying a link never reaches the server, so it is a `ui_click`).

## GA4 admin setup

- **Key events:** `sign_up` and `trial_start` only. `demo_login` can be deleted.
  Do not mark `login`, `project_created` or clicks as key events.
- **Custom dimensions (event scope)** - register these names exactly:
  `action, channel, component, document_category, entry_point, file_type,
  invitation_method, method, page_template, project_type, quote_type, role,
  search_area`.
  Counts (`project_count`, `invitee_count`, `invite_count`, `results_count`,
  `trial_days`) are custom METRICS if you want to sum them, not dimensions.
- **No value/currency** is sent. If a real conversion value is added later,
  send `value` and `currency` together.

## Verifying in DebugView

Install the Google Tag Assistant extension, or open GTM Preview, so your
browser shows up in DebugView. Then:

1. Open a `/portal/...` link: Network filtered to `google` shows nothing.
2. Sign in: one `login` on the dashboard.
3. Create a project: one `project_created`. A failed save sends none.
4. Send a quote request to a sub with an email: one `quote_sent`.
   Copy link: one `ui_click`, no `quote_sent`.
5. Invite a sub from the Directory: one `sub_invited`.
6. Search "concrete" in the header and wait: one `search_used`. The parameters
   hold no search text.
