// One-time bootstrap: download Xenova/all-MiniLM-L6-v2 into the local HF cache.
// Run once with network; afterwards smart-pill runs fully offline (env.allowRemoteModels=false).
// Usage: node scripts/bootstrap-model.mjs
import { pipeline, env } from "@huggingface/transformers";

// Allow the one-time fetch; the actual server keeps remote disabled.
env.allowRemoteModels = true;
env.allowRemoteCode = true;

try {
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const out = await extractor("smart pill semantic recall bootstrap", { pooling: "mean", normalize: true });
  console.log("BOOTSTRAP OK, dim:", out.data.length);
} catch (e) {
  console.error("BOOTSTRAP FAILED:", e.message);
  process.exit(1);
}