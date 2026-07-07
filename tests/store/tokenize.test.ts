/**
 * Tokenization tests (user-stories/typescript_mail_store.md): one shared
 * tokenize.ts lowercases subject + bodyPlain, splits on non-alphanumeric
 * runs, and drops sub-2-character tokens plus every word in the bundled
 * ~175-word English stop-word list, so indexing and querying can never
 * tokenize differently.
 */
import { describe, expect, it } from 'vitest';
import { STOP_WORDS } from '../../src/store/stopwords';
import { tokenize } from '../../src/store/tokenize';

describe('story: tokenization in one shared tokenize.ts — lowercase, split on non-alphanumeric runs', () => {
  it('lowercases and splits on runs of non-alphanumeric characters', () => {
    expect(tokenize('Hello,   WORLD-wide...Web!')).toEqual(['hello', 'world', 'wide', 'web']);
  });

  it('keeps digit tokens — alphanumeric means letters and digits', () => {
    expect(tokenize('Invoice #42 due 2025')).toEqual(['invoice', '42', 'due', '2025']);
  });

  it('drops tokens shorter than 2 characters', () => {
    // "don't" splits into "don" + "t"; the 1-char "t" is dropped.
    expect(tokenize("don't x 7 ok")).toEqual(['don', 'ok']);
  });

  it('drops every stop word', () => {
    expect(tokenize('The report is on the table')).toEqual(['report', 'table']);
  });

  it('returns [] for empty input and for all-stop-word input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('the of and is to in it')).toEqual([]);
  });

  it('is deterministic — the same input always tokenizes the same way', () => {
    const input = 'Please review the attached Quarterly REPORT before Friday.';
    expect(tokenize(input)).toEqual(tokenize(input));
    expect(tokenize(input)).toEqual(['please', 'review', 'attached', 'quarterly', 'report', 'friday']);
  });
});

describe('story: a bundled English stop-word list (~175 words: articles, pronouns, prepositions, auxiliaries)', () => {
  it('contains roughly 175 words', () => {
    expect(STOP_WORDS.size).toBeGreaterThanOrEqual(160);
    expect(STOP_WORDS.size).toBeLessThanOrEqual(190);
  });

  it('covers articles, pronouns, prepositions, and auxiliaries', () => {
    const articles = ['the', 'an'];
    const pronouns = ['he', 'she', 'it', 'they', 'you', 'we', 'me', 'them', 'this', 'that'];
    const prepositions = ['of', 'in', 'on', 'at', 'by', 'to', 'from', 'with', 'about', 'between'];
    const auxiliaries = [
      'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    ];
    for (const word of [...articles, ...pronouns, ...prepositions, ...auxiliaries]) {
      expect(STOP_WORDS.has(word), `expected stop word: ${word}`).toBe(true);
    }
  });

  it('every entry is a plain lowercase word, matchable by the tokenizer', () => {
    for (const word of STOP_WORDS) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });
});
