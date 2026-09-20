/**
 * Ranked, offline memory search: exact key > key prefix > key substring >
 * value contains > semantic embedding similarity (offline all-MiniLM-L6-v2,
 * see embed.ts). The semantic tier catches paraphrases that lexical matching
 * misses. It runs only when no exact key match exists (an exact match beats
 * every paraphrase anyway) and the lexical miss pool is small enough to embed
 * cheaply.
 */

import {
  embedTexts,
  semanticScore,
  cosine,
  EMBED_MAX_CHARS,
  EMBED_MAX_CANDIDATES,
} from './embed.js';

export interface MemoryHit {
  key: string;
  value: string;
  score: number;
}

export async function searchMemory(
  data: Record<string, unknown>,
  topic: string,
  limit = 10,
  maxValueChars = 400,
  maxKeyChars = 200,
): Promise<MemoryHit[]> {
  const t = topic.trim().toLowerCase();
  const out: MemoryHit[] = [];
  const candidates: { key: string; value: string }[] = [];
  let bestLex = 0;

  for (const [key, raw] of Object.entries(data)) {
    const value = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const k = key.toLowerCase();
    const v = value.toLowerCase();
    // Defense-in-depth: write-side caps exist (pill_remember: key 200 / value 8000);
    // slicing keys here too keeps every recall output bounded even if a store was
    // written by an older version or edited by hand.
    const shownKey = key.slice(0, maxKeyChars);
    const shownValue = value.slice(0, maxValueChars);

    if (t) {
      let score = 0;
      if (k === t) score = 100;
      else if (k.startsWith(t)) score = 50;
      else if (k.includes(t)) score = 30;
      else if (v.includes(t)) score = 10;
      if (score > 0) {
        if (score > bestLex) bestLex = score;
        out.push({ key: shownKey, value: shownValue, score });
      } else {
        // No lexical signal at all — a potential paraphrase for the semantic tier.
        candidates.push({ key: shownKey, value: shownValue });
      }
    } else {
      out.push({ key: shownKey, value: shownValue, score: 0 });
    }
  }

  // Semantic tier: rescues lexical misses only. An exact match (bestLex=100)
  // already caps recall, an empty topic needs no ranking, and an oversized
  // candidate pool is not worth the embedding latency.
  if (t && bestLex < 100 && candidates.length > 0 && candidates.length <= EMBED_MAX_CANDIDATES) {
    const texts = [t, ...candidates.map((c) => c.value.slice(0, EMBED_MAX_CHARS))];
    const embedded = await embedTexts(texts);
    if (embedded && embedded.length === texts.length) {
      const queryVec = embedded[0].vector;
      for (let i = 0; i < candidates.length; i++) {
        const sim = cosine(queryVec, embedded[i + 1].vector);
        const score = semanticScore(sim);
        if (score > 0) {
          out.push({ key: candidates[i].key, value: candidates[i].value, score });
        }
      }
    }
  }

  out.sort((a, b) => b.score - a.score); // stable in V8: ties keep insertion order
  return out.slice(0, limit);
}
