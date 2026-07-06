# Generate typescript mail intelligence
## Function
Create `src/intelligence/MailIntelligence.ts`, `src/intelligence/ClaudeIntelligence.ts`, and `src/intelligence/FakeIntelligence.ts`; do not execute! AI is fundamental to how JojiMailAI runs: every thread that enters the app is classified and tagged by this layer, long threads are summarized by it, replies are drafted by it, and search queries are interpreted by it. It mirrors the mail-provider design exactly — `MailIntelligence` is the interface the UI depends on, `ClaudeIntelligence` is the concrete implementation backed by the Anthropic API through the official TypeScript SDK, and `FakeIntelligence` is the deterministic in-memory implementation all tests run against. The UI never imports a concrete intelligence class, so a different AI backend can be swapped in without UI changes — the same substitution rule the proxy pattern gives mail platforms.

## User Stories
Following agile conventions, we want our user stories to be in the following format: `As a <actor> I want <requirement> so that <description>` will be written in shorthand as `actor | requirement | description`. User stories form the basis of tests and code.

actor | requirement | description
engineer | a `MailIntelligence` TypeScript interface that is the single AI surface the UI may import, enforced by the same no-concrete-imports test that guards the provider layer | AI backends swap the way mail platforms do, and AI stays fundamental without being hard-wired
engineer | the interface to cover the four core intelligence flows: `classify(message, availableTags)`, `summarizeThread(messages)`, `draftReply(thread, guidance?)`, and `parseSearchQuery(query, availableTags)` | tagging, triage, reading, composing, and search all run through one contract
human | `classify` to return `{tagIds: string[], importance: 'high' | 'normal' | 'low'}` choosing only from the `availableTags` it was given — never inventing a tagId | AI-assigned tags always exist in my real mailbox, so applying them via `provider.addTag` cannot fail on a phantom tag
human | `summarizeThread` to return `{summary: string, actionItems: string[]}` | i can grasp a long conversation and what it needs from me without reading every message
human | `draftReply` to return `{bodyPlain: string}` shaped by the thread and my optional guidance (e.g. "decline politely") | composing starts from a usable draft instead of a blank box
human | `parseSearchQuery` to return structured criteria `{tagIds?: string[], from?: string, text?: string, dateFrom?: number, dateTo?: number}` | i can type "unread invoices from ACME last month" and get the mail i meant
engineer | `ClaudeIntelligence` implemented with the official `@anthropic-ai/sdk` (`new Anthropic({apiKey, dangerouslyAllowBrowser: true})`), never raw `fetch` | the SDK owns auth headers, retries, and typed errors, and the browser flag is required inside the Capacitor webview
engineer | the model configurable with default `claude-opus-4-8` (the exact string) | a capable default that can be overridden in one place without touching call sites
engineer | every flow to use structured outputs — `client.messages.parse` with `zodOutputFormat` schemas matching the return types above — never hand-parsing JSON out of response text | malformed responses are caught by schema validation, not by downstream crashes
engineer | adaptive thinking (`thinking: {type: "adaptive"}`) on every request, with `output_config: {effort: "low"}` on the high-volume flows (`classify`, `parseSearchQuery`) and the default effort on `summarizeThread` and `draftReply` | per-message classification stays fast and cheap while summaries and drafts get full quality
engineer | the Anthropic API key read from config (`VITE_ANTHROPIC_API_KEY`), constructor performing no I/O, and the first API call happening on the first method call | the same lazy-proxy discipline as `GmailProvider`, and no key ever hardcoded
human | my API key and mail content sent only to the Anthropic API, directly from my device, and only when an intelligence method is invoked | AI is fundamental to the app but my data leaves the device only for the calls that power it
engineer | SDK typed errors mapped most-specific-first to one `MailIntelligenceError` with codes `AI_AUTH` (AuthenticationError), `AI_RATE_LIMITED` (RateLimitError), `AI_UNAVAILABLE` (APIConnectionError / 5xx), `AI_ERROR` (anything else) — never string-matching error messages | the UI handles AI failure provider-agnostically, mirroring `MailProviderError`
engineer | prompts built from the shared model types only — each flow sends the minimal fields it needs (e.g. `classify` sends subject/from/snippet plus the tag list, not the full raw thread) | token spend stays proportional to the task and no more mail content is shared than the flow requires
engineer | `FakeIntelligence` implementing the interface deterministically over fixture rules (e.g. "subject containing 'invoice' → tag finance") with fake addresses | UI and integration tests exercise AI-driven flows with no network, no key, and no flakiness
engineer | `ClaudeIntelligence` unit tests to inject a mocked Anthropic client and assert on the requests built (model, schema, effort, minimal fields) and on error mapping | the Claude integration is tested to the SDK boundary without ever calling the live API
engineer | vitest as the test runner; no test may read a real API key or open a socket | all tests are deterministic and reproducible

## Input
Runtime inputs are the shared model objects handed in by the UI (`Message`, `ThreadSummary`, tag lists from `listTags()`) and the Anthropic API reached through the official SDK with the configured key. In tests, the inputs are fixtures and a mocked SDK client — the live API is never touched.

## Output Schema
Return types (each also expressed as a zod schema and enforced via structured outputs):
name, type, format (optional)
`Classification`, object, `{tagIds: string[], importance: 'high' | 'normal' | 'low'}`
`ThreadDigest`, object, `{summary: string, actionItems: string[]}`
`ReplyDraft`, object, `{bodyPlain: string}`
`SearchCriteria`, object, `{tagIds?: string[], from?: string, text?: string, dateFrom?: number, dateTo?: number}` (epoch ms)
`MailIntelligenceError.code`, union, `AI_AUTH | AI_RATE_LIMITED | AI_UNAVAILABLE | AI_ERROR`

# Finally
Follow strict TDD (see `SKILL.md`): write the tests derived from the user stories first and run them to show they fail (red) **before** changing any implementation; then implement until green and report both runs. Every user story must map to at least one test that was observed failing first. Commit after green.
