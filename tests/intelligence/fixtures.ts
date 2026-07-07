/**
 * Shared fixtures for the intelligence layer tests
 * (user-stories/typescript_mail_intelligence.md): synthetic messages with
 * fake example.com addresses, a tag list, an injectable test config, and a
 * mocked OpenAI-compatible chat client. No test may open a socket or need a
 * running inference server — every completion is queued here.
 */
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { Message, Tag } from '../../src/providers/model';
import type { AiConfig } from '../../src/config';
import type { IntelligenceChatClient } from '../../src/intelligence/LocalIntelligence';

/** Marks the tail of a long plain body; must never appear in a classify prompt. */
export const LONG_TAIL_SENTINEL = 'XX_LONG_TAIL_SENTINEL_XX';
/** Marks HTML content; must never be sent to the model by any flow. */
export const HTML_SENTINEL = 'XX_HTML_ONLY_SENTINEL_XX';

export const TEST_CONFIG: AiConfig = {
  baseUrl: 'http://192.168.1.50:8000/v1',
  model: 'test-model',
  apiKey: 'sk-placeholder',
};

export const TAGS: Tag[] = [
  { tagId: 't-finance', name: 'finance' },
  { tagId: 't-travel', name: 'travel' },
  { tagId: 't-newsletters', name: 'newsletters' },
];

export function fixtureMessage(overrides: Partial<Message> = {}): Message {
  return {
    messageId: 'm-1',
    threadId: 'th-1',
    from: 'alice@example.com',
    to: ['bob@example.com'],
    cc: [],
    bcc: [],
    subject: 'Invoice #42 from ACME',
    date: 1_750_000_000_000,
    bodyPlain:
      'Hello Bob, please send the Q3 invoice by Friday. ' +
      'lorem ipsum dolor sit amet '.repeat(40) +
      LONG_TAIL_SENTINEL,
    bodyHtml: `<p>${HTML_SENTINEL}</p>`,
    unread: true,
    tagIds: [],
    ...overrides,
  };
}

export function fixtureThread(): Message[] {
  return [
    fixtureMessage({
      messageId: 'm-1',
      bodyPlain: 'Hi Bob, can we meet Tuesday about the ACME contract?',
    }),
    fixtureMessage({
      messageId: 'm-2',
      from: 'bob@example.com',
      to: ['alice@example.com'],
      date: 1_750_000_100_000,
      bodyPlain: 'Tuesday works. Please send the agenda beforehand.',
      unread: false,
    }),
  ];
}

// --- canned valid outputs, one per flow --------------------------------------

export const VALID_CLASSIFICATION = { tagIds: ['t-finance'], importance: 'normal' };
export const VALID_DIGEST = { summary: 'Alice and Bob plan a Tuesday meeting.', actionItems: ['Send the agenda'] };
export const VALID_DRAFT = { bodyPlain: 'Hi Alice,\n\nTuesday works for me.\n\nBob' };
export const VALID_CRITERIA = { text: 'invoice' };

// --- mocked OpenAI-compatible client -----------------------------------------

interface QueuedCompletion {
  content?: string;
  error?: unknown;
}

export interface ChatMock {
  /** Exactly the slice of the SDK LocalIntelligence accepts by injection. */
  client: IntelligenceChatClient;
  /** Every params object passed to create, in order. */
  calls: Array<Record<string, any>>;
  respondJson(value: unknown): ChatMock;
  respondText(content: string): ChatMock;
  reject(error: unknown): ChatMock;
}

export function createChatMock(): ChatMock {
  const calls: Array<Record<string, any>> = [];
  const queue: QueuedCompletion[] = [];
  const client: IntelligenceChatClient = {
    chat: {
      completions: {
        create: async (params: ChatCompletionCreateParamsNonStreaming) => {
          calls.push(params as unknown as Record<string, any>);
          const next = queue.shift() ?? { content: '{}' };
          if (next.error !== undefined) throw next.error;
          return {
            id: 'chatcmpl-fixture',
            object: 'chat.completion',
            created: 1_750_000_000,
            model: 'test-model',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: next.content ?? null },
              },
            ],
          };
        },
      },
    },
  };
  const mock: ChatMock = {
    calls,
    client,
    respondJson(value: unknown) {
      queue.push({ content: JSON.stringify(value) });
      return mock;
    },
    respondText(content: string) {
      queue.push({ content });
      return mock;
    },
    reject(error: unknown) {
      queue.push({ error });
      return mock;
    },
  };
  return mock;
}
