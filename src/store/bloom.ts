/**
 * Per-message Bloom filter (user-stories/typescript_mail_store.md), every
 * constant justified:
 * - m = 2048 bits (256 bytes): at a typical ~200 distinct content words per
 *   message this yields ≈1% false positives, and 256 bytes/message keeps
 *   10k messages under 3 MB;
 * - k = 4 hash positions, derived by Kirsch-Mitzenmacher double hashing —
 *   position_i = (h1 + i·h2) mod m — from two FNV-1a 32-bit variants, so
 *   two cheap hashes stand in for four independent ones.
 *
 * Bloom filters can false-positive but never false-negative: membership
 * checks prescreen candidates, which are then verified against stored text.
 */
export const BLOOM_BITS = 2048;
export const BLOOM_BYTES = BLOOM_BITS / 8; // 256
export const BLOOM_HASHES = 4;

const FNV_PRIME = 0x01000193;
const FNV_OFFSET_BASIS = 0x811c9dc5;
/** A different offset basis makes the second hash independent of the first. */
const FNV_ALT_OFFSET_BASIS = (FNV_OFFSET_BASIS ^ 0x5bd1e995) >>> 0;

/** Standard FNV-1a 32-bit hash. */
export function fnv1a(input: string, offsetBasis: number = FNV_OFFSET_BASIS): number {
  let hash = offsetBasis >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** The second FNV-1a variant: same algorithm, different offset basis. */
export function fnv1aAlt(input: string): number {
  return fnv1a(input, FNV_ALT_OFFSET_BASIS);
}

/** Kirsch-Mitzenmacher: the k bit positions of a token. */
function bitPositions(token: string): number[] {
  const h1 = fnv1a(token);
  const h2 = fnv1aAlt(token);
  const positions: number[] = [];
  for (let i = 0; i < BLOOM_HASHES; i++) {
    // h1 + 3·h2 < 2^34, exact in doubles — no 32-bit overflow tricks needed.
    positions.push((h1 + i * h2) % BLOOM_BITS);
  }
  return positions;
}

/** Build the 256-byte filter for a message's token set. */
export function createBloom(tokens: Iterable<string>): Uint8Array {
  const bloom = new Uint8Array(BLOOM_BYTES);
  for (const token of tokens) {
    for (const bit of bitPositions(token)) {
      bloom[bit >> 3] |= 1 << (bit & 7);
    }
  }
  return bloom;
}

/** Membership prescreen: false means definitely absent; true means maybe. */
export function bloomContains(bloom: Uint8Array, token: string): boolean {
  return bitPositions(token).every((bit) => (bloom[bit >> 3] & (1 << (bit & 7))) !== 0);
}

/** True when the filter may contain every one of `tokens`. */
export function bloomContainsAll(bloom: Uint8Array, tokens: Iterable<string>): boolean {
  for (const token of tokens) {
    if (!bloomContains(bloom, token)) return false;
  }
  return true;
}
