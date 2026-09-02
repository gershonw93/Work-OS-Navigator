# Launch copy - written, held until it is true

Everything here is finished and ready to paste **on the day the app is actually
downloadable**. It is deliberately NOT in `lib/whats-new.ts` yet.

**Why it is held.** A What's New entry's `date` drives the unread badge in the
sidebar, so publishing this early puts "SyteNav is on the App Store" in front of
every user, with a notification, before there is anything to download. That is a
false claim to the whole customer base and it cannot be un-sent. The same goes
for the marketing page: `/mobile` currently makes no download claim, which is
correct, and it should keep making none until the listing is live.

---

## 1. What's New entry

Paste at the **top** of `RELEASES` in `lib/whats-new.ts`, with `date` set to the
day it goes live - not the day it was written.

```ts
  {
    date: 'YYYY-MM-DD',
    title: 'SyteNav is on the App Store',
    items: [
      {
        kind: 'new',
        title: 'Install SyteNav on your iPhone and iPad',
        text: 'Search the App Store for SyteNav, or use the link on our site. Sign in with the account you already have - everything is exactly where you left it, because it is the same SyteNav, not a cut-down version. Push notifications for approvals and invoices now arrive on your phone, and they follow the notification settings you have already set.',
        help: 'sytenav-on-your-phone',
      },
      {
        kind: 'improved',
        title: 'Your account is still managed on the web',
        text: 'You sign up, change your plan and manage billing on sytenav.com. The app is for signing in and getting on with the work. Invites still work on the phone - opening an invite link on your phone sets your account up as usual.',
      },
    ],
  },
```

**Check before pasting:** the Help article slug `sytenav-on-your-phone` exists in
`lib/help/articles.ts`, and its "the app itself" section has been updated from
"not out yet" to how it actually works.

## 2. Announcement email / post

> **SyteNav is on your phone.**
>
> The app is on the App Store today. It is the same SyteNav you already use -
> your jobs, your budgets, your daily logs - built to sit in a pocket on site
> rather than on a desk.
>
> Sign in with the account you already have. Nothing to migrate, nothing to set
> up twice.
>
> - Photos straight from the camera into a daily log
> - Clock in and out on site
> - Push notifications when a bill needs approving or an invoice is paid
> - Scan an invoice or a permit and let it fill itself in
>
> Accounts and billing stay on the website. The app is for the work.
>
> [Download on the App Store] · [What's new]

## 3. App Store "What's New in this version" (first release)

> First release. SyteNav on your phone: your jobs, budgets, daily logs, time
> clock and approvals, with push notifications for the things that need you.
> Sign in with your existing SyteNav account.

## 4. The `/mobile` marketing page

It currently describes the mobile experience and claims no download, which is
right for today. On launch it needs an App Store badge and link. Apple's badge
has rules - use the official asset from
<https://developer.apple.com/app-store/marketing/guidelines/>, do not redraw it,
and do not call it "iOS app" in a way that implies Apple endorses it.

## 5. Order on the day

1. App is **Ready for Sale** in App Store Connect - actually check, do not trust
   the email
2. Open the store link on a phone that has never had the app and confirm it
   installs and signs in
3. `/mobile` page gets the badge and link
4. Help article's "the app itself" section updated
5. What's New entry pasted with today's date
6. Announcement sent

Steps 1 and 2 come first for a reason: "Ready for Sale" can precede the listing
actually being visible in every region by a few hours, and an announcement that
lands before the link works is worse than one that lands a day later.
