/**
 * Config stories (user-stories/typescript_mail_intelligence.md and
 * user-stories/typescript_email_ui.md):
 * - story (engineer): the AI server settings are read from one config module
 *   honoring VITE_AI_BASE_URL, VITE_AI_MODEL, and VITE_AI_API_KEY — switching
 *   servers or models is a config change, never a code change;
 * - story (engineer): the app-store build has no bridge — no bridge URL
 *   setting exists anywhere in config.
 */
import { describe, expect, it } from 'vitest';
import * as config from '../../src/config';

describe('story: one config module carries the AI settings with env overrides', () => {
  it('reads model, baseUrl, and apiKey from the env', () => {
    const ai = config.loadAiConfig({
      VITE_AI_MODEL: 'llama3',
      VITE_AI_BASE_URL: 'http://127.0.0.1:1234/v1',
      VITE_AI_API_KEY: 'gateway-key',
    });
    expect(ai).toStrictEqual({
      model: 'llama3',
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKey: 'gateway-key',
    });
  });

  it('defaults baseUrl to Ollama and apiKey to the placeholder', () => {
    const ai = config.loadAiConfig({ VITE_AI_MODEL: 'llama3' });
    expect(ai.baseUrl).toBe('http://127.0.0.1:11434/v1');
    expect(ai.apiKey).toBe('not-needed');
  });

  it('fails fast with an error naming VITE_AI_MODEL when it is unset', () => {
    expect(() => config.loadAiConfig({})).toThrow(/VITE_AI_MODEL/);
  });
});

describe('story: the app-store build has no bridge — no bridge URL setting exists', () => {
  it('config exports no bridge loader or default', () => {
    expect('loadBridgeConfig' in config).toBe(false);
    expect('DEFAULT_BRIDGE_URL' in config).toBe(false);
  });
});
