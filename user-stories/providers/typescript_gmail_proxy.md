# Typescript gmail proxy

Status: built — `src/providers/gmail/GmailProvider.ts`. This skill documents required behavior; the generalized contract every provider satisfies lives in `typescript_mail_provider.md`.

## Function
Create `src/providers/gmail/GmailProvider.ts`; do not execute! This class is the **first concrete Proxy** behind the `MailProvider` interface: a local surrogate for the remote Gmail server that fulfills every interface method by delegating over HTTP to the Python bridge (`python_gmail_bridge.md`), which wraps `simplegmail`. The UI never sees this class — it resolves it from the `ProviderRegistry` as a plain `MailProvider`. All Gmail-specific knowledge in the app (bridge URL, wire schema, error mapping) lives in this one directory.

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | `GmailProvider` to implement the `MailProvider` interface exactly, with a test asserting assignability | it registers into the `ProviderRegistry` as a drop-in and the UI cannot tell it from any other platform |
| engineer | tests to mock `fetch` (injected, never global) and never open a socket | all tests are deterministic and reproducible |
| engineer | test fixtures modeled on the bridge's wire JSON from `python_gmail_bridge.md`, using fake addresses | tests are realistic yet deterministic and touch no real account or bridge |
| engineer | the constructor to take `{baseUrl?: string, fetchFn?: typeof fetch}` with `baseUrl` defaulting to `http://127.0.0.1:8765` | tests inject a mock, and devices that can't see the host's localhost (e.g. Android emulator's `10.0.2.2`) can point elsewhere |
| engineer | construction to perform no I/O; the first HTTP request happens on the first interface method call (Proxy pattern: lazy initialization) | registering a Gmail account at startup costs nothing until the user opens it |
| engineer | each interface method mapped to exactly one bridge endpoint: `listTags→GET /tags`, `listThreads→GET /threads?tag=`, `getThread→GET /threads/{id}`, `getMessage→GET /messages/{id}`, `send→POST /messages/send`, `markRead/markUnread/addTag/removeTag→POST /messages/{id}/modify`, `archive/trash→POST /threads/{id}/modify` (thread-scoped, matching the interface's `archive(threadId)`/`trash(threadId)`) | the proxy stays a thin delegate with no business logic to drift |
| engineer | tag semantics passed through untouched: Gmail labels arrive as the model's tags, `tag_ids` maps to `tagIds`, and the proxy never synthesizes folder/containment behavior on top of them | the tag-based model reaches the UI exactly as Gmail expresses it |
| engineer | wire snake_case JSON mapped field-for-field to the shared camelCase model types (`thread_id→threadId`, `body_plain→bodyPlain`, ...) with a test per model type | the schema contract between bridge and app is enforced by tests, not by reading two documents |
| engineer | the bridge's epoch-milliseconds `date` integers carried into the model as-is with no parsing or timezone math | date normalization was done once, server-side; the proxy does not re-transform |
| engineer | `pageToken` passed through to the bridge verbatim and `next_page_token` handed back opaquely as `nextPageToken` | pagination stays platform-opaque through every layer |
| engineer | bridge error bodies `{code, message}` rethrown as `MailProviderError` with the same `code`, and transport failures (fetch rejection, non-JSON body) thrown as `MailProviderError('NETWORK')` | UI error handling stays provider-agnostic even when the bridge is down |
| human | an `AUTH_REQUIRED` error to carry a message telling me to start the bridge and complete the Google sign-in in a browser | i know how to fix authentication instead of seeing a raw HTTP failure |
| engineer | `capabilities()` returning `{supportsTags: true, supportsSend: true, supportsArchive: true}` without any bridge call | the UI can enable Gmail affordances even while the bridge is starting |
| engineer | `send(draft)` to POST the draft's `to`, `cc`, `bcc`, `subject`, and `bodyPlain` and resolve with the created `messageId` | the compose flow can confirm the send and open the sent message |
| engineer | no retry, caching, or offline-queue logic in v1, documented as a deliberate omission | the proxy stays a thin remote surrogate; resilience is a later, separately-tested layer |
| engineer | vitest as the test runner, sharing the fixture builders with the provider-interface tests where shapes overlap | one source of truth for what wire and model objects look like |

## Input
