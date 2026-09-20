# smart-pill

> **Give free opencode models a pill — small-model output at ~big-model quality, ~zero cost.**
> Claude users see exactly how many tokens they didn't waste.

[![CI](https://github.com/smart-pill/smart-pill/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/smart-pill/smart-pill/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/smart-pill.svg)](https://www.npmjs.com/package/smart-pill)
[![Node.js 22](https://img.shields.io/badge/Node-22-brightgreen.svg)](https://nodejs.org/)
[![Coverage](https://codecov.io/gh/smart-pill/smart-pill/branch/main/graph/badge.svg)](https://codecov.io/gh/smart-pill/smart-pill)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)](CONTRIBUTING.md)

---

Free models don't waste tokens on *output*. They waste them on *context*: every turn they re-read the world. **smart-pill** is an MCP server that fixes that with eight cheap, offline-first tools:

| Tool | What it does |
|---|---|
| `pill_digest` | Compresses a repo/session dump into a small working set (extractive; optional LLM summary when `OPENROUTER_API_KEY` is set). |
| `pill_remember` / `pill_recall` | Tiny JSON KV memory (`SMART_PILL_HOME`, default `~/.smart-pill`) with offline semantic recall (all-MiniLM-L6-v2). Facts learned once are never re-absorbed. |
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
npm run model:fetch   # one-time offline embedding model cache
npm run smoke
npm test              # vitest suite (38 tests)
```

Wire into `opencode.jsonc`:

```jsonc
{
  "mcp": {
    "smart-pill": {
      "type": "local",
      "command": ["node", "C:\\\\path\\\\to\\\\smart-pill\\\\dist\\\\index.js"],
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
| `SMART_PILL_ROUTE_THRESHOLD` | `40` | Escalation score threshold (0–100) |
| `OPENROUTER_API_KEY` | — | Enables `pill_route` + LLM digests |

## Hardening (0.5.0)

- **Concurrency-safe writes**: memory store serializes read-modify-write through a per-file promise queue, so parallel `pill_remember` calls never lose a fact.
- **Bounded memory**: keys capped at 200 chars, values at 8000 (truncated with a warning), store capped at 500 entries (smallest entries evicted, reported).
- **Budget-compliant digest**: `maxChars` is now a hard upper bound on output, even for tiny budgets.
- **Escalation heuristic**: `pill_route` scores every prompt offline before spending a big-model call. Skips if score < threshold (saves tokens). Pass `force:true` to override.
- **38-unit tests**, CI on every push/PR, coverage tracking.

## How to promote

If you want to promote this project, here's what works:

1. **GitHub Stars** — Star the repo, it signals adoption to the opencode community.
2. **Open in DevContainers** — Add a `.devcontainer/devcontainer.json` so anyone can clone and run instantly.
3. **Publish to npm** — `npm publish --access public` makes it discoverable.
4. **Write a blog post** — The token-saving angle ("how many tokens didn't you waste?") is a compelling hook for AI-dev Twitter/X, Dev.to, and Hashnode.
5. **Demonstrate the ledger** — Screenshots of `pill_ledger()` showing token savings are the single best conversion tool. The number sells itself.
6. **Opencode marketplace** — Submit the MCP server to the opencode ecosystem.
7. **Contributing** — `CONTRIBUTING.md` is ready; good first issues are tagged.

## Honest limits

- Token figures are heuristics (ASCII/4 + non-ASCII), not billing-grade.
- Extractive digest is approximate; LLM digest needs a key.
- A pill is a discipline layer — it stops a model wasting its ceiling on noise, it cannot raise the ceiling itself.

---

<p align="center">
  <sub>Built for developers who watch their token budget like a hawk.</sub>
</p>
