# Typescript yahoo provider

Status: **future — no code exists.** This skill is the design spec for Yahoo Mail support; nothing below is built. The generalized contract every provider satisfies lives in `typescript_mail_provider.md` — read it first.

## Function
Create `src/providers/yahoo/YahooProvider.ts` plus a Yahoo bridge (`bridge/yahoo_app.py`, a sibling of the Gmail bridge); do not execute! Yahoo has **no public REST mail API** — programmatic access is IMAP/SMTP, which cannot run inside a webview — so Yahoo follows the Gmail architecture: a localhost Python bridge owns all IMAP/SMTP I/O and credentials, and this thin TypeScript proxy fulfills every `MailProvider` method by delegating to it over HTTP. All Yahoo-specific knowledge (servers, folder names, flag semantics, auth) lives in the bridge and this one directory.

Yahoo is the contract's **folder-only platform**: Yahoo IMAP has a fixed flag set with no custom keywords, so a message lives in exactly one folder. Each folder (`Inbox`, `Draft`, `Sent`, `Bulk Mail`, `Trash`, `Archive`, plus user folders) surfaces as a tag, every message carries exactly one folder tag, and `capabilities().supportsTags` is honestly `false`.

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | `YahooProvider` to implement the `MailProvider` interface exactly, with a test asserting assignability | it registers into the `ProviderRegistry` as a drop-in and the UI cannot tell it from any other platform |
| engineer | the constructor to take `{baseUrl?: string, fetchFn?: typeof fetch}` and perform no I/O; the first HTTP request happens on the first interface method call | tests inject a mock fetch, and construction follows the Proxy discipline |
| engineer | the bridge to speak IMAP to `imap.mail.yahoo.com:993` (SSL) and SMTP to `smtp.mail.yahoo.com:465`, authenticating with a per-app **app password** the user creates under Yahoo Account Security (OAuth2/OAUTHBEARER noted as the approval-gated alternative — Yahoo's mail scope is not self-serve) | the client works for real users today without Yahoo partner approval, and the auth story can upgrade later without touching mail logic |
| human | an `AUTH_REQUIRED` error whose message tells me to create a Yahoo app password and configure the bridge with it | i can fix authentication myself instead of decoding an IMAP protocol error |
| engineer | `listTags()` returning one tag per IMAP folder, using SPECIAL-USE attributes where Yahoo actually returns them and the community-reported well-known names (`Inbox`, `Draft`, `Sent`, `Bulk Mail`, `Trash`, `Archive`) as fallback | the sidebar shows where mail actually lives, with a documented fallback when special-use attributes are absent |
| engineer | `listThreads(tagId)` listing the folder's mail grouped into threads by the bridge (RFC 8474 `OBJECTID` thread ids where available, else `References`/`In-Reply-To` chaining), summaries newest-first | the contract's thread view works even though IMAP is message-centric |
| engineer | pagination as an opaque bridge cursor over descending UID windows, handed back as `nextPageToken` and passed back verbatim | IMAP paging state never leaks past the bridge, exactly as the contract requires |
| engineer | `send(draft)` submitted over SMTP with the sent message appended to the `Sent` folder, resolving with the appended message's id | the compose flow confirms the send and the Sent tag stays truthful |
| engineer | `markRead`/`markUnread` as IMAP `STORE` of the `\Seen` flag | read state round-trips through the real mailbox |
| engineer | `addTag`/`removeTag` to reject with `MailProviderError('PROVIDER_ERROR')` and a message explaining Yahoo has no labels — and `capabilities()` returning `{supportsTags: false, supportsSend: true, supportsArchive: true}` without any bridge call | the UI hides tag editing for Yahoo accounts instead of offering an affordance the platform cannot honor |
| engineer | `archive(threadId)`/`trash(threadId)` as `UID MOVE` of the thread's messages to `Archive`/`Trash` (fallback `COPY` + `\Deleted` + `EXPUNGE` where MOVE is unavailable), after which each message carries its new folder's tag | archive and trash match what Yahoo's own clients do, staying within tag semantics |
| engineer | message `INTERNALDATE`/`Date` headers normalized to epoch-milliseconds in the bridge, carried through the proxy untouched | dates leave the provider as plain numbers per the shared contract |
| engineer | bridge and IMAP failures mapped to `MailProviderError`: auth rejections → `AUTH_REQUIRED`, unknown ids/folders → `NOT_FOUND`, Yahoo throttling → `RATE_LIMITED`, unreachable bridge/fetch rejection → `NETWORK`, all else → `PROVIDER_ERROR` | UI error handling stays provider-agnostic |
| engineer | provider tests to mock `fetch` (injected, never global) against fixtures modeled on the Yahoo bridge's wire JSON with fake addresses; bridge tests to mock the IMAP/SMTP client per the Gmail bridge's pattern | tests are deterministic, reproducible, and touch no real account |
| engineer | vitest as the test runner, sharing fixture builders with the provider-interface tests where shapes overlap | one source of truth for what wire and model objects look like |

## Open design questions (resolve before the TDD loop)
