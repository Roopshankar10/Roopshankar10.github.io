// Pure retrieval logic for "Ask my portfolio": no DOM, no model. Runs in the browser and in tests.
// Hybrid = dense cosine (bge-small) + BM25 keyword, merged with Reciprocal Rank Fusion,
// the same recipe as the production assistant this portfolio describes.

export type Chunk = { id: string; section: string; anchor: string; title: string; text: string; emb?: string };

export type Hit = { chunk: Chunk; cosine: number | null; bm25: number; rrf: number };
export type Result =
  | { kind: 'answer'; hits: Hit[]; mode: Mode; bestCosine: number | null }
  | { kind: 'not_found'; mode: Mode; bestCosine: number | null; reason: string };
export type Mode = 'hybrid' | 'keyword';

// Calibrated on bge-small-en-v1.5 with in-scope and out-of-scope questions:
// out-of-scope questions still score ~0.45–0.61, so cosine alone can't say "not found".
// A passage only counts if a meaningful query term matches it (BM25 > 0), or cosine is high on its own.
export const COSINE_STRONG = 0.68;
const MIN_COVERAGE = 0.5;
const RRF_K = 60;
const TOP_K = 3;

// Words that say nothing about *what* is being asked. They don't count as evidence.
const STOP = new Set(
  ('a an the and or of to in on for with at by from as is are was were be been being it its this that these those ' +
    'he him his she her they them their you your i me my we our us roop shankar voruganti ' +
    'what which who whom whose where when why how do does did done has have had can could should would will ' +
    'tell about any some much many more most there here into than then also just like know knows experience ' +
    'use used using skill skills please show give list me new').split(' '),
);

export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+(?:[.\-][a-z0-9]+)*/g) ?? [])
    .map(stem);
}
// Tiny suffix stemmer: enough to match "studied"/"study", "chunks"/"chunk", "indexed"/"index".
function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ied')) return t.slice(0, -3) + 'y';
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}
const contentTerms = (s: string) => tokenize(s).filter((t) => !STOP.has(t));

export class Bm25 {
  private docs: Map<string, number>[] = [];
  private lens: number[] = [];
  private df = new Map<string, number>();
  private avg = 0;
  private k1 = 1.2;
  private b = 0.75;
  constructor(chunks: Chunk[]) {
    for (const c of chunks) {
      const tf = new Map<string, number>();
      const toks = tokenize(`${c.title} ${c.text}`);
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.docs.push(tf);
      this.lens.push(toks.length);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avg = this.lens.reduce((a, b) => a + b, 0) / Math.max(1, this.lens.length);
  }
  /** Share of the query's meaningful terms that appear in each chunk (0..1). */
  coverage(query: string): number[] {
    const q = [...new Set(contentTerms(query))];
    if (!q.length) return this.docs.map(() => 0);
    return this.docs.map((tf) => q.filter((t) => tf.has(t)).length / q.length);
  }
  scores(query: string): number[] {
    const N = this.docs.length;
    const q = [...new Set(contentTerms(query))];
    return this.docs.map((tf, i) => {
      let s = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t)!;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.lens[i]) / this.avg));
      }
      return s;
    });
  }
}

export function decodeEmb(packed: string): Float32Array {
  const i = packed.indexOf(':');
  const scale = i > 0 ? parseFloat(packed.slice(0, i)) : 0;
  const bin = atob(i > 0 ? packed.slice(i + 1) : packed);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  if (i <= 0) return new Float32Array(bytes.buffer); // legacy float32 format
  const q = new Int8Array(bytes.buffer);
  const out = new Float32Array(q.length);
  let norm = 0;
  for (let k = 0; k < q.length; k++) (out[k] = (q[k] / 127) * scale), (norm += out[k] * out[k]);
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < out.length; k++) out[k] /= norm; // re-normalize after quantization
  return out;
}

const dot = (a: Float32Array, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const ranks = (scores: number[], keep: (s: number) => boolean) => {
  const order = scores.map((s, i) => [s, i] as const).filter(([s]) => keep(s)).sort((a, b) => b[0] - a[0]);
  const r = new Map<number, number>();
  order.forEach(([, i], pos) => r.set(i, pos + 1));
  return r;
};

/** queryVec = normalized query embedding, or null for keyword-only mode. */
export function search(
  query: string,
  chunks: Chunk[],
  bm25: Bm25,
  vectors: Float32Array[] | null,
  queryVec: ArrayLike<number> | null,
): Result {
  const mode: Mode = vectors && queryVec ? 'hybrid' : 'keyword';
  if (!contentTerms(query).length && mode === 'keyword') {
    return { kind: 'not_found', mode, bestCosine: null, reason: 'No searchable terms in the question.' };
  }
  const kw = bm25.scores(query);
  const cos = mode === 'hybrid' ? vectors!.map((v) => dot(v, queryVec!)) : null;
  const bestCosine = cos ? Math.max(...cos) : null;

  // Evidence gate: a chunk is a candidate if it contains at least half of the query's
  // meaningful terms, or (hybrid only) it is semantically very close on its own.
  const cov = bm25.coverage(query);
  const candidate = (i: number) => cov[i] >= MIN_COVERAGE || (cos !== null && cos[i] >= COSINE_STRONG);
  const kwRank = ranks(kw, (s) => s > 0);
  const denseRank = cos ? ranks(cos, () => true) : new Map<number, number>();

  const hits: Hit[] = [];
  chunks.forEach((chunk, i) => {
    if (!candidate(i)) return;
    let rrf = 0;
    if (kwRank.has(i)) rrf += 1 / (RRF_K + kwRank.get(i)!);
    if (denseRank.has(i)) rrf += 1 / (RRF_K + denseRank.get(i)!);
    hits.push({ chunk, cosine: cos ? cos[i] : null, bm25: kw[i], rrf });
  });
  hits.sort((a, b) => b.rrf - a.rrf);

  if (!hits.length) {
    return {
      kind: 'not_found',
      mode,
      bestCosine,
      reason:
        mode === 'hybrid'
          ? `No passage contains the key terms of the question, and the best similarity (${bestCosine!.toFixed(2)}) is below ${COSINE_STRONG}.`
          : 'No passage contains the key terms of the question.',
    };
  }
  return { kind: 'answer', hits: hits.slice(0, TOP_K), mode, bestCosine };
}

// ---------- Q&A matching (question-to-question) ----------
export type FaqEntry = {
  id: string; kind: 'faq' | 'gen'; q: string; a: string; anchor: string; variants: string[];
  entities?: string[]; link?: { label: string; href: string }; embs?: string[]; suggest?: false;
};
export type FaqMatch = { faq: FaqEntry; score: number; via: 'dense' | 'keyword'; matched: string };

// Calibrated on bge-small-en-v1.5 (symmetric, no query prefix): unseen paraphrases scored 0.80–0.98,
// off-topic questions mostly 0.52–0.77.
export const FAQ_COSINE = 0.8;
const FAQ_JACCARD = 0.6;

const allTokens = (s: string) => new Set(tokenize(s.replace(/[’']/g, ' ')));

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/** symVec = normalized query embedding WITHOUT the retrieval prefix, or null in keyword mode. */
/** Template questions ("Do you know X?") only count if the question really mentions X. */
const mentions = (f: FaqEntry, normalized: string) =>
  !f.entities || f.entities.some((e) => new RegExp(`(^|[^a-z0-9])${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(normalized));

export function matchFaq(query: string, faqs: FaqEntry[], faqVecs: Float32Array[][] | null, symVec: ArrayLike<number> | null): FaqMatch | null {
  let best: FaqMatch | null = null;
  const normalized = query.toLowerCase();
  if (faqVecs && symVec) {
    for (let i = 0; i < faqs.length; i++)
      for (let j = 0; j < faqVecs[i].length; j++) {
        if (!mentions(faqs[i], normalized)) continue;
        const s = dot(faqVecs[i][j], symVec);
        if (s >= FAQ_COSINE && (!best || s > best.score)) best = { faq: faqs[i], score: s, via: 'dense', matched: faqs[i].variants[j] };
      }
    if (best) return best;
  }
  // Keyword path (fallback mode, or near-verbatim questions): word overlap with a known variant,
  // and the variant must share at least one meaningful word with the question if it has any.
  const qt = allTokens(query);
  const qc = new Set(contentTerms(query));
  for (const f of faqs) {
    if (!mentions(f, normalized)) continue;
    for (const v of f.variants) {
      const vt = allTokens(v);
      const sharesContent = !qc.size || [...qc].some((t) => vt.has(t));
      const s = jaccard(qt, vt);
      if (sharesContent && s >= FAQ_JACCARD && (!best || s > best.score)) best = { faq: f, score: s, via: 'keyword', matched: v };
    }
  }
  return best;
}

/** Closest answerable questions, for "Did you mean…?" when nothing matches confidently. */
export function nearestQuestions(faqs: FaqEntry[], faqVecs: Float32Array[][] | null, symVec: ArrayLike<number> | null, k = 3): string[] {
  if (!faqVecs || !symVec) return [];
  return faqs
    .map((f, i) => ({ f, s: Math.max(...faqVecs[i].map((v) => dot(v, symVec))) }))
    .filter((x) => x.s >= 0.55 && x.f.suggest !== false) // only offer questions worth offering
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.f.q);
}

// ---------- Understanding the question ----------
// Visitors say "you", "he", "Roop" or "the candidate" for the same person. Every question is rewritten
// into one canonical second-person form before it's matched, so all of them land on the same answer.
const PERSON: [RegExp, string][] = [
  [/\b(mr\.?\s+)?roop\s+shankar\s+voruganti'?s\b/g, 'your'],
  [/\b(mr\.?\s+)?roop\s+shankar\s+voruganti\b/g, 'you'],
  [/\broop\s+shankar'?s\b/g, 'your'], [/\broop\s+shankar\b/g, 'you'],
  [/\broop'?s\b/g, 'your'], [/\broop\b/g, 'you'], [/\bvoruganti'?s\b/g, 'your'], [/\bvoruganti\b/g, 'you'],
  [/\b(the|this)\s+(candidate|person|guy|engineer)'?s\b/g, 'your'], [/\b(the|this)\s+(candidate|person|guy|engineer)\b/g, 'you'],
  [/\bhe'?s\b/g, 'you are'], [/\bhe'?d\b/g, 'you would'], [/\bhe'?ll\b/g, 'you will'],
  [/\bhimself\b/g, 'yourself'], [/\bhis\b/g, 'your'], [/\bhim\b/g, 'you'], [/\bhe\b/g, 'you'],
  [/\bdoes you\b/g, 'do you'], [/\bhas you\b/g, 'have you'], [/\bis you\b/g, 'are you'], [/\bwas you\b/g, 'were you'],
  [/\byou has\b/g, 'you have'], [/\byou is\b/g, 'you are'], [/\byou was\b/g, 'you were'], [/\byou does\b/g, 'you do'],
];
export function normalizeQuestion(q: string): string {
  let s = ' ' + q.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim() + ' ';
  // drop a leading greeting when a real question follows: "hi, what's your notice period?"
  s = s.replace(/^\s*(hi+|hello|hey|hola|namaste|good (morning|afternoon|evening))\b[\s,!.:-]*(?=\S.{6,})/, ' ');
  for (const [re, to] of PERSON) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

export type SmallTalk = 'greeting' | 'thanks' | 'bye' | 'bot' | 'help';
export function detectSmallTalk(q: string): SmallTalk | null {
  const s = q.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/^(hi+|hello+|hey+|hiya|hola|namaste|yo|good (morning|afternoon|evening)|greetings)( there| roop| team| all)?$/.test(s)) return 'greeting';
  if (/^(thanks|thank you|thx|ty|cheers|great|cool|nice|awesome|perfect|ok|okay|got it)( (so much|a lot|roop))?$/.test(s)) return 'thanks';
  if (/^(bye|goodbye|see you|see ya|cya|good night)$/.test(s)) return 'bye';
  if (/\b(are you|is this) (a |an )?(bot|ai|robot|chatbot|real|human|chatgpt|gpt|llm)\b/.test(s) || /^(what is this|how does this work|how do you work)$/.test(s)) return 'bot';
  if (/^(help|what can (i|you) ask|what can you (do|answer)|what should i ask|what do you know)$/.test(s)) return 'help';
  return null;
}

/** "Do you know X?" style questions: returns X, so unknown technologies get an honest "not in my skills". */
export function askedTechnology(normalized: string): string | null {
  const m = normalized.match(
    /\b(?:do you know|do you use|have you (?:ever )?(?:used|worked (?:with|on)|built (?:with|using))|any experience (?:with|in)|experience (?:with|in)|are you familiar with|familiar with|can you (?:use|work with|code in)|are you (?:good|skilled|proficient|experienced) (?:at|in|with)|experienced (?:with|in)|can you build|know about|worked with|knowledge of)\s+(.+?)[?.!]*$/,
  );
  return m ? m[1].replace(/^(the|a|an)\s+/, '').trim() : null;
}

// ---------- The full answer pipeline (shared by the browser and the eval) ----------
export type SearchCtx = {
  chunks: Chunk[]; bm25: Bm25; vectors: Float32Array[] | null;
  faq: FaqEntry[]; faqVecs: Float32Array[][] | null; vocab: Set<string>;
};
export type Answer =
  | { kind: 'smalltalk'; intent: SmallTalk }
  | { kind: 'qa'; match: FaqMatch; support: Hit[]; mode: Mode }
  | { kind: 'unknown_tech'; tech: string; missing: string[]; mode: Mode }
  | { kind: 'passages'; hits: Hit[]; mode: Mode; bestCosine: number | null }
  | { kind: 'not_found'; reason: string; suggestions: string[]; mode: Mode; bestCosine: number | null };

/** qv = retrieval embedding of the original question (with query prefix); sv = symmetric embedding of normalizeQuestion(q). */
export function answer(q: string, ctx: SearchCtx, qv: ArrayLike<number> | null, sv: ArrayLike<number> | null): Answer {
  const intent = detectSmallTalk(q);
  if (intent) return { kind: 'smalltalk', intent };
  const n = normalizeQuestion(q);
  const mode: Mode = qv && ctx.vectors ? 'hybrid' : 'keyword';

  // An unknown technology ("Do you know Kubernetes?") gets an honest no before anything else can
  // match it by sentence shape ("Do you know AWS?").
  const tech = askedTechnology(n);
  if (tech) {
    const missing = contentTerms(tech.replace(/[-_/]/g, ' ')).filter((t) => !ctx.vocab.has(t));
    if (missing.length) return { kind: 'unknown_tech', tech, missing, mode };
  }

  const r = search(q, ctx.chunks, ctx.bm25, mode === 'hybrid' ? ctx.vectors : null, qv);
  const fm = matchFaq(n, ctx.faq, sv ? ctx.faqVecs : null, sv);
  if (fm) {
    const related = (h: Hit) => (h.cosine !== null ? h.cosine >= 0.6 : h.bm25 >= 2);
    const support = r.kind === 'answer' ? r.hits.filter((h) => h.chunk.id !== fm.faq.id && related(h)).slice(0, 2) : [];
    return { kind: 'qa', match: fm, support, mode };
  }
  if (r.kind === 'answer') return { kind: 'passages', hits: r.hits, mode, bestCosine: r.bestCosine };
  return { kind: 'not_found', reason: r.reason, suggestions: nearestQuestions(ctx.faq, ctx.faqVecs, sv), mode, bestCosine: r.bestCosine };
}
