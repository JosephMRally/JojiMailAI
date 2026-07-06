# Typescript mail store
## Function
Create `src/store/MailStore.ts`, `src/store/SqliteMailStore.ts`, `src/store/FakeMailStore.ts`, and `src/store/tokenize.ts`; do not execute! This is the local persistence layer: every thread and message fetched from a provider is upserted into an on-device **SQLite** database, making mail readable offline and searchable locally without refetching. Each message row carries a **Bloom filter of its content words (stop words excluded)** that prescreens text search — candidates come from cheap bitwise checks, and only candidates are verified against stored text. It follows the repo's standard pattern: `MailStore` is the interface the UI depends on, `SqliteMailStore` is the concrete implementation, `FakeMailStore` is the in-memory implementation tests run against.

## User Stories
Following agile conventions, we want our user stories to be in the following format: `As a <actor> I want <requirement> so that <description>` will be written in shorthand as `actor | requirement | description`. User stories form the basis of tests and code.

actor | requirement | description
engineer | a `MailStore` TypeScript interface that is the single storage surface the UI may import, enforced by the same no-concrete-imports rule that guards providers and intelligence | storage backends swap the way mail platforms and AI backends do
engineer | the interface to cover: `upsertThreads(accountId, summaries)`, `upsertMessages(accountId, messages)`, `listThreads(accountId, tagId, opts?)`, `getThread(threadId)`, `getMessage(messageId)`, `searchText(accountId, terms)`, and `clear(accountId)` | syncing, offline reading, local search, and account removal all run through one contract
engineer | `SqliteMailStore` built on `@capacitor-community/sqlite` (with the jeep-sqlite/sql.js web pathway) behind a thin injected database handle | one store runs on iOS, Android, and web, and tests can inject an in-memory database instead of the native plugin
engineer | a schema mirroring the shared model: `threads(thread_id PK, account_id, subject, snippet, from_addr, date, unread, message_count)`, `messages(message_id PK, thread_id, account_id, from_addr, to_addrs, cc_addrs, bcc_addrs, subject, date, body_plain, body_html, unread, bloom BLOB)`, and `message_tags(message_id, tag_id)` | mail lists and tag filters are plain indexed queries, with no provider round-trip
engineer | all writes as idempotent upserts keyed on `thread_id`/`message_id` | re-syncing the same page never duplicates a row, and content updates land in place
human | previously synced mail listed and read from the store even when the bridge and network are unreachable | i can read my mail offline
engineer | tokenization in one shared `tokenize.ts`: lowercase `subject` + `bodyPlain`, split on non-alphanumeric runs, drop tokens shorter than 2 characters and every word in a bundled English stop-word list (`stopwords.ts`, ~175 words: articles, pronouns, prepositions, auxiliaries) | only meaningful words are indexed, and indexing and querying can never tokenize differently
engineer | a per-message Bloom filter computed on upsert from the message's token set and stored in the `bloom` column: m = 2048 bits (256 bytes) and k = 4 hash positions derived by double hashing from two FNV-1a variants (Kirsch-Mitzenmacher) — at a typical ~200 distinct content words per message this yields ≈1% false positives, and 256 bytes/message keeps 10k messages under 3 MB | text-search prescreening is a few bitwise tests per message instead of scanning bodies, with every constant justified
engineer | `searchText(accountId, terms)` to tokenize the terms with the same `tokenize.ts` rules, take as candidates only messages whose Bloom filter contains **all** terms, then verify each candidate against its stored text before returning | Bloom filters can false-positive but never false-negative, so results are exact while the scan stays cheap
human | search results identical to what a full scan of every stored message would return | the Bloom filter is an invisible speedup, never a source of missed or phantom results
engineer | search terms that are stop words or sub-2-character tokens dropped before the Bloom check, and an all-stop-word query returning an empty result plus a "query too generic" signal | the index and the query agree on what a word is, and meaningless queries fail fast instead of matching everything
engineer | the Bloom filter recomputed whenever an upsert changes a message's `subject` or `body_plain` | the index can never go stale against the stored text
engineer | `FakeMailStore` implementing the interface in memory (including real tokenize/Bloom behavior via the shared modules) | UI tests exercise sync, offline, and search flows with no database at all
engineer | `SqliteMailStore` tests to run against an in-memory sql.js database injected through the handle — never the native plugin, never the filesystem | all tests are deterministic and reproducible
engineer | vitest as the test runner, fixtures using fake addresses, and Bloom tests asserting the no-false-negative property directly (every indexed word is found) plus a measured false-positive rate below 5% on fixture data | the two properties that make the design correct are pinned by tests, not assumed

## Input
Runtime inputs are the shared model objects (`ThreadSummary`, `Message`) handed in by the UI after provider fetches, and search term strings. In tests, the inputs are fixtures and an in-memory database — no native SQLite plugin, filesystem, or network.

## Output Schema
SQLite tables (all columns NOT NULL unless marked nullable):
name, type, format (optional)
`threads`, table, `thread_id TEXT PK, account_id TEXT, subject TEXT, snippet TEXT, from_addr TEXT, date INTEGER (epoch ms), unread INTEGER (0/1), message_count INTEGER`
`messages`, table, `message_id TEXT PK, thread_id TEXT, account_id TEXT, from_addr TEXT, to_addrs TEXT ('|'-joined), cc_addrs TEXT ('|'-joined), bcc_addrs TEXT ('|'-joined), subject TEXT, date INTEGER (epoch ms), body_plain TEXT nullable, body_html TEXT nullable, unread INTEGER (0/1), bloom BLOB (256 bytes)`
`message_tags`, table, `message_id TEXT, tag_id TEXT, PRIMARY KEY (message_id, tag_id)`
`searchText` return, array, `Message[]` (verified matches only, newest-first)

# Finally
Follow strict TDD (see `SKILL.md`): tests come first, and the suite is the feedback-loop validator — run, fix, re-run, and only proceed when green. Every user story above must map to at least one test that was observed failing before implementation. Copy this checklist and check items off as you go:

- [ ] Red: tests for every user story above, run and observed failing
- [ ] Green: minimum implementation, full suite passing (report both runs)
- [ ] Refactor: cleaned up, suite still green
- [ ] Commit
