import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../tokens.js';

describe('estimateTokens', () => {
  it('estimateTokens("") -> small number', () => {
    const result = estimateTokens('');
    expect(result).toBeLessThanOrEqual(1);
  });

  it('estimateTokens("hello world") -> reasonable number', () => {
    const result = estimateTokens('hello world');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });

  it('estimateTokens("a".repeat(100)) -> ~25 (ASCII/4 heuristic)', () => {
    const result = estimateTokens('a'.repeat(100));
    expect(result).toBe(Math.ceil(100 / 4));
  });
});
