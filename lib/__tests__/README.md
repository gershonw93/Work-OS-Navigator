# Tests

`npm test` compiles each `.ts` in this directory with esbuild and runs it under
node. No framework, no config, no watch mode — a file that exits non-zero failed.

```bash
npm test                 # everything
npm test mobile-tabs     # one suite, by name
```

## Why they live here

They used to live in a session scratch directory, which meant they were never
runnable by anyone but the agent that wrote them, never ran in CI, and did not
survive the container being reset. Sixty-five suites went that way in one go.
The code they guarded was all shipped and fine; the guards simply stopped
existing, silently, which is the worst way for a test to fail.

## What they are, and are not

Mostly **pure-logic and source-shape** checks. `lib/` holds the rules that decide
money — `pay-app-rules`, `committed`, `invoice-budget`, `activation` — and those
are tested by calling them with fixtures built from real reported numbers.

The source-shape ones read a file and assert something about it: that a route
still validates its input, that a screen still surfaces an error rather than an
empty state. Crude, and they can pass for the wrong reason — so every one of
them **asserts it can see the fault before trusting a clean run**. A scan that
reports zero because its pattern never matched is worse than no scan, and that
has happened here twice.

Nothing renders React. There is no jsdom and no testing-library.

## The convention that matters

**Reintroduce the bug and confirm the test fails.** A test written after a fix,
never seen red, is a guess about what it covers. Every suite here was checked
that way, and several were wrong on the first try — one matched a string that
also appeared in an import, another split on a `]` that turned out to be inside
`Tab[]` and captured an empty string that passed every absence check.

Build fixtures from the **reported** numbers, not from the code. A fixture
derived from the implementation agrees with it by construction, including where
it is wrong.
