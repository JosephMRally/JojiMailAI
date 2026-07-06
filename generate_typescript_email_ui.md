# Generate typescript email ui
## Function
Create the web UI under `src/ui/` (React + Vite + TypeScript) and the Capacitor shell config (`capacitor.config.ts`); do not execute! The UI is the client of the Proxy pattern: every screen obtains a `MailProvider` from the `ProviderRegistry` and calls only interface methods — it must compile and pass all tests with nothing but the in-memory `FakeProvider`, proving that adding IMAP or Outlook later requires zero UI changes. The Capacitor shell wraps the built web app for iOS/Android; native platform setup commands (`npx cap add ios|android`) are documented in the README, not executed.

## User Stories
Following agile conventions, we want our user stories to be in the following format: `As a <actor> I want <requirement> so that <description>` will be written in shorthand as `actor | requirement | description`. User stories form the basis of tests and code.

actor | requirement | description
engineer | every UI file to import mail types only from `src/providers/` (interface, model, registry) and never from a concrete provider directory, enforced by a test or lint rule | the Proxy boundary holds and new platforms need zero UI changes
engineer | UI tests to run against the in-memory `FakeProvider` from `generate_typescript_mail_provider.md`, seeded with fixture data using fake addresses | tests are deterministic, reproducible, and touch no bridge or network
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
engineer | app startup to construct providers and register them (Gmail via its config) in one composition-root module, `src/main.tsx`-adjacent, the only file allowed to import concrete providers | the proxy wiring lives in exactly one place
engineer | the Gmail bridge `baseUrl` read from a single config module honoring a `VITE_BRIDGE_URL` env override (default `http://127.0.0.1:8765`) | the Android emulator (`10.0.2.2`) and a physical device can each reach the bridge without code edits
engineer | `capacitor.config.ts` with `appId`, `appName`, and `webDir` pointing at Vite's build output (`dist`), and no native plugins required in v1 | `npx cap sync` wraps the same tested web build for iOS and Android
engineer | `npm run build` (Vite) to produce the `webDir` output consumed by Capacitor, wired into package.json scripts | one command path from source to something `cap sync` can package

## Input
At runtime the UI's only inputs are the providers registered in the `ProviderRegistry` at the composition root and user interaction. In tests, the registry holds only `FakeProvider` instances — no bridge, no network, no Capacitor native layer.

## Output Schema
The UI produces no data files. Its "outputs" are provider calls, which must be exactly the `MailProvider` interface methods with the shared model/`Draft` types from `generate_typescript_mail_provider.md` — asserted in tests via the `FakeProvider`'s recorded calls.

# Finally
Follow strict TDD (see `SKILL.md`): write the tests derived from the user stories first and run them to show they fail (red) **before** changing any implementation; then implement until green and report both runs. Every user story must map to at least one test that was observed failing first. Commit after green.
