/**
 * escalate.ts — offline escalation heuristic for pill_route.
 *
 * Decides whether a turn is worth spending a big-model call on. Pure and
 * deterministic: no network, no clock, no randomness — cheap to run and easy
 * to golden-test. The heuristic is deliberately conservative: `escalate:false`
 * is a token *saving*, never a refusal, and the caller can always override
 * with `force:true`.
 */

export const DEFAULT_ROUTE_THRESHOLD = 40;

export interface EscalationVerdict {
  score: number; // 0..100
  escalate: boolean;
  threshold: number;
  reasons: string[];
}

/** Clamp an env/option value into a sane 0..100 threshold (NaN -> fallback). */
export function clampThreshold(value: unknown, fallback = DEFAULT_ROUTE_THRESHOLD): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const HARD_HINTS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "design/architecture", re: /\b(design|architect(?:ure)?|trade-?offs?|schema|api contract)\b/i },
  { label: "debug/trace", re: /\b(debug|trace|diagnos\w*|root cause|repro(?:duce)?|stack ?trace|regression)\b/i },
  { label: "concurrency/systems", re: /\b(concurren(?:cy|t)|deadlock|race condition|distributed|throughput|latency|backpressure)\b/i },
  { label: "security/crypto", re: /\b(security|vulnerab\w*|crypto|auth(?:entication|orization)?|owasp|exploit|injection|xss|csrf|secret)\b/i },
  { label: "infra/deploy", re: /\b(docker|kubernetes|k8s|terraform|ci\/?cd|pipeline|infra(?:structure)?|deploy\w*|migration)\b/i },
  { label: "refactor/optimize", re: /\b(refactor\w*|optimi[sz]\w*|performance|profil(?:e|ing)|benchmark\w*|scal(?:e|ing|ability))\b/i },
];

const FAILURE_HINTS = /\b(fix|broken|fails?|failing|error|crash(?:es|ed)?|segfault|cannot|can't|unable|throws?|exception)\b/i;

/** Score a prompt's "hardness" from offline surface signals only. */
export function escalationScore(prompt: string): { score: number; reasons: string[] } {
  const text = typeof prompt === "string" ? prompt : "";
  const chars = text.length;
  const newlines = (text.match(/\n/g) ?? []).length;
  const reasons: string[] = [];
  let score = 0;

  if (chars >= 2000) {
    score += 25;
    reasons.push(`long prompt (${chars} chars) +25`);
  } else if (chars >= 600) {
    score += 15;
    reasons.push(`substantial prompt (${chars} chars) +15`);
  } else if (chars > 0 && chars <= 120) {
    score -= 10;
    reasons.push(`short prompt (${chars} chars) -10`);
  }

  if (newlines >= 10) {
    score += 15;
    reasons.push(`multi-line (${newlines} newlines) +15`);
  }

  const hits = HARD_HINTS.filter((h) => h.re.test(text));
  if (hits.length >= 2) {
    score += 30;
    reasons.push(`hard-task signals x${hits.length} (${hits.map((h) => h.label).join(", ")}) +30`);
  } else if (hits.length === 1) {
    score += 15;
    reasons.push(`hard-task signal (${hits[0].label}) +15`);
  }

  if (FAILURE_HINTS.test(text)) {
    score += 15;
    reasons.push("failure/debug wording +15");
  }

  score = Math.max(0, Math.min(100, score));
  if (reasons.length === 0) reasons.push("no escalation signals (plain turn)");
  return { score, reasons };
}

/** score >= threshold, or force. Threshold defaults to 40 (clamped 0..100). */
export function decideEscalation(
  prompt: string,
  opts: { threshold?: number; force?: boolean } = {},
): EscalationVerdict {
  const threshold = clampThreshold(opts.threshold);
  const { score, reasons } = escalationScore(prompt);
  if (opts.force) {
    return { score, escalate: true, threshold, reasons: ["forced by caller", ...reasons] };
  }
  return { score, escalate: score >= threshold, threshold, reasons };
}
