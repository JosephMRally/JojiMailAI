# Generate typescript email ui
## Function
Create the web UI under `src/ui/` (React + Vite + TypeScript) and the Capacitor shell config (`capacitor.config.ts`); do not execute! The UI is the client of the Proxy pattern twice over: every screen obtains a `MailProvider` from the `ProviderRegistry` and a `MailIntelligence` (see `generate_typescript_mail_intelligence.md`) from the composition root, and calls only interface methods — it must compile and pass all tests with nothing but the in-memory `FakeProvider` and `FakeIntelligence`, proving that adding IMAP or a different AI backend later requires zero UI changes. **AI is fundamental to how the app runs**: arriving threads are AI-classified and auto-tagged, long threads open with an AI digest, compose starts from an AI draft, and the search box speaks natural language. The Capacitor shell wraps the built web app for iOS/Android; native platform setup commands (`npx cap add ios|android`) are documented in the README, not executed.

## User Stories
Following agile conventions, we want our user stories to be in the following format: `As a <actor> I want <requirement> so that <description>` will be written in shorthand as `actor | requirement | description`. User stories form the basis of tests and code.

actor | requirement | description
engineer | every UI file to import mail types only from `src/providers/` and AI only from `src/intelligence/MailIntelligence.ts` — never a concrete provider or intelligence class — enforced by a test or lint rule | both proxy boundaries hold and new platforms or AI backends need zero UI changes
engineer | UI tests to run against the in-memory `FakeProvider` from `generate_typescript_mail_provider.md` and `FakeIntelligence` from `generate_typescript_mail_intelligence.md`, seeded with fixture data using fake addresses | tests are deterministic, reproducible, and touch no bridge, network, or AI API
engineer | vitest + React Testing Library, asserting on what the user sees (roles, text) rather than component internals | tests survive refactors and match the user stories they encode
human | an account switcher listing accounts from `ProviderRegistry.listAccounts()`, showing each account's tags (from `listTags()`) when selected | multiple accounts on different platforms live in one app
human | navigation by tags, never folders/directories: selecting a tag shows the threads carrying it, and the same thread appears under every tag it carries | mail is organized by what it is, not where it lives
human | a thread list per tag showing sender, subject, snippet, date, message count, and tag chips, with unread threads visually distinct | i can triage my inbox at a glance
human | add/remove tag actions on a message (shown only when `capabilities().supportsTags`), calling `addTag`/`removeTag` and updating the chips optimistically | i can organize mail by tagging without leaving the thread view
human | thread-list dates rendered relative for the current day (e.g. "14:05") and as a date otherwise, from the model's epoch-ms numbers | the list reads like a familiar mail app
human | a "load more" control shown exactly when `nextPageToken` is present, fetching the next page and appending | large mailboxes load a page at a time without scroll jank
human | opening a thread to show its messages oldest-first and mark the thread read via the provider | conversations read top-to-bottom and unread state stays true to the server
human | HTML bodies rendered inside a sandboxed iframe (`sandbox` attribute, no scripts) with remote images blocked by default behind a per-message "load images" action, falling back to `bodyPlain` when no HTML exists | mail can't run script in my client or track me by default, but i can still see a message's images when i choose to
human | mark read/unread, archive, and trash actions on each thread, each calling the corresponding provider method and updating the list optimistically | i can triage without waiting on the server round-trip
human | a compose screen with to/cc/bcc, subject, and plain-text body that submits a `Draft` via `provider.send()` and confirms with the returned message id | i can write and reply from the app
human | a reply action on a message pre-filling compose with the sender as `to` and the subject prefixed `Re:` (not duplicated if already present) | replying takes one tap instead of retyping headers
engineer | loading, empty ("no messages"), and error states on every screen, with error copy keyed off `MailProviderError.code` — `AUTH_REQUIRED` shows the error's own message (the fix instructions), `NETWORK` offers a retry button | failures are actionable, and provider-specific guidance flows through without the UI knowing platforms
engineer | actions that hide UI behind `capabilities()` — e.g. no archive button when `supportsArchive` is false, no compose when `supportsSend` is false | a future read-only or label-less platform degrades gracefully instead of erroring
human | a manual refresh control on the thread list that re-fetches the current page | i can pull new mail on demand; background sync is a later phase
human | every thread new to the app run through `intelligence.classify` on arrival, its suggested tags applied via `provider.addTag` and shown as visually distinct "AI" chips with a one-tap undo per thread | my mailbox organizes itself into my real tags as mail arrives, and i can reverse any call the AI got wrong
human | the thread list ordered AI-importance-first within a tag (`high` before `normal` before `low`), with a toggle back to pure date order | the mail that needs me surfaces to the top by default
human | threads with more than three messages to open with an AI digest panel (summary + action items from `intelligence.summarizeThread`) above the messages, loaded asynchronously so the messages never wait on it | long conversations start with the gist while the full thread stays instantly readable
human | a "Draft with AI" action on compose and reply that fills the body from `intelligence.draftReply` (with my optional guidance text), always leaving me to edit and press send myself | replies start ready-made but nothing is ever sent without my explicit action
human | a single search box that passes my words through `intelligence.parseSearchQuery` and applies the returned criteria to the thread list, showing the interpreted criteria as removable chips | i search by meaning ("invoices from ACME last month") and can see and correct how the AI understood me
engineer | AI failures degrade, never block: every core mail flow (list, read, tag manually, compose, send) works when `MailIntelligence` rejects, with AI affordances showing error copy keyed off `MailIntelligenceError.code` and a retry | AI is fundamental to the experience but an inference server that's down or missing its model never locks me out of my mail
engineer | app startup to construct providers and the intelligence backend (Gmail via its config, `LocalIntelligence` via its server URL and model) in one composition-root module, `src/main.tsx`-adjacent, the only file allowed to import concrete provider or intelligence classes | the proxy wiring lives in exactly one place
engineer | the Gmail bridge `baseUrl` and the AI server settings read from a single config module honoring `VITE_BRIDGE_URL` (default `http://127.0.0.1:8765`), `VITE_AI_BASE_URL` (default `http://127.0.0.1:11434/v1`), and `VITE_AI_MODEL` env overrides | the Android emulator (`10.0.2.2`), a physical device, and whichever self-hosted server (Ollama, vLLM, LM Studio) is running are each configured without code edits
engineer | `capacitor.config.ts` with `appId`, `appName`, and `webDir` pointing at Vite's build output (`dist`), and no native plugins required in v1 | `npx cap sync` wraps the same tested web build for iOS and Android
engineer | `npm run build` (Vite) to produce the `webDir` output consumed by Capacitor, wired into package.json scripts | one command path from source to something `cap sync` can package

## Input
At runtime the UI's only inputs are the providers registered in the `ProviderRegistry`, the `MailIntelligence` constructed at the composition root, and user interaction. In tests, the registry holds only `FakeProvider` instances and the intelligence is `FakeIntelligence` — no bridge, no network, no AI API, no Capacitor native layer.

## Output Schema
The UI produces no data files. Its "outputs" are provider and intelligence calls, which must be exactly the `MailProvider` and `MailIntelligence` interface methods with the shared model types — asserted in tests via the fakes' recorded calls.

# Finally
Follow strict TDD (see `SKILL.md`): tests come first, and the suite is the feedback-loop validator — run, fix, re-run, and only proceed when green. Every user story above must map to at least one test that was observed failing before implementation. Copy this checklist and check items off as you go:

- [ ] Red: tests for every user story above, run and observed failing
- [ ] Green: minimum implementation, full suite passing (report both runs)
- [ ] Refactor: cleaned up, suite still green
- [ ] Commit
