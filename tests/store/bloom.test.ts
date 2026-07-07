/**
 * Bloom filter tests (user-stories/typescript_mail_store.md): m = 2048 bits
 * (256 bytes), k = 4 positions via Kirsch-Mitzenmacher double hashing from
 * two FNV-1a 32-bit variants. The two properties that make the design
 * correct are pinned directly: no false negatives ever, and a measured
 * false-positive rate below 5% on fixture data (~200 distinct words per
 * message).
 */
import { describe, expect, it } from 'vitest';
import {
  BLOOM_BITS,
  BLOOM_BYTES,
  BLOOM_HASHES,
  bloomContains,
  createBloom,
  fnv1a,
  fnv1aAlt,
} from '../../src/store/bloom';
import { mulberry32, sampleDistinct, syntheticVocab } from './fixtures';

function setBitPositions(bloom: Uint8Array): number[] {
  const positions: number[] = [];
  for (let bit = 0; bit < bloom.length * 8; bit++) {
    if ((bloom[bit >> 3] & (1 << (bit & 7))) !== 0) positions.push(bit);
  }
  return positions;
}

describe('story: per-message Bloom filter — m = 2048 bits (256 bytes), k = 4, every constant justified', () => {
  it('exports the spec constants: 2048 bits, 256 bytes, 4 hash positions', () => {
    expect(BLOOM_BITS).toBe(2048);
    expect(BLOOM_BYTES).toBe(256);
    expect(BLOOM_HASHES).toBe(4);
  });

  it('createBloom returns a 256-byte Uint8Array; the empty token set is all zeroes', () => {
    const bloom = createBloom([]);
    expect(bloom).toBeInstanceOf(Uint8Array);
    expect(bloom.length).toBe(256);
    expect(setBitPositions(bloom)).toEqual([]);
  });

  it('a single token sets between 1 and 4 bits (k = 4 positions, collisions allowed)', () => {
    const positions = setBitPositions(createBloom(['quarterly']));
    expect(positions.length).toBeGreaterThanOrEqual(1);
    expect(positions.length).toBeLessThanOrEqual(4);
  });

  it('is deterministic and insertion-order independent', () => {
    const a = createBloom(['alpha', 'beta', 'gamma']);
    const b = createBloom(['gamma', 'alpha', 'beta']);
    expect(a).toEqual(b);
  });
});

describe('story: k positions derived by Kirsch-Mitzenmacher double hashing from two FNV-1a 32-bit variants', () => {
  it('fnv1a matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('the second variant hashes the same input to different values', () => {
    for (const token of ['quarterly', 'invoice', 'zz42']) {
      expect(fnv1aAlt(token)).not.toBe(fnv1a(token));
    }
  });

  it('a token’s bits sit exactly at (h1 + i·h2) mod 2048 for i = 0..3', () => {
    for (const token of ['quarterly', 'ramen', 'zz1a']) {
      const h1 = fnv1a(token);
      const h2 = fnv1aAlt(token);
      const expected = [
        ...new Set(
          Array.from({ length: BLOOM_HASHES }, (_, i) => (h1 + i * h2) % BLOOM_BITS),
        ),
      ].sort((a, b) => a - b);
      expect(setBitPositions(createBloom([token]))).toEqual(expected);
    }
  });
});

describe('story: Bloom filters can false-positive but never false-negative', () => {
  it('property: every indexed word is found — zero false negatives across 100 messages x 200 words', () => {
    const vocab = syntheticVocab(3000);
    const rand = mulberry32(0xb100f);
    let misses = 0;
    for (let i = 0; i < 100; i++) {
      const words = sampleDistinct(vocab, 200, rand);
      const bloom = createBloom(words);
      for (const word of words) {
        if (!bloomContains(bloom, word)) misses++;
      }
    }
    expect(misses).toBe(0);
  });

  it('property: measured false-positive rate is below 5% at ~200 distinct words per message', () => {
    const vocab = syntheticVocab(3000);
    const rand = mulberry32(0xfa15e);
    let trials = 0;
    let falsePositives = 0;
    for (let i = 0; i < 100; i++) {
      const words = sampleDistinct(vocab, 200, rand);
      const wordSet = new Set(words);
      const bloom = createBloom(words);
      let probed = 0;
      for (const candidate of vocab) {
        if (probed >= 100) break;
        if (wordSet.has(candidate)) continue;
        probed++;
        trials++;
        if (bloomContains(bloom, candidate)) falsePositives++;
      }
    }
    const rate = falsePositives / trials;
    expect(trials).toBe(10_000);
    expect(rate).toBeLessThan(0.05);
  });
});
