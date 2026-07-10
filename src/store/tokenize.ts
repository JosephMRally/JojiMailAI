/**
 * The one shared tokenizer (user-stories/typescript_mail_store.md): both
 * indexing (on upsert) and querying (searchText) run through this module, so
 * they can never tokenize differently.
 *
 * Rules: lowercase, split on runs of non-alphanumeric characters, drop
 * tokens shorter than 2 characters and every bundled English stop word.
 */
import { STOP_WORDS } from './stopwords';

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * The distinct token set of a message's searchable text — always
 * `subject` + `bodyPlain` (never HTML), for indexing and verification alike.
 */
export function messageTokens(subject: string, bodyPlain: string | undefined): Set<string> {
  return new Set(tokenize(`${subject} ${bodyPlain ?? ''}`));
}
