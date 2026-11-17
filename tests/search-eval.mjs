// Retrieval eval for "Ask my portfolio": expected chunk in top 3, or NOT_FOUND for out-of-scope.
// Run: npm test (also runs on every build). Uses the model in public/models when present, else keyword-only.
import fs from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';
import { Bm25, decodeEmb, search } from '../src/scripts/search-core.ts';

const cases = [
  ['What retrieval approach does he use?', 'sia-decisions|principle-3|skills-retrieval|sia-architecture'],
  ['What were the eval results?', 'sia-evals'],
  ['Where does Roop work?', 'exp-tcs'],
  ['Which certifications does he have?', 'certifications'],
  ["How does he handle questions the docs don't cover?", 'principle-4|sia-problem'],
  ['How can I contact him?', 'contact'],
  ['What is the hit@5?', 'sia-evals'],
  ['Is he open to new roles?', 'availability'],
  ['Tell me about the biotech project', 'biotech-problem|biotech-decisions|biotech-architecture|exp-biotech'],
  ['Where did he study?', 'education|exp-mgit'],
  ['What is RRF?', 'sia-architecture|principle-3|sia-decisions|skills-retrieval'],
  ['Which LLM does the service assistant use?', 'sia-architecture'],
  ['How many chunks were indexed?', 'sia-architecture'],
  ['Does he know LangChain?', 'skills-llm-orchestration|biotech-decisions|multidoc-architecture'],
  ['Does he know Kubernetes?', null],
  ['What is his favourite food?', null],
  ['Has he worked with React Native?', null],
  ['Java Spring Boot experience', null],
  ['What is his salary expectation?', null],
];

const idx = JSON.parse(fs.readFileSync('public/search-index.json', 'utf8'));
const vecs = idx.model ? idx.chunks.map((c) => decodeEmb(c.emb)) : null;
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
    const qv = mode === 'hybrid' ? (await ex(idx.model.queryPrefix + q, { pooling: 'cls', normalize: true })).data : null;
    const r = search(q, idx.chunks, bm, mode === 'hybrid' ? vecs : null, qv);
    const got = r.kind === 'answer' ? r.hits.map((h) => h.chunk.id) : ['NOT_FOUND'];
    const good = want === null ? r.kind === 'not_found' : got.some((id) => want.split('|').includes(id));
    if (good) ok++;
    console.log(`${good ? 'PASS' : 'FAIL'} [${mode}] ${q.padEnd(48)} → ${got.join(', ')}`);
  }
  console.log(`== ${mode}: ${ok}/${cases.length}\n`);
  summary.results[mode] = ok;
}
// Published on /how-this-site-works, so the site reports its own measured score.
fs.mkdirSync('src/data/generated', { recursive: true });
fs.writeFileSync('src/data/generated/search-eval.json', JSON.stringify(summary, null, 1));
