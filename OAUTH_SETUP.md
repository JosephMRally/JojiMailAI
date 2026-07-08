# Native OAuth Setup for GmailProvider

This document explains how to integrate native OAuth into the GmailProvider for app-store distribution.

## Overview

Instead of delegating to a localhost bridge, `GmailProvider` now uses native Capacitor OAuth plugins to authenticate and direct Gmail REST API calls.

## Implementation Steps

### 1. Install Capacitor OAuth Plugin

```bash
npm install @capacitor-community/oauth2
npx cap sync
```

### 2. Platform Configuration

#### iOS (capacitor.config.ts)
```typescript
const config: CapacitorConfig = {
  ios: {
    scheme: 'jojioauth',  // Custom URL scheme for OAuth redirect
  },
  plugins: {
    OAuth2: {
      clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
      redirectUrl: 'jojioauth://callback',
      logoutUrl: 'jojioauth://logout',
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      discovery: {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
      },
    },
  },
};
```

#### Android (capacitor.config.ts)
```typescript
const config: CapacitorConfig = {
  android: {
    scheme: 'jojioauth',
  },
  plugins: {
    OAuth2: {
      clientId: 'YOUR_GOOGLE_CLIENT_ID-android.apps.googleusercontent.com',
      redirectUrl: 'jojioauth://callback',
      logoutUrl: 'jojioauth://logout',
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      serviceConfiguration: {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
      },
    },
  },
};
```

#### Web (React/Vite)
For web, use the standard OAuth2 library or Capacitor's browser-based OAuth:
```typescript
// Option 1: Use Google's gapi library
<script src="https://accounts.google.com/gapi/gapi.js"></script>

// Option 2: Use a standard OAuth2 library (auth0, okta, etc.)
import { GoogleOAuthProvider } from '@react-oauth/google';
```

### 3. GmailProvider Constructor

```typescript
interface GmailProviderConfig {
  accessToken: string;  // Obtained from OAuth
  refreshToken?: string;  // For long-lived sessions
  fetchFn?: typeof fetch;  // For testing
}

class GmailProvider implements MailProvider {
  private accessToken: string;
  private refreshToken?: string;
  private fetchFn: typeof fetch;

  constructor(config: GmailProviderConfig) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.fetchFn = config.fetchFn || fetch;
    // No I/O here — lazy initialization
  }

  private async ensureTokenValid(): Promise<void> {
    // Check token expiry; refresh if needed
    // If refresh fails, throw MailProviderError('AUTH_REQUIRED')
  }

  private async apiCall(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    await this.ensureTokenValid();
    
    const response = await this.fetchFn(
      `https://www.googleapis.com/gmail/v1/users/me${endpoint}`,
      {
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      }
    );

    if (response.status === 401) {
      throw new MailProviderError('AUTH_REQUIRED', 'OAuth token expired; please sign in again');
    }
    if (response.status === 404) {
      throw new MailProviderError('NOT_FOUND', '');
    }
    if (!response.ok) {
      throw new MailProviderError('PROVIDER_ERROR', await response.text());
    }

    return response.json();
  }

  async listTags(): Promise<Tag[]> {
    const { labels } = await this.apiCall('GET', '/labels') as { labels: unknown[] };
    return labels.map((label: any) => ({
      tagId: label.id,
      tagName: label.name,
      unreadCount: label.messagesUnread ?? 0,
    }));
  }

  // ... other methods delegate to apiCall
}
```

### 4. Composition Root: OAuth + GmailProvider

```typescript
// src/composition/CompositionRoot.ts

import { OAuth2Client } from '@capacitor-community/oauth2';

export interface CompositionRoot {
  provider: MailProvider;
  intelligence: MailIntelligence;
  store: MailStore;
}

export async function createCompositionRoot(): Promise<CompositionRoot> {
  // Authenticate with Gmail
  const oauthToken = await authenticateWithGmail();

  const provider = new GmailProvider({
    accessToken: oauthToken.accessToken,
    refreshToken: oauthToken.refreshToken,
  });

  // AI is optional
  const aiBaseUrl = import.meta.env.VITE_AI_BASE_URL;
  const intelligence = aiBaseUrl && aiBaseUrl.trim()
    ? new LocalIntelligence({
        baseURL: aiBaseUrl,
        model: import.meta.env.VITE_AI_MODEL,
        apiKey: import.meta.env.VITE_AI_API_KEY ?? 'not-needed',
      })
    : new NoOpIntelligence();

  const store = new SqliteMailStore();

  return { provider, intelligence, store };
}

async function authenticateWithGmail(): Promise<{ accessToken: string; refreshToken?: string }> {
  const platform = getPlatform();  // 'ios' | 'android' | 'web'

  if (platform === 'ios' || platform === 'android') {
    // Use native OAuth via Capacitor
    const result = await OAuth2Client.performAuthorization({
      clientId: import.meta.env.VITE_OAUTH_CLIENT_ID,
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  } else {
    // Web: use Google's gapi or a standard OAuth library
    // Example with google-auth-library:
    const response = await window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_OAUTH_CLIENT_ID,
      callback: handleCredentialResponse,
    });

    // Return the token obtained from the callback
    // Implementation depends on your OAuth library choice
  }
}

function getPlatform(): 'ios' | 'android' | 'web' {
  if (Capacitor.isNativePlatform()) {
    return getPlatformName() === 'ios' ? 'ios' : 'android';
  }
  return 'web';
}
```

### 5. Testing: Mock OAuth, Real Gmail API Calls

```typescript
// Tests mock fetch, not OAuth
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GmailProvider } from './GmailProvider';

describe('GmailProvider', () => {
  let provider: GmailProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    provider = new GmailProvider({
      accessToken: 'test-token',
      fetchFn: fetchMock as unknown as typeof fetch,
    });
  });

  it('lists tags by calling /labels', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          labels: [
            { id: 'INBOX', name: 'Inbox', messagesUnread: 5 },
            { id: 'SENT', name: 'Sent', messagesUnread: 0 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const tags = await provider.listTags();

    expect(tags).toEqual([
      { tagId: 'INBOX', tagName: 'Inbox', unreadCount: 5 },
      { tagId: 'SENT', tagName: 'Sent', unreadCount: 0 },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/gmail/v1/users/me/labels',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    );
  });

  // ... more tests for other methods
});
```

## Gmail API v1 Endpoints Reference

| MailProvider Method | Gmail API Endpoint | HTTP Method |
|--------------------|-------------------|------------|
| `listTags()` | `/labels` | GET |
| `listThreads(tag, pageToken)` | `/threads?q=label:TAG&pageToken=T&maxResults=N` | GET |
| `getThread(threadId)` | `/threads/{id}?format=full` | GET |
| `getMessage(messageId)` | `/messages/{id}?format=full` | GET |
| `send(draft)` | `/messages/send` | POST |
| `markRead(messageId)` | `/messages/{id}/modify` (add UNREAD label) | POST |
| `markUnread(messageId)` | `/messages/{id}/modify` (remove UNREAD label) | POST |
| `addTag(messageId, tagId)` | `/messages/{id}/modify` (add label) | POST |
| `removeTag(messageId, tagId)` | `/messages/{id}/modify` (remove label) | POST |
| `archive(threadId)` | `/threads/{id}/modify` (remove INBOX label) | POST |
| `trash(threadId)` | `/threads/{id}/modify` (add TRASH label) | POST |

## OAuth Scope

For read/write access to mail:
```
https://www.googleapis.com/auth/gmail.modify
```

For read-only:
```
https://www.googleapis.com/auth/gmail.readonly
```

JojiMailAI uses `gmail.modify` because it supports sending, tagging, and archiving.

## Storing Tokens Securely

### iOS
Use Keychain (handled automatically by Capacitor's OAuth plugin):
```typescript
// Capacitor handles token storage automatically on iOS
// Tokens are stored in the device's Keychain
```

### Android
Use Android's Keystore (handled automatically by Capacitor's OAuth plugin):
```typescript
// Capacitor handles token storage automatically on Android
// Tokens are stored in the device's KeyStore
```

### Web
Use browser localStorage or sessionStorage (browser-managed):
```typescript
// Warning: localStorage is less secure than native platform stores
// Consider using secure cookies (HttpOnly, Secure flags) instead
// For PWAs, consider using the Credential Management API
```

## Token Refresh

When a token expires (typically after ~1 hour):

```typescript
private async refreshAccessToken(): Promise<void> {
  if (!this.refreshToken) {
    throw new MailProviderError('AUTH_REQUIRED', 'No refresh token available');
  }

  const response = await this.fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: import.meta.env.VITE_OAUTH_CLIENT_ID!,
      client_secret: import.meta.env.VITE_OAUTH_CLIENT_SECRET!,  // Only on backend; on frontend, use implicit flow
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    throw new MailProviderError('AUTH_REQUIRED', 'Failed to refresh token');
  }

  const { access_token } = await response.json();
  this.accessToken = access_token;
}
```

**Note:** For client-side (browser) OAuth, use the implicit flow (don't send client_secret). The server handles token refresh server-side and sends a new token to the client. This is more secure than exposing client secrets in the client code.

## See Also

- [Capacitor OAuth2 Plugin Docs](https://capacitor.community/docs/plugins/oauth2)
- [Gmail REST API Docs](https://developers.google.com/gmail/api)
- [OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [user-stories/providers/typescript_gmail_proxy.md](user-stories/providers/typescript_gmail_proxy.md)
