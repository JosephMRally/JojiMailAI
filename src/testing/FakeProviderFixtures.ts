/**
 * Testing utilities for FakeProvider (user-stories/providers/typescript_fake_provider.md).
 * These helpers live outside the pure provider layer and may perform I/O.
 */
import type { FakeProviderFixtures } from '../providers/FakeProvider';

/** Load fixture data from a JSON file (dev/prod: fetch from public root, tests: import directly). */
export async function loadFakeFixtures(path: string): Promise<FakeProviderFixtures> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load fixtures from ${path}: ${response.statusText}`);
  }
  return response.json();
}
