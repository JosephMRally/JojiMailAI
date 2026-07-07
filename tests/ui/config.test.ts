/**
 * Config stories (user-stories/typescript_email_ui.md):
 * - story (engineer): the Gmail bridge baseUrl and the AI server settings are
 *   read from one config module honoring VITE_BRIDGE_URL (default
 *   http://127.0.0.1:8765), VITE_AI_BASE_URL, and VITE_AI_MODEL — so the
 *   Android emulator, a device, and any self-hosted AI server are configured
 *   without code edits.
 */
import { describe, expect, it } from 'vitest';
import * as config from '../../src/config';

describe('story: one config module carries bridge and AI settings with env overrides', () => {
  it('defaults the bridge baseUrl to http://127.0.0.1:8765', () => {
    expect(config.loadBridgeConfig({}).baseUrl).toBe('http://127.0.0.1:8765');
  });

  it('honors VITE_BRIDGE_URL (e.g. the Android emulator reaches the host via 10.0.2.2)', () => {
    expect(config.loadBridgeConfig({ VITE_BRIDGE_URL: 'http://10.0.2.2:8765' }).baseUrl).toBe(
      'http://10.0.2.2:8765',
    );
  });

  it('the same module carries the AI settings with their env overrides', () => {
    expect(typeof config.loadAiConfig).toBe('function');
    const ai = config.loadAiConfig({
      VITE_AI_MODEL: 'llama3',
      VITE_AI_BASE_URL: 'http://127.0.0.1:1234/v1',
    });
    expect(ai).toMatchObject({ model: 'llama3', baseUrl: 'http://127.0.0.1:1234/v1' });
  });
});
