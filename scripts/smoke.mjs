// smart-pill smoke test: MCP handshake + offline round-trip of all six tools.
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

function assert(cond, label) {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

async function callTool(name, args, expectText) {
  const res = await rpc("tools/call", { name, arguments: args });
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
  for (const want of ["pill_digest", "pill_remember", "pill_recall", "pill_plan", "pill_review", "pill_ledger", "pill_route"]) {
    assert(names.includes(want), `tools/list includes ${want}`);
  }

  await callTool("pill_plan", { goal: "Port hello world to TypeScript" }, "PHASES");
  await callTool("pill_digest", { text: "line of context\n".repeat(2000) }, "<<<TAIL");
  await callTool("pill_remember", { entries: [{ key: "smoke.test", value: "ok" }] }, "Remembered 1");
  await callTool("pill_recall", { topic: "smoke" }, "smoke.test: ok");
  await callTool(
    "pill_review",
    { files: [{ path: "a.ts", content: "const api_key = 'abcdef123456';\n" }] },
    "HIGH",
  );
  await callTool("pill_ledger", {}, "TOTAL EST. TOKENS SAVED");
  await callTool("pill_route", { prompt: "hi" }, "OPENROUTER_API_KEY");

  child.kill();
  console.log("SMOKE PASS: handshake ok; all 7 tools round-tripped offline");
  process.exit(0);
} catch (err) {
  child.kill();
  console.error("SMOKE FAIL:", err.message);
  process.exit(1);
}