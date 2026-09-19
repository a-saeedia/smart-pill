/**
 * bench-semantic: does the semantic tier actually make ME (the model using
 * smart-pill) smarter? Seed a store with facts from real sessions, then fire
 * paraphrased queries that substring matching CANNOT answer (no shared
 * character run). Metric: docs that lexical-only misses but semantic catches,
 * and mean rank of the true hit.
 *
 * Pure Node, no MCP round-trip: imports the compiled search code. Requires the
 * embedding model cached — run `npm run model:fetch` once before this.
 */

import { searchMemory } from "../dist/search.js";

// Facts written to the store during real sessions (value strings = what the
// model actually persisted / would persist).
const FACTS = [
  ["memory vault", "Obsidian vault at C:\\Users\\User\\.config\\opencode\\vault; INDEX.md holds project notes"],
  ["smart-pill repo", "repo at C:\\Users\\user\\Desktop\\system admin\\smart-pill; push to github.com/a-saeedia/smart-pill (private)"],
  ["git quirks", "git.exe NOT on PATH; use PowerShell call operator with C:\\Program Files\\Git\\cmd\\git.exe; stderr red is normal on success"],
  ["node toolchain", "node v22 at C:\\Users\\User\\tools\\node\\node.exe; npm at C:\\Users\\User\\tools\\node\\npm.cmd"],
  ["opencode ui", "theme jarvis-arc cyan and gold on dark void; cockpit port 4096; TUI attention sounds on"],
  ["tehran market", "TSE trading in Rial, Sat-Wed 09:00-12:30 Asia/Tehran; order book 5 levels via bource MCP"],
  ["telegram funnel", "funnel bot DMs registered users via alchemist-bot; channel @cyberalchemistt; content store newest-tool + catalog"],
  ["rag strategy", "substring recall misses paraphrases; offline all-MiniLM-L6-v2 embeddings catch them (npm run model:fetch bootstraps the model)"],
  ["premiere", "prpr MCP drives Adobe Premiere over UXP bridge; timeline_append timeline_ensure; NOT dvr-only tools"],
  ["cloudflare workers", "workers on account Darkestjokepossible@gmail.com; wrangler deploy; R2 for objects, D1 for sql"],
];

// Paraphrased queries: no lexical overlap with the matching fact's key/value.
const QUERIES = [
  ["Where do you keep your notes about projects?", "memory vault"],
  ["point me at the directory tree of the pill project", "smart-pill repo"],
  ["why does my terminal print red on every git command?", "git quirks"],
  ["which runtime binary should I invoke for builds?", "node toolchain"],
  ["restyle the interface to a dark console look", "opencode ui"],
  ["is the iranian exchange open right now?", "tehran market"],
  ["how do we reach the subscribed audience?", "telegram funnel"],
  ["the retrieval layer could do better than exact words", "rag strategy"],
  ["video editing timeline automation server", "premiere"],
  ["edge functions and object storage hosting", "cloudflare workers"],
];

// Lexical-only control = same scorer, semantic tier disabled.
function lexicalOnly(data, topic, limit) {
  const t = topic.trim().toLowerCase();
  const out = [];
  for (const [key, raw] of Object.entries(data)) {
    const value = typeof raw === "string" ? raw : JSON.stringify(raw);
    const k = key.toLowerCase();
    const v = value.toLowerCase();
    let score = 0;
    if (k === t) score = 100;
    else if (k.startsWith(t)) score = 50;
    else if (k.includes(t)) score = 30;
    else if (v.includes(t)) score = 10;
    else continue;
    out.push({ key, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

const data = Object.fromEntries(FACTS);
const LIMIT = 5;

let lexFound = 0;
let semFound = 0;
let semRankSum = 0;

console.log("query -> expected fact");
console.log("-".repeat(70));
for (const [q, expectedKey] of QUERIES) {
  const lex = lexicalOnly(data, q, LIMIT);
  const sem = await searchMemory(data, q, LIMIT);
  const lexHit = lex.find((h) => h.key === expectedKey);
  const semHit = sem.find((h) => h.key === expectedKey);
  const semRank = sem.findIndex((h) => h.key === expectedKey) + 1; // 0 = absent

  if (lexHit) lexFound++;
  if (semHit) {
    semFound++;
    if (semRank > 0) semRankSum += semRank;
  }

  const top = sem.length ? sem[0].key : "(none)";
  const lexMark = lexHit ? "LEX" : "---";
  const semMark = semHit ? `SEM#${semRank}` : "---";
  console.log(`Q: ${q}`);
  console.log(`   expected=${expectedKey}  lex=${lexMark}  sem=${semMark}  top=${top}`);
}

console.log("-".repeat(70));
console.log(`lexical-only found ${lexFound}/${QUERIES.length}`);
console.log(`semantic-blend found ${semFound}/${QUERIES.length} (${semFound - lexFound > 0 ? "+" : ""}${semFound - lexFound})`);
if (semFound > 0) console.log(`mean true-hit rank (sem): ${(semRankSum / semFound).toFixed(2)}`);

// Sanity gate: semantic must catch at least 7/10 paraphrases to be a win.
if (semFound < 7) {
  console.error(`TUNE NEEDED: semantic tier caught ${semFound}/10 — below the 7/10 bar`);
  process.exit(1);
}
console.log("BENCH PASS: semantic tier is a real lift over lexical-only recall");