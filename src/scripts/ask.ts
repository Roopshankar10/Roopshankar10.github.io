// UI controller for "Ask my portfolio".
// Keyword (BM25) search answers instantly; the embedding model loads lazily in a Web Worker,
// and once it's ready the same question is re-run as hybrid search (dense + BM25, RRF).
// If the model can't load, the panel stays on keyword search: it never blocks the page.
import { Bm25, decodeEmb, search, type Chunk, type Result } from './search-core';

type Index = {
  model: { id: string; dtype: 'q8' | 'fp32'; queryPrefix: string } | null;
  chunks: Chunk[];
};
type ModelState = 'idle' | 'loading' | 'ready' | 'failed';

const root = document.querySelector<HTMLElement>('[data-ask]');
if (root) init(root);

function init(root: HTMLElement) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const form = $<HTMLFormElement>('[data-ask-form]');
  const input = $<HTMLInputElement>('[data-ask-input]');
  const error = $('[data-ask-error]');
  const modelLine = $('[data-ask-model]');
  const progress = $('[data-ask-progress]');
  const progressBar = $('[data-ask-progress-bar]');
  const results = $('[data-ask-results]');

  let indexP: Promise<{ idx: Index; bm25: Bm25; vectors: Float32Array[] | null }> | null = null;
  let modelState: ModelState = 'idle';
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void }>();
  let lastQuery = '';

  const loadIndex = () =>
    (indexP ??= fetch('/search-index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`index HTTP ${r.status}`);
        return r.json() as Promise<Index>;
      })
      .then((idx) => ({
        idx,
        bm25: new Bm25(idx.chunks),
        vectors: idx.model ? idx.chunks.map((c) => decodeEmb(c.emb!)) : null,
      })));

  const setModelLine = (text: string) => (modelLine.textContent = text);

  async function startModel() {
    if (modelState !== 'idle') return;
    modelState = 'loading';
    let idx: Index;
    try {
      idx = (await loadIndex()).idx;
    } catch {
      modelState = 'failed';
      setModelLine('search index unavailable');
      return;
    }
    if (!idx.model || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      modelState = 'failed';
      setModelLine('mode: keyword (BM25) · embedding model not available in this build or browser');
      return;
    }
    setModelLine(`model: ${idx.model.id.split('/')[1]} · loading…`);
    progress.classList.remove('hidden');
    worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        const pct = m.total ? (m.loaded / m.total) * 100 : 0;
        progressBar.style.width = `${pct.toFixed(1)}%`;
        setModelLine(`model: ${idx.model!.id.split('/')[1]} · downloading ${(m.loaded / 1e6).toFixed(1)} / ${(m.total / 1e6).toFixed(1)} MB (one time)`);
      } else if (m.type === 'ready') {
        modelState = 'ready';
        progress.classList.add('hidden');
        setModelLine(`mode: hybrid · ${idx.model!.id.split('/')[1]} (${idx.model!.dtype}) + BM25, fused with RRF · model ready in ${(m.ms / 1000).toFixed(1)} s`);
        if (lastQuery) run(lastQuery, true);
      } else if (m.type === 'error') {
        fail(m.message);
      } else if (m.type === 'embedding') {
        pending.get(m.id)?.resolve(m.vec);
        pending.delete(m.id);
      } else if (m.type === 'embed-error') {
        pending.get(m.id)?.reject(new Error(m.message));
        pending.delete(m.id);
      }
    };
    worker.onerror = (e) => fail(e.message || 'worker error');
    worker.postMessage({ type: 'init', modelId: idx.model.id, dtype: idx.model.dtype });
  }

  function fail(reason: string) {
    modelState = 'failed';
    progress.classList.add('hidden');
    worker?.terminate();
    worker = null;
    console.warn('[ask] model failed, using keyword search:', reason);
    setModelLine('mode: keyword (BM25) · model failed to load, keyword fallback active');
  }

  const embed = (text: string) =>
    new Promise<Float32Array>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker!.postMessage({ type: 'embed', id, text });
    });

  async function run(q: string, upgraded = false) {
    lastQuery = q;
    const t0 = performance.now();
    let data;
    try {
      data = await loadIndex();
    } catch {
      results.innerHTML = `<p class="font-mono text-sm text-amber">Search index unavailable. Every answer is still on this page: scroll down.</p>`;
      return;
    }
    let qv: Float32Array | null = null;
    if (modelState === 'ready' && data.idx.model) {
      try {
        qv = await embed(data.idx.model.queryPrefix + q);
      } catch (e) {
        fail(String(e));
      }
    }
    if (q !== lastQuery) return; // a newer question superseded this one
    const r = search(q, data.idx.chunks, data.bm25, qv ? data.vectors : null, qv);
    render(r, performance.now() - t0, upgraded);
  }

  function render(r: Result, ms: number, upgraded: boolean) {
    const mode = r.mode === 'hybrid' ? 'hybrid' : 'keyword (BM25)';
    const sim = r.bestCosine !== null ? ` · best similarity ${r.bestCosine.toFixed(2)}` : '';
    const readout = `mode: ${mode}${sim} · latency ${Math.max(1, Math.round(ms))} ms${upgraded ? ' · re-ranked with embeddings' : ''}`;

    if (r.kind === 'not_found') {
      results.innerHTML = `
        <div class="rounded-lg border border-amber/40 bg-amber-wash p-4">
          <p class="font-mono text-sm font-semibold text-amber">NOT_FOUND in my portfolio</p>
          <p class="mt-1 text-sm text-fg-muted">${esc(r.reason)} Rather than guess, the search says so, just like the systems I build.</p>
          <p class="mt-2 font-mono text-xs text-fg-subtle">${esc(readout)}</p>
        </div>`;
      return;
    }

    const chips = r.hits
      .map((h, i) => `<a href="${h.chunk.anchor}" data-cite class="cite-chip">[S${i + 1}]</a>`)
      .join(' ');
    const items = r.hits
      .map((h, i) => {
        const scores = [
          h.cosine !== null ? `similarity ${h.cosine.toFixed(2)}` : null,
          h.bm25 > 0 ? `bm25 ${h.bm25.toFixed(1)}` : null,
        ].filter(Boolean).join(' · ');
        return `
        <li class="rounded-lg border border-line bg-bg p-3.5">
          <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
            <a href="${h.chunk.anchor}" data-cite class="cite-chip" aria-label="Source ${i + 1}: go to ${esc(h.chunk.section)}">[S${i + 1}]</a>
            <span class="text-fg">${esc(h.chunk.title)}</span>
            <span class="text-fg-subtle">· ${esc(h.chunk.section)}</span>
            <span class="ml-auto text-amber">${esc(scores)}</span>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-fg-muted">${esc(h.chunk.text)}</p>
        </li>`;
      })
      .join('');
    results.innerHTML = `
      <p class="font-mono text-xs text-fg-subtle">${esc(readout)}</p>
      <p class="mt-2 text-sm text-fg">Found ${r.hits.length} passage${r.hits.length > 1 ? 's' : ''} ${chips}</p>
      <ol class="mt-3 space-y-2">${items}</ol>`;
  }

  // Citation chips scroll to the source and briefly highlight it.
  results.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-cite]');
    if (!a) return;
    const target = document.querySelector<HTMLElement>(a.getAttribute('href')!);
    if (!target) return;
    target.classList.remove('cite-flash');
    void target.offsetWidth; // restart the animation
    target.classList.add('cite-flash');
  });

  const ask = (q: string) => {
    const query = q.trim();
    if (!query) {
      error.classList.remove('hidden');
      input.focus();
      return;
    }
    error.classList.add('hidden');
    startModel();
    run(query);
  };

  input.addEventListener('focus', startModel, { once: true });
  input.addEventListener('input', () => error.classList.add('hidden'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-ask-chip]').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.textContent!.trim();
      ask(input.value);
    }),
  );

  // "Ask my portfolio" buttons elsewhere (hero, command palette) focus the box.
  const focusBox = () => setTimeout(() => input.focus({ preventScroll: true }), 350);
  document.querySelectorAll('a[href="#ask"]').forEach((a) => a.addEventListener('click', focusBox));
  window.addEventListener('ask:open', () => {
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusBox();
  });
  if (location.hash === '#ask') focusBox();
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
