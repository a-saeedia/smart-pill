// smart-pill smoke test: MCP handshake + offline round-trip of all eight tools.
// Uses a throwaway SMART_PILL_HOME and blanks OPENROUTER_API_KEY so it is fully offline.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";
import fs from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const smokeHome = fs.mkdtempSync(join(os.tmpdir(), "smart-pill-smoke-"));

const child = spawn(process.execPath, [join(root, "dist", "index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, OPENROUTER_API_KEY: "", SMART_PILL_HOME: smokeHome },
});
child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

let buffer = "";
const pending = new Map();
let nextId = 1;

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof msg.id !== "undefined" && msg.id !== null) {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    }
  }
});

function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout: ${method}`));
    }, 20000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function notify(method, params = {}) {
  send({ jsonrpc: "2.0", method, params });
}

let asserts = 0;
function assert(cond, label) {
  asserts++;
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

async function callToolRaw(name, args) {
  const res = await rpc("tools/call", { name, arguments: args });
  assert(res && typeof res === "object", `${name} returns a result`);
  return res;
}

async function callTool(name, args, expectText) {
  const res = await callToolRaw(name, args);
  const text = res?.content?.[0]?.text ?? "";
  assert(typeof text === "string" && text.length > 0, `${name} returns text`);
  assert(text.includes(expectText), `${name} content includes "${expectText}"`);
  return text;
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.1" },
  });
  assert(init?.capabilities?.tools, "server advertises tools capability");
  notify("notifications/initialized");

  const tools = await rpc("tools/list");
  const names = (tools.tools ?? []).map((t) => t.name);
  for (const want of ["pill_digest", "pill_remember", "pill_recall", "pill_plan", "pill_review", "pill_ledger", "pill_context", "pill_route"]) {
    assert(names.includes(want), `tools/list includes ${want}`);
  }

  await callTool("pill_plan", { goal: "Port hello world to TypeScript" }, "PHASES");
  await callTool("pill_digest", { text: "line of context\n".repeat(2000) }, "<<<TAIL");
  await callTool(
    "pill_digest",
    { text: "apollo mission checklist alpha\n" + "noise line\n".repeat(400), focus: "apollo" },
    "apollo",
  );
  await callTool("pill_remember", { entries: [{ key: "smoke.test", value: "ok" }] }, "Remembered 1");
  await callTool("pill_remember", { entries: [{ key: "note.smoke.stale", value: "old" }] }, "Remembered 1");
  await callTool("pill_recall", { topic: "smoke" }, "2 hit(s)");
  await callTool("pill_context", { topic: "smoke" }, "SMART-PILL BRIEFING");
  await callTool(
    "pill_review",
    { files: [{ path: "a.ts", content: "const api_key = 'abcdef123456';\n" }] },
    "HIGH",
  );
  await callTool("pill_ledger", {}, "TOTAL EST. TOKENS SAVED");
  await callTool("pill_route", { prompt: "hi" }, "OPENROUTER_API_KEY");

  // --- behavioral: ranked recall ordering (exact > prefix > substring > value contains) ---
  await callTool(
    "pill_remember",
    {
      entries: [
        { key: "alpha", value: "v1" },
        { key: "alpha.extra", value: "v2" },
        { key: "beta.alpha.gamma", value: "v3" },
        { key: "delta", value: "the alpha inside" },
        { key: "omega", value: "unrelated" },
      ],
    },
    "Remembered 5",
  );
  {
    const res = await callToolRaw("pill_recall", { topic: "alpha", limit: 10 });
    const t = res?.content?.[0]?.text ?? "";
    assert(t.includes("4 hit(s)"), "alpha recall returns exactly 4 hits");
    const keys = ["alpha:", "alpha.extra:", "beta.alpha.gamma:", "delta:"];
    const idx = keys.map((s) => t.indexOf(`- ${s}`));
    for (const i of idx) assert(i >= 0, `ranked hit present: ${keys[i]}`);
    for (let i = 1; i < idx.length; i++) assert(idx[i] > idx[i - 1], `recall ranking order (exact > prefix > substring > value)`);
  }

  // --- behavioral: input caps (key 200 / value 8000) + truncated recall output ---
  {
    const res = await callToolRaw("pill_remember", { entries: [{ key: "k".repeat(300), value: "v".repeat(9000) }] });
    const t = res?.content?.[0]?.text ?? "";
    assert(t.includes("truncated"), "oversized remember reports truncation");
    const rec = await callToolRaw("pill_recall", { topic: "k".repeat(20), limit: 5 });
    const rt = rec?.content?.[0]?.text ?? "";
    assert(rt.includes("k".repeat(200)) && !rt.includes("k".repeat(201)), "recalled key capped at 200 chars");
    assert(rt.includes("v".repeat(400)) && !rt.includes("v".repeat(401)), "recall value display capped at 400 chars");
  }

  // --- behavioral: concurrent remembers serialize (no lost updates) ---
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      rpc("tools/call", {
        name: "pill_remember",
        arguments: { entries: [{ key: `conc.${i}`, value: `c${i}` }] },
      }),
    ),
  );
  {
    const res = await callToolRaw("pill_recall", { topic: "conc", limit: 50 });
    const t = res?.content?.[0]?.text ?? "";
    assert(t.includes("10 hit(s)"), "all 10 concurrent remembers persisted");
    for (let i = 0; i < 10; i++) assert(t.includes(`conc.${i}`), `concurrent key conc.${i} present`);
  }

  // --- behavioral: digest respects maxChars budget ---
  {
    const res = await callToolRaw("pill_digest", { text: "line of context\n".repeat(200), maxChars: 700 });
    const t = res?.content?.[0]?.text ?? "";
    assert(t.includes("<<<TAIL"), "digest keeps fresh tail");
    assert(t.length <= 700 + 150, "digest output within maxChars + CMPR marker margin");
  }

  // --- behavioral: store entry cap evicts smallest entries ---
  {
    const res = await callToolRaw("pill_remember", {
      entries: Array.from({ length: 505 }, (_, i) => ({ key: `bulk.${i}`, value: "y" })),
    });
    const t = res?.content?.[0]?.text ?? "";
    assert(t.includes("Remembered 505"), "bulk remember acknowledged");
    assert(t.includes("evicted"), "entry cap eviction reported");
  }

  child.kill();
  console.log(`SMOKE PASS: handshake ok; all 8 tools round-tripped offline; ${asserts} asserts green`);
  process.exit(0);
} catch (err) {
  child.kill();
  console.error("SMOKE FAIL:", err.message);
  process.exit(1);
}