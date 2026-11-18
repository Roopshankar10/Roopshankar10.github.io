// Build-time step for "Ask my portfolio" (runs before `astro build` / `astro dev`).
//
// 1. Copies the ONNX Runtime WebAssembly files into public/ort/ (self-hosted: no CDN at runtime).
// 2. Makes sure the embedding model is in public/models/ (downloads it from Hugging Face once).
// 3. Chunks the portfolio content and embeds every chunk with the SAME model the browser uses.
// 4. Projects skill embeddings to 2D with PCA for the "embedding space" scatter.
// 5. Writes public/search-index.json and src/data/generated/skills-2d.json.
//
// If the model can't be fetched (offline, blocked network), it still writes a keyword-only
// index and the site falls back to BM25 search. The build never fails because of the model.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChunks, buildSkillTexts, buildFaq } from './chunks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_ID = 'Xenova/bge-small-en-v1.5';
const MODEL_DIR = path.join(root, 'public/models', MODEL_ID);
const HF = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const BASE_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json'];
const Q8_FILE = 'onnx/model_quantized.onnx';
const FP32_FILE = 'onnx/model.onnx';

const exists = (p) => fs.access(p).then(() => true, () => false);
const log = (...a) => console.log('[search]', ...a);

async function copyOrt() {
  const src = path.join(root, 'node_modules/onnxruntime-web/dist');
  const dst = path.join(root, 'public/ort');
  await fs.mkdir(dst, { recursive: true });
  for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    await fs.copyFile(path.join(src, f), path.join(dst, f));
  }
}

async function download(rel) {
  const res = await fetch(`${HF}/${rel}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const out = path.join(MODEL_DIR, rel);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
}

// Returns the dtype to use ('q8' preferred, 'fp32' if only the full model is present), or null.
async function ensureModel() {
  try {
    for (const f of BASE_FILES) if (!(await exists(path.join(MODEL_DIR, f)))) await download(f);
    if (await exists(path.join(MODEL_DIR, Q8_FILE))) return 'q8';
    if (await exists(path.join(MODEL_DIR, FP32_FILE))) return 'fp32';
    log('downloading', Q8_FILE, '(~34 MB, one time)…');
    await download(Q8_FILE);
    return 'q8';
  } catch (e) {
    log('model unavailable → keyword-only index.', String(e.message ?? e));
    return null;
  }
}

async function embedAll(dtype, texts) {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.localModelPath = path.join(root, 'public/models') + '/';
  const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype });
  const out = await extractor(texts, { pooling: 'cls', normalize: true });
  return out.tolist();
}

const b64 = (vec) => Buffer.from(new Float32Array(vec).buffer).toString('base64');

// Plain PCA via power iteration (2 components); enough for ~25 points × 384 dims.
function pca2(vectors) {
  const n = vectors.length, d = vectors[0].length;
  const mean = Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j] / n;
  const X = vectors.map((v) => v.map((x, j) => x - mean[j]));
  const comps = [];
  for (let c = 0; c < 2; c++) {
    let w = Array.from({ length: d }, (_, j) => Math.sin(j * 12.9898 + c * 78.233));
    for (let it = 0; it < 200; it++) {
      const s = X.map((r) => r.reduce((a, x, j) => a + x * w[j], 0));
      const nw = Array(d).fill(0);
      X.forEach((r, i) => r.forEach((x, j) => (nw[j] += x * s[i])));
      for (const p of comps) {
        const dot = nw.reduce((a, x, j) => a + x * p[j], 0);
        for (let j = 0; j < d; j++) nw[j] -= dot * p[j];
      }
      const norm = Math.hypot(...nw) || 1;
      w = nw.map((x) => x / norm);
    }
    comps.push(w);
  }
  return X.map((r) => comps.map((w) => r.reduce((a, x, j) => a + x * w[j], 0)));
}

function normalize01(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return points.map(([x, y]) => [+((x - x0) / (x1 - x0 || 1)).toFixed(4), +((y - y0) / (y1 - y0 || 1)).toFixed(4)]);
}

async function main() {
  const t0 = Date.now();
  await copyOrt();
  const chunks = await buildChunks();
  const skillTexts = await buildSkillTexts();
  const faq = await buildFaq();
  const faqTexts = faq.flatMap((f) => f.variants);
  const dtype = await ensureModel();

  let vectors = null, skillVecs = null, faqVecs = null;
  if (dtype) {
    try {
      const all = await embedAll(dtype, [...chunks.map((c) => `${c.title}. ${c.text}`), ...skillTexts.map((s) => s.text), ...faqTexts]);
      vectors = all.slice(0, chunks.length);
      skillVecs = all.slice(chunks.length, chunks.length + skillTexts.length);
      faqVecs = all.slice(chunks.length + skillTexts.length);
    } catch (e) {
      log('embedding failed → keyword-only index.', String(e.message ?? e));
    }
  }

  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    model: vectors ? { id: MODEL_ID, dtype, dims: vectors[0].length, pooling: 'cls',
      queryPrefix: 'Represent this sentence for searching relevant passages: ' } : null,
    chunks: chunks.map((c, i) => ({ ...c, ...(vectors ? { emb: b64(vectors[i]) } : {}) })),
    faq: (() => {
      let k = 0;
      return faq.map((f) => ({
        ...f,
        ...(faqVecs ? { embs: f.variants.map(() => b64(faqVecs[k++])) } : {}),
      }));
    })(),
  };
  await fs.writeFile(path.join(root, 'public/search-index.json'), JSON.stringify(index));

  const genDir = path.join(root, 'src/data/generated');
  await fs.mkdir(genDir, { recursive: true });
  const coords = skillVecs ? normalize01(pca2(skillVecs)) : null;
  await fs.writeFile(
    path.join(genDir, 'skills-2d.json'),
    JSON.stringify({ method: coords ? `PCA of ${MODEL_ID} embeddings` : null, points: skillTexts.map((s, i) => ({ name: s.name, xy: coords?.[i] ?? null })) }, null, 1),
  );

  log(`${chunks.length} chunks · ${faq.length} Q&A · ${vectors ? `dense (${dtype})` : 'keyword-only'} · ${Date.now() - t0} ms`);
}

main().catch((e) => {
  console.error('[search] failed:', e);
  process.exit(1);
});
