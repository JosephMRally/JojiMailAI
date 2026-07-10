/**
 * Build provider-flag stories (user-stories/typescript_email_ui.md):
 * - story (engineer): `npm run build` requires an explicit provider flag
 *   (`npm run build -- --provider=gmail`) routed through scripts/build.mjs;
 *   a missing or unknown --provider throws before any compilation starts,
 *   naming the flag, showing the usage, and listing the known provider ids;
 * - story (engineer): the parsing/validation lives in scripts/providerFlag.mjs
 *   as a pure function unit-tested here — the exception paths are tested
 *   without running a real build.
 */
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { KNOWN_PROVIDERS, resolveProviderFlag } from '../../scripts/providerFlag.mjs';

describe('story: a missing --provider flag throws before any compilation starts', () => {
  it('no arguments at all throws, naming the flag and showing the usage', () => {
    expect(() => resolveProviderFlag([])).toThrow(/--provider/);
    expect(() => resolveProviderFlag([])).toThrow(/npm run build -- --provider=/);
  });

  it('the error lists every known provider id', () => {
    for (const id of KNOWN_PROVIDERS) {
      expect(() => resolveProviderFlag([])).toThrow(new RegExp(id));
    }
  });

  it('a bare --provider with no value also throws', () => {
    expect(() => resolveProviderFlag(['--provider'])).toThrow(/--provider/);
    expect(() => resolveProviderFlag(['--provider='])).toThrow(/--provider/);
  });
});

describe('story: an unknown provider id throws, listing the known ids', () => {
  it('rejects a provider that has no registered implementation', () => {
    expect(() => resolveProviderFlag(['--provider=aol'])).toThrow(/aol/);
    expect(() => resolveProviderFlag(['--provider=aol'])).toThrow(/gmail/);
  });
});

describe('story: a valid flag resolves to the provider id', () => {
  it('accepts --provider=gmail', () => {
    expect(resolveProviderFlag(['--provider=gmail'])).toBe('gmail');
  });

  it('accepts --provider=vite', () => {
    expect(resolveProviderFlag(['--provider=vite'])).toBe('vite');
  });

  it('accepts the two-argument form --provider gmail', () => {
    expect(resolveProviderFlag(['--provider', 'gmail'])).toBe('gmail');
  });

  it('accepts the two-argument form --provider vite', () => {
    expect(resolveProviderFlag(['--provider', 'vite'])).toBe('vite');
  });

  it('gmail is a known provider', () => {
    expect(KNOWN_PROVIDERS).toContain('gmail');
  });

  it('vite is a known provider', () => {
    expect(KNOWN_PROVIDERS).toContain('vite');
  });
});

describe('story: npm run build routes through scripts/build.mjs', () => {
  it('the package.json build script invokes the flag-checking build script', () => {
    expect(pkg.scripts.build).toContain('scripts/build.mjs');
  });
});
