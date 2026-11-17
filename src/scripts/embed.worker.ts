// Web Worker: loads bge-small (ONNX, WebAssembly) and embeds queries off the main thread.
// Everything is served from this site: model in /models/, ONNX Runtime wasm in /ort/. No CDN, no API key.
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

type InitMsg = { type: 'init'; modelId: string; dtype: 'q8' | 'fp32' };
type EmbedMsg = { type: 'embed'; id: number; text: string };

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/'; // site-relative path (a full URL skips the library's local-file check)
env.useBrowserCache = true; // second visit loads from Cache Storage
const wasm = env.backends.onnx.wasm!;
wasm.wasmPaths = {
  mjs: new URL('/ort/ort-wasm-simd-threaded.mjs', self.location.origin).href,
  wasm: new URL('/ort/ort-wasm-simd-threaded.wasm', self.location.origin).href,
};
wasm.numThreads = 1; // GitHub Pages can't send COOP/COEP headers, so no SharedArrayBuffer threads

let extractor: Promise<FeatureExtractionPipeline> | null = null;

self.onmessage = async (e: MessageEvent<InitMsg | EmbedMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    if (extractor) return;
    const t0 = performance.now();
    const files = new Map<string, { loaded: number; total: number }>();
    extractor = pipeline('feature-extraction', msg.modelId, {
      dtype: msg.dtype,
      device: 'wasm',
      progress_callback: (p: any) => {
        if (p.status === 'progress' && p.total) {
          files.set(p.file, { loaded: p.loaded, total: p.total });
          let loaded = 0, total = 0;
          for (const f of files.values()) (loaded += f.loaded), (total += f.total);
          self.postMessage({ type: 'progress', loaded, total });
        }
      },
    }) as Promise<FeatureExtractionPipeline>;
    try {
      const ex = await extractor;
      await ex('warm up', { pooling: 'cls', normalize: true }); // first run compiles kernels
      self.postMessage({ type: 'ready', ms: Math.round(performance.now() - t0) });
    } catch (err) {
      extractor = null;
      self.postMessage({ type: 'error', message: String((err as Error)?.message ?? err) });
    }
    return;
  }
  if (msg.type === 'embed') {
    try {
      if (!extractor) throw new Error('model not loaded');
      const ex = await extractor;
      const t0 = performance.now();
      const out = await ex(msg.text, { pooling: 'cls', normalize: true });
      const vec = new Float32Array(out.data as Float32Array);
      self.postMessage({ type: 'embedding', id: msg.id, vec, ms: performance.now() - t0 }, [vec.buffer]);
    } catch (err) {
      self.postMessage({ type: 'embed-error', id: msg.id, message: String((err as Error)?.message ?? err) });
    }
  }
};
