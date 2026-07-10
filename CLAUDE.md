# JojiMailAI

A cross-platform, local-first email client (Capacitor + React/Vite/TypeScript web UI) generated from spec files: `SKILL.md` defines the overall process and architecture, and each `user-stories/*.md` is the spec for one component. User stories in the specs are the source of truth for tests and code — Skill Driven Development (SDD): write code only to satisfy a spec, and change the spec before changing behavior. `TODO.md` is the longer-term feature backlog (derived from FairEmail), not a spec. This skill was designed as a POC to run in Claude Code with an effort of ultracode.

## Authoring best practices (all .md files)

Every markdown file in this repo follows Anthropic's [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), two of them deliberately:

- **Progressive disclosure**: `SKILL.md` stays a lean overview that points to detail files; load a `user-stories/*.md` spec only when working on that component. Keep every reference one level deep from `SKILL.md`, give any file over 100 lines a Contents section at the top, and keep bodies concise — never restate what Claude already knows.
- **Workflows and feedback loops**: every multi-step process is written as a copyable checklist, and every step that can be validated has a validator and a loop — run pytest/vitest, fix, re-run, and **only proceed when it passes**.

Apply both patterns when editing or adding any .md file here.

## Architecture in one paragraph

All mail access goes through the **Proxy pattern**: the UI talks only to the `MailProvider` interface and resolves concrete providers from the `ProviderRegistry` — no UI file may import a concrete provider directory. Gmail is the first platform: a TypeScript `GmailProvider` proxy uses native Capacitor OAuth (ASWebAuthenticationSession on iOS, Custom Tabs on Android, browser OAuth on web) and calls the Gmail REST API directly — no localhost bridge needed. Organization is tag-based throughout — no folders/directories; Gmail labels map 1:1 to tags. **Storage is local-first through the same pattern**: synced mail persists in `MailStore` (SQLite via `@capacitor-community/sqlite`), so reading and exact local text search work offline. **Extensibility runs through `PluginHost`**: versioned, capability-declared, crash-isolated `MailPlugin` extension points for message views, compose transforms, thread actions, and settings. The component diagram and build order live in `SKILL.md`; do not duplicate them here.

## TDD is mandatory

When executing or re-executing any `user-stories/*.md` spec — including small schema changes to already-working code, and including test-only changes — copy this checklist into your response and check items off as you go. Always author or update a user story before writing any code, **even a test**:

```
TDD Progress (<component>):
- [ ] Story: a user story covering this change exists in a user-stories/*.md spec — write or refine it first, even when the only code will be a test
- [ ] Red: tests derived from the spec's user stories, run and observed failing
- [ ] Green: minimum implementation, full suite passing
- [ ] Refactor: cleaned up, suite still green
- [ ] Update documents to be consistent with the code, include `sequence diagrams` and `flow diagrams` both as PNG file types.
- [ ] Commit
```

1. **Story**: ensure a user story covering the change lives in a `user-stories/*.md` spec — write or refine it before touching anything else. Holds even when the only code you plan to write is a test: tests derive from user stories, so a test with no backing story means the story is missing — add it first.
2. **Red**: translate the changed user stories into tests only (no edits under `src/` or `bridge/`), run the tests, and show the failing output.
3. **Green**: write the minimum implementation to make those tests pass; change nothing the tests don't force.
4. **Refactor** on green, keeping tests passing.
5. Commit after each green so the next cycle has a baseline to demonstrate red against.

The test suite is the validator in the feedback loop: run it, fix, re-run — never move to the next checklist item or component while it fails. Never edit implementation and tests in the same step.

## Running tests

**Default to Playwright for end-to-end tests; use vitest for unit tests.**

```
npx playwright test                            # End-to-end tests (default, if possible)
npx vitest run                                 # Unit tests (TypeScript layers: providers, store, plugins, UI)
.venv/bin/python -m pytest bridge/tests/ -q   # Python bridge unit tests
```

Use `.venv/bin/python` — pytest is installed in the project venv, not globally.

When writing new tests: prefer Playwright for features with a UI component; use vitest for pure logic, interfaces, and internal contracts. Playwright tests are the ground truth for user-facing behavior; vitest tests validate the contracts beneath them.

## Change order: always follow this sequence

When implementing a feature, fixing a behavior, or adding a test:

1. **Skills** — Update `SKILL.md` or a `user-stories/*.md` spec first. Change the spec before changing code. If requirements are unclear, nail them down in the spec.
2. **User stories** — Refine or add user-story requirements in the relevant `user-stories/*.md` file. The spec is the source of truth; tests and code follow from it.
3. **Tests** — Write tests that derive from the spec's user stories. Run and observe them fail (Red). Never edit tests and code in the same step. A test-only change is still a change: it begins at step 1 with the story it derives from, never here.
4. **Code** — Write minimum implementation to make tests pass (Green). Refactor on green, keeping tests passing.

This order — spec → user stories → tests → code — ensures the spec drives all downstream work, tests validate the spec's requirements, and code changes are safe. There is no test without a user story behind it — even a test-only change starts at step 1.

## Other rules

- Do not run the app or the bridge against the live mailbox unless explicitly asked — "do not execute" in the specs refers to live runs; running pytest/vitest/playwright is always fine.
- Bridge tests must mock the `simplegmail` `Gmail` client (the JosephMRally fork); provider/store/plugin unit tests (vitest) mock their dependencies (no test may require a filesystem or live API); UI unit tests use the in-memory `FakeProvider`, `FakeMailStore`, and `FakePlugin`. End-to-end tests (Playwright) drive the real in-memory stack and a browser. No real addresses or credentials in fixtures.
- Keep the wire schema in `user-stories/python_gmail_bridge.md` and the mapping in `user-stories/typescript_gmail_proxy.md` in agreement field-for-field; change them together or not at all.
