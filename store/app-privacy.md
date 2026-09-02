# App Privacy - Apple's questionnaire, answered

App Store Connect asks this as a form, one category at a time, and the answers
become the "nutrition label" on the listing. This is the form filled in ahead of
time so nobody is guessing at it at submission with the clock running.

**The thing that gets apps rejected here is inconsistency**, not the answers
themselves. Apple compares this label against the published privacy policy and
against what the app is observed to do. So this file, `/privacy` and `/cookies`
have to say the same thing, and `lib/__tests__`-style guards keep the cookie
policy from claiming an analytics stack that does not exist.

**Nothing here is used for tracking**, in Apple's sense of the word: we do not
link this data to third-party data for advertising, and we do not share it with
a data broker. So **App Tracking Transparency does not apply** and the app must
not show an ATT prompt - showing one for an app that does not track is itself a
rejection.

---

## Data collected

| Apple category | Collected | Linked to identity | Used for tracking | What it is, and why |
|---|---|---|---|---|
| **Contact Info → Name** | Yes | Yes | No | Your name on your profile, so the people on your jobs know who wrote a daily log or approved a bill. |
| **Contact Info → Email address** | Yes | Yes | No | It is the account. Sign-in, password resets, invites, and the notification emails you have switched on. |
| **Contact Info → Phone number** | Yes | Yes | No | Optional, on a profile and on the people you add to a directory. Used to call somebody about a job. |
| **User Content → Photos or videos** | Yes | Yes | No | Jobsite photos on daily logs, and photographs of invoices, quotes and permits that get read into line items. |
| **User Content → Other user content** | Yes | Yes | No | The work itself: projects, budgets, invoices, schedules, documents, notes. This is what the app is for. |
| **Identifiers → User ID** | Yes | Yes | No | The account id, and the device token that lets us send you a push notification. |
| **Usage Data → Product interaction** | Yes | Yes | No | Only the audit trail the product itself shows you - the activity feed on a job, and the log of who signed in as whom for support. Not an analytics pipeline. |
| **Diagnostics → Crash data** | No | - | - | Not collected. No crash reporter is installed. |
| **Location → Precise location** | Yes | Yes | No | **Only** when you clock in or out, or write a daily log, and only if you allow it. It records where the work happened so hours can be checked against the job. There is no background tracking - the app never asks for "Always". |
| **Financial Info → Payment info** | No | - | - | Not collected. There is no purchase in the app; card details never touch it. |
| **Browsing History** | No | - | - | Not collected. |
| **Search History** | No | - | - | Not collected. |
| **Contacts** | No | - | - | Not collected. The address book is never read; the directory is people you type in. |
| **Sensitive Info** | No | - | - | Not collected. |
| **Health & Fitness** | No | - | - | Not collected. |

## Third parties that see data

| Who | What they get | Why |
|---|---|---|
| **Supabase** | Everything above - it is the database and the auth provider | It is where the Service stores your data |
| **Vercel** | Requests hitting the app | It is where the Service runs |
| **Apple (APNs)** | A device token and the text of a notification | Only how a push notification reaches your phone |
| **SendGrid** | Email address and the message | Sending the emails you asked for |
| **Anthropic** | The document you asked to be read | Only when you scan an invoice, quote or permit. Not used to train a model |
| **QuickBooks (Intuit)** | Invoices and payments, one way out | **Only if you connect it yourself.** Not connected is the normal state |

No advertising network, no analytics vendor, no data broker.

## Answers to the trickier form questions

- **"Do you or your third-party partners use data for tracking?"** → **No.**
- **"Does your app use the AdvertisingIdentifier (IDFA)?"** → **No.**
- **"Do you collect data from this app?"** → Yes, per the table above.
- **Account deletion**: required since 2022 for any app with account creation.
  Accounts are created and closed on the website (there is no sign-up in the iOS
  build), and the review notes say so. The support route is `/contact`.

## URLs the form asks for

- Privacy policy: `https://sytenav.com/privacy`
- Cookie policy: `https://sytenav.com/cookies`
- Support: `https://sytenav.com/contact`
- Terms: `https://sytenav.com/terms`

## When this file has to change

Adding **any** of the following makes the label above wrong, and the label is a
statement to Apple and to users:

- an analytics or product-metrics vendor → Usage Data changes, `/cookies` needs
  rewriting, and a consent banner becomes necessary
- a crash reporter → Diagnostics changes from No to Yes
- an advertising SDK, or anything reading the IDFA → tracking becomes Yes and
  ATT becomes mandatory
- in-app purchase → Financial Info changes
- reading the device address book → Contacts changes

The cookie-policy guard in the test suite fails if an analytics integration
appears while `/cookies` still says there is none. It does not know about the
other four - those are on whoever adds them.
