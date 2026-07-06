# Python gmail bridge
## Function
Create a Python service called `bridge/app.py`; do not execute! The service should be a Facade over the `simplegmail` library that hides the Gmail API behind a small localhost HTTP API. It is the **server-side half of the Gmail proxy**: `simplegmail` is Python and cannot run inside the Capacitor webview, so the app-side `GmailProvider` (see `typescript_gmail_proxy.md`) delegates to this bridge over HTTP. The bridge owns all Gmail I/O — OAuth, paging, label changes, send — so the web app never touches Google directly and never holds Gmail credentials.

## User Stories
Following agile conventions, we want our user stories to be in the following format: `As a <actor> I want <requirement> so that <description>` will be written in shorthand as `actor | requirement | description`. User stories form the basis of tests and code.

actor | requirement | description
engineer | tests to mock the `simplegmail` Gmail client | all tests are deterministic and reproducible
engineer | test fixtures modeled on the shape of real `simplegmail` `Message` objects, using fake addresses | tests are realistic yet deterministic and touch no real account
engineer | use [`simplegmail`](https://github.com/JosephMRally/simplegmail) (the JosephMRally fork) to connect to Gmail | it wraps the Gmail API and speeds up development
engineer | FastAPI as the HTTP framework, with tests driven through `TestClient` | endpoints are testable in-process with no socket or live server
engineer | the server to bind `127.0.0.1` only, on a port from `--port` (default: 8765) | the mailbox is never reachable from off the device
engineer | pass both `~/gmail-token.json` (creds_file) and `~/client_secret.json` (client_secret_file) to the Gmail constructor; a valid saved token is reused | so that signing in isnt necessary a second time
human | a `--client-secret PATH` flag to override the OAuth client JSON location (default: `~/client_secret.json`) | i can authenticate with an OAuth client stored somewhere other than my home directory
human | a `--token PATH` flag to override the saved OAuth token location (default: `~/gmail-token.json`) | i can reuse a saved token stored somewhere other than my home directory
human | a clear JSON error body with `code: "AUTH_REQUIRED"` and a non-2xx status when neither the saved token nor the OAuth client exists | so that the user understands why authentication cannot proceed and how to fix it
engineer | the `simplegmail` client constructed lazily on the first request that needs it, not at process start | the bridge starts (and reports auth errors per-request) even before credentials exist
engineer | `GET /health` returning `{status: "ok"}` with no Gmail call | the app can detect a running bridge without triggering OAuth
engineer | `GET /tags` returning Gmail labels as tags — Gmail is already tag-native, so labels pass through as a flat list with no folder/directory semantics invented on top | the app renders Inbox, Sent, and user labels from one endpoint as tags
engineer | `GET /threads?tag=ID&page_token=T&page_size=N` (page_size 1-100, default 25) returning summaries of threads carrying that tag plus `next_page_token` when more pages exist, passing Gmail's own page token through opaquely | the thread list loads a page at a time and the app never learns Gmail pagination internals
engineer | `GET /threads/{thread_id}` returning the thread's messages oldest-first and `GET /messages/{message_id}` returning one full message | the app can open a conversation or a single message
engineer | derive each message's `date` as an epoch-milliseconds integer from the fork's `Message.internalDate` (an `Optional[int]`; also accept an `internal_date` attribute), falling back to parsing the fork's `Message.headerDate` (a `str`; the fork renamed upstream's `Message.date`; also accept `header_date`) only when `internalDate` is missing | every message gets exactly one canonical date and the app never parses Gmail date strings
engineer | read `sender`, `recipient`, `cc`, and `bcc` off each `simplegmail` `Message`, treating `sender` as a string and the rest as lists of strings (any may be empty/None) | every From/To/Cc/Bcc value reaches the app in the shape it expects
engineer | message bodies returned with both `body_plain` and `body_html` when `simplegmail` exposes them, omitting whichever is absent | the app can prefer HTML and fall back to plain text
human | `POST /messages/send` accepting `{to, cc?, bcc?, subject, body_plain}`, requiring `to`, `subject`, and `body_plain`, and returning the sent message's `message_id` | i can reply and compose from the app
human | `POST /messages/{message_id}/modify` accepting `{action, tag_id?}` with `action` from the closed set `mark_read | mark_unread | add_tag | remove_tag | archive | trash` (`tag_id` required for the tag actions, rejected otherwise) | triage and tagging in the app change the real mailbox
engineer | all mutations expressed as Gmail label (tag) changes — `archive` removes the `INBOX` label, `add_tag`/`remove_tag` add/remove the given label — never as a move between containers | the tag model holds end-to-end and a message can carry many tags at once
engineer | `trash` to only move mail to Gmail's Trash (never permanent delete), and no endpoint that deletes permanently | every destructive action stays reversible from Gmail's own UI
engineer | Gmail/`simplegmail` exceptions caught and mapped to JSON error bodies `{code, message}` with `code` from `AUTH_REQUIRED | NOT_FOUND | RATE_LIMITED | PROVIDER_ERROR` and matching HTTP status (401, 404, 429, 502) | the app-side proxy can normalize errors without string-matching Google messages
engineer | all response JSON in snake_case exactly matching the Output Schema below | the app-side proxy's field mapping is mechanical and testable field-for-field
agent | python args and exit codes are used (`--port`, `--token`, `--client-secret`; non-zero exit on bad flags) | so that LLM harness executing the code knows the status
engineer | include a flag for logging, `-v`/`--verbose` (off by default) | so that i can see requests being processed for testing

## Input
The bridge reads the mailbox through the `simplegmail` library, which wraps the Gmail API — there is no MCP connector involved. Authentication is Google OAuth: use the `~/client_secret.json` (an OAuth client from the Google Cloud Console) in the constructor. The first run opens a browser to authorize and writes `~/gmail-token.json` for reuse. Because the first run needs a browser, provision `~/gmail-token.json` in an environment that has one — the bridge cannot authenticate headless on a cold start.

When running locally, pass `--verbose` to watch requests being processed (logging is off by default).

## Output Schema
Wire JSON (snake_case; the app-side proxy maps these to the shared model in `typescript_mail_provider.md`):
name, type, format (optional)
`tag`, object, `{tag_id: str, name: str, unread_count?: int}`
`thread_summary`, object, `{thread_id: str, subject: str, snippet: str, from: str, date: int (epoch ms), unread: bool, message_count: int, tag_ids: [str]}`
`thread list`, object, `{threads: [thread_summary], next_page_token?: str}`
`message`, object, `{message_id: str, thread_id: str, from: str, to: [str], cc: [str], bcc: [str], subject: str, date: int (epoch ms), body_plain?: str, body_html?: str, unread: bool, tag_ids: [str]}`
`send result`, object, `{message_id: str}`
`error`, object, `{code: AUTH_REQUIRED|NOT_FOUND|RATE_LIMITED|PROVIDER_ERROR, message: str}`

# Finally
Follow strict TDD (see `SKILL.md`): tests come first, and the suite is the feedback-loop validator — run, fix, re-run, and only proceed when green. Every user story above must map to at least one test that was observed failing before implementation. Copy this checklist and check items off as you go:

- [ ] Red: tests for every user story above, run and observed failing
- [ ] Green: minimum implementation, full suite passing (report both runs)
- [ ] Refactor: cleaned up, suite still green
- [ ] Commit
