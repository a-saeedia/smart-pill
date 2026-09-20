import { describe, it, expect } from 'vitest';
import { reviewText } from '../review.js';

describe('reviewText', () => {
  it('Empty content -> []', () => {
    const findings = reviewText('file.ts', '');
    expect(findings).toEqual([]);
  });

  it('Content with password = "secret123" -> finding with severity "high"', () => {
    const findings = reviewText('file.ts', "password = 'secret123'");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('high');
  });

  it('Content with eval(x) -> finding with severity "medium"', () => {
    const findings = reviewText('file.ts', 'eval(x)');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('medium');
  });

  it('Content with TODO: fix this -> finding with severity "low"', () => {
    const findings = reviewText('file.ts', 'TODO: fix this');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('low');
  });

  it('Content with long base64 string -> finding with severity "medium"', () => {
    const base64 = 'a'.repeat(60);
    const findings = reviewText('file.ts', base64);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('medium');
  });

  it('Content with node_modules -> finding with severity "low"', () => {
    const findings = reviewText('file.ts', 'import x from "node_modules/foo"');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('low');
  });

  it('Content with no issues -> []', () => {
    const findings = reviewText('file.ts', 'const x = 1;\nconsole.log(x);');
    expect(findings).toEqual([]);
  });
});
