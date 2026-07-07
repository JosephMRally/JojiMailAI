/**
 * LocalIntelligence — the concrete MailIntelligence backed by a self-hosted,
 * OpenAI-compatible inference server (Ollama, vLLM, or LM Studio) through the
 * official `openai` SDK, never raw fetch. Every flow requests strict
 * json_schema output and re-validates it with the matching zod schema; one
 * automatic retry absorbs schema-invalid output from small local models.
 * Construction performs no I/O (lazy client, same discipline as
 * GmailProvider): the first HTTP request happens on the first method call.
 * Inference stays on the user's own machines — the default endpoint is
 * localhost and no cloud AI host is ever contacted.
 * Spec: user-stories/typescript_mail_intelligence.md.
 */
import OpenAI, { APIConnectionError } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { z } from 'zod';
import { loadAiConfig, type AiConfig } from '../config';
import type { Message, Tag } from '../providers/model';
import {
  ClassificationSchema,
  MailIntelligenceError,
  ReplyDraftSchema,
  SearchCriteriaSchema,
  ThreadDigestSchema,
  type Classification,
  type MailIntelligence,
  type ReplyDraft,
  type SearchCriteria,
  type ThreadDigest,
} from './MailIntelligence';

/** The slice of the SDK LocalIntelligence needs; tests inject a mock of it. */
export interface IntelligenceChatClient {
  chat: {
    completions: {
      create(params: ChatCompletionCreateParamsNonStreaming): Promise<unknown>;
    };
  };
}

export interface LocalIntelligenceOptions {
  /** Injected by tests; production defaults to loadAiConfig(). */
  config?: AiConfig;
  /** A ready client (tests). Takes precedence over clientFactory. */
  client?: IntelligenceChatClient;
  /** Lazily invoked on the first call; defaults to building the openai SDK client. */
  clientFactory?: () => IntelligenceChatClient;
}

/** Keep prompts small for local context windows. */
const SNIPPET_CHARS = 280;
const BODY_CHARS = 2000;

// --- json_schema payloads (mirror the zod schemas field-for-field) -----------

const CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    tagIds: { type: 'array', items: { type: 'string' } },
    importance: { type: 'string', enum: ['high', 'normal', 'low'] },
  },
  required: ['tagIds', 'importance'],
  additionalProperties: false,
};

const THREAD_DIGEST_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    actionItems: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'actionItems'],
  additionalProperties: false,
};

const REPLY_DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    bodyPlain: { type: 'string' },
  },
  required: ['bodyPlain'],
  additionalProperties: false,
};

const SEARCH_CRITERIA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    tagIds: { type: 'array', items: { type: 'string' } },
    from: { type: 'string' },
    text: { type: 'string' },
    dateFrom: { type: 'number' },
    dateTo: { type: 'number' },
  },
  required: [],
  additionalProperties: false,
};

interface StructuredRequest<T> {
  name: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  system: string;
  user: string;
  /** Deterministic flows pin temperature 0; generative ones use the server default. */
  deterministic?: boolean;
}

export class LocalIntelligence implements MailIntelligence {
  private readonly config: AiConfig;
  private readonly clientFactory: () => IntelligenceChatClient;
  private client?: IntelligenceChatClient;

  constructor(options: LocalIntelligenceOptions = {}) {
    this.config = options.config ?? loadAiConfig();
    this.client = options.client;
    this.clientFactory =
      options.clientFactory ??
      (() =>
        new OpenAI({
          baseURL: this.config.baseUrl,
          apiKey: this.config.apiKey,
          dangerouslyAllowBrowser: true,
        }));
  }

  async classify(message: Message, availableTags: Tag[]): Promise<Classification> {
    const result = await this.requestStructured({
      name: 'classification',
      schema: ClassificationSchema,
      jsonSchema: CLASSIFICATION_JSON_SCHEMA,
      system:
        'You are the triage engine of an email client. Classify the email into ' +
        'zero or more of the available tags (use tagId values only) and rate its ' +
        'importance. Respond with JSON only.',
      user: JSON.stringify({
        subject: message.subject,
        from: message.from,
        snippet: (message.bodyPlain ?? '').slice(0, SNIPPET_CHARS),
        availableTags: availableTags.map(({ tagId, name }) => ({ tagId, name })),
      }),
      deterministic: true,
    });
    // Never surface an invented tagId: applying it via provider.addTag must not fail.
    const known = new Set(availableTags.map((tag) => tag.tagId));
    return { ...result, tagIds: result.tagIds.filter((tagId) => known.has(tagId)) };
  }

  async summarizeThread(messages: Message[]): Promise<ThreadDigest> {
    return this.requestStructured({
      name: 'thread_digest',
      schema: ThreadDigestSchema,
      jsonSchema: THREAD_DIGEST_JSON_SCHEMA,
      system:
        'Summarize this email thread for its owner and list the concrete action ' +
        'items it asks of them. Respond with JSON only.',
      user: JSON.stringify({
        subject: messages[0]?.subject,
        messages: messages.map((message) => ({
          from: message.from,
          date: message.date,
          body: (message.bodyPlain ?? '').slice(0, BODY_CHARS),
        })),
      }),
    });
  }

  async draftReply(thread: Message[], guidance?: string): Promise<ReplyDraft> {
    return this.requestStructured({
      name: 'reply_draft',
      schema: ReplyDraftSchema,
      jsonSchema: REPLY_DRAFT_JSON_SCHEMA,
      system:
        'Draft a plain-text reply to the last message of this email thread on ' +
        'behalf of its owner, following their instructions if given. ' +
        'Respond with JSON only.',
      user: JSON.stringify({
        subject: thread[0]?.subject,
        thread: thread.map((message) => ({
          from: message.from,
          body: (message.bodyPlain ?? '').slice(0, BODY_CHARS),
        })),
        ...(guidance === undefined ? {} : { instructions: guidance }),
      }),
    });
  }

  async parseSearchQuery(query: string, availableTags: Tag[]): Promise<SearchCriteria> {
    return this.requestStructured({
      name: 'search_criteria',
      schema: SearchCriteriaSchema,
      jsonSchema: SEARCH_CRITERIA_JSON_SCHEMA,
      system:
        'Convert the natural-language mailbox search query into structured ' +
        'criteria. Dates are epoch milliseconds relative to nowMs. Use tagId ' +
        'values only. Omit fields the query does not imply. Respond with JSON only.',
      user: JSON.stringify({
        query,
        nowMs: Date.now(),
        availableTags: availableTags.map(({ tagId, name }) => ({ tagId, name })),
      }),
      deterministic: true,
    });
  }

  // --- plumbing ---------------------------------------------------------------

  private getClient(): IntelligenceChatClient {
    if (!this.client) this.client = this.clientFactory();
    return this.client;
  }

  /**
   * One request with strict json_schema output, zod-validated; one automatic
   * retry on schema-invalid output, then AI_BAD_OUTPUT. Transport errors are
   * mapped immediately and never retried.
   */
  private async requestStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model: this.config.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: request.name, strict: true, schema: request.jsonSchema },
      },
      ...(request.deterministic ? { temperature: 0 } : {}),
    };

    const attempts = 2; // the original request plus one retry on bad output
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let completion: unknown;
      try {
        completion = await this.getClient().chat.completions.create(params);
      } catch (error) {
        throw this.toIntelligenceError(error);
      }
      const content = extractContent(completion);
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        continue; // malformed JSON — retry once
      }
      const validated = request.schema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
    throw new MailIntelligenceError(
      'AI_BAD_OUTPUT',
      `The model returned output that failed the ${request.name} schema even after a retry.`,
    );
  }

  /** Most-specific-first mapping into the one normalized error type. */
  private toIntelligenceError(error: unknown): MailIntelligenceError {
    if (error instanceof MailIntelligenceError) return error;
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof APIConnectionError) {
      return new MailIntelligenceError(
        'AI_UNAVAILABLE',
        `Cannot reach the AI server at ${this.config.baseUrl}: ${detail}. ` +
          'Start your self-hosted inference server (Ollama, vLLM, or LM Studio) ' +
          'and check VITE_AI_BASE_URL.',
      );
    }
    if ((error as { status?: unknown } | null)?.status === 404) {
      return new MailIntelligenceError(
        'AI_MODEL_NOT_FOUND',
        `Model "${this.config.model}" was not found on the AI server: ${detail}. ` +
          `Pull or load it (e.g. \`ollama pull ${this.config.model}\`) or change VITE_AI_MODEL.`,
      );
    }
    return new MailIntelligenceError('AI_ERROR', detail);
  }
}

function extractContent(completion: unknown): string {
  const choices = (completion as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}
