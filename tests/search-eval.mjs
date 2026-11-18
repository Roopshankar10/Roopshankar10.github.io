// Eval for "Ask my portfolio": runs the same answer() pipeline as the browser, in both modes.
// Run: npm test (also runs on every build). Uses the model in public/models when present, else keyword-only.
//
// Expected value syntax:
//   'qa:<id>'         a Q&A / generated answer with that id
//   '<chunk-id>'      that passage in the top 3 (or as the top supporting passage)
//   'smalltalk'       greeting / thanks / help reply
//   'unknown'         honest "not in my skills" for an unknown technology
//   null              NOT_FOUND
//   'a|b'             any of these
import fs from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';
import { Bm25, answer, decodeEmb, normalizeQuestion } from '../src/scripts/search-core.ts';

const cases = [
  // small talk
  ['hi', 'smalltalk'], ['Hello!', 'smalltalk'], ['thanks', 'smalltalk'], ['what can I ask?', 'smalltalk'], ['Are you a bot?', 'smalltalk'],
  // same question, different pronouns
  ['Tell me about yourself', 'qa:faq-about'], ['Tell me about Roop', 'qa:faq-about'], ['who is he?', 'qa:faq-about'],
  ['What is his notice period?', 'qa:faq-notice'], ["what's Roop's notice period", 'qa:faq-notice'], ['hi, how soon can he join?', 'qa:faq-notice'],
  ['Is the candidate open to relocation?', 'qa:faq-relocate'], ['can he work remotely', 'qa:faq-relocate'],
  ['Why should we hire him?', 'qa:faq-strengths'], ['what is he good at', 'qa:faq-strengths'],
  ['How many years of experience does he have?', 'qa:exp-years'], ['is he a fresher', 'qa:exp-years'],
  ['what is his current role', 'qa:exp-role|qa:faq-current'], ['Where does Roop work?', 'qa:faq-current|qa:exp-role'],
  ['Where did he study?', 'qa:education'], ['which college', 'qa:education'],
  ['Does he have any certifications?', 'qa:certifications'], ['is he claude certified', 'qa:certifications'],
  ['Can I get his resume?', 'qa:resume'], ['send me your cv', 'qa:resume'],
  ['How can I contact him?', 'qa:faq-reach|contact'], ['what is his github', 'qa:links'],
  ['what are his skills', 'qa:skills-all'], ["what's your tech stack", 'qa:skills-all'],
  ['What projects has he worked on?', 'qa:projects-all'],
  // skills (known) and the entity guard
  ['Does he know LangChain?', 'qa:skill-langchain'], ['have you worked with FAISS', 'qa:skill-faiss'],
  ['Is he familiar with BM25?', 'qa:skill-hybrid-search-bm25-dense-rrf'], ['does roop know python', 'qa:skill-python'],
  ['experience with agents?', 'qa:faq-agents|qa:skill-agents-tool-integration'], ['Does he know Docker?', 'qa:faq-backend'],
  ['do you know AWS', 'qa:faq-cloud'], ['has he fine-tuned models', 'qa:faq-finetuning'],
  // unknown technologies → honest no
  ['Does he know Kubernetes?', 'unknown'], ['Has he worked with React Native?', 'unknown'], ['experience with Java Spring Boot', 'unknown'],
  // projects by meaning
  ['Tell me about the service manual assistant', 'qa:proj-sia'], ['which llm does the service instructions assistant use', 'qa:proj-sia-stack'],
  ['how accurate is the manual assistant', 'qa:proj-sia-results'], ['what did he do for the biotech client', 'qa:proj-biotech|qa:faq-stakeholders'],
  ['What were the eval results?', 'sia-evals|qa:proj-sia-results|key-results'], ['What is the hit@5?', 'sia-evals|key-results|qa:proj-sia-results'],
  ['What is RRF?', 'sia-architecture|principle-3|sia-decisions|skills-retrieval|qa:skill-hybrid-search-bm25-dense-rrf'],
  ['How many chunks were indexed?', 'sia-architecture|qa:proj-sia-stack|qa:proj-sia'],
  // B.Tech projects
  ['Tell me about his PUBG project', 'qa:proj-pubg'], ['did he do any fraud detection', 'qa:proj-fraud|qa:proj-fraud-results'],
  ['what was the book mood project about', 'qa:proj-book-mood|book-mood-problem'], ['what projects did he do in college', 'qa:projects-academic'],
  ['has he worked with LSTM', 'qa:proj-book-mood|book-mood-architecture|book-mood-problem'], ['does he know anomaly detection', 'qa:skill-anomaly-detection'],
  // intent phrased indirectly
  ['how does he deal with hallucinations', 'qa:faq-hallucination'], ['what was the toughest problem he solved', 'qa:faq-hardest'],
  ['did he build it alone', 'qa:faq-ownership'], ['has any of his work shipped to production', 'qa:faq-production'],
  ['what kind of job is he looking for', 'qa:faq-role'], ['is he interested in FDE roles', 'qa:faq-role'],
  ['what is he learning these days', 'qa:faq-learning'], ['what are his weaknesses', 'qa:faq-weakness'],
  // out of scope → NOT_FOUND
  ['What is his favourite food?', null], ['What is his salary expectation?', null], ['Is he married?', null], ['What is his CGPA?', null],
];

const idx = JSON.parse(fs.readFileSync('public/search-index.json', 'utf8'));
const ctx = {
  chunks: idx.chunks,
  bm25: new Bm25(idx.chunks),
  vectors: idx.model ? idx.chunks.map((c) => decodeEmb(c.emb)) : null,
  faq: idx.faq,
  faqVecs: idx.model ? idx.faq.map((f) => f.embs.map(decodeEmb)) : null,
  vocab: new Set(idx.vocab),
};
let ex = null;
if (idx.model) {
  env.allowRemoteModels = false;
  env.localModelPath = process.cwd() + '/public/models/';
  ex = await pipeline('feature-extraction', idx.model.id, { dtype: idx.model.dtype });
}
const emb = async (t) => (await ex(t, { pooling: 'cls', normalize: true })).data;

const label = (a) =>
  a.kind === 'smalltalk' ? ['smalltalk']
  : a.kind === 'qa' ? [`qa:${a.match.faq.id}`, ...a.support.map((h) => h.chunk.id)]
  : a.kind === 'unknown_tech' ? ['unknown']
  : a.kind === 'passages' ? a.hits.map((h) => h.chunk.id)
  : ['NOT_FOUND'];

const summary = {
  runAt: new Date().toISOString(),
  model: idx.model ? `${idx.model.id.split('/')[1]} (${idx.model.dtype})` : null,
  total: cases.length,
  inScope: cases.filter((c) => c[1]).length,
  outOfScope: cases.filter((c) => !c[1]).length,
  results: {},
  misses: {},
};
for (const mode of idx.model ? ['hybrid', 'keyword'] : ['keyword']) {
  let ok = 0;
  summary.misses[mode] = [];
  for (const [q, want] of cases) {
    const hybrid = mode === 'hybrid';
    const qv = hybrid ? await emb(idx.model.queryPrefix + q) : null;
    const sv = hybrid ? await emb(normalizeQuestion(q)) : null;
    const a = answer(q, hybrid ? ctx : { ...ctx, vectors: null, faqVecs: null }, qv, sv);
    const got = label(a);
    const wants = want === null ? ['NOT_FOUND'] : want.split('|');
    // qa/smalltalk/unknown/NOT_FOUND must be the answer itself; a passage id may be anywhere in the top 3.
    const good = wants.some((w) => (w.includes(':') || !want || w === 'smalltalk' || w === 'unknown' ? got[0] === w : got.includes(w)));
    if (good) ok++;
    else summary.misses[mode].push(q);
    console.log(`${good ? 'PASS' : 'FAIL'} [${mode}] ${q.padEnd(52)} → ${got.join(', ')}`);
  }
  console.log(`== ${mode}: ${ok}/${cases.length}\n`);
  summary.results[mode] = ok;
}
// Published on /how-this-site-works, so the site reports its own measured score.
fs.mkdirSync('src/data/generated', { recursive: true });
fs.writeFileSync('src/data/generated/search-eval.json', JSON.stringify(summary, null, 1));
