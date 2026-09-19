// probe3: can @huggingface/transformers run all-MiniLM-L6-v2 fully offline on this box?
import { pipeline, env } from "@huggingface/transformers";

// Fully offline: no HF hub fetch. Model must exist in the local package cache.
env.allowRemoteModels = false;
env.allowRemoteCode = false;

try {
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const q = await extractor("Where do you keep your notes about projects?", { pooling: "mean", normalize: true });
  const t = await extractor("Obsidian vault at .config opencode vault INDEX.md holds project notes", { pooling: "mean", normalize: true });
  const d1 = await extractor("repo at system admin smart-pill push to github", { pooling: "mean", normalize: true });
  const qv = q.data;
  const tv = t.data;
  const d1v = d1.data;
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  console.log("EMBEDDINGS OK, dim:", qv.length);
  console.log("sim(true-hit):", dot(qv, tv).toFixed(3));
  console.log("sim(distractor):", dot(qv, d1v).toFixed(3));
} catch (e) {
  console.error("EMBEDDINGS FAILED:", e.message);
  process.exit(1);
}