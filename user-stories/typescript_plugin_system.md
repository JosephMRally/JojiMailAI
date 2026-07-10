# Typescript plugin system
## Function
Create `src/plugins/MailPlugin.ts`, `src/plugins/PluginHost.ts`, and `src/plugins/FakePlugin.ts`; do not execute! This is the extensibility layer from `TODO.md` → "Extensibility & Plug-ins": the core app stays minimal and capabilities arrive through typed extension points. `MailPlugin` is the versioned contract a plug-in implements, `PluginHost` registers plug-ins and dispatches extension-point calls with crash isolation, and `FakePlugin` is the deterministic implementation tests use. Backends already have their own plug-in seam — new mail platforms implement `MailProvider` — so this layer covers what that doesn't: contributions to the read pipeline, compose pipeline, actions, and settings. In v1, plug-ins are in-process TypeScript modules registered at the composition root; dynamic loading from files or URLs is a deliberate non-goal (documented, not hacked in).

## User Stories

| actor | requirement | description |
|-------|-------------|-------------|
| engineer | a `MailPlugin` TypeScript interface — `{id, name, version, apiVersion, contributes(): ExtensionPoint[]}` plus one optional method per extension point — that is the single plug-in surface the UI may import, enforced by the same no-concrete-imports rule as the other layers | plug-ins swap and stack the way providers and stores do |
| engineer | a versioned plug-in API: the host exports `PLUGIN_API_VERSION` (starts at 1), and `register` rejects a plugin whose `apiVersion` doesn't match, with an error naming both versions | plug-ins written against an old API fail loudly at startup, never subtly at runtime |
| engineer | four typed extension points in v1: `messageView(message) → ViewContribution[]` (panels/banners rendered above a message), `composeAction(draft) → Draft` (transform a draft before the user sends), `threadAction(threadSummary) → PluginAction[]` (extra actions on thread rows), and `settingsPanel() → SettingsContribution` | reading, composing, triage, and configuration are all extensible without touching core code |
| engineer | a `PluginHost` with `register(plugin)`, `setEnabled(pluginId, boolean)`, `list()` (id, name, version, enabled, contributes), and per-extension-point dispatch methods that call only **enabled** plug-ins that **declare** that point | capability negotiation is structural — the host never calls a hook a plug-in didn't claim |
| engineer | enabled/disabled state persisted through an injected `PluginSettings` key-value storage (webview `localStorage` in production, in-memory in tests) | my plug-in choices survive restarts without coupling the host to any storage engine |
| engineer | crash isolation on every dispatch: a hook that throws or exceeds a 2-second timeout (generous for in-process synchronous work; anything longer is hung) is caught, the plug-in is auto-disabled for the session, and an error naming the plug-in is surfaced via `list()` | one broken plug-in can never break a core mail flow or another plug-in |
| engineer | dispatch results merged in registration order and each plug-in's contribution kept attributable (`pluginId` on every contribution) | the UI can render, group, and blame contributions deterministically |
| human | plug-ins that bundle a backend to register it through the existing seams — a `MailProvider` into the `ProviderRegistry`, handled at the composition root | "mail-platform plug-ins" reuse the proxy pattern instead of a second registration mechanism |
| engineer | `composeAction` transforms applied sequentially in registration order, each receiving the previous result, with the final `Draft` still requiring the user's explicit send | plug-ins like signatures or grammar fixes compose predictably and never auto-send |
| engineer | core flows fully functional with zero plug-ins registered, asserted by a test that boots the host empty | plug-ins are optional capability, never a dependency |
| engineer | `FakePlugin` implementing configurable contributions and a `ThrowingPlugin` fixture for the isolation stories, both with fake data | UI and host tests exercise every extension point and every failure path deterministically |
| engineer | vitest as the test runner; no plug-in test may touch network, filesystem, or real storage | all tests are deterministic and reproducible |

## Input
