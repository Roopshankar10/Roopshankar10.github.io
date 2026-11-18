// Builds the question bank for "Ask my portfolio": hand-written Q&A (src/data/faq.ts) plus
// questions GENERATED from the profile data (skills, projects, experience, education, contact).
// Every generated answer is composed only from fields in src/data/*.ts, in first person.
//
// `entities`: for template questions ("Do you know X?") the question must actually mention one of
// these strings; otherwise "Do you know Kubernetes?" would match "Do you know LangChain?" by shape alone.

const load = async () => ({
  ...(await import('../src/data/site.ts')),
  ...(await import('../src/data/content.ts')),
  ...(await import('../src/data/faq.ts')),
});

const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Extra spellings visitors use for each skill (lowercase).
const SKILL_ALIASES = {
  RAG: ['rag', 'retrieval augmented generation', 'retrieval-augmented generation', 'chatbots', 'chatbot', 'question answering', 'qa systems'],
  Embeddings: ['embedding', 'embeddings', 'vector embeddings', 'bge', 'sentence embeddings'],
  FAISS: ['faiss', 'vector database', 'vector databases', 'vector db', 'vector store', 'vector search'],
  'Hybrid search (BM25 + dense, RRF)': ['hybrid search', 'hybrid retrieval', 'bm25', 'rrf', 'reciprocal rank fusion', 'keyword search'],
  'SQLite FTS5': ['sqlite', 'fts5', 'full text search', 'full-text search'],
  LLMs: ['llm', 'llms', 'large language model', 'large language models', 'gpt', 'llama'],
  LangChain: ['langchain', 'lang chain'],
  LlamaIndex: ['llamaindex', 'llama index', 'llama-index'],
  'Prompt engineering': ['prompt engineering', 'prompting', 'prompts'],
  'Agents / tool integration': ['agent', 'agents', 'agentic', 'tool calling', 'tool use', 'function calling'],
  Evaluation: ['evaluation', 'evaluations', 'evals', 'eval', 'testing llm', 'llm evaluation', 'rag evaluation'],
  Guardrails: ['guardrail', 'guardrails'],
  Python: ['python'],
  Streamlit: ['streamlit'],
  Ollama: ['ollama'],
  'scikit-learn': ['scikit-learn', 'scikit learn', 'sklearn'],
  Pandas: ['pandas'],
  NumPy: ['numpy'],
  'Machine learning': ['machine learning', 'ml'],
  'Deep learning': ['deep learning', 'neural network', 'neural networks'],
  NLP: ['nlp', 'natural language processing'],
};
const CLUSTER_PHRASE = {
  Retrieval: 'retrieval',
  'LLM orchestration': 'LLM orchestration',
  Evaluation: 'evaluation',
  'Backend / Deploy': 'backend and deployment',
  'ML / NLP': 'ML and NLP',
};
const PROJECT_ALIASES = {
  sia: ['service instructions assistant', 'service instruction assistant', 'service instructions', 'service manual assistant', 'manual assistant', 'manuals assistant', 'service manuals', 'manufacturing ai', 'tcs manufacturing', 'technician'],
  biotech: ['biotech', 'biotechnology', 'life sciences', 'plm', 'jira', 'rtm', 'traceability', 'knowledge assistant', 'enterprise genai', 'client project'],
  copilot: ['service manual copilot', 'copilot', 'faa', 'public project', 'side project', 'personal project'],
};

export async function buildQaBank() {
  const { profile, projects, trace, skills, clusterOrder, education, certifications, faq } = await load();
  const nameOf = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const B = [];

  // 1. Hand-written answers (approved by Roop)
  for (const f of faq) B.push({ id: `faq-${f.id}`, kind: 'faq', q: f.q, variants: [f.q, ...f.alts], a: f.a, anchor: `#faq-${f.id}` });

  // 2. Skills: "Do you know X?" → yes, with where it was used
  for (const s of skills) {
    const names = SKILL_ALIASES[s.name] ?? [s.name.toLowerCase()];
    const shown = s.name.replace(' (BM25 + dense, RRF)', '');
    const used = s.usedIn.map((id) => nameOf[id]).filter(Boolean);
    B.push({
      id: `skill-${slug(s.name)}`, kind: 'gen', q: `Do you know ${shown}?`, anchor: '#skills', entities: names,
      variants: [
        `Do you know ${shown}?`, `Have you worked with ${shown}?`, `What is your experience with ${shown}?`, `Are you familiar with ${shown}?`, `Have you used ${shown}?`,
        // the same questions under the other names visitors use (e.g. "BM25" for hybrid search)
        ...names.filter((a) => a !== shown.toLowerCase()).slice(0, 3).flatMap((a) => [`Do you know ${a}?`, `Are you familiar with ${a}?`]),
      ],
      a: `Yes. ${shown} is part of my ${CLUSTER_PHRASE[s.cluster]} toolkit${used.length ? `, and I used it in ${list(used)}` : ''}.`,
    });
  }
  B.push({
    id: 'skills-all', kind: 'gen', q: 'What are your skills?', anchor: '#skills',
    variants: ['What are your skills?', 'What is your tech stack?', 'What technologies do you know?', 'What tools do you use?', 'What are your technical skills?', 'Which programming languages do you know?'],
    a: clusterOrder.map((c) => `${c}: ${list(skills.filter((s) => s.cluster === c).map((s) => s.name))}.`).join(' '),
  });

  // 3. Projects
  B.push({
    id: 'projects-all', kind: 'gen', q: 'What projects have you worked on?', anchor: '#projects',
    variants: ['What projects have you worked on?', 'Tell me about your projects', 'What have you built?', 'Show me your work', 'What are your main projects?'],
    a: projects.map((p) => `${p.name} (${p.context})`).join('; ') + '.',
  });
  for (const p of projects) {
    const al = PROJECT_ALIASES[p.id] ?? [p.name.toLowerCase()];
    const soon = p.status === 'coming-soon';
    const steps = p.pipeline.filter((s) => s.detail).map((s) => s.detail);
    const results = p.metrics.length ? p.metrics.map((m) => `${m.label}: ${m.value}`).join('; ') + '.' : p.metricsNote ?? '';
    B.push({
      id: `proj-${p.id}`, kind: 'gen', q: `Tell me about ${p.name}`, anchor: `#project-${p.id}`, entities: al,
      variants: [`Tell me about ${p.name}`, `What is ${p.name}?`, `What did you build in ${p.name}?`, `Explain ${p.name}`, `What problem does ${p.name} solve?`],
      a: `${p.name} (${p.context}${soon ? ', coming soon' : ''}). ${p.problem}${p.metrics.length ? ` Results: ${results}` : ''}`,
    });
    if (steps.length)
      B.push({
        id: `proj-${p.id}-stack`, kind: 'gen', q: `What is the architecture and stack of ${p.name}?`, anchor: `#project-${p.id}`, entities: al,
        variants: [`What is the architecture of ${p.name}?`, `What tech stack did ${p.name} use?`, `How does ${p.name} work?`, `Which LLM does ${p.name} use?`, `How did you build ${p.name}?`],
        a: `${steps.join('. ')}. Stack: ${list(p.stack)}.`,
      });
    B.push({
      id: `proj-${p.id}-results`, kind: 'gen', q: `What were the results of ${p.name}?`, anchor: `#project-${p.id}`, entities: al,
      variants: [`What were the results of ${p.name}?`, `How well does ${p.name} work?`, `What are the eval results of ${p.name}?`, `How accurate is ${p.name}?`, `What metrics did ${p.name} achieve?`],
      a: results || 'No public metrics yet.',
    });
  }

  // 4. Experience (duration computed at build time, so it stays current with each deploy)
  const tcs = trace.find((s) => s.name.startsWith('Tata'));
  const start = new Date(`${tcs.start}-01`);
  const months = Math.max(0, (new Date().getFullYear() - start.getFullYear()) * 12 + new Date().getMonth() - start.getMonth());
  const dur = [Math.floor(months / 12) && `${Math.floor(months / 12)} year${Math.floor(months / 12) > 1 ? 's' : ''}`, months % 12 && `${months % 12} month${months % 12 > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
  B.push({
    id: 'exp-years', kind: 'gen', q: 'How many years of experience do you have?', anchor: '#experience',
    variants: ['How many years of experience do you have?', 'How much experience do you have?', 'How long have you been working?', 'What is your total experience?', 'Are you a fresher?'],
    a: `About ${dur} of professional experience: I joined Tata Consultancy Services as a ${tcs.meta} in March 2025.`,
  });
  B.push({
    id: 'exp-role', kind: 'gen', q: 'What is your current role?', anchor: '#experience',
    variants: ['What is your current role?', 'What is your job title?', 'What do you do at TCS?', 'What is your designation?', 'What is your current position?'],
    a: `${tcs.meta} at Tata Consultancy Services, since March 2025. My work there includes ${list((tcs.children ?? []).map((c) => c.name))}.`,
  });

  // 5. Education and certifications
  const e = education[0];
  B.push({
    id: 'education', kind: 'gen', q: 'What is your education?', anchor: '#education',
    variants: ['What is your education?', 'Where did you study?', 'What is your degree?', 'Which college did you go to?', 'Which college?', 'Which university?', 'When did you graduate?', 'What is your qualification?'],
    a: `${e.degree} from ${e.school}, ${e.years}.`,
  });
  B.push({
    id: 'certifications', kind: 'gen', q: 'Which certifications do you have?', anchor: '#education',
    variants: ['Which certifications do you have?', 'Are you certified?', 'Do you have any certifications?', 'Are you Claude certified?', 'Do you have an Anthropic certification?'],
    a: `${list(certifications.map((c) => `${c.name} (${c.issuer})`))}.`,
  });

  // 6. Resume and contact
  B.push({
    id: 'resume', kind: 'gen', q: 'Can I get your resume?', anchor: '#hero', link: { label: 'Download resume (PDF)', href: profile.links.resume },
    variants: ['Can I get your resume?', 'Send me your CV', 'Where is your resume?', 'Download resume', 'Can you share your CV?'],
    a: 'Yes, you can download my resume as a PDF.',
  });
  B.push({
    id: 'links', kind: 'gen', q: 'Where can I find your GitHub and LinkedIn?', anchor: '#contact',
    variants: ['What is your GitHub?', 'What is your LinkedIn?', 'Where can I see your code?', 'Do you have a GitHub profile?', 'Can I connect with you on LinkedIn?'],
    a: `GitHub: ${profile.links.github} · LinkedIn: ${profile.links.linkedin}`,
  });
  return B;
}

// Every word in the portfolio, so "Do you know X?" can tell a known technology from an unknown one.
export async function buildVocabulary() {
  const d = await load();
  const bank = await buildQaBank();
  const text = (JSON.stringify(d) + JSON.stringify(bank) + JSON.stringify(SKILL_ALIASES)).toLowerCase();
  return `${text} ${text.replace(/[-_/]/g, ' ')}`; // hyphenated words also count as their parts
}
