# smart-pill — ideas pack

## Core thesis
Free opencode models (fable-class small models) don't waste tokens on *output* —
they waste them on *context*: they re-read the world each turn. Give them a
pill: distilled context, persistent memory, plan-first discipline, self-review,
and a token ledger. The result is small-model output at ~big-model quality, at
~zero cost. Claude users who watch the ledger see exactly how many tokens they
did NOT waste. That is the demo.

## The six ingredients
1. **pill_digest** — squeeze a repo/session into a small working set before each
   task. Offline extractive digest (head + fresh tail scoring); optional LLM
   digest when a key exists.
2. **pill_remember / pill_recall** — a tiny JSON KV store (`SMART_PILL_HOME`,
   default `~/.smart-pill`). Facts learned once are never re-absorbed.
3. **pill_plan** — enforce a cheap plan before coding: Understand → Locate →
   Implement → Verify → Harden. Plans keep small models on rails.
4. **pill_review** — deterministic smell scan before claiming done: hardcoded
   secrets, eval/exec, TODO/FIXME, base64 blobs, node_modules debris.
5. **pill_ledger** — estimate token savings from digesting + remembering;
   rendered as "tokens you didn't waste".
6. **pill_route** — escalate the hard 10% of turns to a big model via
   OpenRouter (fetch-based OpenAI-compatible client). Graceful advisory mode
   when no key is configured.

## Recipe (one turn)
```
pill_recall(topic)        → what we already know
pill_digest(cwd)          → compressed context
pill_plan(goal)           → the rails
[small model does the work]
pill_review(changes)      → self-check
pill_ledger()             → tokens saved
pill_remember(facts)      → persist for next time
```

## Hook for Claude users
Claude (and anyone on paid models) can run the same MCP server. The ledger
turns invisible savings into a number: "this session cost X tokens; the pill
compressed away Y of them." Saving feels better than spending.

## Honest limits
- Token estimates are heuristics (ASCII/4 + non-ASCII), not billing-grade.
- Extractive digest is approximate; LLM digest needs a key.
- A pill is a discipline layer — it cannot beat a model's real ceiling, it
  stops the model from wasting its own ceiling on noise.