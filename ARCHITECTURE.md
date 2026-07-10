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

### 2. Local-First Unchanged

- ✅ All mail synced to on-device SQLite
- ✅ Full offline reading and search
- ✅ Text search tokenizes the query and matches it against each message's stored subject + body (exact results, no cloud indexing)
- ✅ Tags stored locally, synced bidirectionally with Gmail labels

## Deployment: From Development to App Store

### Development
```bash
npm run dev                              # Web: http://localhost:5173
npx cap run ios                         # iOS Simulator
npx cap run android                     # Android Emulator
```

### App Store (No External Requirements)
Production builds need no environment configuration and no external services — the app ships ready to sign and submit.

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

### Package for App Stores
- [ ] iOS: Use Xcode to sign, provision, and submit to App Store
- [ ] Android: Sign APK/AAB and submit to Google Play
- [ ] Web: Deploy to CDN (e.g., Vercel, Cloudflare Pages)

## Maintaining Privacy While Using Cloud OAuth

**Concern:** "If Gmail OAuth is cloud-based, isn't my mail going through Google?"
**Answer:** No. OAuth is only for authentication (proving you own the account). Mail access flows through direct API calls from your device to Gmail servers, not through any intermediary. Your mail content never passes through your home network or a third-party service.

**Flow:**
1. **OAuth**: You sign in via native platform handler → Google OAuth flow → token returned to your device
2. **Mail Access**: Your device calls Gmail REST API directly with the token
3. **Local Storage**: Mail is synced to on-device SQLite

## Configuration Reference

Core mail features require no build-time configuration — Gmail sign-in uses native OAuth at runtime (see OAUTH_SETUP.md). The build's target platform is selected with `npm run build -- --provider=<id>` (see `scripts/providerFlag.mjs`).

## Testing in App Store Environments

```bash
npm run dev              # UI exercises all flows against the in-memory fakes
npm run build && serve   # Simulates production
```

## FAQ

**Q: How do I authenticate without the bridge?**
A: Native OAuth handlers in Capacitor. On iOS, it uses `ASWebAuthenticationSession` (system modal). On Android, `Custom Tabs`. On web, browser OAuth. All platform-native.

**Q: Can I still use the bridge for development?**
A: The bridge architecture is documented in `user-stories/providers/python_gmail_bridge.md` for reference. You can keep it in a separate branch, but the app-store version uses native OAuth.

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
- [CLAUDE.md](CLAUDE.md) — Updated architecture paragraph
