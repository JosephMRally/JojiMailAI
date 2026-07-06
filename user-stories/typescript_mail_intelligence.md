# Typescript mail intelligence
## Function
Create `src/intelligence/MailIntelligence.ts`, `src/intelligence/LocalIntelligence.ts`, and `src/intelligence/FakeIntelligence.ts`; do not execute! AI is fundamental to how JojiMailAI runs: every thread that enters the app is classified and tagged by this layer, long threads are summarized by it, replies are drafted by it, and search queries are interpreted by it. It mirrors the mail-provider design exactly — `MailIntelligence` is the interface the UI depends on, `LocalIntelligence` is the concrete implementation backed by a **self-hosted, OpenAI-compatible inference server** (Ollama, vLLM, or LM Studio — one implementation covers all three because they all speak the OpenAI `/v1/chat/completions` protocol), and `FakeIntelligence` is the deterministic in-memory implementation all tests run against. The UI never imports a concrete intelligence class, so a different AI backend can be swapped in without UI changes — the same substitution rule the proxy pattern gives mail platforms. No mail content ever leaves the user's own machines: inference is self-hosted, full stop.

## User Stories
Following agile conventions, we want our user stories to be in the following format: `As a <actor> I want <requirement> so that <description>` will be written in shorthand as `actor | requirement | description`. User stories form the basis of tests and code.

actor | requirement | description
engineer | a `MailIntelligence` TypeScript interface that is the single AI surface the UI may import, enforced by the same no-concrete-imports test that guards the provider layer | AI backends swap the way mail platforms do, and AI stays fundamental without being hard-wired
engineer | the interface to cover the four core intelligence flows: `classify(message, availableTags)`, `summarizeThread(messages)`, `draftReply(thread, guidance?)`, and `parseSearchQuery(query, availableTags)` | tagging, triage, reading, composing, and search all run through one contract
human | `classify` to return `{tagIds: string[], importance: 'high' | 'normal' | 'low'}` choosing only from the `availableTags` it was given — never inventing a tagId | AI-assigned tags always exist in my real mailbox, so applying them via `provider.addTag` cannot fail on a phantom tag
human | `summarizeThread` to return `{summary: string, actionItems: string[]}` | i can grasp a long conversation and what it needs from me without reading every message
human | `draftReply` to return `{bodyPlain: string}` shaped by the thread and my optional guidance (e.g. "decline politely") | composing starts from a usable draft instead of a blank box
human | `parseSearchQuery` to return structured criteria `{tagIds?: string[], from?: string, text?: string, dateFrom?: number, dateTo?: number}` | i can type "unread invoices from ACME last month" and get the mail i meant
engineer | `LocalIntelligence` implemented with the official `openai` npm SDK (`new OpenAI({baseURL, apiKey, dangerouslyAllowBrowser: true})`), never raw `fetch` | Ollama, vLLM, and LM Studio all expose OpenAI-compatible `/v1` endpoints, so one SDK-backed implementation covers every self-hosted server, and the browser flag is required inside the Capacitor webview
engineer | the server `baseURL` and `model` read from config: `VITE_AI_BASE_URL` (default `http://127.0.0.1:11434/v1`, Ollama's default; LM Studio serves `:1234/v1`, vLLM `:8000/v1`) and `VITE_AI_MODEL` (no default — fail fast with a clear error naming the missing setting) | switching between Ollama, vLLM, and LM Studio — or between models — is a config change, never a code change
engineer | the `apiKey` field sent as a configurable placeholder (`VITE_AI_API_KEY`, default `"not-needed"`) | self-hosted servers ignore or accept any key, but the OpenAI client requires one, and a real gateway key can still be injected later without code changes
engineer | every flow to request structured output via `response_format: {type: "json_schema", json_schema: {strict: true, schema: ...}}` **and** validate the returned JSON with the matching zod schema before returning it | Ollama, vLLM, and LM Studio all support constrained JSON decoding, and the zod check catches the weaker local models that drift anyway
engineer | `temperature: 0` on the deterministic flows (`classify`, `parseSearchQuery`) and the server default on the generative flows (`summarizeThread`, `draftReply`) | the same message classifies to the same tags run after run, while summaries and drafts keep natural variation
engineer | the constructor performing no I/O, with the first HTTP request happening on the first method call | the same lazy-proxy discipline as `GmailProvider`, and the app starts even when the inference server is down
human | my mail content never leaving my own machines — inference runs on a server i host (localhost or my own LAN box) and the app makes no calls to any cloud AI service | AI is fundamental to the app and my mail stays entirely private
engineer | errors mapped most-specific-first to one `MailIntelligenceError` with codes `AI_UNAVAILABLE` (connection refused/timeout — message says to start the Ollama/vLLM/LM Studio server and check `VITE_AI_BASE_URL`), `AI_MODEL_NOT_FOUND` (404/unknown model — message names the configured model and suggests pulling/loading it), `AI_BAD_OUTPUT` (schema validation failed after retry), and `AI_ERROR` (anything else) | the UI handles AI failure backend-agnostically, and the two failures self-hosters actually hit — server not running, model not pulled — get actionable messages
engineer | one automatic retry on schema-invalid output before surfacing `AI_BAD_OUTPUT` | small local models occasionally emit malformed JSON, and one retry absorbs most of it without hiding real problems
engineer | prompts built from the shared model types only — each flow sends the minimal fields it needs (e.g. `classify` sends subject/from/snippet plus the tag list, not the full raw thread) | small local context windows are respected and inference stays fast on modest hardware
engineer | `FakeIntelligence` implementing the interface deterministically over fixture rules (e.g. "subject containing 'invoice' → tag finance") with fake addresses | UI and integration tests exercise AI-driven flows with no server, no model, and no flakiness
engineer | `LocalIntelligence` unit tests to inject a mocked OpenAI client and assert on the requests built (baseURL/model wiring, `response_format` schema, temperature, minimal fields) and on error mapping | the integration is tested to the SDK boundary without ever needing a running inference server
engineer | vitest as the test runner; no test may require a running inference server or open a socket | all tests are deterministic and reproducible

## Input
Runtime inputs are the shared model objects handed in by the UI (`Message`, `ThreadSummary`, tag lists from `listTags()`) and a self-hosted OpenAI-compatible inference server (Ollama, vLLM, or LM Studio) reached through the official `openai` SDK at the configured `baseURL`. In tests, the inputs are fixtures and a mocked SDK client — no server is ever required.

## Output Schema
Return types (each also expressed as a zod schema and enforced via `response_format` json_schema plus zod validation):
name, type, format (optional)
`Classification`, object, `{tagIds: string[], importance: 'high' | 'normal' | 'low'}`
`ThreadDigest`, object, `{summary: string, actionItems: string[]}`
`ReplyDraft`, object, `{bodyPlain: string}`
`SearchCriteria`, object, `{tagIds?: string[], from?: string, text?: string, dateFrom?: number, dateTo?: number}` (epoch ms)
`MailIntelligenceError.code`, union, `AI_UNAVAILABLE | AI_MODEL_NOT_FOUND | AI_BAD_OUTPUT | AI_ERROR`

# Finally
Follow strict TDD (see `SKILL.md`): tests come first, and the suite is the feedback-loop validator — run, fix, re-run, and only proceed when green. Every user story above must map to at least one test that was observed failing before implementation. Copy this checklist and check items off as you go:

- [ ] Red: tests for every user story above, run and observed failing
- [ ] Green: minimum implementation, full suite passing (report both runs)
- [ ] Refactor: cleaned up, suite still green
- [ ] Commit
