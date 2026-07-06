# JojiMailAI

A cross-platform, AI-native email client (Capacitor + React/Vite/TypeScript web UI) generated from spec files: `SKILL.md` defines the overall process and architecture, and each `user-stories/generate_*.md` is the spec for one component. User stories in the specs are the source of truth for tests and code. `TODO.md` is the longer-term feature backlog (derived from FairEmail), not a spec.

## Authoring best practices (all .md files)

Every markdown file in this repo follows Anthropic's [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), two of them deliberately:

- **Progressive disclosure**: `SKILL.md` stays a lean overview that points to detail files; load a `user-stories/generate_*.md` spec only when working on that component. Keep every reference one level deep from `SKILL.md`, give any file over 100 lines a Contents section at the top, and keep bodies concise — never restate what Claude already knows.
- **Workflows and feedback loops**: every multi-step process is written as a copyable checklist, and every step that can be validated has a validator and a loop — run pytest/vitest, fix, re-run, and **only proceed when it passes**.

Apply both patterns when editing or adding any .md file here.

## Architecture in one paragraph

All mail access goes through the **Proxy pattern**: the UI talks only to the `MailProvider` interface and resolves concrete providers from the `ProviderRegistry` — no UI file may import a concrete provider directory. Gmail is the first platform: a TypeScript `GmailProvider` proxy delegates over localhost HTTP to `bridge/app.py`, a Python FastAPI facade over `simplegmail`, because `simplegmail` cannot run in the webview. Organization is tag-based throughout — no folders/directories; Gmail labels map 1:1 to tags. **AI is fundamental, self-hosted, and runs through the same pattern**: the UI depends only on the `MailIntelligence` interface; `LocalIntelligence` (official `openai` SDK pointed at the OpenAI-compatible `/v1` endpoint of a user-hosted Ollama, vLLM, or LM Studio server, constrained JSON output) auto-tags arriving mail, digests long threads, drafts replies, and parses natural-language search — mail content never leaves the user's machines, and AI failure degrades those affordances without blocking core mail flows. The component diagram and build order live in `SKILL.md`; do not duplicate them here.

## TDD is mandatory

When executing or re-executing any `user-stories/generate_*.md` spec — including small schema changes to already-working code — copy this checklist into your response and check items off as you go:

```
TDD Progress (<component>):
- [ ] Red: tests derived from the spec's user stories, run and observed failing
- [ ] Green: minimum implementation, full suite passing
- [ ] Refactor: cleaned up, suite still green
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
npx vitest run                                 # TypeScript providers + intelligence + UI
```

Use `.venv/bin/python` — pytest is installed in the project venv, not globally.

## Other rules

- Do not run the app or the bridge against the live mailbox unless explicitly asked — "do not execute" in the specs refers to live runs; running pytest/vitest is always fine.
- Bridge tests must mock the `simplegmail` `Gmail` client (the JosephMRally fork); provider tests mock `fetch`; intelligence tests mock the OpenAI-compatible client (no test may require a running Ollama/vLLM/LM Studio server); UI tests use the in-memory `FakeProvider` and `FakeIntelligence`. No real addresses or credentials in fixtures.
- Keep the wire schema in `user-stories/generate_python_gmail_bridge.md` and the mapping in `user-stories/generate_typescript_gmail_proxy.md` in agreement field-for-field; change them together or not at all.
