export interface ReviewFinding {
  path: string;
  line: number;
  code: string;
  severity: 'high' | 'medium' | 'low';
  note: string;
}

interface Rule {
  severity: ReviewFinding['severity'];
  pattern: RegExp;
  note: string;
}

const RULES: Rule[] = [
  {
    severity: 'high',
    pattern: /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    note: 'Possible hardcoded secret',
  },
  { severity: 'medium', pattern: /\beval\s*\(/, note: 'eval() — code injection risk' },
  { severity: 'medium', pattern: /\bexec\s*\(/, note: 'exec() — command injection risk' },
  { severity: 'low', pattern: /\b(TODO|FIXME|HACK)\b/, note: 'Unfinished marker left in code' },
  {
    severity: 'medium',
    pattern: /(?:[A-Za-z0-9+/]{60,}={0,2})/,
    note: 'Suspicious base64 blob',
  },
  { severity: 'low', pattern: /node_modules/, note: 'node_modules path referenced in code' },
];

export function reviewText(path: string, content: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({
          path,
          line: i + 1,
          code: line.trim().slice(0, 140),
          severity: rule.severity,
          note: rule.note,
        });
      }
    }
  }
  return findings;
}
