import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { KVStore } from "./store.js";
import { extractiveDigest } from "./digest.js";
import { searchMemory } from "./search.js";
import { buildPlan } from "./plan.js";
import { reviewText } from "./review.js";
import { Ledger } from "./ledger.js";
import { chatCompletion } from "./route.js";
import { estimateTokens } from "./tokens.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.homeDir, { recursive: true });
  const store = new KVStore(config.storeFile);
  const ledger = new Ledger(new KVStore(config.ledgerFile));

  const server = new McpServer({
    name: "smart-pill",
    version: "0.3.0",
  });

  server.registerTool(
    "pill_digest",
    {
      title: "Digest context",
      description:
        "Compress a blob of text (repo summary, session log, file dump) into a small working set before a task. Offline extractive digest; when task=summarize AND OPENROUTER_API_KEY is set, uses the digest model for a free-form summary. Returns compression stats to feed pill_ledger.",
      inputSchema: {
        text: z.string().min(1).describe("Raw context to compress"),
        maxChars: z
          .number()
          .int()
          .positive()
          .max(20000)
          .optional()
          .describe("Output budget (default 3000)"),
        task: z
          .enum(["context", "summarize"])
          .optional()
          .describe("context=extractive working set; summarize=LLM summary when a key is present"),
        focus: z
          .string()
          .optional()
          .describe("Bias the extractive digest toward lines containing this term (e.g. the task about to start)"),
      },
    },
    async ({ text, maxChars, task, focus }) => {
      const max = maxChars ?? 3000;
      if (task === "summarize" && config.openRouterKey) {
        const res = await chatCompletion(
          [
            {
              role: "system",
              content:
                "You are a context compressor. Return a tight, information-dense summary preserving facts, names, paths, and decisions. Stay under the user's budget.",
            },
            { role: "user", content: text.slice(0, 60_000) },
          ],
          { model: config.digestModel, apiKey: config.openRouterKey, maxTokens: Math.min(max, 4096) },
        );
        if (res.ok) {
          await ledger.add({
            tool: "pill_digest",
            inputTokens: estimateTokens(text),
            savedTokens: Math.max(0, estimateTokens(text) - estimateTokens(res.content)),
            note: `LLM digest via ${res.model}`,
          });
          return {
            content: [
              { type: "text" as const, text: `SUMMARY (${res.model})\n\n${res.content}` },
            ],
          };
        }
        // fall through to offline digest on failure
      }
      const d = extractiveDigest(text, max, focus);
      await ledger.add({
        tool: "pill_digest",
        inputTokens: d.estInputTokens,
        savedTokens: Math.max(0, d.estInputTokens - d.estOutputTokens),
        note: `extractive ${d.inputChars}\u2192${d.outputChars} chars`,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `${d.text}\n\n[CMPR ${d.inputChars}\u2192${d.outputChars} chars; est ${d.estInputTokens}\u2192${d.estOutputTokens} tokens]`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "pill_remember",
    {
      title: "Persist a fact",
      description:
        "Store facts in the smart-pill memory KV store. Facts persisted here are recalled by pill_recall in later sessions, so the model never re-absorbs known context.",
      inputSchema: {
        entries: z
          .array(z.object({ key: z.string().min(1), value: z.string().min(1) }))
          .min(1)
          .describe("key/value facts to persist"),
      },
    },
    async ({ entries }) => {
      const MAX_KEY = 200;
      const MAX_VALUE = 8000;
      const MAX_ENTRIES = 500;
      const sizeOf = (v: unknown): number =>
        typeof v === "string" ? v.length : JSON.stringify(v).length;

      const stored = entries.map((e) => ({
        key: e.key.slice(0, MAX_KEY),
        value: e.value.slice(0, MAX_VALUE),
      }));
      const truncatedKeys = entries.filter((e, i) => stored[i].key !== e.key).length;
      const truncatedValues = entries.filter((e, i) => stored[i].value !== e.value).length;

      let evicted = 0;
      await store.update((d) => {
        for (const s of stored) d[s.key] = s.value;
        const keys = Object.keys(d);
        if (keys.length > MAX_ENTRIES) {
          keys.sort((a, b) => sizeOf(d[a]) - sizeOf(d[b]));
          let n = keys.length;
          for (const k of keys) {
            if (n <= MAX_ENTRIES) break;
            delete d[k];
            n--;
            evicted++;
          }
        }
        return d;
      });

      const avoided = stored.reduce((n, s) => n + estimateTokens(s.value), 0);
      await ledger.add({
        tool: "pill_remember",
        inputTokens: 0,
        savedTokens: avoided,
        note: `persisted ${stored.length} fact(s) — future recalls avoid re-reading ~${avoided} tokens`,
      });

      const warnings: string[] = [];
      if (truncatedKeys > 0) warnings.push(`${truncatedKeys} key(s) truncated to ${MAX_KEY} chars`);
      if (truncatedValues > 0) warnings.push(`${truncatedValues} value(s) truncated to ${MAX_VALUE} chars`);
      if (evicted > 0) warnings.push(`${evicted} entry(s) evicted at ${MAX_ENTRIES} cap`);

      const keys = stored.map((s) => s.key).join(", ").slice(0, 500);
      const warnLine = warnings.length > 0 ? `\nNote: ${warnings.join("; ")}.` : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `Remembered ${stored.length} fact(s): ${keys}\nStore: ${config.storeFile}${warnLine}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "pill_recall",
    {
      title: "Recall a fact",
      description:
        "Search the smart-pill memory KV store and return ranked hits for the topic: exact key match > key prefix > key substring > value contains. Query before asking the model to re-read anything.",
      inputSchema: {
        topic: z.string().min(1).describe("Topic to match against fact keys and values"),
        limit: z.number().int().positive().max(50).optional().describe("Max hits (default 10)"),
      },
    },
    async ({ topic, limit }) => {
      const data = await store.read();
      const hits = searchMemory(data, topic, limit ?? 10);
      const text =
        hits.length === 0
          ? `No facts match "${topic}".`
          : [`${hits.length} hit(s) for "${topic}":`, ...hits.map((h) => `- ${h.key}: ${h.value}`)].join(
              "\n",
            );
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "pill_plan",
    {
      title: "Build a plan",
      description:
        "Emit a cheap 5-phase plan (Understand → Locate → Implement → Verify → Harden) for the current goal. Small models stay on rails; never skip VERIFY.",
      inputSchema: {
        goal: z.string().min(1).describe("The task to plan"),
        context: z.string().optional().describe("Optional context to include"),
      },
    },
    async ({ goal, context }) => {
      const text = buildPlan(goal, context);
      await ledger.add({
        tool: "pill_plan",
        inputTokens: estimateTokens(goal + (context ?? "")),
        savedTokens: 0,
        note: "plan enforced",
      });
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "pill_review",
    {
      title: "Review for smells",
      description:
        "Deterministic smell scan of changed files: hardcoded secrets, eval/exec, TODO/FIXME, base64 blobs, node_modules references. Run before claiming done.",
      inputSchema: {
        files: z
          .array(z.object({ path: z.string().min(1), content: z.string() }))
          .min(1)
          .describe("Files to scan (path + full content)"),
      },
    },
    async ({ files }) => {
      const findings = files.flatMap((f) => reviewText(f.path, f.content));
      await ledger.add({
        tool: "pill_review",
        inputTokens: files.reduce((n, f) => n + estimateTokens(f.content), 0),
        savedTokens: 0,
        note: `scanned ${files.length} file(s), ${findings.length} finding(s)`,
      });
      const text =
        findings.length === 0
          ? "No smells found."
          : findings
              .map(
                (f) =>
                  `[${f.severity.toUpperCase()}] ${f.path}:${f.line} — ${f.note}\n    ${f.code}`,
              )
              .join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "pill_ledger",
    {
      title: "Token savings report",
      description:
        "Return the persistent ledger of token savings — the 'tokens you didn't waste' report. Show this to users to make invisible savings visible.",
      inputSchema: {},
    },
    async () => {
      const { events, totalSavedTokens } = await ledger.report();
      const text =
        events.length === 0
          ? "No pill activity yet."
          : [
              `TOTAL EST. TOKENS SAVED: ${totalSavedTokens}`,
              "",
              ...events
                .slice(-15)
                .reverse()
                .map(
                  (e) =>
                    `- ${e.ts.slice(0, 19).replace("T", " ")} ${e.tool} saved~${e.savedTokens} (in ${e.inputTokens}) — ${e.note}`,
                ),
            ].join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "pill_context",
    {
      title: "Session briefing",
      description:
        "Assemble a whole-session briefing before starting work — persistent memory, token ledger, routing status, and the discipline rails — so the model starts a session already thinking like a smart one.",
      inputSchema: {
        topic: z.string().optional().describe("Optional topic to bias recalled memory toward"),
        limit: z.number().int().positive().max(50).optional().describe("Max memory hits (default 8)"),
      },
    },
    async ({ topic, limit }) => {
      const data = await store.read();
      const hits = searchMemory(data, topic ?? "", limit ?? 8, 600);
      const { events, totalSavedTokens } = await ledger.report();
      const byTool = new Map<string, number>();
      for (const e of events) byTool.set(e.tool, (byTool.get(e.tool) ?? 0) + 1);
      const topTools = [...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const routeLine = config.openRouterKey
        ? `ARMED — escalations via ${config.routeModel}`
        : "OFFLINE ADVISORY — no OPENROUTER_API_KEY (pill_route returns self-service prompts)";
      const text = [
        "<<<SMART-PILL BRIEFING>>>",
        ...(topic ? [`topic: ${topic}`] : []),
        "",
        `<<<MEMORY (${hits.length} hit(s))>>>`,
        ...(hits.length === 0 ? ["(empty)"] : hits.map((h) => `- ${h.key}: ${h.value}`)),
        "",
        "<<<LEDGER>>>",
        `TOTAL EST. TOKENS SAVED: ${totalSavedTokens}`,
        ...(topTools.length === 0
          ? ["(no activity yet)"]
          : topTools.map(([tool, n]) => `- ${tool}: ${n} use(s)`)),
        "",
        "<<<ROUTING>>>",
        routeLine,
        "",
        "<<<DISCIPLINE>>>",
        "1) plan first (pill_plan) — never touch code without a VERIFY step",
        "2) digest before you re-read (pill_digest) — don't re-absorb known context",
        "3) scan before done (pill_review) — smells, secrets, drift",
        "4) persist what you learned (pill_remember) — pay the memory forward",
        "5) escalate the hard 10% (pill_route) — don't burn turns on your ceiling",
        "",
        `[home ${config.homeDir}]`,
      ].join("\n");
      await ledger.add({
        tool: "pill_context",
        inputTokens: estimateTokens(topic ?? ""),
        savedTokens: 0,
        note: "briefing assembled",
      });
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "pill_route",
    {
      title: "Escalate to a big model",
      description:
        "Escalate the hard 10% of turns to a big model via OpenRouter (SMART_PILL_ROUTE_MODEL, default anthropic/claude-3.7-sonnet). Without OPENROUTER_API_KEY it returns a self-service advisory instead of failing.",
      inputSchema: {
        prompt: z.string().min(1).describe("The hard question or task to escalate"),
        system: z.string().optional().describe("Optional system prompt for the big model"),
      },
    },
    async ({ prompt, system }) => {
      if (!config.openRouterKey) {
        const advice = `No OPENROUTER_API_KEY configured — smart-pill cannot escalate to a big model.
Self-service prompt for the free model:
---
${prompt}
---
Work it yourself: write the plan (pill_plan), implement the smallest change, verify with a real command, then scan with pill_review.`;
        await ledger.add({
          tool: "pill_route",
          inputTokens: estimateTokens(prompt),
          savedTokens: 0,
          note: "advisory (no key)",
        });
        return { content: [{ type: "text" as const, text: advice }] };
      }
      const res = await chatCompletion(
        [
          ...(system
            ? [{ role: "system" as const, content: system.slice(0, 20_000) }]
            : [{ role: "system" as const, content: "You are a senior staff engineer. Answer directly, terse, with exact commands and real verification." }]),
          { role: "user" as const, content: prompt.slice(0, 60_000) },
        ],
        { model: config.routeModel, apiKey: config.openRouterKey },
      );
      if (!res.ok) {
        await ledger.add({
          tool: "pill_route",
          inputTokens: estimateTokens(prompt),
          savedTokens: 0,
          note: `escalation failed: ${res.error.slice(0, 120)}`,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Escalation failed: ${res.error}\nFallback plan:\n${buildPlan(prompt)}`,
            },
          ],
        };
      }
      await ledger.add({
        tool: "pill_route",
        inputTokens: estimateTokens(prompt),
        savedTokens: 0,
        note: `escalated to ${res.model}`,
      });
      return { content: [{ type: "text" as const, text: res.content }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("smart-pill fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});