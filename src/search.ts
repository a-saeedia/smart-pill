/** Ranked, offline memory search: exact key > key prefix > key substring > value contains. */

export interface MemoryHit {
  key: string;
  value: string;
  score: number;
}

export function searchMemory(
  data: Record<string, unknown>,
  topic: string,
  limit = 10,
  maxValueChars = 400,
  maxKeyChars = 200,
): MemoryHit[] {
  const t = topic.trim().toLowerCase();
  const out: MemoryHit[] = [];
  for (const [key, raw] of Object.entries(data)) {
    const value = typeof raw === "string" ? raw : JSON.stringify(raw);
    const k = key.toLowerCase();
    const v = value.toLowerCase();
    // Defense-in-depth: write-side caps exist (pill_remember: key 200 / value 8000);
    // slicing keys here too keeps every recall output bounded even if a store was
    // written by an older version or edited by hand.
    const shownKey = key.slice(0, maxKeyChars);

    let score = 0;
    if (!t) {
      out.push({ key: shownKey, value: value.slice(0, maxValueChars), score: 0 });
      continue;
    }
    if (k === t) score += 100;
    else if (k.startsWith(t)) score += 50;
    else if (k.includes(t)) score += 30;
    else if (v.includes(t)) score += 10;
    else continue;

    out.push({ key: shownKey, value: value.slice(0, maxValueChars), score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}