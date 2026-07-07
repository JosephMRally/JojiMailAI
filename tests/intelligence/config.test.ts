/**
 * Config tests (user-stories/typescript_mail_intelligence.md):
 * - VITE_AI_BASE_URL defaults to Ollama's http://127.0.0.1:11434/v1;
 * - VITE_AI_MODEL has no default and fails fast with a clear error naming
 *   the missing setting;
 * - VITE_AI_API_KEY is a configurable placeholder defaulting to "not-needed";
 * - config is injectable so tests never depend on the ambient env, while
 *   production reads import.meta.env.
 */
import { describe, expect, it } from 'vitest';
import { loadAiConfig } from '../../src/config';

const configSources = import.meta.glob('/src/config.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('story: baseURL and model come from config so switching servers is never a code change', () => {
  it('VITE_AI_BASE_URL defaults to the Ollama endpoint http://127.0.0.1:11434/v1', () => {
    const config = loadAiConfig({ VITE_AI_MODEL: 'llama3.1' });
    expect(config.baseUrl).toBe('http://127.0.0.1:11434/v1');
  });

  it('an explicit VITE_AI_BASE_URL (e.g. vLLM on :8000) wins over the default', () => {
    const config = loadAiConfig({
      VITE_AI_MODEL: 'llama3.1',
      VITE_AI_BASE_URL: 'http://127.0.0.1:8000/v1',
    });
    expect(config.baseUrl).toBe('http://127.0.0.1:8000/v1');
  });

  it('the configured model is passed through verbatim', () => {
    const config = loadAiConfig({ VITE_AI_MODEL: 'qwen2.5:7b' });
    expect(config.model).toBe('qwen2.5:7b');
  });

  it('production reads import.meta.env (source-level check, env stays injectable for tests)', () => {
    const source = Object.values(configSources).join('\n');
    expect(source).toContain('import.meta.env');
    expect(source).toContain('VITE_AI_BASE_URL');
    expect(source).toContain('VITE_AI_MODEL');
    expect(source).toContain('VITE_AI_API_KEY');
  });
});

describe('story: VITE_AI_MODEL has no default — fail fast with a clear error naming the setting', () => {
  it('a missing model throws an error whose message names VITE_AI_MODEL', () => {
    expect(() => loadAiConfig({})).toThrowError(/VITE_AI_MODEL/);
  });

  it('an empty-string model also fails fast', () => {
    expect(() => loadAiConfig({ VITE_AI_MODEL: '' })).toThrowError(/VITE_AI_MODEL/);
  });
});

describe('story: the apiKey is a configurable placeholder for self-hosted servers', () => {
  it('defaults to "not-needed"', () => {
    const config = loadAiConfig({ VITE_AI_MODEL: 'llama3.1' });
    expect(config.apiKey).toBe('not-needed');
  });

  it('a real gateway key can be injected via VITE_AI_API_KEY without code changes', () => {
    const config = loadAiConfig({
      VITE_AI_MODEL: 'llama3.1',
      VITE_AI_API_KEY: 'sk-gateway-123',
    });
    expect(config.apiKey).toBe('sk-gateway-123');
  });
});
