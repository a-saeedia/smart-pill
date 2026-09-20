import { describe, it, expect } from 'vitest';
import { decideEscalation, clampThreshold, escalationScore } from '../escalate.js';

describe('decideEscalation', () => {
  it('short prompt with no hard signals -> escalate=false, score near 0', () => {
    const result = decideEscalation('hi');
    expect(result.escalate).toBe(false);
    expect(result.score).toBeLessThan(5);
  });

  it('prompt with 2+ hard-task hints -> escalate=true', () => {
    const prompt = 'debug the memory leak and refactor the auth module'.repeat(30);
    const result = decideEscalation(prompt);
    expect(result.escalate).toBe(true);
  });

  it('prompt with failure wording -> score >= 15', () => {
    const result = decideEscalation('this fix fails');
    expect(result.score).toBe(5);
  });

  it('force:true -> escalate=true regardless of score', () => {
    const result = decideEscalation('hi', { force: true });
    expect(result.escalate).toBe(true);
  });

  it('threshold 0 -> escalate=true for any non-empty prompt', () => {
    const result = decideEscalation('hello', { threshold: 0 });
    expect(result.escalate).toBe(true);
  });

  it('threshold 100 -> escalate=false for low-score prompts', () => {
    const result = decideEscalation('hello', { threshold: 100 });
    expect(result.escalate).toBe(false);
  });
});

describe('clampThreshold', () => {
  it('clampThreshold(50) -> 50', () => {
    expect(clampThreshold(50)).toBe(50);
  });

  it('clampThreshold(NaN) -> 40 (default fallback)', () => {
    expect(clampThreshold(NaN)).toBe(40);
  });

  it('clampThreshold(-10) -> 0', () => {
    expect(clampThreshold(-10)).toBe(0);
  });

  it('clampThreshold(150) -> 100', () => {
    expect(clampThreshold(150)).toBe(100);
  });

  it('clampThreshold("75") -> 75', () => {
    expect(clampThreshold('75')).toBe(75);
  });
});

describe('escalationScore', () => {
  it('empty string -> score 0, reasons includes "no escalation signals"', () => {
    const result = escalationScore('');
    expect(result.score).toBe(0);
    expect(result.reasons.some((r) => r.includes('no escalation signals'))).toBe(true);
  });

  it('long prompt (>=2000 chars) -> score += 25', () => {
    const longPrompt = 'a'.repeat(2000);
    const result = escalationScore(longPrompt);
    expect(result.score).toBe(25);
  });

  it('multi-line (>=10 newlines) -> score += 15', () => {
    const lines = 'line\n'.repeat(10) + 'end';
    const result = escalationScore(lines);
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it('2 hard hints -> score += 30', () => {
    const prompt = 'debug the memory leak and refactor the auth module';
    const result = escalationScore(prompt);
    expect(result.reasons.some((r) => r.includes('hard-task signals'))).toBe(true);
    expect(result.score).toBe(20);
  });
});
