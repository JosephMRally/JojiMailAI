# Typescript gmail proxy

Status: built — `src/providers/gmail/GmailProvider.ts`. This skill documents required behavior; the generalized contract every provider satisfies lives in `typescript_mail_provider.md`.

## Function
Create `src/providers/gmail/GmailProvider.ts`; do not execute! This class is the **first concrete Proxy** behind the `MailProvider` interface: a local surrogate for the remote Gmail server that fulfills every interface method by calling the Gmail API directly via REST. The UI never sees this class — it resolves it from the `ProviderRegistry` as a plain `MailProvider`. Authentication flows through native Capacitor OAuth (ASWebAuthenticationSession on iOS, Custom Tabs on Android, browser-based on web). All Gmail-specific knowledge in the app (API schema, error mapping, OAuth setup) lives in this one directory.

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | `GmailProvider` to implement the `MailProvider` interface exactly, with a test asserting assignability | it registers into the `ProviderRegistry` as a drop-in and the UI cannot tell it from any other platform |
| engineer | tests to mock `fetch` (injected, never global) and never open a socket or trigger OAuth | all tests are deterministic and reproducible |
| engineer | test fixtures modeled on the Gmail REST API v1 shape (threads, messages, labels), using fake addresses | tests are realistic yet deterministic and touch no real account |
| engineer | the constructor to take `{accessToken, fetchFn?: typeof fetch}` where `accessToken` is a required OAuth2 token | all API calls use this token for authorization |
| engineer | construction to perform no I/O; the first HTTP request happens on the first interface method call (Proxy pattern: lazy initialization) | registering a Gmail account at startup costs nothing until the user opens it |
| engineer | each interface method mapped to exactly one Gmail REST endpoint: `listTags→GET /gmail/v1/users/me/labels`, `listThreads→GET /gmail/v1/users/me/threads?q=...`, `getThread→GET /gmail/v1/users/me/threads/{id}?format=full`, `getMessage→GET /gmail/v1/users/me/messages/{id}?format=full`, `send→POST /gmail/v1/users/me/messages/send`, `markRead/markUnread/addTag/removeTag→POST /gmail/v1/users/me/messages/{id}/modify`, `archive/trash→POST /gmail/v1/users/me/threads/{id}/modify` (thread-scoped, matching the interface's `archive(threadId)`/`trash(threadId)`) | the proxy stays a thin delegate with no business logic to drift |
| engineer | tag semantics passed through untouched: Gmail labels arrive as the model's tags, `id` maps to `tagId` and `name` to `tagName`, and the proxy never synthesizes folder/containment behavior on top of them | the tag-based model reaches the UI exactly as Gmail expresses it |
| engineer | wire snake_case JSON mapped field-for-field to the shared camelCase model types (`threadId→threadId`, `payload.headers` used to extract subject/from/cc/bcc/date, `snippet` for body preview) with a test per model type | the schema contract between Gmail API and app is enforced by tests, not by reading two documents |
| engineer | Gmail's internal `internalDate` (milliseconds) carried into the model as-is; parse RFC 2822 date headers only as fallback for edge cases | date normalization matches the bridge's behavior; avoid re-parsing |
| engineer | `pageToken` passed through to Gmail verbatim and `nextPageToken` handed back opaquely | pagination stays platform-opaque through every layer |
| engineer | Gmail API error responses mapped to `MailProviderError`: `401/403` → `AUTH_REQUIRED`, `404` → `NOT_FOUND`, `429` → `RATE_LIMITED`, other HTTP 4xx/5xx → `PROVIDER_ERROR`; transport failures (fetch rejection, non-JSON body) thrown as `MailProviderError('NETWORK')` | UI error handling stays provider-agnostic even when the API is unavailable |
| human | an `AUTH_REQUIRED` error to carry a message telling me to sign in via the app's OAuth flow | i know how to re-authenticate instead of seeing a raw HTTP failure |
| engineer | `capabilities()` returning `{supportsTags: true, supportsSend: true, supportsArchive: true}` without any API call | the UI can enable Gmail affordances immediately |
| engineer | `send(draft)` to create a raw RFC 2822 message and POST to Gmail's send endpoint, resolving with the created `messageId` | the compose flow can confirm the send and open the sent message |
| engineer | no retry, caching, or offline-queue logic in v1, documented as a deliberate omission | the proxy stays a thin remote surrogate; resilience is a later, separately-tested layer |
| engineer | vitest as the test runner, sharing the fixture builders with the provider-interface tests where shapes overlap | one source of truth for what wire and model objects look like |

## Input
