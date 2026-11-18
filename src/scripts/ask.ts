// UI controller for "Ask my portfolio".
// Questions are understood before they're matched: small talk gets a reply, "you/he/Roop" are treated
// as the same person, and the question is compared by meaning against a bank of answered questions
// built from the profile. Keyword search answers instantly while the embedding model loads lazily in a
// Web Worker; then the same question is re-run with embeddings. If the model can't load, keyword
// search keeps working: the panel never blocks the page.
import { Bm25, answer, decodeEmb, normalizeQuestion, type Answer, type Chunk, type FaqEntry, type Hit, type SearchCtx, type SmallTalk } from './search-core';
import { profile, feedback } from '../data/site';

type Index = {
  model: { id: string; dtype: 'q8' | 'fp32'; queryPrefix: string } | null;
  chunks: Chunk[];
  faq: FaqEntry[];
  vocab: string[];
};
type ModelState = 'idle' | 'loading' | 'ready' | 'failed';

const STARTERS = ['Tell me about yourself', 'What is your notice period?', 'What was the hardest problem you solved?', 'What are your skills?'];
const SMALLTALK: Record<SmallTalk, string> = {
  greeting: 'Hi! I’m Roop, or rather my portfolio answering for me. Ask me anything about my work, skills, projects or availability, using “you”, “he” or “Roop”. Every answer comes from this site.',
  thanks: `You’re welcome! Anything else you’d like to know? You can also email me at ${profile.email}.`,
  bye: `Thanks for stopping by. My resume is one click away, and I’m at ${profile.email}.`,
  bot: 'I’m a search assistant built into my portfolio. I run in your browser and answer only from what’s on this site, with citations, so I can’t make things up. If I don’t know something, I’ll say so.',
  help: 'You can ask about my experience, projects, results, skills, education, certifications, availability or how to reach me. A few to start with:',
};

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

  let indexP: Promise<{ idx: Index; ctx: SearchCtx }> | null = null;
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
        ctx: {
          chunks: idx.chunks,
          bm25: new Bm25(idx.chunks),
          vectors: idx.model ? idx.chunks.map((c) => decodeEmb(c.emb!)) : null,
          faq: idx.faq,
          faqVecs: idx.model && idx.faq.every((f) => f.embs) ? idx.faq.map((f) => f.embs!.map(decodeEmb)) : null,
          vocab: new Set(idx.vocab ?? []),
        },
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
    let qv: Float32Array | null = null; // retrieval embedding (query prefix) → passages
    let sv: Float32Array | null = null; // embedding of the normalized question → question bank
    if (modelState === 'ready' && data.idx.model) {
      try {
        [qv, sv] = await Promise.all([embed(data.idx.model.queryPrefix + q), embed(normalizeQuestion(q))]);
      } catch (e) {
        fail(String(e));
      }
    }
    if (q !== lastQuery) return; // a newer question superseded this one
    const ctx = qv ? data.ctx : { ...data.ctx, vectors: null, faqVecs: null };
    render(q, answer(q, ctx, qv, sv), performance.now() - t0, upgraded);
  }

  const chips = (qs: string[], label?: string) =>
    qs.length
      ? `${label ? `<p class="mt-3 font-mono text-xs text-fg-subtle">${esc(label)}</p>` : ''}<div class="mt-2 flex flex-wrap gap-2">${qs
          .map((x) => `<button type="button" data-ask-q="${esc(x)}" class="rounded-full border border-line px-3 py-1 text-xs text-fg-muted hover:border-mint hover:text-fg">${esc(x)}</button>`)
          .join('')}</div>`
      : '';

  const passageItem = (h: Hit, n: number) => {
    const scores = [h.cosine !== null ? `similarity ${h.cosine.toFixed(2)}` : null, h.bm25 > 0 ? `bm25 ${h.bm25.toFixed(1)}` : null]
      .filter(Boolean)
      .join(' · ');
    return `
        <li class="rounded-lg border border-line bg-bg p-3.5">
          <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
            <a href="${h.chunk.anchor}" data-cite class="cite-chip" aria-label="Source ${n}: go to ${esc(h.chunk.section)}">[S${n}]</a>
            <span class="text-fg">${esc(h.chunk.title)}</span>
            <span class="text-fg-subtle">· ${esc(h.chunk.section)}</span>
            <span class="ml-auto text-amber">${esc(scores)}</span>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-fg-muted">${esc(h.chunk.text)}</p>
        </li>`;
  };

  // Feedback: 👍/👎 on every answer, optional comment on 👎. Sent to a Google Form when one is configured
  // in src/data/site.ts, otherwise a 👎 opens a pre-filled email.
  const feedbackBar = () => `
      <div data-fb class="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-fg-subtle">
        <span>Was this helpful?</span>
        <button type="button" data-fb-vote="up" class="rounded-md border border-line px-2.5 py-1 hover:border-mint hover:text-fg" aria-label="Yes, helpful">Yes</button>
        <button type="button" data-fb-vote="down" class="rounded-md border border-line px-2.5 py-1 hover:border-amber hover:text-fg" aria-label="No, not helpful">No</button>
        <form data-fb-form class="hidden w-full flex-wrap gap-2 pt-1">
          <label class="sr-only" for="fb-comment">What were you looking for?</label>
          <input id="fb-comment" data-fb-comment maxlength="500" placeholder="What were you looking for? (optional)" class="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-bg px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-mint focus:outline-none" />
          <button type="submit" class="mt-2 h-9 rounded-md border border-line-strong px-3 text-sm text-fg hover:border-mint sm:mt-0">Send</button>
        </form>
        <p data-fb-done class="hidden w-full text-mint" role="status"></p>
      </div>`;

  let lastAnswerLabel = '';

  function render(q: string, a: Answer, ms: number, upgraded: boolean) {
    const mode = 'mode' in a ? (a.mode === 'hybrid' ? 'hybrid' : 'keyword (BM25)') : '';
    const readout = mode ? `mode: ${mode} · latency ${Math.max(1, Math.round(ms))} ms${upgraded ? ' · re-ranked with embeddings' : ''}` : '';
    const meta = readout ? `<p class="font-mono text-xs text-fg-subtle">${esc(readout)}</p>` : '';
    let html = '';

    if (a.kind === 'smalltalk') {
      lastAnswerLabel = `smalltalk:${a.intent}`;
      html = `<div class="rounded-lg border border-line bg-bg p-4"><p class="text-[15px] leading-relaxed text-fg">${esc(SMALLTALK[a.intent])}</p></div>${chips(STARTERS, a.intent === 'help' ? '' : 'try asking')}`;
    } else if (a.kind === 'qa') {
      const f = a.match.faq;
      lastAnswerLabel = `qa:${f.id}`;
      const how = a.match.via === 'dense' ? `meaning match ${a.match.score.toFixed(2)}` : `word overlap ${a.match.score.toFixed(2)}`;
      html = `${meta}
        <div class="mt-3 rounded-lg border border-mint/40 bg-mint-wash p-4">
          <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
            <a href="${f.anchor}" data-cite class="cite-chip" aria-label="Source 1">[S1]</a>
            <span class="text-mint">Roop’s answer</span>
            <span class="text-fg-subtle">· understood as “${esc(a.match.matched)}”</span>
            <span class="ml-auto text-amber">${esc(how)}</span>
          </div>
          <p class="mt-2 text-[15px] leading-relaxed text-fg">${esc(f.a)}</p>
          ${f.link ? `<a href="${esc(f.link.href)}" ${f.link.href.endsWith('.pdf') ? 'download' : 'target="_blank" rel="noopener"'} class="mt-3 inline-flex rounded-md bg-mint px-3 py-1.5 text-sm font-medium text-mint-ink">${esc(f.link.label)}</a>` : ''}
        </div>
        ${a.support.length ? `<p class="mt-4 font-mono text-xs text-fg-subtle">supporting passages</p><ol class="mt-2 space-y-2">${a.support.map((h, i) => passageItem(h, i + 2)).join('')}</ol>` : ''}`;
    } else if (a.kind === 'unknown_tech') {
      lastAnswerLabel = `unknown:${a.tech}`;
      html = `${meta}
        <div class="mt-3 rounded-lg border border-line bg-bg p-4">
          <p class="font-mono text-xs text-amber">not in my portfolio</p>
          <p class="mt-1 text-[15px] leading-relaxed text-fg">${esc(cap(a.tech))} isn’t in my skills or projects, so I won’t claim it. My core stack is RAG, LangChain, FAISS, hybrid search (BM25 + dense with RRF), LLM routing and evaluation, in Python.</p>
        </div>${chips(['What are your skills?', 'What are you learning right now?'], 'related')}`;
    } else if (a.kind === 'passages') {
      lastAnswerLabel = `passages:${a.hits.map((h) => h.chunk.id).join(',')}`;
      const cites = a.hits.map((h, i) => `<a href="${h.chunk.anchor}" data-cite class="cite-chip">[S${i + 1}]</a>`).join(' ');
      html = `${meta}
        <p class="mt-2 text-sm text-fg">Here’s what my portfolio says ${cites}</p>
        <ol class="mt-3 space-y-2">${a.hits.map((h, i) => passageItem(h, i + 1)).join('')}</ol>`;
    } else {
      lastAnswerLabel = 'NOT_FOUND';
      html = `
        <div class="rounded-lg border border-amber/40 bg-amber-wash p-4">
          <p class="font-mono text-sm font-semibold text-amber">NOT_FOUND in my portfolio</p>
          <p class="mt-1 text-sm text-fg-muted">I don’t have an answer for that here, and I’d rather say so than guess. Try rephrasing, or email me at ${esc(profile.email)}.</p>
          ${readout ? `<p class="mt-2 font-mono text-xs text-fg-subtle">${esc(readout)}</p>` : ''}
        </div>${chips(a.suggestions.length ? a.suggestions : STARTERS, a.suggestions.length ? 'did you mean…' : 'try asking')}`;
    }
    results.innerHTML = html + feedbackBar();
    results.dataset.q = q;
  }

  function sendFeedback(vote: 'up' | 'down', comment: string) {
    const q = results.dataset.q ?? '';
    const page = location.href;
    if (feedback.googleForm) {
      const f = feedback.googleForm;
      const body = new URLSearchParams({ [f.fields.question]: q, [f.fields.answer]: lastAnswerLabel, [f.fields.vote]: vote, [f.fields.comment]: comment });
      fetch(f.action, { method: 'POST', mode: 'no-cors', body }).catch(() => {});
      return 'Thanks, Roop will see this.';
    }
    if (vote === 'down') {
      const subject = encodeURIComponent('Portfolio search feedback');
      const text = encodeURIComponent(`Question: ${q}\nAnswer shown: ${lastAnswerLabel}\nComment: ${comment}\n\n(${page})`);
      location.href = `mailto:${profile.email}?subject=${subject}&body=${text}`;
      return 'Thanks! Your email app should open with the details filled in.';
    }
    return 'Thanks!';
  }

  results.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    // Citation chips scroll to the source and briefly highlight it.
    const a = t.closest<HTMLAnchorElement>('a[data-cite]');
    if (a) {
      const target = document.querySelector<HTMLElement>(a.getAttribute('href')!);
      if (target) {
        target.classList.remove('cite-flash');
        void target.offsetWidth; // restart the animation
        target.classList.add('cite-flash');
      }
      return;
    }
    const chip = t.closest<HTMLButtonElement>('[data-ask-q]');
    if (chip) {
      input.value = chip.dataset.askQ!;
      ask(input.value);
      return;
    }
    const vote = t.closest<HTMLButtonElement>('[data-fb-vote]');
    if (vote) {
      const bar = vote.closest<HTMLElement>('[data-fb]')!;
      bar.querySelectorAll('[data-fb-vote]').forEach((b) => b.setAttribute('aria-pressed', String(b === vote)));
      if (vote.dataset.fbVote === 'up') {
        bar.querySelector('[data-fb-form]')!.classList.add('hidden');
        const done = bar.querySelector<HTMLElement>('[data-fb-done]')!;
        done.textContent = sendFeedback('up', '');
        done.classList.remove('hidden');
      } else {
        const f = bar.querySelector<HTMLElement>('[data-fb-form]')!;
        f.classList.remove('hidden');
        f.classList.add('flex');
        f.querySelector<HTMLInputElement>('input')!.focus();
      }
    }
  });
  results.addEventListener('submit', (e) => {
    const f = (e.target as HTMLElement).closest<HTMLFormElement>('[data-fb-form]');
    if (!f) return;
    e.preventDefault();
    const bar = f.closest<HTMLElement>('[data-fb]')!;
    const done = bar.querySelector<HTMLElement>('[data-fb-done]')!;
    done.textContent = sendFeedback('down', f.querySelector<HTMLInputElement>('input')!.value.trim());
    f.classList.add('hidden');
    f.classList.remove('flex');
    done.classList.remove('hidden');
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

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
