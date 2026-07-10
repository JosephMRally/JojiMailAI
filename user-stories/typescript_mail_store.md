# Typescript mail store
## Function
Create `src/store/MailStore.ts`, `src/store/SqliteMailStore.ts`, `src/store/FakeMailStore.ts`, and `src/store/tokenize.ts`; do not execute! This is the local persistence layer: every thread and message fetched from a provider is upserted into an on-device **SQLite** database, making mail readable offline and searchable locally without refetching. Text search tokenizes the query (stop words excluded) and matches it against each message's stored subject and body, so results are exact. It follows the repo's standard pattern: `MailStore` is the interface the UI depends on, `SqliteMailStore` is the concrete implementation, `FakeMailStore` is the in-memory implementation tests run against.

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | a `MailStore` TypeScript interface that is the single storage surface the UI may import, enforced by the same no-concrete-imports rule that guards providers | storage backends swap the way mail platforms do |
| engineer | the interface to cover: `upsertThreads(accountId, summaries)`, `upsertMessages(accountId, messages)`, `listThreads(accountId, tagId, opts?)`, `getThread(threadId)`, `getMessage(messageId)`, `searchText(accountId, terms)`, and `clear(accountId)` | syncing, offline reading, local search, and account removal all run through one contract |
| engineer | `SqliteMailStore` built on `@capacitor-community/sqlite` (with the jeep-sqlite/sql.js web pathway) behind a thin injected database handle | one store runs on iOS, Android, and web, and tests can inject an in-memory database instead of the native plugin |
| engineer | a schema mirroring the shared model: `threads(thread_id PK, account_id, subject, snippet, from_addr, date, unread, message_count)`, `messages(message_id PK, thread_id, account_id, from_addr, to_addrs, cc_addrs, bcc_addrs, subject, date, body_plain, body_html, unread)`, and `message_tags(message_id, tag_id)` | mail lists and tag filters are plain indexed queries, with no provider round-trip |
| engineer | all writes as idempotent upserts keyed on `thread_id`/`message_id` | re-syncing the same page never duplicates a row, and content updates land in place |
| human | previously synced mail listed and read from the store even when the network is unreachable | i can read my mail offline |
| engineer | tokenization in one shared `tokenize.ts`: lowercase `subject` + `bodyPlain`, split on non-alphanumeric runs, drop tokens shorter than 2 characters and every word in a bundled English stop-word list (`stopwords.ts`, ~175 words: articles, pronouns, prepositions, auxiliaries) | only meaningful words are indexed, and indexing and querying can never tokenize differently |
| engineer | `searchText(accountId, terms)` to tokenize the terms with the same `tokenize.ts` rules, then return every message whose stored `subject` + `body_plain` contains **all** the query tokens | matching against the stored text keeps results exact |
| human | search results identical to what a full scan of every stored message would return | search never misses a match or returns a phantom one |
| engineer | search terms that are stop words or sub-2-character tokens dropped before matching, and an all-stop-word query returning an empty result plus a "query too generic" signal | the index and the query agree on what a word is, and meaningless queries fail fast instead of matching everything |
| engineer | search matching the current stored `subject` and `body_plain` after any re-upsert that changes them | search can never go stale against the stored text |
| engineer | `FakeMailStore` implementing the interface in memory (with real tokenize behavior via the shared module) | UI tests exercise sync, offline, and search flows with no database at all |
| engineer | `SqliteMailStore` tests to run against an in-memory sql.js database injected through the handle — never the native plugin, never the filesystem | all tests are deterministic and reproducible |
| engineer | vitest as the test runner, fixtures using fake addresses, and search tests asserting exactness directly — every indexed word is found and results match a brute-force scan | the property that makes the design correct is pinned by tests, not assumed |

## Input
