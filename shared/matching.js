// Skill-profile matchmaking math, shared by the server (which pairs people) and the
// browser (which shows the profile and explains the match). Plain JS + JSDoc so Node
// can run it directly and TypeScript can still type-check the client that imports it.

export const SKILL_LANGUAGES = /** @type {const} */ (['Python', 'JavaScript', 'Java', 'C++', 'TypeScript', 'Go', 'Rust']);
export const SKILL_TOPICS = /** @type {const} */ (['Arrays', 'Trees', 'Graphs', 'DP', 'System Design', 'SQL', 'OS']);
export const SKILL_LEVELS = /** @type {const} */ (['beginner', 'intermediate', 'advanced']);

/** @typedef {typeof SKILL_LANGUAGES[number]} SkillLanguage */
/** @typedef {typeof SKILL_TOPICS[number]} SkillTopic */
/** @typedef {typeof SKILL_LEVELS[number]} SkillLevel */
/** @typedef {{ languages: SkillLanguage[], topics: SkillTopic[], level: SkillLevel }} SkillProfile */

/** Beginner = 0, intermediate = 0.5, advanced = 1. */
export const LEVEL_VALUE = { beginner: 0, intermediate: 0.5, advanced: 1 };

/**
 * Encode a profile as a fixed-length vector:
 *   [ 7 language slots | 7 topic slots | 1 level slot ]
 * Languages and topics are one-hot (1 if selected, 0 if not), so every dimension
 * means the same thing for every user and vectors can be compared directly.
 *
 * @param {SkillProfile} profile
 * @returns {number[]}
 */
export function encodeProfile(profile) {
  return [
    ...SKILL_LANGUAGES.map((l) => (profile.languages.includes(l) ? 1 : 0)),
    ...SKILL_TOPICS.map((t) => (profile.topics.includes(t) ? 1 : 0)),
    LEVEL_VALUE[profile.level] ?? 0,
  ];
}

/**
 * Cosine similarity = (a · b) / (|a| |b|): the cosine of the angle between two vectors.
 * 1 means they point the same way (identical interests), 0 means perpendicular (nothing
 * in common). With non-negative one-hot vectors it never goes below 0. Because it only
 * looks at direction, someone who ticks 10 boxes isn't penalized against someone who
 * ticks 3; what matters is how much of their selections overlap.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} similarity in [0, 1]; 0 if either vector is all zeros
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * @param {SkillProfile} a
 * @param {SkillProfile} b
 */
export function matchScore(a, b) {
  return cosineSimilarity(encodeProfile(a), encodeProfile(b));
}

/**
 * @param {SkillProfile} a
 * @param {SkillProfile} b
 * @returns {{ languages: SkillLanguage[], topics: SkillTopic[] }}
 */
export function sharedSkills(a, b) {
  return {
    languages: a.languages.filter((l) => b.languages.includes(l)),
    topics: a.topics.filter((t) => b.topics.includes(t)),
  };
}

/**
 * Keep only known values and a valid level. Used on anything that came over the network.
 *
 * @param {any} raw
 * @returns {SkillProfile | null}
 */
export function normalizeSkills(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const languages = SKILL_LANGUAGES.filter((l) => Array.isArray(raw.languages) && raw.languages.includes(l));
  const topics = SKILL_TOPICS.filter((t) => Array.isArray(raw.topics) && raw.topics.includes(t));
  const level = SKILL_LEVELS.includes(raw.level) ? raw.level : null;
  if (!level || (languages.length === 0 && topics.length === 0)) return null;
  return { languages, topics, level };
}

/**
 * The minimum score two people need before we pair them. It starts strict and relaxes
 * the longer someone waits, so a good match is preferred but nobody waits forever.
 *
 * @param {number} waitedMs
 */
export function minScoreAfter(waitedMs) {
  const START = 0.75;
  const FLOOR = 0;
  const RELAX_PER_SECOND = 0.025; // reaches 0 after 30s
  return Math.max(FLOOR, START - (waitedMs / 1000) * RELAX_PER_SECOND);
}

/**
 * Greedily pair a waiting pool: score every pair, then take pairs from best to worst,
 * skipping anyone already paired. A pair qualifies once its score beats the threshold
 * of whichever of the two has waited longer.
 *
 * @template {{ id: string, userId: string, joinedAt: number, skills: SkillProfile }} T
 * @param {T[]} pool
 * @param {number} now
 * @returns {Array<{ a: T, b: T, score: number }>}
 */
export function pairUp(pool, now) {
  /** @type {Array<{ a: T, b: T, score: number }>} */
  const candidates = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      if (a.userId === b.userId) continue; // same person in two tabs
      const score = matchScore(a.skills, b.skills);
      const waited = now - Math.min(a.joinedAt, b.joinedAt);
      if (score >= minScoreAfter(waited)) candidates.push({ a, b, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);

  const taken = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (taken.has(c.a.id) || taken.has(c.b.id)) continue;
    taken.add(c.a.id);
    taken.add(c.b.id);
    pairs.push(c);
  }
  return pairs;
}

/** Skill languages the editor can open, mapped to editor language ids. Go and Rust count for matching only. */
const EDITOR_LANGUAGE = { Python: 'python', JavaScript: 'javascript', TypeScript: 'typescript', Java: 'java', 'C++': 'cpp' };

/**
 * Pick the language a matched pair's room should open in: the first language they share
 * that the editor supports, else one either of them knows, else JavaScript.
 *
 * @param {SkillProfile} a
 * @param {SkillProfile} b
 * @returns {'python' | 'javascript' | 'typescript' | 'java' | 'cpp'}
 */
export function suggestEditorLanguage(a, b) {
  const order = [...sharedSkills(a, b).languages, ...a.languages, ...b.languages];
  for (const l of order) {
    const id = EDITOR_LANGUAGE[/** @type {keyof typeof EDITOR_LANGUAGE} */ (l)];
    if (id) return /** @type {any} */ (id);
  }
  return 'javascript';
}
