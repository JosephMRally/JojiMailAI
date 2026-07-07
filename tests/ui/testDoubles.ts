/**
 * Controllable test doubles for the UI stories, all built as thin subclasses
 * of the official in-memory fakes (FakeProvider / FakeIntelligence) so every
 * UI test still runs against the fakes' semantics — these only add failure
 * switches and manual promise resolution for the offline/degrade/async
 * stories. Zero I/O, deterministic.
 */
import { FakeProvider, type FakeProviderFixtures } from '../../src/providers/FakeProvider';
import type {
  ListThreadsOptions,
  ProviderCapabilities,
  SendResult,
  ThreadPage,
} from '../../src/providers/MailProvider';
import type { Draft, MailProviderError, Message, Tag } from '../../src/providers/model';
import { FakeMailStore } from '../../src/store/FakeMailStore';
import { FakeIntelligence } from '../../src/intelligence/FakeIntelligence';
import {
  MailIntelligenceError,
  type Classification,
  type ReplyDraft,
  type SearchCriteria,
  type ThreadDigest,
} from '../../src/intelligence/MailIntelligence';

/** FakeProvider whose listThreads/send can be switched to reject (offline/auth/send-failure stories). */
export class FlakyProvider extends FakeProvider {
  failWith?: MailProviderError;
  sendFailWith?: MailProviderError;

  override async listThreads(tagId: string, opts?: ListThreadsOptions): Promise<ThreadPage> {
    if (this.failWith) throw this.failWith;
    return super.listThreads(tagId, opts);
  }

  override async send(draft: Draft): Promise<SendResult> {
    if (this.sendFailWith) throw this.sendFailWith;
    return super.send(draft);
  }
}

/** FakeMailStore whose getThread can reject or come back empty (thread-view error/empty stories). */
export class FlakyStore extends FakeMailStore {
  /** getThread rejects with this until cleared. */
  getThreadFailWith?: Error;
  /** When true, getThread resolves [] as if the bodies were never synced. */
  returnEmptyThreads = false;

  override async getThread(threadId: string): Promise<Message[]> {
    if (this.getThreadFailWith) throw this.getThreadFailWith;
    if (this.returnEmptyThreads) return [];
    return super.getThread(threadId);
  }
}

/** FakeProvider that never resolves listTags — freezes the app in its loading state. */
export class HangingProvider extends FakeProvider {
  override listTags(): Promise<Tag[]> {
    return new Promise<Tag[]>(() => {});
  }
}

/** FakeProvider reporting fixed capabilities (capability-gating stories). */
export class CapabilityProvider extends FakeProvider {
  constructor(
    fixtures: FakeProviderFixtures,
    private readonly caps: ProviderCapabilities,
  ) {
    super(fixtures);
  }

  override async capabilities(): Promise<ProviderCapabilities> {
    return { ...this.caps };
  }
}

export type IntelligenceMethod =
  | 'classify'
  | 'summarizeThread'
  | 'draftReply'
  | 'parseSearchQuery';

export interface RejectingIntelligenceOptions {
  error?: MailIntelligenceError;
  /** How many times each listed method rejects before delegating; default forever. */
  times?: number;
  now?: () => number;
}

/** FakeIntelligence whose chosen methods reject with a MailIntelligenceError. */
export class RejectingIntelligence extends FakeIntelligence {
  readonly error: MailIntelligenceError;
  private readonly remaining: Map<IntelligenceMethod, number>;

  constructor(failing: IntelligenceMethod[], options: RejectingIntelligenceOptions = {}) {
    super({ now: options.now });
    this.error =
      options.error ?? new MailIntelligenceError('AI_UNAVAILABLE', 'inference server unreachable');
    this.remaining = new Map(failing.map((method) => [method, options.times ?? Infinity]));
  }

  private gate(method: IntelligenceMethod): void {
    const left = this.remaining.get(method) ?? 0;
    if (left > 0) {
      this.remaining.set(method, left - 1);
      throw this.error;
    }
  }

  override async classify(message: Message, availableTags: Tag[]): Promise<Classification> {
    this.gate('classify');
    return super.classify(message, availableTags);
  }

  override async summarizeThread(messages: Message[]): Promise<ThreadDigest> {
    this.gate('summarizeThread');
    return super.summarizeThread(messages);
  }

  override async draftReply(thread: Message[], guidance?: string): Promise<ReplyDraft> {
    this.gate('draftReply');
    return super.draftReply(thread, guidance);
  }

  override async parseSearchQuery(query: string, availableTags: Tag[]): Promise<SearchCriteria> {
    this.gate('parseSearchQuery');
    return super.parseSearchQuery(query, availableTags);
  }
}

/** FakeIntelligence whose digests resolve only when the test says so (async digest story). */
export class DeferredDigestIntelligence extends FakeIntelligence {
  digestCalls = 0;
  private pending: Array<(digest: ThreadDigest) => void> = [];

  override summarizeThread(_messages: Message[]): Promise<ThreadDigest> {
    this.digestCalls += 1;
    return new Promise<ThreadDigest>((resolve) => this.pending.push(resolve));
  }

  resolveDigests(digest: ThreadDigest): void {
    const waiting = this.pending;
    this.pending = [];
    for (const resolve of waiting) resolve(digest);
  }
}
