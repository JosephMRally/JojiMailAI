# App Store Architecture: From Bridge to Native OAuth

## Overview

JojiMailAI is now designed for direct app store distribution (iOS App Store, Google Play, web app stores) without requiring users to install and manage server processes.

## Key Changes from Bridge Architecture

### 1. Gmail Access: Bridge → Native OAuth

**Before (Bridge Model)**
```
Mobile App ──HTTP──> bridge/app.py (Python FastAPI) ──> Gmail API
                     └─ OAuth token management
                     └─ simplegmail wrapper
```
- Required users to run `bridge/app.py` on localhost or a home server
- First run needed browser-based OAuth flow on the bridge server
- App could only talk to the bridge, not Gmail directly
- Added complexity: another process to manage, ports to configure

**After (Native OAuth Model)**
```
Mobile App ──(native auth)──> iOS: ASWebAuthenticationSession
                              Android: Custom Tabs
                              Web: Browser OAuth
              ──REST──> Gmail API
```
- iOS and Android use platform-native OAuth handlers (system webview, no manual browser)
- Web uses browser-based OAuth normally
- No separate bridge server needed
- OAuth tokens stored securely on-device (via Keychain on iOS, KeyStore on Android)
- Direct REST API calls to Gmail

**Benefits:**
- ✅ Users download the app and sign in immediately — no server setup
- ✅ Follows platform conventions (native OAuth flows expected on iOS/Android)
- ✅ Smaller app size, fewer dependencies
- ✅ Ready for app stores (no localhost binding, no process management)

### 2. AI: Required → Optional with Graceful Degradation

**Before (AI Required)**
```
Every incoming email → AI classification + tagging
Long thread → AI digest
Compose → AI draft suggestion
Search → Natural language interpretation
└─ Fails if Ollama/vLLM/LM Studio not running
```

**After (AI Optional)**
```
Every incoming email → (if AI available) AI classification + tagging
                    → (if not) empty tags, manual tagging still works
Long thread → (if AI available) AI digest
            → (if not) full conversation visible
Compose → (if AI available) AI draft suggestion
        → (if not) blank box, user writes
Search → (if AI available) natural language
       → (if not) exact field search (from:, text:, etc.)
```

**Implementation:**
- `NoOpIntelligence` class returns empty results, never errors
- UI checks results and disables AI-specific UI affordances
- Core flows (read, send, tag) work fully without AI
- Composition root selects `LocalIntelligence` or `NoOpIntelligence` based on `VITE_AI_BASE_URL`

**User Experience:**
- ✅ App works out of the box on any device
- ✅ Users can optionally set up Ollama/vLLM on their home network for AI features
- ✅ AI features don't block mail operations if the server is down
- ✅ Suitable for app store submission (no external service required)

### 3. Local-First Unchanged

- ✅ All mail synced to on-device SQLite
- ✅ Full offline reading and search
- ✅ Bloom-filter text search (exact results, no cloud indexing)
- ✅ Tags stored locally, synced bidirectionally with Gmail labels

## Deployment: From Development to App Store

### Development (Local or LAN AI, Optional)
```bash
# .env.local
VITE_AI_BASE_URL=http://192.168.1.100:11434/v1
VITE_AI_MODEL=mistral

npm run dev                              # Web: http://localhost:5173
npx cap run ios                         # iOS Simulator
npx cap run android                     # Android Emulator
```

### App Store (No External Requirements)
```bash
# .env (production)
# VITE_AI_BASE_URL=                     # Empty = NoOpIntelligence
# VITE_AI_MODEL=

# Users can optionally set via app settings (if implemented)
```

## Migration Checklist for Existing Code

### Remove Bridge Components
- [x] Bridge kept in-repo as deprecated reference (`bridge/`, spec marked deprecated); not part of the production build
- [x] Remove bridge startup commands from README
- [x] Remove `VITE_BRIDGE_URL` / `loadBridgeConfig` from `src/config.ts`

### Update GmailProvider
- [x] Change from HTTP delegation to direct Gmail API REST calls (`https://gmail.googleapis.com/gmail/v1/users/me`)
- [x] Constructor takes a `getAccessToken` supplier (called per request); composition root injects it via the `gmailAuth` option
- [x] Map Gmail API v1 responses to model types (headers, base64url bodies, labelIds, internalDate)
- [x] Token refresh stays outside the proxy: the supplier is called per request, so a rotating supplier just works
- [ ] Integrate the Capacitor OAuth plugin in `main.tsx` and pass its token supplier as `gmailAuth` (see OAUTH_SETUP.md)

### Add NoOpIntelligence
- [x] Create `src/intelligence/NoOpIntelligence.ts`
- [x] Implement all 4 interface methods returning empty/no-op results
- [x] Update composition root to select based on `VITE_AI_BASE_URL`

### Update UI
- [x] Empty AI results degrade gracefully (no auto-tags, empty digest, blank compose, unfiltered search) — no UI changes were needed
- [x] All flows tested with fakes; composition tested with `NoOpIntelligence`
- [ ] Add app settings for optional `VITE_AI_BASE_URL` configuration at runtime

### Package for App Stores
- [ ] iOS: Use Xcode to sign, provision, and submit to App Store
- [ ] Android: Sign APK/AAB and submit to Google Play
- [ ] Web: Deploy to CDN (e.g., Vercel, Cloudflare Pages)

## Maintaining Privacy While Using Cloud OAuth

**Concern:** "If Gmail OAuth is cloud-based, isn't my mail going through Google?"
**Answer:** No. OAuth is only for authentication (proving you own the account). Mail access flows through direct API calls from your device to Gmail servers, not through any intermediary. Your mail content never passes through your home network or a third-party service unless you explicitly set up AI and configure an on-device or local LAN inference server.

**Flow:**
1. **OAuth**: You sign in via native platform handler → Google OAuth flow → token returned to your device
2. **Mail Access**: Your device calls Gmail REST API directly with the token
3. **Local Storage**: Mail is synced to on-device SQLite
4. **AI (optional)**: If configured, your device makes local API calls to your own Ollama/vLLM server

## Configuration Reference

### Build-Time Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_AI_BASE_URL` | (empty) | Base URL of OpenAI-compatible inference server; if not set, AI is disabled |
| `VITE_AI_MODEL` | (none) | Model name to request from the inference server |
| `VITE_AI_API_KEY` | `"not-needed"` | API key for the inference server (often ignored by local servers) |

### Runtime Configuration (Optional, for Advanced Users)
Users can configure AI via in-app settings (if implemented):
- `VITE_AI_BASE_URL`: e.g., `http://192.168.1.100:11434/v1` (Ollama on home network)
- `VITE_AI_MODEL`: e.g., `mistral`, `neural-chat`, `openchat`

## Testing in App Store Environments

### Without AI (Default)
```bash
npm run dev              # AI disabled, UI tests all flows with NoOpIntelligence
npm run build && serve   # Simulates production
```

### With AI (Optional)
```bash
# Start Ollama locally
ollama serve

# In another terminal
VITE_AI_BASE_URL=http://localhost:11434/v1 VITE_AI_MODEL=mistral npm run dev
```

## FAQ

**Q: How do I authenticate without the bridge?**
A: Native OAuth handlers in Capacitor. On iOS, it uses `ASWebAuthenticationSession` (system modal). On Android, `Custom Tabs`. On web, browser OAuth. All platform-native.

**Q: Can I still use the bridge for development?**
A: The bridge architecture is documented in `user-stories/providers/python_gmail_bridge.md` for reference. You can keep it in a separate branch, but the app-store version uses native OAuth.

**Q: What if I want AI but don't want to run a server?**
A: Run Ollama/vLLM/LM Studio on a spare computer on your home network. Configure `VITE_AI_BASE_URL=http://192.168.1.X:port/v1`. The app calls your server directly over your LAN.

**Q: Is this compatible with the App Store / Google Play store requirements?**
A: Yes. Both stores allow:
- Apps that authenticate via OAuth
- Apps that sync data to cloud services (like Gmail)
- Apps that make direct API calls to third-party servers
- Optional local networking (for your own home LAN server)

The bridge was not store-compatible because it required managing a localhost HTTP server within the app.

## See Also

- [SKILL.md](SKILL.md) — Build order and component specs
- [user-stories/providers/typescript_gmail_proxy.md](user-stories/providers/typescript_gmail_proxy.md) — Gmail provider spec (native OAuth)
- [user-stories/typescript_mail_intelligence.md](user-stories/typescript_mail_intelligence.md) — AI interface and NoOpIntelligence
- [CLAUDE.md](CLAUDE.md) — Updated architecture paragraph
