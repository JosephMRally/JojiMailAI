# Typescript microsoft provider

Status: **future — no code exists.** This skill is the design spec for Outlook/Microsoft 365 support; nothing below is built. The generalized contract every provider satisfies lives in `typescript_mail_provider.md` — read it first.

## Function
Create `src/providers/microsoft/MicrosoftProvider.ts` (plus auth/wire helpers in the same directory); do not execute! This class is a concrete Proxy behind the `MailProvider` interface for Outlook.com and Microsoft 365 mailboxes. Unlike Gmail, no localhost bridge is needed: **Microsoft's documented SPA pattern is direct browser calls to Graph**, with auth via MSAL.js (`@azure/msal-browser`, authorization code + PKCE, a `spa`-type redirect URI). (Core mail endpoints work cross-origin; the known CORS caveat — endpoints that 302-redirect to content download URLs, e.g. attachments — is out of v1 scope.) All Microsoft-specific knowledge — Graph endpoints, OData paging, category/folder mapping, MSAL configuration — lives in this one directory.

The platform's organization maps onto the tag model as: **Outlook categories are the tags** (they are many-to-many string labels on `message.categories`, exactly our model), and the well-known folders `inbox`, `archive`, `deleteditems`, `sentitems` surface as read-only system tags derived from folder membership.

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | `MicrosoftProvider` to implement the `MailProvider` interface exactly, with a test asserting assignability | it registers into the `ProviderRegistry` as a drop-in and the UI cannot tell it from any other platform |
| engineer | the constructor to take `{graphBaseUrl?: string, fetchFn?: typeof fetch, acquireToken: () => Promise<string>}` and perform no I/O; the first Graph call happens on the first interface method call | tests inject a mock fetch and a canned token, and construction follows the Proxy discipline |
| engineer | auth delegated to an injected MSAL-backed `acquireToken` (delegated scopes `Mail.ReadWrite`, `Mail.Send`, `MailboxSettings.ReadWrite`), never handled inside the provider | token flows (including the SPA 24-hour refresh-token limit and any Capacitor-webview strategy) evolve without touching mail logic |
| engineer | `listTags()` merging the category master list (`GET /me/outlook/masterCategories`) with the well-known folder tags `inbox`/`archive`/`deleteditems`/`sentitems` | the sidebar shows both the user's labels and the places mail lives, all as tags |
| engineer | `listThreads(tagId)` for folder tags via `GET /me/mailFolders/{wellKnownName}/messages` and for category tags via `GET /me/messages?$filter=categories/any(c: c eq '{name}')`, grouped into threads client-side by `conversationId` | one tag semantics covers both folder membership and labels without leaking which is which |
| engineer | `getThread(threadId)` as `GET /me/messages?$filter=conversationId eq '{threadId}'`, sorted oldest-first in the provider (Graph v1.0 documents no conversation-list endpoint for user mailboxes, and `$orderby` combined with `$filter` is restricted) | the contract's thread view works even though Graph is message-centric |
| engineer | pagination by handing back Graph's `@odata.nextLink` URL, whole and untouched, as `nextPageToken` and requesting it verbatim on the next page | Microsoft explicitly documents the nextLink as an opaque continuation — it maps 1:1 onto the contract's opaque token |
| engineer | `send(draft)` as create-draft (`POST /me/messages`) then send-draft — never bare `POST /me/sendMail` | `sendMail` returns `202 Accepted` with an empty body, but the contract's `SendResult` needs the created `messageId`; the draft carries it |
| engineer | `markRead`/`markUnread` as `PATCH /me/messages/{id}` `{isRead}`; `addTag`/`removeTag` on category tags as a read-modify-write `PATCH` of the full `categories` array (folder tags reject with `PROVIDER_ERROR`) | Graph updates read state and categories on received messages, and folder membership is never faked as a label edit |
| engineer | `archive(threadId)`/`trash(threadId)` as `POST /me/messages/{id}/move` with `destinationId` `archive`/`deleteditems` for each message in the thread, with the spec-level caveat that **move mints a new message id** which the provider must surface consistently | archive/trash match Outlook's real semantics, and id instability is a designed-for fact, not a surprise |
| engineer | Graph's ISO `receivedDateTime` normalized to epoch-milliseconds in the provider | dates leave the provider as plain numbers per the shared contract |
| engineer | Graph errors mapped to `MailProviderError`: 401 → `AUTH_REQUIRED` (message says to sign in with Microsoft again), 404 → `NOT_FOUND`, 429 → `RATE_LIMITED` (honoring `Retry-After` in the message), fetch rejection/non-JSON → `NETWORK`, all else → `PROVIDER_ERROR` | UI error handling stays provider-agnostic |
| engineer | `capabilities()` returning `{supportsTags: true, supportsSend: true, supportsArchive: true}` without any Graph call | categories are true many-to-many user-editable labels, so every affordance is honest |
| engineer | tests to mock `fetchFn` and `acquireToken` (never global, no socket, no real account), with fixtures modeled on real Graph JSON shapes using fake addresses | tests are deterministic and reproducible |
| engineer | vitest as the test runner, sharing fixture builders with the provider-interface tests where shapes overlap | one source of truth for what wire and model objects look like |

## Open design questions (resolve before the TDD loop)
