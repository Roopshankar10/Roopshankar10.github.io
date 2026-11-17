// Single source of truth for profile facts. Every page, the search index (M3)
// and the terminal (M5) read from here, so a fact is edited in one place only.

export const profile = {
  name: 'Roop Shankar Voruganti',
  title: 'AI Engineer',
  location: 'Hyderabad, India',
  openToOpportunities: true,
  // Put your photo at public/photo.jpg (square, ~600px) and set this to '/photo.jpg'.
  photo: null as string | null,
  tagline:
    'Building Generative AI systems with LLMs, Retrieval-Augmented Generation and LangChain orchestration.',
  summary:
    'AI Engineer building Generative AI systems with LLMs, Retrieval-Augmented Generation (RAG) and LangChain orchestration; works across the RAG stack — embeddings, vector and keyword search, LLM orchestration, evaluation and guardrails.',
  email: 'roopshankarvoruganti@gmail.com',
  links: {
    github: 'https://github.com/Roopshankar10',
    linkedin: 'https://www.linkedin.com/in/roopshankarvoruganti',
    resume: '/resume.pdf',
  },
} as const;

// Hero stats chips: each value comes straight from the brief.
export const heroStats = [
  { value: '91%', label: 'hit@5' },
  { value: '33/34', label: 'router accuracy' },
  { value: '10', label: 'manuals indexed' },
] as const;

// Section order = recruiter scroll order.
export const sections = [
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'skills', label: 'Skills' },
  { id: 'principles', label: 'How I build' },
  { id: 'education', label: 'Education' },
  { id: 'notes', label: 'Notes' },
  { id: 'contact', label: 'Contact' },
] as const;
