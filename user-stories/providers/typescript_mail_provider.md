# Typescript mail provider interface

## Contents
- Function
- Provider family (per-provider skills)
- User Stories (the shared contract)
- What every concrete provider must satisfy
- Per-provider skill template
- Adding a mail platform (workflow)
- Input
- Output Schema
- Finally

## Function
Create `src/providers/MailProvider.ts`, `src/providers/model.ts`, and `src/providers/ProviderRegistry.ts`; do not execute! These files define the **subject interface of the Proxy design pattern**: `MailProvider` is the platform-agnostic contract every mail platform must satisfy, the model types are the shared vocabulary all providers speak, and `ProviderRegistry` maps accounts to whichever concrete proxy serves them. This layer is the **only** mail API surface the UI is allowed to import — no concrete provider, no `fetch`, no platform SDK ever leaks past it. It contains zero I/O of its own, so it is pure TypeScript testable with an in-memory fake.

This spec is also the **generalized skill for the provider family**: everything below applies to every `MailProvider`, and each concrete provider has its own skill holding only what is specific to that platform. Load this file plus exactly one per-provider skill when working on a provider.

## Provider family (per-provider skills)

| Provider | Skill | Status | Read when |
|---|---|---|---|
| `FakeProvider` (in-memory reference) | [typescript_fake_provider.md](typescript_fake_provider.md) | built | Touching the fake or any test that seeds it |
| `GmailProvider` (native OAuth) | [typescript_gmail_proxy.md](typescript_gmail_proxy.md) | built | Touching the app-side Gmail integration |
| `YahooProvider` (IMAP/SMTP bridge) | [typescript_yahoo_provider.md](typescript_yahoo_provider.md) | future — no code exists | Designing or building Yahoo support |
| `MicrosoftProvider` (Microsoft Graph) | [typescript_microsoft_provider.md](typescript_microsoft_provider.md) | future — no code exists | Designing or building Outlook/Microsoft 365 support |

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | a `MailProvider` TypeScript interface that is the single mail API surface the UI may import | any email platform can be swapped in or added without touching UI code |
| engineer | the interface to cover a usable v1 client: `listTags()`, `listThreads(tagId, opts?: {pageToken?, pageSize?})`, `getThread(threadId)`, `getMessage(messageId)`, `send(draft)`, `markRead(messageId)`, `markUnread(messageId)`, `addTag(messageId, tagId)`, `removeTag(messageId, tagId)`, `archive(threadId)`, `trash(threadId)` | one contract covers reading, triaging, tagging, and replying to mail |
| engineer | organization modeled on tags, never folders/directories: a message carries any number of `tagIds` (many-to-many), a thread is listed under a tag when any of its messages carry that tag, and nothing in the model implies containment or hierarchy | tag-native platforms like Gmail map losslessly, and folder-only platforms can present each folder as a tag behind the same interface |
| engineer | every interface method to be async and return the shared model types | concrete proxies are free to reach their servers however they like without changing the contract |
| engineer | concrete providers to follow the Proxy pattern: constructed cheaply with no I/O, deferring connection/auth to the first method call | app cold-start never blocks on a mail server, and unused accounts cost nothing |
| engineer | pagination expressed as an opaque `pageToken: string` handed back on `listThreads` results (`nextPageToken`, absent on the last page) and passed back in verbatim | Gmail's `nextPageToken` today and an IMAP cursor tomorrow both fit without leaking platform details through the interface |
| engineer | a `capabilities()` method returning `{supportsTags, supportsSend, supportsArchive}` booleans, where `supportsTags` means the user can add/remove arbitrary tags (a folder-backed platform may expose only read-only, one-per-message tags) | the UI can hide affordances a future platform lacks instead of special-casing platform names |
| engineer | one normalized error class `MailProviderError` with a stable machine-readable `code` from a closed union (`AUTH_REQUIRED`, `NETWORK`, `NOT_FOUND`, `RATE_LIMITED`, `PROVIDER_ERROR`) and a human-readable `message` | UI error handling is written once, provider-agnostically |
| engineer | a `ProviderRegistry` with `register(accountId, provider)` and `resolve(accountId)`; `resolve` throws `MailProviderError('NOT_FOUND')` for unknown accounts | multiple accounts on different platforms coexist in one running app |
| engineer | `listAccounts()` on the registry returning registered `accountId`s in registration order | the UI can render an account switcher without a separate bookkeeping store |
| human | shared model types `Account`, `Tag`, `ThreadSummary`, `Message`, and `Draft` used by every provider | every screen renders identically no matter which platform the mail came from |
| human | `ThreadSummary` to carry `threadId`, `subject`, `snippet`, `from`, `date`, `unread`, `messageCount`, `tagIds` | the inbox list can render, tag chips included, without fetching full threads |
| human | `Message` to carry `messageId`, `threadId`, `from`, `to`, `cc`, `bcc`, `subject`, `date`, `bodyPlain`, `bodyHtml`, `unread`, `tagIds` | a full message view, tag chips, and reply flow have everything they need in one object |
| engineer | all dates in the model as epoch-milliseconds `number`s, normalized by each proxy before the model is returned | the UI never parses platform date strings; comparison and sorting are plain numeric |
| engineer | `to`/`cc`/`bcc` as `string[]` and `from` as `string` (any may be empty), with `bodyPlain`/`bodyHtml` each optional but at least one present | model shape matches how mail is actually addressed and encoded |
| engineer | tests to use an in-memory `FakeProvider` that fully implements `MailProvider` over fixture data with fake addresses (detail: `typescript_fake_provider.md`) | the interface is proven implementable, the registry is testable, and later UI tests reuse the same fake |
| engineer | a test (or lint rule) asserting no file under `src/ui/` imports from any concrete provider directory | the Proxy pattern boundary is enforced by CI, not convention |
| engineer | vitest as the test runner with no network, DOM, or filesystem access in this layer's tests | tests are deterministic and reproducible |

## What every concrete provider must satisfy
