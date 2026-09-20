/**
 * Offline semantic embeddings for memory recall.
 *
 * Loads Xenova/all-MiniLM-L6-v2 (384-dim) via @huggingface/transformers ONNX
 * inference, strictly offline (allowRemoteModels=false — the model must be
 * cached, see scripts/bootstrap-model.mjs / `npm run model:fetch`). The
 * extractor is a lazy singleton: the first semantic recall pays a ~1-3s load
 * cost; a failed load degrades recall to lexical-only for the rest of the
 * process.
 */

import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

/** Below this cosine similarity a hit is noise, not meaning. */
export const SEM_THRESHOLD = 0.3;
/** Similarity at which the semantic score saturates at MAX_SEM. */
export const SEM_CEIL = 0.6;
/** Semantic hits score on the 6..15 band, below every lexical tier (100/50/30/10). */
export const MIN_SEM = 6;
export const MAX_SEM = 15;
/** Cap on chars embedded per value (roughly the model's 256-token window). */
export const EMBED_MAX_CHARS = 512;
/** Above this many lexical misses the embedding pass is skipped (>250 gets slow). */
export const EMBED_MAX_CANDIDATES = 250;

const MODEL = 'Xenova/all-MiniLM-L6-v2';

/** Never phone home: recall must work (or degrade) fully offline. */
env.allowRemoteModels = false;

let extractorPromise: Promise<FeatureExtractionPipeline | null> | null = null;
let embedFailed = false;

function loadExtractor(): Promise<FeatureExtractionPipeline | null> {
  if (embedFailed) return Promise.resolve(null);
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL)
      .then((p) => p as unknown as FeatureExtractionPipeline)
      .catch((err: unknown) => {
        embedFailed = true;
        console.error(
          `[smart-pill] embedding extractor unavailable (${String(err)}); recall degrades to lexical-only`,
        );
        return null;
      });
  }
  return extractorPromise;
}

/** True once the extractor has loaded (or failed) — cheap early-out for callers. */
export function embeddingsAvailable(): boolean {
  return extractorPromise !== null && !embedFailed;
}

export interface EmbeddedText {
  text: string;
  vector: Float32Array;
}

/**
 * Embed a batch of texts (query + candidates in one call). Returns null on
 * load/runtime failure — callers treat that as "skip the semantic tier".
 * Vectors are L2-normalized (normalize:true), so cosine is a dot product.
 */
export async function embedTexts(texts: string[]): Promise<EmbeddedText[] | null> {
  if (texts.length === 0) return [];
  const extractor = await loadExtractor();
  if (!extractor) return null;
  try {
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    const data = out.data as Float32Array;
    const dims = Array.isArray(out.dims) ? (out.dims as number[]) : undefined;
    const dim = (dims && dims[dims.length - 1]) || 384;
    const vectors: EmbeddedText[] = [];
    for (let i = 0; i < texts.length; i++) {
      const start = i * dim;
      vectors.push({ text: texts[i], vector: data.subarray(start, start + dim) });
    }
    return vectors;
  } catch (err) {
    embedFailed = true;
    console.error(
      `[smart-pill] embedding pass failed (${String(err)}); recall degrades to lexical-only`,
    );
    return null;
  }
}

/** Cosine similarity between two (preferably normalized) vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Map cosine similarity onto the semantic score band. Below SEM_THRESHOLD the
 * hit is discarded (score 0); at/above SEM_CEIL it saturates at MAX_SEM.
 * At sim=0.30 -> MIN_SEM(6), at sim=0.60 -> MAX_SEM(15).
 */
export function semanticScore(sim: number): number {
  if (sim < SEM_THRESHOLD) return 0;
  const raw =
    MIN_SEM + (MAX_SEM - MIN_SEM) * Math.min(1, (sim - SEM_THRESHOLD) / (SEM_CEIL - SEM_THRESHOLD));
  return Math.max(MIN_SEM, Math.min(MAX_SEM, Math.round(raw)));
}
