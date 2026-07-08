# JojiMailAI

A cross-platform, AI-native email client (Capacitor + React/Vite/TypeScript web UI) generated from spec files: `SKILL.md` defines the overall process and architecture, and each `user-stories/*.md` is the spec for one component. User stories in the specs are the source of truth for tests and code — Skill Driven Development (SDD): write code only to satisfy a spec, and change the spec before changing behavior. `TODO.md` is the longer-term feature backlog (derived from FairEmail), not a spec. This skill was designed as a POC to run in Claude Code with an effort of ultracode.

## Authoring best practices (all .md files)

Every markdown file in this repo follows Anthropic's [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), two of them deliberately:

- **Progressive disclosure**: `SKILL.md` stays a lean overview that points to detail files; load a `user-stories/*.md` spec only when working on that component. Keep every reference one level deep from `SKILL.md`, give any file over 100 lines a Contents section at the top, and keep bodies concise — never restate what Claude already knows.
- **Workflows and feedback loops**: every multi-step process is written as a copyable checklist, and every step that can be validated has a validator and a loop — run pytest/vitest, fix, re-run, and **only proceed when it passes**.

Apply both patterns when editing or adding any .md file here.

## Architecture in one paragraph

All mail access goes through the **Proxy pattern**: the UI talks only to the `MailProvider` interface and resolves concrete providers from the `ProviderRegistry` — no UI file may import a concrete provider directory. Gmail is the first platform: a TypeScript `GmailProvider` proxy uses native Capacitor OAuth (ASWebAuthenticationSession on iOS, Custom Tabs on Android, browser OAuth on web) and calls the Gmail REST API directly — no localhost bridge needed. Organization is tag-based throughout — no folders/directories; Gmail labels map 1:1 to tags. **AI is optional and runs through the same pattern**: the UI depends only on the `MailIntelligence` interface; `LocalIntelligence` (official `openai` SDK pointed at the OpenAI-compatible `/v1` endpoint of a user-hosted Ollama, vLLM, or LM Studio server, constrained JSON output) auto-tags arriving mail, digests long threads, drafts replies, and parses natural-language search when configured — `NoOpIntelligence` gracefully disables AI when no server is available, and the app remains fully functional for reading, tagging, and sending mail. Mail content never leaves the user's machines when AI is self-hosted; it can work entirely offline without AI. **Storage is local-first through the same pattern**: synced mail persists in `MailStore` (SQLite via `@capacitor-community/sqlite`), each message row carrying a Bloom filter of its content words (stop words excluded) that prescreens text search, with candidates verified against stored text — so reading and search work offline and results are exact. **Extensibility runs through `PluginHost`**: versioned, capability-declared, crash-isolated `MailPlugin` extension points for message views, compose transforms, thread actions, and settings. The component diagram and build order live in `SKILL.md`; do not duplicate them here.

## TDD is mandatory

When executing or re-executing any `user-stories/*.md` spec — including small schema changes to already-working code — copy this checklist into your response and check items off as you go:

```
TDD Progress (<component>):
- [ ] Red: tests derived from the spec's user stories, run and observed failing
- [ ] Green: minimum implementation, full suite passing
- [ ] Refactor: cleaned up, suite still green
- [ ] Update documents to be consistent with the code, include `sequence diagrams` and `flow diagrams` both as PNG file types.
- [ ] Commit
```

1. **Red**: translate the changed user stories into tests only (no edits under `src/` or `bridge/`), run the tests, and show the failing output.
2. **Green**: write the minimum implementation to make those tests pass; change nothing the tests don't force.
3. **Refactor** on green, keeping tests passing.
4. Commit after each green so the next cycle has a baseline to demonstrate red against.

The test suite is the validator in the feedback loop: run it, fix, re-run — never move to the next checklist item or component while it fails. Never edit implementation and tests in the same step.

## Running tests

```
.venv/bin/python -m pytest bridge/tests/ -q   # Python bridge
npx vitest run                                 # all TypeScript layers (providers, intelligence, store, plugins, UI)
```

Use `.venv/bin/python` — pytest is installed in the project venv, not globally.

## Other rules

- Do not run the app or the bridge against the live mailbox unless explicitly asked — "do not execute" in the specs refers to live runs; running pytest/vitest is always fine.
- Bridge tests must mock the `simplegmail` `Gmail` client (the JosephMRally fork); provider tests mock `fetch`; intelligence tests mock the OpenAI-compatible client (no test may require a running Ollama/vLLM/LM Studio server); store tests run against an in-memory sql.js database (never the native plugin or filesystem); plugin tests use in-memory settings and fixture plug-ins; UI tests use the in-memory `FakeProvider`, `FakeIntelligence`, `FakeMailStore`, and `FakePlugin`. No real addresses or credentials in fixtures.
- Keep the wire schema in `user-stories/python_gmail_bridge.md` and the mapping in `user-stories/typescript_gmail_proxy.md` in agreement field-for-field; change them together or not at all.
