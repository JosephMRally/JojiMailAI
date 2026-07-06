# JojiMailAI
Humans shouldn't code - they make mistakes

A cross-platform email client — iOS, Android, and web all from one codebase — built as a
[Capacitor](https://capacitorjs.com/) shell around a React + Vite + TypeScript UI.

Mail platforms are pluggable: the UI talks only to a `MailProvider` interface, and each
platform is a proxy registered behind it. Gmail is the first. Organization is
**tag-based** — messages carry any number of tags; there are no folders.

**AI is built into how the client runs**, behind a `MailIntelligence` interface of its
own (Claude, via the official Anthropic SDK): arriving mail is auto-tagged into your
real tags, long threads open with a summary and action items, replies start from an
AI draft you edit, and the search box takes plain language ("invoices from ACME last
month"). Nothing is ever sent without your explicit action, and if AI is unavailable
the client still reads, tags, and sends mail normally.

## Project status

**Spec stage.** This repo currently contains the specifications the code is generated
from, not the code itself:

| File | Role |
|------|------|
| `SKILL.md` | The overall process and architecture: components, TDD loop, order of operations |
| `user-stories/generate_typescript_mail_provider.md` | Spec: `MailProvider` interface, shared model, `ProviderRegistry` |
| `user-stories/generate_python_gmail_bridge.md` | Spec: the local Gmail bridge service |
| `user-stories/generate_typescript_gmail_proxy.md` | Spec: `GmailProvider`, the first concrete proxy |
| `user-stories/generate_typescript_mail_intelligence.md` | Spec: `MailIntelligence` + `ClaudeIntelligence`, the AI core |
| `user-stories/generate_typescript_email_ui.md` | Spec: the AI-driven screens and Capacitor shell |
| `TODO.md` | Long-term feature backlog (derived from FairEmail) |
| `CLAUDE.md` | Working rules for code generation (strict TDD) |

User stories in the `user-stories/generate_*.md` files are the source of truth: every story becomes a
test before any implementation is written (red → green → refactor → commit).

## Running the client

The app has two halves, started in this order:

### 1. Start the bridge

```
.venv/bin/python bridge/app.py
```

The bridge talks to Gmail itself; the app talks only to the bridge (localhost, port
8765 by default — see `--port`, `--token`, `--client-secret`, `--verbose`).

**The first run needs a browser**: it opens a Google sign-in page to authorize the
account and saves a reusable token file. It cannot authenticate headless on a cold
start; every run after that reuses the token silently.

### 2. Start the app

In a browser during development:

```
npm run dev
```

On a device or simulator:

```
npm run build
npx cap sync
npx cap run ios      # or: npx cap run android
```

If the device can't reach the host's localhost (e.g. the Android emulator), point the
app at the bridge with `VITE_BRIDGE_URL` (the Android emulator reaches the host at
`http://10.0.2.2:8765`).

**AI features need an Anthropic API key** in `VITE_ANTHROPIC_API_KEY`. The key stays on
your device and mail content is sent to the Anthropic API only when an AI feature runs.
Without a key, the AI affordances are disabled and everything else works.

## Running tests

```
.venv/bin/python -m pytest bridge/tests/ -q   # Python bridge
npx vitest run                                 # TypeScript providers + UI
```

Tests are fully mocked — nothing touches a real account or the network.

## Adding a mail platform

Implement the `MailProvider` interface and register the provider at the composition
root. That's the whole job — no UI changes, ever. The UI renders whatever the
interface returns and hides anything the provider's `capabilities()` doesn't support.

## Safety

- The bridge binds to `127.0.0.1` only; the mailbox is never reachable off-device.
- Trash only moves mail to Gmail's Trash — nothing is ever deleted permanently.
- Mail data and credentials stay on your device; there is no third-party server.
