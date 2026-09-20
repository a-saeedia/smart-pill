import { describe, it, expect } from 'vitest';
import { buildPlan } from '../plan.js';

describe('buildPlan', () => {
  it('buildPlan("fix bug") includes "GOAL: fix bug"', () => {
    const plan = buildPlan('fix bug');
    expect(plan).toContain('GOAL: fix bug');
  });

  it('buildPlan("fix bug", "context") includes "Context: context"', () => {
    const plan = buildPlan('fix bug', 'context');
    expect(plan).toContain('Context: context');
  });

  it('buildPlan() includes all 5 PHASES', () => {
    const plan = buildPlan('test');
    expect(plan).toContain('UNDERSTAND');
    expect(plan).toContain('LOCATE');
    expect(plan).toContain('IMPLEMENT');
    expect(plan).toContain('VERIFY');
    expect(plan).toContain('HARDEN');
  });

  it('buildPlan() includes "RULE: If any phase fails"', () => {
    const plan = buildPlan('test');
    expect(plan).toContain('RULE: If any phase fails');
  });
});
