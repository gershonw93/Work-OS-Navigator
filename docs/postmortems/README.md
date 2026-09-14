# Post-mortems

These files hold the *evidence* behind the working agreement in
[`CLAUDE.md`](../../CLAUDE.md): the report a user filed, the arithmetic that
closed, the wrong column, the silent 200. `CLAUDE.md` carries the RULE in one
line and links here; this is where the reasoning lives.

| File | Covers |
| --- | --- |
| [data-access.md](data-access.md) | Wrong column, wrong table, wrong key off a response, stale coordinates |
| [layout.md](layout.md) | App shell, overlays, safe areas, the `--vv-h` saga |
| [mobile.md](mobile.md) | Phone look and feel, controls a phone cannot reach, menus and pickers |
| [derived-state.md](derived-state.md) | Stored facts that lie, defaults that claim, buttons that promise |
| [failure-states.md](failure-states.md) | Auth outcomes, loading vs failed, native dialogs, geolocation, time |
| [integrations.md](integrations.md) | QuickBooks, the notification/permission registries, invite emails |

## The contract with CLAUDE.md

**A rule is not weaker because its story moved.** These were split out of
`CLAUDE.md` only to stop re-sending ~70KB of narrative on every request. If a
rule there looks arbitrary, expensive, or like it does not apply to your case,
read its post-mortem before working around it - the case you think is an
exception is usually the one that produced the rule.

Two obligations when you touch this directory:

- **Fixing a bug that a rule already covers?** Add the new report to the
  existing section rather than writing a new rule. The repetition is the
  point - `data-access.md` says "IT HAPPENED AGAIN AND THE SECOND ONE WAS
  WORSE" because it did.
- **Writing a NEW rule?** The one-line imperative goes in `CLAUDE.md`, the
  story goes here, and the rule links to it. A rule with no evidence behind it
  gets rationalised away by the next person; a story with no rule in front of
  it is never read at all.

Keep the pin (the test in `lib/__tests__/` that enforces the rule) named in
both places.
