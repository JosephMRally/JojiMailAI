/**
 * Default-client construction tests (user-stories/typescript_mail_intelligence.md):
 * when no client is injected, LocalIntelligence lazily builds the official
 * openai SDK client — new OpenAI({baseURL, apiKey, dangerouslyAllowBrowser:
 * true}) — on the first method call, never at construction. The `openai`
 * module is mocked here, so no socket is ever opened.
 */
import { describe, expect, it, vi } from 'vitest';
import { LocalIntelligence } from '../../src/intelligence/LocalIntelligence';
import { fixtureMessage, TAGS, TEST_CONFIG, VALID_CLASSIFICATION } from './fixtures';

const state = vi.hoisted(() => ({ constructorArgs: [] as Array<Record<string, unknown>> }));

vi.mock('openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('openai')>();
  class MockOpenAI {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { role: 'assistant', content: JSON.stringify(VALID_CLASSIFICATION) } }],
        }),
      },
    };
    constructor(options: Record<string, unknown>) {
      state.constructorArgs.push(options);
    }
  }
  return { ...actual, default: MockOpenAI };
});

describe('story: LocalIntelligence builds the official OpenAI client lazily from config', () => {
  it('construction builds no client (no I/O), the first call builds exactly one', async () => {
    state.constructorArgs.length = 0;
    const intelligence = new LocalIntelligence({ config: TEST_CONFIG });
    expect(state.constructorArgs).toHaveLength(0);

    await intelligence.classify(fixtureMessage(), TAGS);
    expect(state.constructorArgs).toHaveLength(1);

    await intelligence.classify(fixtureMessage(), TAGS);
    expect(state.constructorArgs).toHaveLength(1); // cached, not rebuilt
  });

  it('the client gets baseURL and apiKey from config plus dangerouslyAllowBrowser for the webview', async () => {
    state.constructorArgs.length = 0;
    const intelligence = new LocalIntelligence({ config: TEST_CONFIG });
    await intelligence.classify(fixtureMessage(), TAGS);

    expect(state.constructorArgs[0]).toMatchObject({
      baseURL: TEST_CONFIG.baseUrl,
      apiKey: TEST_CONFIG.apiKey,
      dangerouslyAllowBrowser: true,
    });
  });
});
