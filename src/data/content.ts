// Portfolio content. RULE: only facts from Roop's brief. No invented numbers,
// dates, employers or skills. Anything unknown is left empty and shown as such.
// Confidentiality: employer/client work is described only at the level of the brief.

export type PipelineStep = {
  stage: 'ingest' | 'chunk' | 'embed' | 'retrieve' | 'generate' | 'validate' | 'route';
  detail: string;
};

export type Metric = {
  label: string;
  value: string; // as displayed, e.g. "58/64"
  ratio?: number; // 0..1 → drawn as a bar; omit for non-ratio stats (e.g. mean rank)
  note?: string;
};

export type Project = {
  id: string;
  name: string;
  context: string;
  status: 'shipped' | 'prototype' | 'coming-soon';
  problem: string;
  pipeline: PipelineStep[];
  decisions: string[];
  metrics: Metric[];
  metricsNote?: string;
  stack: string[];
  links: { label: string; href: string | null }[];
  linksNote?: string;
};

export const projects: Project[] = [
  {
    id: 'sia',
    name: 'Service Instructions Assistant',
    context: 'TCS · internal Manufacturing AI initiative',
    status: 'shipped',
    problem:
      "Technicians need answers from 10 equipment service manuals (engines, generator sets, aircraft maintenance), with a document, page and section citation for every answer, and an explicit NOT_FOUND when the manuals don't cover the question.",
    pipeline: [
      { stage: 'ingest', detail: '10 manuals, incl. 2 scanned manuals read with OCR' },
      { stage: 'chunk', detail: 'Structure-aware chunking → 5,232 chunks' },
      { stage: 'embed', detail: 'Local BGE embeddings (bge-small-en-v1.5)' },
      { stage: 'route', detail: 'LLM router runs before search' },
      { stage: 'retrieve', detail: 'SQLite FTS5/BM25 + dense, merged with Reciprocal Rank Fusion' },
      { stage: 'generate', detail: 'Llama 3 via Ollama behind an Azure API Management gateway' },
      { stage: 'validate', detail: 'Citations [S1–S5] validated in code' },
    ],
    decisions: [
      'Hybrid retrieval (BM25 + dense with RRF) over pure vector search',
      'SQLite registry as the source of truth',
      'Structure-aware chunking',
      'LLM router before search',
      'Per-engine answers are never mixed',
      'Explicit NOT_FOUND when the manuals don’t cover a question',
    ],
    metrics: [
      { label: 'Retrieval hit@5', value: '58/64 · 91%', ratio: 58 / 64, note: 'right page in top 5' },
      { label: 'Mean hit rank', value: '1.6' },
      { label: 'End-to-end smoke test', value: '12/12', ratio: 1 },
      { label: 'LLM router accuracy', value: '33/34', ratio: 33 / 34, note: 'labelled messages' },
    ],
    stack: [
      'Python', 'bge-small-en-v1.5', 'SQLite FTS5', 'BM25', 'RRF', 'OCR',
      'Llama 3', 'Ollama', 'Azure API Management', 'Streamlit',
    ],
    links: [],
    linksNote: 'Internal project · served as a Streamlit app with streaming and usage/feedback logging. No public code or demo.',
  },
  {
    id: 'biotech',
    name: 'Enterprise GenAI for a global biotech client',
    context: 'TCS · PLM team',
    status: 'shipped',
    problem:
      'Give a PLM team natural-language access to enterprise knowledge and project data, and surface traceability gaps between requirement specs, design specs and ALM artifacts.',
    pipeline: [
      { stage: 'ingest', detail: 'Enterprise knowledge sources' },
      { stage: 'embed', detail: 'Embeddings for semantic retrieval' },
      { stage: 'retrieve', detail: 'FAISS semantic retrieval' },
      { stage: 'generate', detail: 'LangChain-orchestrated answers' },
    ],
    decisions: [
      'RAG Knowledge Assistant (LangChain + FAISS) for semantic retrieval from enterprise knowledge sources',
      'Requirement Traceability Matrix (RTM) Validation Solution comparing requirement specs, design specs and ALM artifacts',
      'JIRA–GPT integration prototype for natural-language access to JIRA data',
      'Worked with stakeholders on AI use-case discovery and feasibility',
    ],
    metrics: [],
    metricsNote: 'Client work · no public metrics.',
    stack: ['Python', 'LangChain', 'FAISS', 'LLMs', 'JIRA'],
    links: [],
    linksNote: 'Client work · no public code or demo.',
  },
  {
    id: 'copilot',
    name: 'Service Manual Copilot',
    context: 'Public project · in progress',
    status: 'coming-soon',
    problem: 'Production-grade RAG over public FAA maintenance handbooks, built in the open.',
    pipeline: [
      { stage: 'ingest', detail: 'Public FAA maintenance handbooks' },
      { stage: 'chunk', detail: '' },
      { stage: 'embed', detail: '' },
      { stage: 'retrieve', detail: '' },
      { stage: 'generate', detail: '' },
      { stage: 'validate', detail: '' },
    ],
    decisions: ['FastAPI service', 'Docker', 'CI evals', 'Observability', 'Live demo'],
    metrics: [],
    metricsNote: 'Evals will run in CI and publish here.',
    stack: ['Python', 'FastAPI', 'Docker'],
    links: [
      { label: 'Live demo', href: null },
      { label: 'GitHub', href: null },
    ],
  },
];

// ---------- Experience as a trace ----------
export type Span = {
  name: string;
  meta: string;
  start?: string; // YYYY-MM; omitted when the brief gives no date
  end?: string | 'present';
  when?: string; // displayed date text, exactly as in the brief
  children?: Span[];
  projectId?: string;
};

export const trace: Span[] = [
  {
    name: 'B.Tech, Computer Science & Data Science',
    meta: 'Mahatma Gandhi Institute of Technology, Hyderabad',
    start: '2020-01',
    end: '2024-12',
    when: '2020–2024',
  },
  {
    name: 'Tata Consultancy Services',
    meta: 'Systems Engineer (AI Developer – GenAI)',
    start: '2025-03',
    end: 'present',
    when: 'Mar 2025–present',
    children: [
      { name: 'Service Instructions Assistant', meta: 'internal Manufacturing AI initiative', projectId: 'sia' },
      {
        name: 'Enterprise GenAI · global biotech client',
        meta: 'PLM team',
        projectId: 'biotech',
        children: [
          { name: 'RAG Knowledge Assistant', meta: 'LangChain + FAISS' },
          { name: 'RTM Validation Solution', meta: 'traceability gaps across specs and ALM artifacts' },
          { name: 'JIRA–GPT integration', meta: 'prototype' },
          { name: 'AI use-case discovery', meta: 'with stakeholders' },
        ],
      },
    ],
  },
];

// ---------- Skills ----------
export type SkillCluster = 'Retrieval' | 'LLM orchestration' | 'Evaluation' | 'Backend / Deploy' | 'ML / NLP';

export const skills: { name: string; cluster: SkillCluster; usedIn: string[] }[] = [
  { name: 'RAG', cluster: 'Retrieval', usedIn: ['sia', 'biotech'] },
  { name: 'Embeddings', cluster: 'Retrieval', usedIn: ['sia', 'biotech'] },
  { name: 'FAISS', cluster: 'Retrieval', usedIn: ['biotech'] },
  { name: 'Hybrid search (BM25 + dense, RRF)', cluster: 'Retrieval', usedIn: ['sia'] },
  { name: 'SQLite FTS5', cluster: 'Retrieval', usedIn: ['sia'] },
  { name: 'LLMs', cluster: 'LLM orchestration', usedIn: ['sia', 'biotech'] },
  { name: 'LangChain', cluster: 'LLM orchestration', usedIn: ['biotech'] },
  { name: 'LlamaIndex', cluster: 'LLM orchestration', usedIn: [] },
  { name: 'Prompt engineering', cluster: 'LLM orchestration', usedIn: ['sia', 'biotech'] },
  { name: 'Agents / tool integration', cluster: 'LLM orchestration', usedIn: ['biotech'] },
  { name: 'Evaluation', cluster: 'Evaluation', usedIn: ['sia'] },
  { name: 'Guardrails', cluster: 'Evaluation', usedIn: ['sia'] },
  { name: 'Python', cluster: 'Backend / Deploy', usedIn: ['sia', 'biotech'] },
  { name: 'Streamlit', cluster: 'Backend / Deploy', usedIn: ['sia'] },
  { name: 'Ollama', cluster: 'Backend / Deploy', usedIn: ['sia'] },
  { name: 'scikit-learn', cluster: 'ML / NLP', usedIn: [] },
  { name: 'Pandas', cluster: 'ML / NLP', usedIn: [] },
  { name: 'NumPy', cluster: 'ML / NLP', usedIn: [] },
  { name: 'Machine learning', cluster: 'ML / NLP', usedIn: [] },
  { name: 'Deep learning', cluster: 'ML / NLP', usedIn: [] },
  { name: 'NLP', cluster: 'ML / NLP', usedIn: [] },
];

export const clusterOrder: SkillCluster[] = ['Retrieval', 'LLM orchestration', 'Evaluation', 'Backend / Deploy', 'ML / NLP'];

// ---------- How I build ----------
export const principles = [
  {
    title: 'Citations validated in code',
    body: 'The model doesn’t get the last word on its sources. Every [S1–S5] citation is checked in code before an answer ships.',
  },
  {
    title: 'Evals before opinions',
    body: 'Retrieval hit@5, a smoke test and router accuracy on labelled messages decide what changes, not a demo that looked good once.',
  },
  {
    title: 'Hybrid retrieval beats pure vectors on part numbers',
    body: 'Exact identifiers are where keyword search earns its place. BM25 and dense results are merged with Reciprocal Rank Fusion.',
  },
  {
    title: '“Not found” is a feature',
    body: 'When the sources don’t cover a question, the system says NOT_FOUND instead of guessing.',
  },
  {
    title: 'Ship with tests and baselines',
    body: 'An end-to-end smoke test runs before anything ships, and every change is measured against a baseline it has to beat.',
  },
];

// ---------- Education & certifications ----------
export const education = [
  {
    degree: 'B.Tech, Computer Science & Data Science',
    school: 'Mahatma Gandhi Institute of Technology, Hyderabad',
    years: '2020–2024',
  },
];

export const certifications = [
  { name: 'Claude Certified Architect – Professional', issuer: 'Anthropic' },
  { name: 'Claude Certified Developer – Foundations', issuer: 'Anthropic' },
];
