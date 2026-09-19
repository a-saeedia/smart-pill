import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { KVStore } from "./store.js";
import { extractiveDigest } from "./digest.js";
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
    version: "0.1.0",
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
      },
    },
    async ({ text, maxChars, task }) => {
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
      const d = extractiveDigest(text, max);
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
      const data = await store.read();
      for (const e of entries) data[e.key] = e.value;
      await store.write(data);
      const avoided = entries.reduce((n, e) => n + estimateTokens(e.value), 0);
      await ledger.add({
        tool: "pill_remember",
        inputTokens: 0,
        savedTokens: avoided,
        note: `persisted ${entries.length} fact(s) — future recalls avoid re-reading ~${avoided} tokens`,
      });
      const keys = entries.map((e) => e.key).join(", ").slice(0, 500);
      return {
        content: [
          {
            type: "text" as const,
            text: `Remembered ${entries.length} fact(s): ${keys}\nStore: ${config.storeFile}`,
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
        "Search the smart-pill memory KV store for keys containing the topic and return their values. Query before asking the model to re-read anything.",
      inputSchema: {
        topic: z.string().min(1).describe("Substring to match against fact keys"),
      },
    },
    async ({ topic }) => {
      const data = await store.read();
      const hits = Object.entries(data).filter(([k]) => k.includes(topic));
      const text =
        hits.length === 0
          ? `No facts match "${topic}".`
          : hits
              .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
              .join("\n");
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