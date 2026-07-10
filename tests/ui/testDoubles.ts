/**
 * Controllable test doubles for the UI stories, built as thin subclasses of the
 * official in-memory fakes (FakeProvider / FakeMailStore) so every UI test still
 * runs against the fakes' semantics — these only add failure switches and manual
 * control for the offline/degrade stories. Zero I/O, deterministic.
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

/** FakeProvider whose listTags rejects until cleared (startup auth/offline stories). */
export class TagsFailingProvider extends FakeProvider {
  tagsFailWith?: MailProviderError;

  override async listTags(): Promise<Tag[]> {
    if (this.tagsFailWith) throw this.tagsFailWith;
    return super.listTags();
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
