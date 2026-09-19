/**
 * Token estimation heuristics. Never billing-grade — an honest budget meter.
 * ASCII ~4 chars/token, non-ASCII (Persian/CJK...) ~1 char/token.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let nonAscii = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else nonAscii++;
  }
  return Math.ceil(ascii / 4) + nonAscii;
}