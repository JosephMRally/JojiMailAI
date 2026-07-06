# JojiMailAI

A cross-platform email client (Capacitor + React/Vite/TypeScript web UI) generated from spec files: `SKILL.md` defines the overall process and architecture, and each `generate_*.md` is the spec for one component. User stories in the specs are the source of truth for tests and code. `TODO.md` is the longer-term feature backlog (derived from FairEmail), not a spec.

## Architecture in one paragraph

All mail access goes through the **Proxy pattern**: the UI talks only to the `MailProvider` interface and resolves concrete providers from the `ProviderRegistry` — no UI file may import a concrete provider directory. Gmail is the first platform: a TypeScript `GmailProvider` proxy delegates over localhost HTTP to `bridge/app.py`, a Python FastAPI facade over `simplegmail`, because `simplegmail` cannot run in the webview. Organization is tag-based throughout — no folders/directories; Gmail labels map 1:1 to tags.

## TDD is mandatory

When executing or re-executing any `generate_*.md` spec — including small schema changes to already-working code — follow the strict loop from `SKILL.md`:

1. **Red**: translate the changed user stories into tests only (no edits under `src/` or `bridge/`), run the tests, and show the failing output.
2. **Green**: write the minimum implementation to make those tests pass; change nothing the tests don't force.
3. **Refactor** on green, keeping tests passing.
4. Commit after each green so the next cycle has a baseline to demonstrate red against.

Never edit implementation and tests in the same step.

## Running tests

```
.venv/bin/python -m pytest bridge/tests/ -q   # Python bridge
npx vitest run                                 # TypeScript providers + UI
```

Use `.venv/bin/python` — pytest is installed in the project venv, not globally.

## Other rules

- Do not run the app or the bridge against the live mailbox unless explicitly asked — "do not execute" in the specs refers to live runs; running pytest/vitest is always fine.
- Bridge tests must mock the `simplegmail` `Gmail` client (the JosephMRally fork); provider tests mock `fetch`; UI tests use the in-memory `FakeProvider`. No real addresses or credentials in fixtures.
- Keep the wire schema in `generate_python_gmail_bridge.md` and the mapping in `generate_typescript_gmail_proxy.md` in agreement field-for-field; change them together or not at all.
