/**
 * Request-building tests for LocalIntelligence against an injected mocked
 * OpenAI client (user-stories/typescript_mail_intelligence.md):
 * - model wiring from config on every request;
 * - response_format {type: "json_schema", json_schema: {strict: true, schema}}
 *   on every flow;
 * - temperature 0 on classify/parseSearchQuery, server default on
 *   summarizeThread/draftReply;
 * - minimal fields per flow (classify sends subject/from/snippet + tags,
 *   never the full body or HTML);
 * - classify never returns a tagId outside availableTags;
 * - constructor performs no I/O; the first request happens on the first call.
 */
import { describe, expect, it } from 'vitest';
import { LocalIntelligence } from '../../src/intelligence/LocalIntelligence';
import type { MailIntelligence } from '../../src/intelligence/MailIntelligence';
import {
  createChatMock,
  fixtureMessage,
  fixtureThread,
  HTML_SENTINEL,
  LONG_TAIL_SENTINEL,
  TAGS,
  TEST_CONFIG,
  VALID_CLASSIFICATION,
  VALID_CRITERIA,
  VALID_DIGEST,
  VALID_DRAFT,
} from './fixtures';

function make() {
  const mock = createChatMock();
  const intelligence = new LocalIntelligence({ config: TEST_CONFIG, client: mock.client });
  return { mock, intelligence };
}

/** Concatenated chat message contents of the request at `index`. */
function requestText(mock: ReturnType<typeof createChatMock>, index = 0): string {
  const messages = mock.calls[index].messages as Array<{ content: string }>;
  return messages.map((m) => m.content).join('\n');
}

type FlowName = 'classify' | 'summarizeThread' | 'draftReply' | 'parseSearchQuery';

const flows: Array<{
  name: FlowName;
  run: (i: MailIntelligence) => Promise<unknown>;
  valid: unknown;
  requiredSchemaKeys: string[];
}> = [
  {
    name: 'classify',
    run: (i) => i.classify(fixtureMessage(), TAGS),
    valid: VALID_CLASSIFICATION,
    requiredSchemaKeys: ['tagIds', 'importance'],
  },
  {
    name: 'summarizeThread',
    run: (i) => i.summarizeThread(fixtureThread()),
    valid: VALID_DIGEST,
    requiredSchemaKeys: ['summary', 'actionItems'],
  },
  {
    name: 'draftReply',
    run: (i) => i.draftReply(fixtureThread(), 'decline politely'),
    valid: VALID_DRAFT,
    requiredSchemaKeys: ['bodyPlain'],
  },
  {
    name: 'parseSearchQuery',
    run: (i) => i.parseSearchQuery('invoices from acme last month', TAGS),
    valid: VALID_CRITERIA,
    requiredSchemaKeys: [],
  },
];

describe('story: every flow requests strict json_schema output and sends the configured model', () => {
  for (const flow of flows) {
    it(`${flow.name} sends model + response_format json_schema with strict: true`, async () => {
      const { mock, intelligence } = make();
      mock.respondJson(flow.valid);

      await flow.run(intelligence);

      expect(mock.calls).toHaveLength(1);
      const params = mock.calls[0];
      expect(params.model).toBe(TEST_CONFIG.model);
      expect(params.response_format.type).toBe('json_schema');
      expect(params.response_format.json_schema.strict).toBe(true);
      const schema = params.response_format.json_schema.schema;
      expect(schema).toBeTypeOf('object');
      expect(schema.type).toBe('object');
      for (const key of flow.requiredSchemaKeys) {
        expect(schema.properties).toHaveProperty(key);
        expect(schema.required).toContain(key);
      }
    });
  }
});

describe('story: temperature 0 on the deterministic flows, server default on the generative ones', () => {
  it('classify sends temperature: 0', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_CLASSIFICATION);
    await intelligence.classify(fixtureMessage(), TAGS);
    expect(mock.calls[0].temperature).toBe(0);
  });

  it('parseSearchQuery sends temperature: 0', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_CRITERIA);
    await intelligence.parseSearchQuery('invoices from acme', TAGS);
    expect(mock.calls[0].temperature).toBe(0);
  });

  it('summarizeThread omits temperature (server default)', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_DIGEST);
    await intelligence.summarizeThread(fixtureThread());
    expect(mock.calls[0].temperature).toBeUndefined();
  });

  it('draftReply omits temperature (server default)', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_DRAFT);
    await intelligence.draftReply(fixtureThread());
    expect(mock.calls[0].temperature).toBeUndefined();
  });
});

describe('story: prompts are built from minimal fields of the shared model types', () => {
  it('classify sends subject, from, a snippet, and the tag list — not the full body', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_CLASSIFICATION);
    const message = fixtureMessage();

    await intelligence.classify(message, TAGS);

    const text = requestText(mock);
    expect(text).toContain(message.subject);
    expect(text).toContain('alice@example.com');
    expect(text).toContain('t-finance');
    expect(text).toContain('finance');
    // The snippet is a truncation: the tail of the long body never ships.
    expect(text).not.toContain(LONG_TAIL_SENTINEL);
  });

  it('no flow ever sends the HTML body', async () => {
    for (const flow of flows) {
      const { mock, intelligence } = make();
      mock.respondJson(flow.valid);
      await flow.run(intelligence);
      expect(requestText(mock), `${flow.name} leaked HTML`).not.toContain(HTML_SENTINEL);
    }
  });

  it('summarizeThread sends each message body and sender', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_DIGEST);

    await intelligence.summarizeThread(fixtureThread());

    const text = requestText(mock);
    expect(text).toContain('can we meet Tuesday about the ACME contract?');
    expect(text).toContain('Please send the agenda beforehand.');
    expect(text).toContain('alice@example.com');
    expect(text).toContain('bob@example.com');
  });

  it('parseSearchQuery sends the raw query and the available tags', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_CRITERIA);

    await intelligence.parseSearchQuery('unread invoices from acme last month', TAGS);

    const text = requestText(mock);
    expect(text).toContain('unread invoices from acme last month');
    expect(text).toContain('t-finance');
  });
});

describe('story: draftReply is shaped by the thread and my optional guidance', () => {
  it('sends the guidance when provided and returns {bodyPlain}', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_DRAFT);

    const draft = await intelligence.draftReply(fixtureThread(), 'decline politely');

    expect(requestText(mock)).toContain('decline politely');
    expect(draft).toEqual(VALID_DRAFT);
  });

  it('omits the guidance field entirely when none is given', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_DRAFT);

    await intelligence.draftReply(fixtureThread());

    expect(requestText(mock)).not.toContain('"guidance"');
    expect(requestText(mock)).not.toContain('undefined');
  });
});

describe('story: classify chooses only from availableTags — never inventing a tagId', () => {
  it('returns {tagIds, importance} validated against the given tags', async () => {
    const { mock, intelligence } = make();
    mock.respondJson({ tagIds: ['t-finance'], importance: 'high' });

    const result = await intelligence.classify(fixtureMessage(), TAGS);

    expect(result).toEqual({ tagIds: ['t-finance'], importance: 'high' });
  });

  it('drops any tagId the model invented so provider.addTag cannot fail on a phantom tag', async () => {
    const { mock, intelligence } = make();
    mock.respondJson({ tagIds: ['t-finance', 't-phantom'], importance: 'normal' });

    const result = await intelligence.classify(fixtureMessage(), TAGS);

    expect(result.tagIds).toEqual(['t-finance']);
  });
});

describe('story: summarizeThread returns {summary, actionItems}', () => {
  it('returns the digest parsed from the model output', async () => {
    const { mock, intelligence } = make();
    mock.respondJson(VALID_DIGEST);

    const digest = await intelligence.summarizeThread(fixtureThread());

    expect(digest).toEqual(VALID_DIGEST);
  });
});

describe('story: parseSearchQuery returns structured SearchCriteria', () => {
  it('returns the criteria parsed from the model output', async () => {
    const { mock, intelligence } = make();
    mock.respondJson({
      tagIds: ['t-finance'],
      from: 'billing@example.com',
      text: 'invoice',
      dateFrom: 1_748_736_000_000,
      dateTo: 1_751_328_000_000,
    });

    const criteria = await intelligence.parseSearchQuery('invoices from billing last month', TAGS);

    expect(criteria).toEqual({
      tagIds: ['t-finance'],
      from: 'billing@example.com',
      text: 'invoice',
      dateFrom: 1_748_736_000_000,
      dateTo: 1_751_328_000_000,
    });
  });
});

describe('story: the constructor performs no I/O — the first request happens on the first call', () => {
  it('constructing with an injected client sends nothing', () => {
    const mock = createChatMock();
    new LocalIntelligence({ config: TEST_CONFIG, client: mock.client });
    expect(mock.calls).toHaveLength(0);
  });

  it('an injected clientFactory is not invoked at construction, then invoked exactly once', async () => {
    const mock = createChatMock();
    mock.respondJson(VALID_CLASSIFICATION).respondJson(VALID_CLASSIFICATION);
    let built = 0;
    const intelligence = new LocalIntelligence({
      config: TEST_CONFIG,
      clientFactory: () => {
        built += 1;
        return mock.client;
      },
    });

    expect(built).toBe(0);
    await intelligence.classify(fixtureMessage(), TAGS);
    expect(built).toBe(1);
    await intelligence.classify(fixtureMessage(), TAGS);
    expect(built).toBe(1); // cached, not rebuilt
    expect(mock.calls).toHaveLength(2);
  });
});
