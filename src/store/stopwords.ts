/**
 * Bundled English stop-word list (~175 words: articles, pronouns,
 * prepositions, auxiliaries, common conjunctions/adverbs). Shared by
 * tokenize.ts so indexing and querying can never disagree on what a word is.
 * Spec: user-stories/typescript_mail_store.md.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // Articles
  'a', 'an', 'the',
  // Personal pronouns and possessives
  'i', 'me', 'my', 'mine', 'myself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'they', 'them', 'their', 'theirs', 'themselves',
  // Relative/interrogative pronouns and demonstratives
  'who', 'whom', 'whose', 'which', 'what',
  'this', 'that', 'these', 'those',
  // Prepositions
  'of', 'in', 'on', 'at', 'by', 'to', 'from', 'with', 'without',
  'about', 'against', 'between', 'among', 'into', 'onto', 'through',
  'during', 'before', 'after', 'above', 'below', 'under', 'over',
  'up', 'down', 'out', 'off', 'across', 'behind', 'beyond', 'within',
  'along', 'around', 'near', 'upon', 'toward', 'towards', 'until',
  'since', 'via', 'per', 'despite', 'except', 'inside', 'outside',
  // Auxiliaries and copulas
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might',
  'must', 'ought',
  // Conjunctions
  'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'if', 'because',
  'although', 'though', 'while', 'whereas', 'unless', 'whether', 'as',
  // Determiners and quantifiers
  'all', 'any', 'both', 'each', 'every', 'few', 'many', 'much', 'more',
  'most', 'other', 'some', 'such', 'own', 'same', 'no', 'none', 'either',
  'neither', 'another',
  // Common adverbs and particles
  'not', 'only', 'very', 'too', 'also', 'just', 'than', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'again', 'further',
  'ever', 'never', 'now', 'always', 'often', 'still', 'even', 'else',
]);
