// Retrieval eval for "Ask my portfolio": expected chunk in top 3, or NOT_FOUND for out-of-scope.
// Run: npm test (also runs on every build). Uses the model in public/models when present, else keyword-only.
import fs from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';
import { Bm25, decodeEmb, matchFaq, search } from '../src/scripts/search-core.ts';

const cases = [
  ['What retrieval approach does he use?', 'sia-decisions|principle-3|skills-retrieval|sia-architecture'],
  ['What were the eval results?', 'sia-evals'],
  ['Where does Roop work?', 'exp-tcs|faq:current'],
  ['Which certifications does he have?', 'certifications'],
  ["How does he handle questions the docs don't cover?", 'principle-4|sia-problem|faq:hallucination'],
  ['How can I contact him?', 'contact|faq:reach'],
  ['What is the hit@5?', 'sia-evals'],
  ['Is he open to new roles?', 'availability|faq:role'],
  ['Tell me about the biotech project', 'biotech-problem|biotech-decisions|biotech-architecture|exp-biotech'],
  ['Where did he study?', 'education|exp-mgit'],
  ['What is RRF?', 'sia-architecture|principle-3|sia-decisions|skills-retrieval'],
  ['Which LLM does the service assistant use?', 'sia-architecture'],
  ['How many chunks were indexed?', 'sia-architecture'],
  ['Does he know LangChain?', 'skills-llm-orchestration|biotech-decisions|biotech-architecture'],
  ['Does he know Kubernetes?', null],
  ['What is his favourite food?', null],
  ['Has he worked with React Native?', null],
  ['Java Spring Boot experience', null],
  ['What is his salary expectation?', null],
  ['Are you married?', null],
  // Q&A: paraphrases that are NOT in the stored variants → must match the right answer
  ['tell me something about you', 'faq:about'],
  ['whats your notice period', 'faq:notice'],
  ['how fast can you join us', 'faq:notice'],
  ['is remote work ok for you', 'faq:relocate'],
  ['which city would you like to work in', 'faq:cities'],
  ['what is your greatest accomplishment', 'faq:achievement'],
  ['did you have a team', 'faq:ownership'],
  ['any production deployments?', 'faq:production'],
  ['have you used AWS or GCP', 'faq:cloud'],
  ['experience with docker?', 'faq:backend'],
  ['what are you weak at', 'faq:weakness'],
  ['what is your ideal job', 'faq:role'],
];

const idx = JSON.parse(fs.readFileSync('public/search-index.json', 'utf8'));
const vecs = idx.model ? idx.chunks.map((c) => decodeEmb(c.emb)) : null;
const faqVecs = idx.model ? idx.faq.map((f) => f.embs.map(decodeEmb)) : null;
const bm = new Bm25(idx.chunks);
let ex = null;
if (idx.model) {
  env.allowRemoteModels = false;
  env.localModelPath = process.cwd() + '/public/models/';
  ex = await pipeline('feature-extraction', idx.model.id, { dtype: idx.model.dtype });
}
const summary = { runAt: new Date().toISOString(), model: idx.model ? `${idx.model.id.split('/')[1]} (${idx.model.dtype})` : null, total: cases.length, inScope: cases.filter((c) => c[1]).length, outOfScope: cases.filter((c) => !c[1]).length, results: {} };
for (const mode of idx.model ? ['hybrid', 'keyword'] : ['keyword']) {
  let ok = 0;
  for (const [q, want] of cases) {
    const hybrid = mode === 'hybrid';
    const qv = hybrid ? (await ex(idx.model.queryPrefix + q, { pooling: 'cls', normalize: true })).data : null;
    const sv = hybrid ? (await ex(q, { pooling: 'cls', normalize: true })).data : null;
    const fm = matchFaq(q, idx.faq, hybrid ? faqVecs : null, sv);
    const r = search(q, idx.chunks, bm, hybrid ? vecs : null, qv);
    const got = fm ? [`faq:${fm.faq.id}`] : r.kind === 'answer' ? r.hits.map((h) => h.chunk.id) : ['NOT_FOUND'];
    const good = want === null
      ? got[0] === 'NOT_FOUND'
      : want.split('|').includes(got[0]) ||
        (!fm && got.some((id) => want.split('|').includes(id))) ||
        // a Q&A answer can also surface as the top passage (keyword mode): same answer, shown with [S1]
        (!fm && want.split('|').some((w) => w.startsWith('faq:') && got[0] === `faq-${w.slice(4)}`));
    if (good) ok++;
    console.log(`${good ? 'PASS' : 'FAIL'} [${mode}] ${q.padEnd(48)} → ${got.join(', ')}`);
  }
  console.log(`== ${mode}: ${ok}/${cases.length}\n`);
  summary.results[mode] = ok;
}
// Published on /how-this-site-works, so the site reports its own measured score.
fs.mkdirSync('src/data/generated', { recursive: true });
fs.writeFileSync('src/data/generated/search-eval.json', JSON.stringify(summary, null, 1));
