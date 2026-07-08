/**
 * Shared fixture builders for the provider-layer tests. All addresses are
 * fake (@example.com) per SKILL.md — no real addresses or credentials.
 * Fixtures are loaded from tests/fixtures/fake-provider-comprehensive.json.
 */
import type { Message, Tag } from '../../src/providers/model';
import comprehensiveFixtures from '../fixtures/fake-provider-comprehensive.json';

export interface ProviderFixtures {
  tags: Tag[];
  messages: Message[];
}

export const SELF_ADDRESS = 'me@example.com';

// Computed from the comprehensive fixture file; kept as exports for backward compatibility.
export const D_M1 = 1735734000000;
export const D_M2 = 1735738200000;
export const D_M3 = 1735820400000;
export const D_M4 = 1735906800000;
export const D_M5 = 1735993200000;
export const D_M6 = 1736079600000;

/** Every thread in the fixture set carries the `inbox` tag. */
export const ALL_INBOX_THREAD_IDS = ['t1', 't2', 't3', 't4', 't5'];

export function makeFixtures(): ProviderFixtures {
  // Deep-copy: callers may mutate what they get, and the JSON import is a
  // module-level singleton shared by every test in the worker.
  return structuredClone(comprehensiveFixtures) as ProviderFixtures;
}
