/**
 * Boundary and privacy tests for the intelligence layer
 * (user-stories/typescript_mail_intelligence.md):
 * - MailIntelligence is the single AI surface the UI may import, enforced by
 *   the same no-concrete-imports discipline that guards the provider layer;
 * - mail content never leaves the user's machines: no cloud AI hosts, no raw
 *   fetch, and a localhost default endpoint;
 * - LocalIntelligence is implemented with the official openai SDK, never raw
 *   fetch;
 * - tests run under node with no DOM and no running inference server.
 */
import { describe, expect, it } from 'vitest';

const intelligenceSources = import.meta.glob('/src/intelligence/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const configSources = import.meta.glob('/src/config.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const uiSources = import.meta.glob('/src/ui/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Matches import/export specifiers such as `from './x'` or `import('./x')`. */
const IMPORT_SPECIFIER_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

describe('story: MailIntelligence is the single AI surface the UI may import, enforced like the provider layer', () => {
  it('the intelligence layer ships its three contract files', () => {
    const fileNames = Object.keys(intelligenceSources).map((p) => p.split('/').pop());
    expect(fileNames).toEqual(
      expect.arrayContaining(['MailIntelligence.ts', 'LocalIntelligence.ts', 'FakeIntelligence.ts']),
    );
  });

  it('no file under src/ui/ imports a concrete intelligence module', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(uiSources)) {
      for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
        const specifier = match[1];
        if (/intelligence\/(LocalIntelligence|FakeIntelligence)/.test(specifier)) {
          offenders.push(`${file} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('story: LocalIntelligence uses the official openai SDK, never raw fetch', () => {
  it('LocalIntelligence.ts imports the openai package', () => {
    const source = Object.entries(intelligenceSources).find(([path]) =>
      path.endsWith('/LocalIntelligence.ts'),
    )?.[1];
    expect(source).toBeDefined();
    expect(source!).toMatch(/from\s+['"]openai['"]/);
  });

  it('no intelligence-layer file calls fetch, XMLHttpRequest, or WebSocket directly', () => {
    const forbidden: Array<[string, RegExp]> = [
      ['raw fetch call', /\bfetch\s*\(/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['WebSocket', /\bWebSocket\b/],
    ];
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(intelligenceSources)) {
      for (const [label, pattern] of forbidden) {
        if (pattern.test(source)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('story: mail content never leaves my machines — no cloud AI service is ever referenced', () => {
  it('no intelligence or config source mentions a cloud AI host', () => {
    const cloudHosts =
      /api\.openai\.com|openrouter|anthropic|generativelanguage|googleapis|azure|api\.mistral|groq\.com|together\.ai/i;
    const offenders: string[] = [];
    for (const [file, source] of Object.entries({ ...intelligenceSources, ...configSources })) {
      if (cloudHosts.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('the default inference endpoint is localhost (self-hosted)', () => {
    const source = Object.values(configSources).join('\n');
    expect(source).toContain('http://127.0.0.1:11434/v1');
  });
});

describe('story: vitest is the runner and no test requires a running inference server or opens a socket', () => {
  it('runs under the node vitest environment with no DOM globals', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
