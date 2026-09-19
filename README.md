# smart-pill

**Give free opencode models a pill — small-model output at ~big-model quality,
~zero cost. Claude users see exactly how many tokens they didn't waste.**

Free models don't waste tokens on *output*. They waste them on *context*: every
turn they re-read the world. smart-pill is an MCP server that fixes that with
six cheap, offline-first tools:

| Tool | What it does |
|---|---|
| `pill_digest` | Compresses a repo/session dump into a small working set (extractive; optional LLM summary when `OPENROUTER_API_KEY` is set). |
| `pill_remember` / `pill_recall` | Tiny JSON KV memory (`SMART_PILL_HOME`, default `~/.smart-pill`). Facts learned once are never re-absorbed. |
| `pill_plan` | Forces a 5-phase plan before code: Understand → Locate → Implement → Verify → Harden. |
| `pill_review` | Deterministic smell scan: hardcoded secrets, `eval`/`exec`, TODO/FIXME, base64 blobs, `node_modules` references. |
| `pill_ledger` | The number that sells the story: **tokens saved** so far this session/project. |
| `pill_route` | Escalates the hard 10% to a big model via OpenRouter (default `anthropic/claude-3.7-sonnet`). Advisory mode when no key. |

## One-turn recipe

```
pill_recall(topic)   → what we already know
pill_digest(cwd)     → compressed context
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

## Honest limits

- Token figures are heuristics (ASCII/4 + non-ASCII), not billing-grade.
- Extractive digest is approximate; LLM digest needs a key.
- A pill is a discipline layer — it stops a model wasting its ceiling on
  noise, it cannot raise the ceiling itself.