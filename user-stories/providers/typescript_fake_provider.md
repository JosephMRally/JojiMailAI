# Typescript fake provider

Status: built — `src/providers/FakeProvider.ts`. This skill documents required behavior; the generalized contract lives in `typescript_mail_provider.md`.

## Function
`FakeProvider` is the **in-memory reference implementation** of `MailProvider`: it proves the contract implementable, exercises the registry in tests, and stands in for every platform in UI tests. It holds fixture data (`{tags, messages}`) entirely in memory — zero I/O, fully deterministic — yet still follows the Proxy discipline: cheap construction with "connection" deferred to the first method call. It is real `src/` code, not a test helper, because UI tests and future demos seed it as a complete working mail platform.

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | `FakeProvider` to implement the `MailProvider` interface exactly, with a test asserting assignability | it registers into the `ProviderRegistry` as a drop-in and UI tests cannot tell it from a real platform |
| engineer | construction from `FakeProviderFixtures` (`{tags, messages}`) plus `FakeProviderOptions` (`selfAddress`, `inboxTagId`, `trashTagId`, `sentTagId`, defaulting to `me@example.com`/`inbox`/`trash`/`sent`) | one fake serves every test scenario by seeding different fixtures, and archive/trash/send semantics are configurable without subclassing |
| engineer | fixtures defensively copied on the way in and model objects on the way out | provider mutations never leak into caller-held fixture data and callers can never corrupt provider state |
| engineer | construction to perform no I/O or work beyond copying fixtures and seeding the deterministic clock, with a `connected` getter (not part of `MailProvider`) that turns true on the first method call | the deferred-connection contract of the Proxy pattern is observable and testable |
| engineer | `listTags()` returning the fixture tags in seed order, `unreadCount` passed through untouched | the sidebar renders exactly what the test seeded, in a stable order |
| engineer | `listThreads(tagId)` to list a thread when **any** of its messages carries the tag, summaries sorted newest-first by date | tag semantics match the shared contract's many-to-many model |
| engineer | `ThreadSummary` built as: `subject` from the oldest message, `snippet` (first 100 characters, HTML stripped when only `bodyHtml` exists) and `from` and `date` from the newest, `unread` when any message is unread, `tagIds` the union across messages | the inbox list renders a faithful one-line digest of the whole thread |
| engineer | pagination with default page size 50 and opaque `fake-page-<offset>` tokens (`nextPageToken` absent on the last page); an unrecognizable token throws `MailProviderError('PROVIDER_ERROR')` | paging flows and token opacity are testable without a real platform |
| engineer | `getThread(threadId)` resolving the thread's messages oldest-first; `getThread`/`getMessage`/mutations on unknown ids throw `MailProviderError('NOT_FOUND')` | ordering and error contracts match what real providers return |
| engineer | `send(draft)` to append a deterministic sent message — ids `fake-sent-m<n>`/`fake-sent-t<n>`, `from` = `selfAddress`, tagged `sentTagId`, read (`unread: false`), `cc`/`bcc` defaulting to `[]` when the draft omits them, `date` advancing a deterministic clock seeded from the newest fixture date — and resolve with its `messageId` | compose flows are testable end-to-end with reproducible results and no wall clock |
| engineer | `markRead`/`markUnread` to flip `unread`; `addTag` idempotent (no duplicate tagIds); `removeTag` to drop the tag | triage mutations behave like a real platform without special cases |
| engineer | `archive(threadId)` to remove `inboxTagId` from every message in the thread, and `trash(threadId)` to replace each message's tags with `[trashTagId]` | Gmail-like archive/trash semantics are available to UI tests via configuration, not hardcoding |
| engineer | `capabilities()` returning `{supportsTags: true, supportsSend: true, supportsArchive: true}` | the fake exercises every UI affordance the contract allows |
| engineer | fixture data to use fake addresses only (`example.com`) | tests never touch or leak a real account |
| engineer | vitest as the test runner with no network, DOM, or filesystem access | tests are deterministic and reproducible |

Coverage note: a few story clauses describe implemented behavior not yet pinned by `tests/providers/` — the invalid-page-token `PROVIDER_ERROR` path, non-default options, the returned newest-first ordering, defensive copying, and the exact sent-message id format. They are the first Red candidates when this spec is next re-executed.

## Input
