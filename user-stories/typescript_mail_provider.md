# Typescript mail provider interface
## Function
Create `src/providers/MailProvider.ts`, `src/providers/model.ts`, and `src/providers/ProviderRegistry.ts`; do not execute! These files define the **subject interface of the Proxy design pattern**: `MailProvider` is the platform-agnostic contract every mail platform must satisfy, the model types are the shared vocabulary all providers speak, and `ProviderRegistry` maps accounts to whichever concrete proxy serves them. This layer is the **only** mail API surface the UI is allowed to import — no concrete provider, no `fetch`, no platform SDK ever leaks past it. It contains zero I/O of its own, so it is pure TypeScript testable with an in-memory fake.

## User Stories
Following agile conventions, we want our user stories to be in the following format: `As a <actor> I want <requirement> so that <description>` will be written in shorthand as `actor | requirement | description`. User stories form the basis of tests and code.

actor | requirement | description
engineer | a `MailProvider` TypeScript interface that is the single mail API surface the UI may import | any email platform can be swapped in or added without touching UI code
engineer | the interface to cover a usable v1 client: `listTags()`, `listThreads(tagId, opts?: {pageToken?, pageSize?})`, `getThread(threadId)`, `getMessage(messageId)`, `send(draft)`, `markRead(messageId)`, `markUnread(messageId)`, `addTag(messageId, tagId)`, `removeTag(messageId, tagId)`, `archive(threadId)`, `trash(threadId)` | one contract covers reading, triaging, tagging, and replying to mail
engineer | organization modeled on tags, never folders/directories: a message carries any number of `tagIds` (many-to-many), a thread is listed under a tag when any of its messages carry that tag, and nothing in the model implies containment or hierarchy | tag-native platforms like Gmail map losslessly, and folder-only platforms can present each folder as a tag behind the same interface
engineer | every interface method to be async and return the shared model types | concrete proxies are free to reach their servers however they like without changing the contract
engineer | concrete providers to follow the Proxy pattern: constructed cheaply with no I/O, deferring connection/auth to the first method call | app cold-start never blocks on a mail server, and unused accounts cost nothing
engineer | pagination expressed as an opaque `pageToken: string` handed back on `listThreads` results (`nextPageToken`, absent on the last page) and passed back in verbatim | Gmail's `nextPageToken` today and an IMAP cursor tomorrow both fit without leaking platform details through the interface
engineer | a `capabilities()` method returning `{supportsTags, supportsSend, supportsArchive}` booleans, where `supportsTags` means the user can add/remove arbitrary tags (a folder-backed platform may expose only read-only, one-per-message tags) | the UI can hide affordances a future platform lacks instead of special-casing platform names
engineer | one normalized error class `MailProviderError` with a stable machine-readable `code` from a closed union (`AUTH_REQUIRED`, `NETWORK`, `NOT_FOUND`, `RATE_LIMITED`, `PROVIDER_ERROR`) and a human-readable `message` | UI error handling is written once, provider-agnostically
engineer | a `ProviderRegistry` with `register(accountId, provider)` and `resolve(accountId)`; `resolve` throws `MailProviderError('NOT_FOUND')` for unknown accounts | multiple accounts on different platforms coexist in one running app
engineer | `listAccounts()` on the registry returning registered `accountId`s in registration order | the UI can render an account switcher without a separate bookkeeping store
human | shared model types `Account`, `Tag`, `ThreadSummary`, `Message`, and `Draft` used by every provider | every screen renders identically no matter which platform the mail came from
human | `ThreadSummary` to carry `threadId`, `subject`, `snippet`, `from`, `date`, `unread`, `messageCount`, `tagIds` | the inbox list can render, tag chips included, without fetching full threads
human | `Message` to carry `messageId`, `threadId`, `from`, `to`, `cc`, `bcc`, `subject`, `date`, `bodyPlain`, `bodyHtml`, `unread`, `tagIds` | a full message view, tag chips, and reply flow have everything they need in one object
engineer | all dates in the model as epoch-milliseconds `number`s, normalized by each proxy before the model is returned | the UI never parses platform date strings; comparison and sorting are plain numeric
engineer | `to`/`cc`/`bcc` as `string[]` and `from` as `string` (any may be empty), with `bodyPlain`/`bodyHtml` each optional but at least one present | model shape matches how mail is actually addressed and encoded
engineer | tests to use an in-memory `FakeProvider` that fully implements `MailProvider` over fixture data with fake addresses | the interface is proven implementable, the registry is testable, and later UI tests reuse the same fake
engineer | a test (or lint rule) asserting no file under `src/ui/` imports from any concrete provider directory | the Proxy pattern boundary is enforced by CI, not convention
engineer | vitest as the test runner with no network, DOM, or filesystem access in this layer's tests | tests are deterministic and reproducible

## Input
None at runtime — this layer is pure types and an in-memory registry. Its inputs are the concrete providers registered into it at app startup.

## Output Schema
Shared model types (all fields required unless marked optional):
name, type, format (optional)
`Account`, object, `{accountId: string, displayName: string, platform: string}`
`Tag`, object, `{tagId: string, name: string, unreadCount?: number}`
`ThreadSummary`, object, `{threadId: string, subject: string, snippet: string, from: string, date: number, unread: boolean, messageCount: number, tagIds: string[]}`
`Message`, object, `{messageId: string, threadId: string, from: string, to: string[], cc: string[], bcc: string[], subject: string, date: number, bodyPlain?: string, bodyHtml?: string, unread: boolean, tagIds: string[]}`
`Draft`, object, `{to: string[], cc?: string[], bcc?: string[], subject: string, bodyPlain: string}`
`MailProviderError.code`, union, `AUTH_REQUIRED | NETWORK | NOT_FOUND | RATE_LIMITED | PROVIDER_ERROR`

# Finally
Follow strict TDD (see `SKILL.md`): tests come first, and the suite is the feedback-loop validator — run, fix, re-run, and only proceed when green. Every user story above must map to at least one test that was observed failing before implementation. Copy this checklist and check items off as you go:

- [ ] Red: tests for every user story above, run and observed failing
- [ ] Green: minimum implementation, full suite passing (report both runs)
- [ ] Refactor: cleaned up, suite still green
- [ ] Commit
