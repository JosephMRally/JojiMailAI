/**
 * Error-mapping and retry tests for LocalIntelligence
 * (user-stories/typescript_mail_intelligence.md):
 * - errors map most-specific-first to one MailIntelligenceError:
 *   AI_UNAVAILABLE (connection refused/timeout, actionable message naming the
 *   self-hosted servers and VITE_AI_BASE_URL), AI_MODEL_NOT_FOUND (404 /
 *   unknown model, names the configured model and suggests pulling/loading),
 *   AI_BAD_OUTPUT (schema-invalid after retry), AI_ERROR (anything else);
 * - one automatic retry on schema-invalid output, and no retry on transport
 *   errors.
 */
import { describe, expect, it } from 'vitest';
import { APIConnectionError, APIConnectionTimeoutError } from 'openai';
import { LocalIntelligence } from '../../src/intelligence/LocalIntelligence';
import { MailIntelligenceError } from '../../src/intelligence/MailIntelligence';
import {
  createChatMock,
  fixtureMessage,
  fixtureThread,
  TAGS,
  TEST_CONFIG,
  VALID_CLASSIFICATION,
  VALID_DIGEST,
} from './fixtures';

function make() {
  const mock = createChatMock();
  const intelligence = new LocalIntelligence({ config: TEST_CONFIG, client: mock.client });
  return { mock, intelligence };
}

async function classifyError(intelligence: LocalIntelligence) {
  return intelligence.classify(fixtureMessage(), TAGS).catch((e: unknown) => e);
}

describe('story: connection refused/timeout becomes AI_UNAVAILABLE with an actionable message', () => {
  it('an SDK APIConnectionError maps to AI_UNAVAILABLE', async () => {
    const { mock, intelligence } = make();
    mock.reject(new APIConnectionError({ message: 'Connection error.' }));

    const error = await classifyError(intelligence);
    expect(error).toBeInstanceOf(MailIntelligenceError);
    expect((error as MailIntelligenceError).code).toBe('AI_UNAVAILABLE');
    const message = (error as MailIntelligenceError).message;
    expect(message).toMatch(/ollama/i);
    expect(message).toMatch(/vllm/i);
    expect(message).toMatch(/lm ?studio/i);
    expect(message).toContain('VITE_AI_BASE_URL');
  });

  it('a connection timeout also maps to AI_UNAVAILABLE', async () => {
    const { mock, intelligence } = make();
    mock.reject(new APIConnectionTimeoutError({ message: 'Request timed out.' }));

    const error = await classifyError(intelligence);
    expect((error as MailIntelligenceError).code).toBe('AI_UNAVAILABLE');
  });

  it('transport errors are not retried: exactly one request', async () => {
    const { mock, intelligence } = make();
    mock.reject(new APIConnectionError({ message: 'Connection error.' }));

    await classifyError(intelligence);
    expect(mock.calls).toHaveLength(1);
  });
});

describe('story: 404/unknown model becomes AI_MODEL_NOT_FOUND naming the configured model', () => {
  it('a 404 maps to AI_MODEL_NOT_FOUND and the message suggests pulling/loading the model', async () => {
    const { mock, intelligence } = make();
    mock.reject(Object.assign(new Error("model 'test-model' not found"), { status: 404 }));

    const error = await classifyError(intelligence);
    expect(error).toBeInstanceOf(MailIntelligenceError);
    expect((error as MailIntelligenceError).code).toBe('AI_MODEL_NOT_FOUND');
    const message = (error as MailIntelligenceError).message;
    expect(message).toContain(TEST_CONFIG.model);
    expect(message).toMatch(/pull|load/i);
  });
});

describe('story: anything else becomes AI_ERROR', () => {
  it('a 500 server error maps to AI_ERROR', async () => {
    const { mock, intelligence } = make();
    mock.reject(Object.assign(new Error('internal server error'), { status: 500 }));

    const error = await classifyError(intelligence);
    expect((error as MailIntelligenceError).code).toBe('AI_ERROR');
  });

  it('a plain unexpected Error maps to AI_ERROR', async () => {
    const { mock, intelligence } = make();
    mock.reject(new Error('boom'));

    const error = await classifyError(intelligence);
    expect(error).toBeInstanceOf(MailIntelligenceError);
    expect((error as MailIntelligenceError).code).toBe('AI_ERROR');
  });
});

describe('story: one automatic retry on schema-invalid output before AI_BAD_OUTPUT', () => {
  it('malformed JSON then a valid response: the retry succeeds with two requests', async () => {
    const { mock, intelligence } = make();
    mock.respondText('sorry, here is your JSON: {oops').respondJson(VALID_CLASSIFICATION);

    const result = await intelligence.classify(fixtureMessage(), TAGS);
    expect(result).toEqual(VALID_CLASSIFICATION);
    expect(mock.calls).toHaveLength(2);
  });

  it('schema-invalid JSON twice: AI_BAD_OUTPUT after exactly two requests', async () => {
    const { mock, intelligence } = make();
    mock
      .respondJson({ tagIds: ['t-finance'], importance: 'mega' })
      .respondJson({ tagIds: ['t-finance'], importance: 'mega' });

    const error = await classifyError(intelligence);
    expect(error).toBeInstanceOf(MailIntelligenceError);
    expect((error as MailIntelligenceError).code).toBe('AI_BAD_OUTPUT');
    expect(mock.calls).toHaveLength(2);
  });

  it('the generative flows retry too: summarizeThread recovers from one bad output', async () => {
    const { mock, intelligence } = make();
    mock.respondJson({ summary: 'missing actionItems' }).respondJson(VALID_DIGEST);

    const digest = await intelligence.summarizeThread(fixtureThread());
    expect(digest).toEqual(VALID_DIGEST);
    expect(mock.calls).toHaveLength(2);
  });
});
