/** Cheap rails for small models: enforce a plan before coding. */
export function buildPlan(goal: string, context?: string): string {
  const ctx = context ? `\nContext: ${context}` : '';
  return [
    `GOAL: ${goal}`,
    ctx,
    '',
    'PHASES (follow in order; end each phase with a one-line output):',
    '',
    '1. UNDERSTAND — restate the goal in one sentence. List the constraints you can see (paths, APIs, budgets).',
    '2. LOCATE — list the exact files/functions you will touch. Do not start editing yet.',
    '3. IMPLEMENT — smallest correct change set, following existing conventions. No speculative refactors.',
    '4. VERIFY — run the real command (build/test/lint/smoke) and report its exact output. Never claim success without a run.',
    '5. HARDEN — check: hardcoded secrets? inputs validated? errors surfaced? edge cases handled? If you skipped a step, say why.',
    '',
    'RULE: If any phase fails, stop — name what failed and why before improvising the next phase.',
  ].join('\n');
}
