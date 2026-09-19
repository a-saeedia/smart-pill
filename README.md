# smart-pill

**Give free opencode models a pill — small-model output at ~big-model quality,
~zero cost. Claude users see exactly how many tokens they didn't waste.**

Free models don't waste tokens on *output*. They waste them on *context*: every
turn they re-read the world. smart-pill is an MCP server that fixes that with
eight cheap, offline-first tools:

| Tool | What it does |
|---|---|
| `pill_digest` | Compresses a repo/session dump into a small working set (extractive; optional LLM summary when `OPENROUTER_API_KEY` is set). |
| `pill_remember` / `pill_recall` | Tiny JSON KV memory (`SMART_PILL_HOME`, default `~/.smart-pill`). Facts learned once are never re-absorbed. |
| `pill_plan` | Forces a 5-phase plan before code: Understand → Locate → Implement → Verify → Harden. |
| `pill_review` | Deterministic smell scan: hardcoded secrets, `eval`/`exec`, TODO/FIXME, base64 blobs, `node_modules` references. |
| `pill_ledger` | The number that sells the story: **tokens saved** so far this session/project. |
| `pill_context` | One-call session briefing before you start: ranked memory + token ledger + routing status + the discipline rails. |
| `pill_route` | Escalates the hard 10% to a big model via OpenRouter (default `anthropic/claude-3.7-sonnet`). Advisory mode when no key. |

## One-turn recipe

```
pill_context(topic)  → session briefing (memory + ledger + rails)
pill_digest(cwd, focus: goal) → compressed context biased to the task
pill_plan(goal)      → the rails
[model does the work]
pill_review(changes) → self-check
pill_ledger()        → tokens saved
pill_remember(facts) → persist for next time
```

## Install

```bash
npm install
npm run build
npm run smoke
```

Wire into `opencode.jsonc`:

```jsonc
{
  "mcp": {
    "smart-pill": {
      "type": "local",
      "command": ["node", "C:\\path\\to\\smart-pill\\dist\\index.js"],
      "enabled": true
    }
  }
}
```

## Environment (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `SMART_PILL_HOME` | `~/.smart-pill` | Memory store + ledger location |
| `SMART_PILL_ROUTE_MODEL` | `anthropic/claude-3.7-sonnet` | Escalation model for `pill_route` |
| `SMART_PILL_DIGEST_MODEL` | `anthropic/claude-3.5-haiku` | LLM digest model |
| `OPENROUTER_API_KEY` | — | Enables `pill_route` + LLM digests |

## Hardening (0.3.0)

- **Concurrency-safe writes**: memory store serializes read-modify-write through
  a per-file mutex, so parallel `pill_remember` calls never lose a fact.
- **Bounded memory**: keys capped at 200 chars, values at 8000 (truncated with a
  warning), store capped at 500 entries (smallest entries evicted, reported).
- **Budget-compliant digest**: `maxChars` is now a hard upper bound on output,
  even for tiny budgets; separator-only and near-duplicate lines no longer eat
  the head budget.
- **Behavioral smoke tests**: ranking order (exact > prefix > substring > value),
  caps, digest budget, eviction, ledger totals, and a 10-way concurrent-write
  race are all asserted, not just round-tripped.

## Honest limits

- Token figures are heuristics (ASCII/4 + non-ASCII), not billing-grade.
- Extractive digest is approximate; LLM digest needs a key.
- A pill is a discipline layer — it stops a model wasting its ceiling on
  noise, it cannot raise the ceiling itself.