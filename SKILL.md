---
name: capacitor-email-client
description: >
  Architects, designs, and programs a cross-platform, local-first email client 
  for iOS/Android/web: a Capacitor app (React + Vite + TypeScript) downloadable 
  from app stores, with every backend behind an interface via the Proxy design 
  pattern. Mail platforms plug in as proxies (Gmail first, via native OAuth); 
  synced mail persists in on-device SQLite with exact local text search. 
  Organization is tag-based (no folders), the app works offline, and mail 
  content never leaves the user's machines. Use when asked to build an email 
  client, a multi-account or Capacitor app, an offline or private mail client, 
  to add another mail provider, or to ship an app through app stores.
---

# Capacitor Email Client (MailProvider proxies → Gmail native OAuth · SQLite store · app store ready)
Humans shouldn't program - they make too many mistakes

This skill was designed as a POC to run in Claude Code with an effort of ultracode. Only generate code; never run
the pipeline against a live mailbox — "do not execute" means live runs, and
running pytest/vitest is always fine. Follow Skill Driven Development (SDD:
the user-story specs under `user-stories/` are the single source of truth —
write code only to satisfy them, and change the spec before changing behavior)
and Test Driven Development (TDD: red->green->refactor) when generating code. Tests must not use real
email addresses; use synthetic fixture data modeled on the shape of real
`simplegmail` `Message` objects (Python side) and on the shared wire schema
(TypeScript side). Follow pytest convention for Python tests and vitest
convention for TypeScript unit tests; user-facing flows are additionally
verified end-to-end with Playwright against the seeded fake build (see
CLAUDE.md "Running tests" — Playwright is the default for UI behavior).

This file and every spec follow Anthropic's [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
— progressive disclosure and workflows with feedback loops in particular.

## Contents
- Component specs (progressive disclosure)
- Architecture
- Steps (TDD loop and constraints)
- Order of Operations (build checklist and README requirements)

## Component specs (progressive disclosure)

This file is the overview; the detail lives in one spec per component. **Load
only the spec for the component you are working on** — all references are one
level deep from here:

| Component | Spec | Read when |
|---|---|---|
| `MailProvider` interface, model, registry — the generalized provider skill and family index | [user-stories/providers/typescript_mail_provider.md](user-stories/providers/typescript_mail_provider.md) | Touching the shared contract or model types, or adding a mail platform (load it alongside the one per-provider spec you are working on) |
| `FakeProvider` (in-memory reference) | [user-stories/providers/typescript_fake_provider.md](user-stories/providers/typescript_fake_provider.md) | Touching the fake or tests that seed it |
| `GmailProvider` proxy (native OAuth, no bridge) | [user-stories/providers/typescript_gmail_proxy.md](user-stories/providers/typescript_gmail_proxy.md) | Touching the app-side Gmail integration, OAuth setup, or direct Gmail API calls |
| Gmail bridge (deprecated; reference only) | [user-stories/providers/python_gmail_bridge.md](user-stories/providers/python_gmail_bridge.md) | Historical reference; not part of the app-store distribution model |
| `YahooProvider` (future — no code) | [user-stories/providers/typescript_yahoo_provider.md](user-stories/providers/typescript_yahoo_provider.md) | Designing or building Yahoo support |
| `MicrosoftProvider` (future — no code) | [user-stories/providers/typescript_microsoft_provider.md](user-stories/providers/typescript_microsoft_provider.md) | Designing or building Outlook/Microsoft 365 support |
| `MailStore` + `SqliteMailStore` (SQLite text search) | [user-stories/typescript_mail_store.md](user-stories/typescript_mail_store.md) | Touching local storage, offline, or text search |
| `MailPlugin` + `PluginHost` (extension points) | [user-stories/typescript_plugin_system.md](user-stories/typescript_plugin_system.md) | Touching plug-ins, extension points, or their settings |
| UI + Capacitor shell (native OAuth) | [user-stories/typescript_email_ui.md](user-stories/typescript_email_ui.md) | Touching screens, the shell, OAuth login, or app store packaging |

## Architecture
The React UI depends on three interfaces, each resolved at the composition
root, each with an in-memory Fake for tests:

```
Capacitor shell (iOS / Android / web)

React UI ──▶ MailProvider (interface, via ProviderRegistry)
              ◀── GmailProvider ──native OAuth──▶ Gmail API (iOS: ASWebAuthenticationSession, Android: Custom Tabs)
                   (native proxy)
              ◀── future: YahooProvider, MicrosoftProvider
              ◀── FakeProvider (tests)

React UI ──▶ MailStore (interface)
              ◀── SqliteMailStore — on-device SQLite; no network
              ◀── FakeMailStore (tests)

React UI ──▶ PluginHost (MailPlugin registry; typed extension points, crash-isolated)
              ◀── plug-ins registered at the composition root
              ◀── FakePlugin (tests)
```
The UI never imports a concrete provider; it resolves one from the registry.
Each concrete provider is a **Proxy**: a local surrogate for a remote mail
server that defers connection until first use, translates platform errors into
one normalized error type, and hides platform pagination behind opaque tokens.
For **Gmail**, the proxy uses native OAuth flows (Capacitor's platform handlers
on iOS/Android, browser-based on web) to authenticate, then calls the Gmail API
directly — no localhost bridge needed. Organization is **tag-based throughout 
— no folders/directories**: messages carry any number of tags (Gmail labels map 
1:1), "moving" mail means changing tags, and a folder-only platform's proxy 
presents each folder as a tag.
**Storage is local-first through the same pattern**: synced mail persists in 
`MailStore` (SQLite via `@capacitor-community/sqlite`), matched against each 
message's stored subject and body for exact text search, so reading and search 
work offline. Mail content never leaves the user's machines.
**Extensibility runs through typed extension points**: `PluginHost` dispatches
to registered `MailPlugin`s (versioned API, capability-declared hooks,
crash-isolated so a broken plug-in never breaks core mail flows); new mail
platforms plug in through the `MailProvider` interface above.

## Steps
The development of each component must follow a strict Test Driven Development
(TDD) loop — a feedback loop where the test suite is the validator: run it,
fix, re-run, and **do not proceed to the next step until it passes**.

For each component, copy this checklist into your response and check items off
as you complete them:

```
TDD Progress (<component>):
- [ ] Story: a user story covering this change exists in a user-stories/*.md spec — write or refine it first, even when the only code will be a test
- [ ] Red: tests derived from the spec's user stories, run and observed failing
- [ ] Green: minimum implementation, full suite passing
- [ ] Refactor: cleaned up, suite still green
- [ ] Commit
```

1. **Story**: Ensure a user story covering the change exists in the relevant
   `user-stories/*.md` spec — author or refine it first. Required even when the
   only code you intend to write is a test: a test is derived from a user story,
   so there is no test without one. Add the story before writing anything under
   `tests/`, `src/`, or `bridge/`.
2. **Red**: Translate the user stories into a test file only (no edits under
   `src/` or `bridge/`), run it (it must fail), and show the failure output.
3. **Green**: Write/Edit the minimum amount of code required to make those
   specific tests pass; change nothing the tests don't force.
4. **Refactor**: Clean up on green, keeping tests passing.
5. **Commit**: Commit after each green so the next cycle has a baseline to
   demonstrate red against.

Never edit implementation and tests in the same step.

**Specific Constraints:**
- **Isolation**: One component at a time. Do not combine multiple components
  into one response.
- **Mocking**: You must mock the `simplegmail` `Gmail` client in bridge tests
  and mock `fetch` in provider tests; store tests run against an in-memory
  sql.js database, never the native plugin or filesystem. No test may require a
  live server. UI tests use the in-memory `FakeProvider`, `FakeMailStore`, and
  `FakePlugin`.
- **Proxy discipline**: No file under `src/ui/` may import from
  `src/providers/gmail/`, `src/store/SqliteMailStore.ts`, or any concrete
  provider/store/plug-in module — only the interfaces and the `PluginHost`.
  Enforce with a test or lint rule.
- **Validation**: Every response that includes code must also include the
  output of a successful test run (or at least the command used to verify it).

**Order of Operations** — copy this checklist and check off each component only
after its TDD loop is fully green and committed (the feedback-loop gate):

```
Build Progress:
- [ ] 1. Provider interface + model + registry
- [ ] 2. GmailProvider proxy (native OAuth, no bridge)
- [ ] 3. Mail store (SQLite text search)
- [ ] 4. Plugin host (extension points)
- [ ] 5. UI + Capacitor shell
- [ ] 6. Cross-component review
- [ ] 7. Edge cases verified
- [ ] 8. README.md written
```

1.  Execute TDD loop for `src/providers/` per `user-stories/providers/typescript_mail_provider.md` and `user-stories/providers/typescript_fake_provider.md` (the in-memory reference implementation built in the same step)
2.  Execute TDD loop for `src/providers/gmail/GmailProvider.ts` per `user-stories/providers/typescript_gmail_proxy.md` (now using native OAuth, not HTTP bridge)
3.  Execute TDD loop for `src/store/` per `user-stories/typescript_mail_store.md`
4.  Execute TDD loop for `src/plugins/` per `user-stories/typescript_plugin_system.md`
5.  Execute TDD loop for the UI and Capacitor shell per `user-stories/typescript_email_ui.md`
6.  Review all five components and confirm they meet the requirements in their
    respective .md files, and that every store- and plug-in-driven UI flow
    works against the fakes alone.
7.  Verify any remaining edge cases (e.g., empty mailbox, message with no
    `Date` header, HTML-only body, expired OAuth token, search query that is all
    stop words, message with empty body, plug-in that throws mid-hook).
8. **Create or replace `README.md`** — the app store guide and developer setup.
    For end users:
    - **Show how to download from the app store** (iOS App Store, Google Play,
      web) and sign in with Google — no server setup needed. The app reads, tags,
      and sends mail out of the box.
    - **State that synced mail persists in on-device SQLite** and stays
      readable and text-searchable offline. Mail content never leaves the
      user's machines.
    - **Present adding a new mail platform as: implement `MailProvider`,
      register it** — no UI changes, ever.
    
    For developers:
    - Show how to build for web, iOS, and Android from source using
      `npm run dev`, `npx cap run ios`, and `npx cap run android`.
    - Show how to configure the Gmail OAuth client (environment setup).
