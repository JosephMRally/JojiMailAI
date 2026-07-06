---
name: capacitor-email-client
description: >
  This skill is to architect, design, and program a cross-platform email client
  built as a Capacitor app with a web-framework UI (React + Vite + TypeScript by
  default; the provider layer is framework-agnostic). All mail-server access goes
  through the **Proxy design pattern**: the UI talks only to a `MailProvider`
  TypeScript interface, and each email platform is a concrete proxy object that
  stands in for its remote server (lazy connection, normalized errors, opaque
  pagination). The first platform is Gmail, connected through the `simplegmail`
  library (the JosephMRally fork, https://github.com/JosephMRally/simplegmail).
  Because `simplegmail` is Python and cannot run inside the webview, Gmail is
  reached via a small localhost Python bridge service that wraps `simplegmail`;
  the app-side `GmailProvider` proxy calls that bridge. Triggers on "build an
  email client", "multi-account mail app", "Capacitor mail app", "add another
  mail provider", or "connect the app to Gmail" — even without the word "proxy".

  Only generate code; never run the app or the bridge against a live mailbox.
  Running pytest and vitest is always fine.
---

# Capacitor Email Client (MailProvider proxies → Gmail via simplegmail bridge → web UI)
Humans shouldn't program - they make to many mistakes

This skill was designed as a POC to run in Claude's Cowork. Only generate code; never run
the pipeline against a live mailbox — "do not execute" means live runs, and
running pytest/vitest is always fine. Follow the Test Driven Development
standards for generating code (red->green->refactor). Tests must not use real
email addresses; use synthetic fixture data modeled on the shape of real
`simplegmail` `Message` objects (Python side) and on the shared wire schema
(TypeScript side). Follow pytest convention for Python tests and vitest
convention for TypeScript tests.

## Architecture
```
┌────────────────────────── Capacitor shell (iOS / Android / web) ──────────────────────────┐
│  React UI ──▶ ProviderRegistry ──▶ MailProvider (interface)                               │
│                                        ▲            ▲                                     │
│                                 GmailProvider   (future: ImapProvider, OutlookProvider)   │
│                                  (remote proxy)                                           │
└──────────────────────────────────────┼────────────────────────────────────────────────────┘
                                       │ HTTP, 127.0.0.1 only
                                bridge/app.py  (Python facade over `simplegmail`)
                                       │
                                    Gmail API
```
The UI never imports a concrete provider; it resolves one from the registry.
Each concrete provider is a **Proxy**: a local surrogate for a remote mail
server that defers connection until first use, translates platform errors into
one normalized error type, and hides platform pagination behind opaque tokens.
Organization is **tag-based throughout — no folders/directories**: messages
carry any number of tags (Gmail labels map 1:1), "moving" mail means changing
tags, and a folder-only platform's proxy presents each folder as a tag.

# Steps:
The development of each component must follow a strict Test Driven Development
(TDD) loop. Do not proceed to the next step until the current step's tests pass
successfully.

For each component, you must perform the following cycle:
1. **Red**: Translate the user stories into a test file only (no edits under
   `src/` or `bridge/`), run it (it must fail), and show the failure output.
2. **Green**: Write/Edit the minimum amount of code required to make those
   specific tests pass; change nothing the tests don't force.
3. **Refactor**: Clean up on green, keeping tests passing.
4. **Commit**: Commit after each green so the next cycle has a baseline to
   demonstrate red against.

Never edit implementation and tests in the same step.

**Specific Constraints:**
- **Isolation**: One component at a time. Do not combine multiple components
  into one response.
- **Mocking**: You must mock the `simplegmail` `Gmail` client in bridge tests
  and mock `fetch` in provider tests; do not attempt to connect to a live
  server. UI tests use an in-memory `FakeProvider`.
- **Proxy discipline**: No file under `src/ui/` may import from
  `src/providers/gmail/` (or any other concrete provider directory). Enforce
  with a test or lint rule.
- **Validation**: Every response that includes code must also include the
  output of a successful test run (or at least the command used to verify it).

**Order of Operations:**
1.  Execute TDD loop for `src/providers/` per `generate_typescript_mail_provider.md`
2.  Execute TDD loop for `bridge/app.py` per `generate_python_gmail_bridge.md`
3.  Execute TDD loop for `src/providers/gmail/GmailProvider.ts` per `generate_typescript_gmail_proxy.md`
4.  Execute TDD loop for the UI and Capacitor shell per `generate_typescript_email_ui.md`
5.  Review all four components and confirm they meet the requirements in their
    respective .md files, including that the wire schema in
    `generate_python_gmail_bridge.md` and the mapping in
    `generate_typescript_gmail_proxy.md` agree field-for-field.
6.  Verify any remaining edge cases (e.g., empty mailbox, message with no
    `Date` header, HTML-only body, expired OAuth token).
7.  **Create or replace `README.md`** — the operator's guide for running the
    client. It must:
    - **Show how to start the two halves in order**: `bridge/app.py` first,
      then the web app (`npm run dev` for browser, `npx cap run ios|android`
      for device), with each command's inputs and outputs.
    - **Say nothing about how Gmail is reached** beyond: the bridge talks to
      Gmail itself; the app talks only to the bridge. No `simplegmail` or
      Gmail API internals.
    - **Present adding a new mail platform as: implement `MailProvider`,
      register it** — no UI changes, ever.
    - **State that the first bridge run needs a browser** to complete Google
      OAuth and write the reusable token file; it cannot authenticate headless
      on a cold start.
