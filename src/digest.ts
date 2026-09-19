import { estimateTokens } from "./tokens.js";

const TAIL_BUDGET = 600; // always keep the freshest context
const OVERHEAD = 120; // markers + separators

/** Simple line scorer: favors headers, imports, decls, smells, secrets. */
function scoreLine(line: string, focus?: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  let score = 0;
  if (
    /^(#|\/\/|\/\*|\*|import |export |function |class |const |let |interface |type |def |async )/.test(trimmed)
  ) {
    score += 2;
  }
  if (/TODO|FIXME|HACK|BUG/.test(trimmed)) score += 2;
  if (/password|secret|api[_-]?key|token|bearer/i.test(trimmed)) score += 3;
  if (focus && trimmed.toLowerCase().includes(focus.toLowerCase())) score += 6;
  score += Math.min(trimmed.length / 200, 2);
  return score;
}

export interface DigestResult {
  text: string;
  inputChars: number;
  outputChars: number;
  estInputTokens: number;
  estOutputTokens: number;
}

/**
 * Offline extractive digest: keep the fresh tail verbatim, keep the
 * highest-scoring head lines within budget, ordered as they appeared.
 * Pass `focus` to bias the head toward lines about that term.
 */
/** Normalized form for dedupe: lowercase, collapse whitespace, strip trailing punctuation. */
function normalizeForDedupe(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?)\]}]+$/g, "");
}

export function extractiveDigest(text: string, maxChars = 3000, focus?: string): DigestResult {
  const inputChars = text.length;
  // Budget compliance: shrink the tail when maxChars is too small to keep the
  // full TAIL_BUDGET, so output never exceeds maxChars (markers included).
  const tailBudget = Math.min(TAIL_BUDGET, Math.max(0, maxChars - OVERHEAD));
  const tail = text.slice(Math.max(0, text.length - tailBudget));
  const headSource = text.slice(0, Math.max(0, text.length - tailBudget));
  const lines = headSource.split("\n");

  const headBudget = Math.max(0, maxChars - tailBudget - OVERHEAD);
  const seen = new Set<string>();
  const candidates = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => {
      const trimmed = line.trim();
      if (!trimmed) return false; // blank
      if (/^[\s\-=_*~.,:;!|#<>()\[\]{}"'`]+$/.test(trimmed)) return false; // separator-only
      const norm = normalizeForDedupe(line);
      if (!norm) return false;
      if (seen.has(norm)) return false; // near-duplicate: keep only the first occurrence
      seen.add(norm);
      return true;
    })
    .map(({ line, i }) => ({ line, i, score: scoreLine(line, focus) }))
    .sort((a, b) => b.score - a.score);

  const chosen = new Set<number>();
  let used = 0;
  for (const c of candidates) {
    if (used + c.line.length + 1 <= headBudget) {
      chosen.add(c.i);
      used += c.line.length + 1;
    }
  }

  const head = lines.filter((_, i) => chosen.has(i)).join("\n");
  const out = `<<<HEAD (scored lines)>>>\n${head}\n<<<TAIL (fresh context)>>>\n${tail}`;

  return {
    text: out,
    inputChars,
    outputChars: out.length,
    estInputTokens: estimateTokens(text),
    estOutputTokens: estimateTokens(out),
  };
}