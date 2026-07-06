# TODO — Email Client Feature Backlog

Feature list derived from [FairEmail](https://github.com/M66B/FairEmail) (open-source, privacy-oriented Android email client by M66B), based on its README, Play Store description, and FAQ. Features marked **(pro)** are paid "pro" convenience/advanced features in FairEmail; everything else is free there.

## Contents
- Extensibility & Plug-ins
- Accounts & Protocols
- Message List / Inbox
- Reading Messages
- Composing
- Search
- Privacy & Security
- Encryption
- Notifications
- Organization, Rules & Automation
- Sync & Offline
- UI / UX
- Project / Meta

## Extensibility & Plug-ins

The client should be highly optimizable via plug-in abilities: core stays minimal, and capabilities are added through well-defined extension points rather than baked in.

> v1 spec: [user-stories/typescript_plugin_system.md](user-stories/typescript_plugin_system.md) (plus `MailProvider`/`MailIntelligence`/`MailStore` interfaces for backend plug-ins). Items below stay unchecked until implemented.

- [ ] Plug-in architecture — a stable, versioned extension API with plug-ins discovered/registered at startup and loadable without modifying core code
- [ ] Mail-platform plug-ins — new email platforms ship as `MailProvider` proxy implementations registered into the `ProviderRegistry` (Gmail first; IMAP, Outlook, etc. as plug-ins)
- [ ] Message-view plug-ins — hooks into the read pipeline (e.g. translation, summarization/AI, tracking-pixel stripping, iCalendar rendering) as installable units
- [ ] Compose plug-ins — hooks into the compose pipeline (e.g. grammar/spell check, templates, Markdown, encryption) as installable units
- [ ] Action/rule plug-ins — custom triage actions and rule conditions/actions (webhooks, automation intents) contributed by plug-ins
- [ ] UI extension points — plug-ins can add message-list actions, toolbar buttons, and settings panels without core UI changes
- [ ] Capability negotiation — plug-ins declare what they support (mirroring `capabilities()`), so the UI shows only applicable affordances
- [ ] Plug-in isolation — a misbehaving plug-in degrades gracefully (disabled with an error surfaced) and cannot break core mail flows
- [ ] Plug-in management UI — enable/disable, configure, and view installed plug-ins from settings

## Accounts & Protocols

- [ ] Unlimited accounts — no cap on number of configured email accounts
- [ ] Unlimited email addresses — unlimited identities/aliases per account, with default CC/BCC per identity and identity matching for replies
- [ ] IMAP support — full two-way IMAP synchronization
- [ ] POP3 support — basic POP3 accounts (with "leave messages on server" option)
- [ ] SMTP support — sending via standard SMTP
- [ ] IMAP IDLE push — real-time push messages without polling (plus IMAP NOTIFY where supported)
- [ ] Quick setup wizard — auto-detects server configuration for virtually all providers (Gmail, Outlook, Yahoo, iCloud, etc.)
- [ ] OAuth sign-in — OAuth for Gmail, Outlook/Office 365, Yahoo, Mail.ru, Yandex; custom OAuth via importable provider XML
- [ ] Auth methods — CRAM-MD5, LOGIN, PLAIN, NTLM, XOAUTH2; client certificates selectable per account/identity; SNI support
- [ ] SSL/TLS and STARTTLS — with option to allow invalid certificates/plain-text only when explicitly chosen
- [ ] Auto discovery — automatic server settings lookup for manual setup
- [ ] Copy accounts/identities — duplicate an existing account/identity configuration
- [ ] Works without Google services — no Firebase Cloud Messaging, runs on de-Googled devices
- [ ] (Explicit non-goals in FairEmail: no Exchange Web Services / ActiveSync / JMAP)

## Message List / Inbox

- [ ] Unified inbox — combined inbox across accounts (optionally per account or per folder); folders can be added/removed from it
- [ ] Generic unified folders — unify any folder type across accounts
- [ ] Conversation threading — messages grouped into conversation threads
- [ ] Message previews — snippet preview lines in the list (also sendable to smartwatches)
- [ ] Swipe actions — configurable swipe left/right targets (archive, trash, snooze, etc.), per account too
- [ ] Batch operations — long-press + hold + swipe to select ranges; mark all read, move/delete all, etc.
- [ ] Browse messages on server — scroll past locally synced messages to fetch older ones on demand
- [ ] Saved searches — e.g. unified starred-messages view implemented as a saved search
- [ ] Sort/filter options — folder sorting, dimmed display for remotely deleted/moved messages
- [ ] Colored stars — star messages in multiple colors **(pro)**; synchronizable via IMAP keywords
- [ ] Local notes — attach private notes to messages
- [ ] Keywords — show/set IMAP keywords (message tags) in the header
- [ ] Gmail specifics — Gmail label/category sync, raw Gmail search operators, label-aware copy

## Reading Messages

- [ ] Safe message view — reformatted view with styling, scripting, and unsafe HTML removed
- [ ] Show original message — optional full original HTML view (embedded WebView), openable in browser
- [ ] Auto-expand rules — sensible auto-expanding of messages in a conversation
- [ ] Pinch to zoom — zoom message content and text size
- [ ] Image handling — embedded vs. external image distinction, tap image to see its source URL, auto-rotate/resize, GIF display
- [ ] Attachments — open/save attachments with confirmation; winmail.dat awareness
- [ ] Calendar invitations — view iCalendar invites; accept/decline **(pro)**; add message to calendar **(pro)**; auto-store invites
- [ ] Message headers — view full headers on demand
- [ ] Print messages — print/export a message
- [ ] Text-to-speech — read out sender/subject (non-Play builds)
- [ ] Translation — integrated DeepL translation support
- [ ] AI assistance — optional OpenAI (ChatGPT) / Gemini integration for summarizing etc.
- [ ] Contact photos — from address book, identicons, gravatars/favicons as contact photos
- [ ] Navigation — swipe to previous/next conversation, go-to-next on archive/delete, tablet two-column mode

## Composing

- [ ] Rich text editing — common text styles (size, color, bold/italic, lists, etc.)
- [ ] Plain-text-only sending — per message or per identity
- [ ] Markdown support — compose with Markdown
- [ ] HTML signatures — per identity, including local images
- [ ] Reply templates — reusable answer templates, insertable or used to create drafts **(pro)**
- [ ] Quote selected text — replying with a selection quotes only that text
- [ ] Reply/forward options — reply-all/sender toggle, forward, send as attachment, resend (rfc2822), hard bounce (DSN)
- [ ] Send after selected time — scheduled/delayed sending **(pro)**
- [ ] Undo send — cancel from the outbox before it goes out
- [ ] Attachment reminder — warns when you mention attaching but didn't
- [ ] Contact groups — insert an Android contact group's addresses
- [ ] CC/BCC management — show/hide fields, default CC/BCC per identity
- [ ] Voice notes / audio recording — record and attach audio
- [ ] Auto vCard attachments — automatically generate vCard attachments **(pro)**
- [ ] Grammar/spell check — LanguageTool integration
- [ ] Read/delivery receipts — request and process delivery/read receipts (sets $Delivered/$Displayed keywords)
- [ ] Large-file sharing — "Send" (Firefox Send-style) integration for big attachments

## Search

- [ ] On-device search — case-insensitive partial-text search across sender, recipients, subject, keywords, and body
- [ ] Server search — continue search on the IMAP server, per folder/account
- [ ] Search scopes — unified inbox searches all accounts; folder search scoped to folder
- [ ] Search filters — with/without attachments (and attachment type), folder search, search suggestions
- [ ] System-wide search — select text in any app and "Search email" for it
- [ ] Gmail raw search — `raw:` prefix for Gmail search operators
- [ ] Search indexing — optional whole-word index for much faster on-device search **(pro)**
- [ ] Settings search — search within the app's settings

## Privacy & Security

- [ ] Reformat messages — strips active/deceptive content to prevent phishing
- [ ] Confirm showing images — images blocked until confirmed, to prevent tracking
- [ ] Tracking-image blocking — attempts to recognize and disable tracking pixels (Disconnect tracker-protection lists)
- [ ] Confirm opening links — link confirmation with full URL display; choose how links open; per-domain trust
- [ ] Remove tracking parameters — strips tracking parameters from links (optional Adguard rules)
- [ ] Authentication warnings — warns when messages fail DKIM/SPF/DMARC checks; "safely transported" indicator
- [ ] Spam blocklists — optional sender/server checks against DNS blocklists (Spamhaus, Spamcop, Barracuda)
- [ ] VirusTotal integration — optionally scan attachments via VirusTotal
- [ ] Biometric/PIN app lock — protect the app with fingerprint/PIN **(pro)**
- [ ] Password-protected content — encrypt message content with a password for any recipient
- [ ] Certificate transparency + DNSSEC/DANE — optional stricter connection verification
- [ ] No third-party data storage — mail data stays on device; no ads, no analytics/tracking (error reporting opt-in), no FCM
- [ ] No special permissions — minimal platform permissions
- [ ] Encrypted settings export — settings backup files are encrypted
- [ ] Sensitivity header — set/display message sensitivity (personal/private/confidential)

## Encryption

- [ ] OpenPGP — sign/encrypt/decrypt via OpenKeychain, including Autocrypt support
- [ ] S/MIME — sign/encrypt/decrypt with certificates **(pro)**
- [ ] Semi-automatic encryption — encrypt by default when keys are available
- [ ] Hardware token support — e.g. YubiKey via OpenKeychain

## Notifications

- [ ] Push notifications — near-instant new-mail notifications via IMAP IDLE, with a low-priority foreground-service notification to stay alive
- [ ] Grouped per-message notifications — individual notifications with actions (Android 7+)
- [ ] Configurable notification actions — choose which actions (archive, trash, reply, move, etc.) appear **(pro)**
- [ ] Per-account/folder/sender notification sounds & settings — via notification channels, Android 8+ **(pro)**
- [ ] Notifications for extra folders — get new-message notifications for any folder
- [ ] Notification light / badge count — LED support and unread-count launcher badges
- [ ] Smartwatch support — message previews on Wear/smartwatches; Android Auto support
- [ ] Quick-settings tile & app shortcuts — toggle sync, jump to compose, etc.

## Organization, Rules & Automation

- [ ] Filter rules **(pro)** — per-folder rules with ordering, grouping, disable, and stop-processing
- [ ] Rule conditions — sender/recipient/subject/header/text contains, attachments (by type), absolute/relative time, regex, Jsoup HTML selectors, expression language (with functions like onBlocklist(), hasMx(), knownContact(), AI(prompt))
- [ ] Rule actions — mark read/unread, hide, suppress/silence notification, snooze, star, set importance, add keyword/notes, move (with $year$/$month$/$domain$ subfolder placeholders), copy/label, delete permanently, play sound, auto answer/forward with template, TTS, automation (Tasker intent), webhook
- [ ] Scheduled rule runs — run rules daily against messages older than N days
- [ ] Automatic message classification — on-device learning to auto-file messages into folders **(pro)**
- [ ] Snooze messages/conversations — hide until a chosen time **(pro)**
- [ ] Synchronization scheduling — sync only during defined schedules/periods **(pro)**
- [ ] Folder management — create/delete folders, per-folder sync/download/keep settings, sub-folders, change system folder mapping
- [ ] Auto-delete old messages — per-folder automatic cleanup (e.g. empty trash after N days)
- [ ] Cross-account moves/copies — move or copy messages between accounts
- [ ] Local contacts — auto-collected suggestion contacts, import (incl. Outlook), contact groups, favicon photos

## Sync & Offline

- [ ] Two-way synchronization — full bidirectional sync of read/starred/moved/deleted state
- [ ] Offline storage and operations — read, compose, and queue actions offline; operations replay when connected
- [ ] Sync on demand — manual/periodic sync modes as alternatives to always-on push
- [ ] Keep starred messages — option to always keep/sync starred messages
- [ ] Fetch more/older messages — download and retain older mail per folder on demand
- [ ] Battery friendly — designed for low battery usage
- [ ] Low data usage — configurable download size on metered connections, roam-like-at-home option
- [ ] Cleanup — periodic cleanup of orphaned local files
- [ ] Export/import settings — full settings backup/restore (export is **(pro)**); optional OS-level backup
- [ ] Cloud sync — optional sync of app configuration across devices

## UI / UX

- [ ] Material design — including dark and pure-black themes, Material You colors, multiple theme variants
- [ ] Deliberately minimalistic — no bells and whistles, focus on reading/writing
- [ ] Highly customizable message view — density, columns shown, action bar top/bottom, compact folder view
- [ ] Account/identity/folder colors and avatars **(pro)** — color-coding throughout the UI
- [ ] Tablet/landscape mode — two-column master/detail layout
- [ ] Navigation drawer — folder/account navigation, customizable entries
- [ ] Message list widget **(pro)** and unread-count widget — home-screen widgets, per-account selectable
- [ ] Small footprint — app under ~30 MB
- [ ] Localized — community-translated via Crowdin
- [ ] Runs on Android 5+ — phones and tablets (this project targets iOS/Android/web via Capacitor instead)

## Project / Meta

- [ ] 100% open source — GPLv3, original work (not a fork)
- [ ] Privacy policy & no vendor lock-in — standard protocols only; bring your own email address
- [ ] Actively maintained — Play Store, GitHub (with in-app update check), and F-Droid releases
