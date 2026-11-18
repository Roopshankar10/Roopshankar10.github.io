// Recruiter Q&A: answers written or approved by Roop. Shown on the page (section #faq) and used by
// "Ask my portfolio": a visitor's question is matched against `q` + `alts` (question-to-question),
// which is far more reliable than matching questions against paragraphs.
// `alts` are paraphrases visitors might type, in both "you" and "he/Roop" forms.

export type Faq = { id: string; group: FaqGroup; q: string; alts: string[]; a: string };
export type FaqGroup = 'About me' | 'Logistics' | 'Experience' | 'Skills' | 'Working style';
export const faqGroups: FaqGroup[] = ['About me', 'Logistics', 'Experience', 'Skills', 'Working style'];

export const faq: Faq[] = [
  {
    id: 'about', group: 'About me', q: 'Tell me about yourself',
    alts: ['Who are you?', 'Who is Roop?', 'Introduce yourself', 'Give me a quick summary of your background', 'What do you do?'],
    a: 'I’m Roop Shankar Voruganti, an AI Engineer at TCS, currently working in Bangalore (I’m originally from Hyderabad). Since March 2025 I’ve built GenAI systems across the RAG stack: a citation-grounded Service Instructions Assistant over 10 equipment service manuals (91% hit@5 on a 64-question eval), and knowledge and traceability tools for a global biotech client’s PLM team. I care about retrieval I can measure, citations checked in code, and systems that say “not found” instead of guessing.',
  },
  {
    id: 'current', group: 'About me', q: 'Where do you work now?',
    alts: ['Where does Roop work?', 'Who is your current employer?', 'Which company do you work for?', 'Where are you based?'],
    a: 'At Tata Consultancy Services (TCS), as a Systems Engineer (AI Developer – GenAI) since March 2025. I’m currently working in Bangalore; my hometown is Hyderabad.',
  },
  {
    id: 'why-ai', group: 'About me', q: 'Why AI engineering?',
    alts: ['Why did you choose AI?', 'What got you into LLMs and RAG?', 'Why are you interested in generative AI?', 'What motivates you in AI engineering?'],
    a: 'I studied Computer Science & Data Science, and LLMs turned machine learning into systems people can simply ask questions. What keeps me interested is trust: an LLM is only as reliable as what it’s grounded on. Making that measurable, with evals, citations and refusing when unsure, is the engineering problem I enjoy most.',
  },
  {
    id: 'role', group: 'About me', q: 'What kind of role are you looking for?',
    alts: ['What job are you looking for?', 'What position do you want next?', 'What roles is Roop interested in?', 'What type of company do you want to join?', 'Are you open to new opportunities?', 'Is he open to new roles?', 'Are you interested in forward deployed engineer roles?'],
    a: 'AI Engineer, GenAI/LLM Engineer, Applied AI Engineer or Forward Deployed Engineer roles, ideally at an established product company, building LLM and RAG systems that real users depend on.',
  },
  {
    id: 'goals', group: 'About me', q: 'Where do you want to be in 2–3 years?',
    alts: ['What are your career goals?', 'Where do you see yourself in a few years?', 'What are your long-term goals?', 'What do you want to do in the future?'],
    a: 'Owning production LLM systems end to end (retrieval, evaluation, guardrails, serving and monitoring) and growing into designing them at the system-architecture level.',
  },
  {
    id: 'notice', group: 'Logistics', q: 'What is your notice period?',
    alts: ['When can you join?', 'How soon can you start?', 'What is Roop’s notice period?', 'When are you available to join?'],
    a: '90 days.',
  },
  {
    id: 'relocate', group: 'Logistics', q: 'Are you open to relocation, and remote, hybrid or office work?',
    alts: ['Are you willing to relocate?', 'Can you work remotely?', 'Are you open to hybrid work?', 'Can you work from the office?', 'Is he open to relocating?'],
    a: 'Yes, I’m open to relocating, and comfortable with remote, hybrid or office.',
  },
  {
    id: 'cities', group: 'Logistics', q: 'Which cities do you prefer?',
    alts: ['Preferred location?', 'Which city do you want to work in?', 'Which locations are you open to?', 'Preferred work location?'],
    a: 'Hyderabad and Bangalore.',
  },
  {
    id: 'reach', group: 'Logistics', q: 'What’s the best way to reach you?',
    alts: ['How can I contact you?', 'How do I get in touch with Roop?', 'What is your email?', 'Contact details?'],
    a: 'Email: roopshankarvoruganti@gmail.com.',
  },
  {
    id: 'achievement', group: 'Experience', q: 'What is your biggest achievement?',
    alts: ['What are you most proud of?', 'What is your best project?', 'Biggest accomplishment so far?', 'What is Roop’s strongest work?'],
    a: 'Building the Service Instructions Assistant on my own: hybrid retrieval that puts the right page in the top 5 for 58 of 64 questions (mean rank 1.6), an LLM router at 33/34, a 12/12 end-to-end smoke test, and every citation validated in code. And it isn’t finished: the next phase extends it further and integrates it with Teamcenter applications.',
  },
  {
    id: 'hardest', group: 'Experience', q: 'What was the hardest technical problem you solved?',
    alts: ['What was your biggest technical challenge?', 'What challenges did you face building RAG?', 'Tell me about a difficult problem you solved', 'What was the hardest part of the service manual assistant?'],
    a: 'Questions that depend on exact identifiers, like part numbers. Dense embeddings handle paraphrases well but blur exact strings. I combined BM25 keyword search (SQLite FTS5) with embeddings using Reciprocal Rank Fusion, which fixed this without tuning score weights. The two scanned manuals were another challenge, solved with OCR.',
  },
  {
    id: 'ownership', group: 'Experience', q: 'What did you own, and how big was the team?',
    alts: ['Did you work alone or in a team?', 'What was your role on the project?', 'How big was your team?', 'Did you build it yourself?'],
    a: 'I worked solo, so I owned it end to end: ingestion and OCR, structure-aware chunking, hybrid retrieval, the LLM router, citation validation, the evaluation set and the Streamlit app. With no reviewer, I wrote the evals to keep myself honest.',
  },
  {
    id: 'production', group: 'Experience', q: 'Is any of your work in production?',
    alts: ['Do you have production experience?', 'Have you deployed to production?', 'How many users use your work?', 'Has he shipped anything to production?'],
    a: 'Not yet. My work so far has been validated with evals and stakeholder demos, not live users. Shipping to production is my next step, and the public Service Manual Copilot (FastAPI, CI evals, observability, live demo) is how I’m building that experience now.',
  },
  {
    id: 'stakeholders', group: 'Experience', q: 'What did you learn working with the biotech client’s stakeholders?',
    alts: ['How do you work with stakeholders?', 'What did you learn from client work?', 'How do you do AI use-case discovery?'],
    a: 'Start from the business problem, not the model. Use-case discovery with the PLM team taught me to check feasibility early and to show a working prototype, like the JIRA–GPT integration, rather than a slide.',
  },
  {
    id: 'hallucination', group: 'Skills', q: 'How do you keep a RAG system from hallucinating?',
    alts: ['How do you prevent hallucinations?', 'How do you stop the model from making things up?', 'How do you make LLM answers reliable?', 'What guardrails do you use?', 'How do you handle questions the documents don’t answer?'],
    a: 'Ground answers in retrieved sources, validate every citation in code, route the question before searching, never mix answers across different engines, and return NOT_FOUND when the sources don’t cover it. Then measure it with an eval set instead of trusting demos.',
  },
  {
    id: 'chunking', group: 'Skills', q: 'How do you decide how to chunk documents?',
    alts: ['What is your chunking strategy?', 'How do you split documents for RAG?', 'How big should chunks be?'],
    a: 'Structure-aware: follow the document’s own sections instead of fixed-size windows, and keep document, page and section metadata on every chunk so each answer can be cited precisely.',
  },
  {
    id: 'not-rag', group: 'Skills', q: 'When would you not use RAG?',
    alts: ['When is RAG the wrong choice?', 'What are the limits of RAG?', 'RAG vs calling an API?'],
    a: 'When the answer lives in structured data or a live system. For the JIRA–GPT prototype I designed API calls to query JIRA directly instead of indexing it. I also wouldn’t use it when the task is reasoning over input the user already provided.',
  },
  {
    id: 'agents', group: 'Skills', q: 'Have you used agents or tool calling?',
    alts: ['Do you have experience with agents?', 'Have you built LLM agents?', 'Do you know function calling?', 'Has he worked with tool use?'],
    a: 'Yes. In the JIRA–GPT prototype I designed API schemas and calls so an LLM could query JIRA in natural language. In the Service Instructions Assistant, an LLM router decides how each message is handled before any search runs.',
  },
  {
    id: 'finetuning', group: 'Skills', q: 'Do you have fine-tuning experience?',
    alts: ['Have you fine-tuned a model?', 'Do you know LoRA or fine-tuning?', 'Have you trained LLMs?'],
    a: 'Not yet. My work has focused on retrieval, prompting and evaluation.',
  },
  {
    id: 'cloud', group: 'Skills', q: 'Which cloud platforms have you used?',
    alts: ['Do you know AWS?', 'Do you know Azure?', 'Do you know GCP?', 'Cloud experience?'],
    a: 'Not hands-on yet. My LLM work has run on local models (Llama 3 via Ollama).',
  },
  {
    id: 'backend', group: 'Skills', q: 'Do you know FastAPI, Docker and CI/CD?',
    alts: ['Do you know FastAPI?', 'Do you know Docker?', 'Have you set up CI/CD?', 'Backend experience?'],
    a: 'FastAPI, yes. Docker and CI/CD I’m learning now through the Service Manual Copilot.',
  },
  {
    id: 'learning', group: 'Skills', q: 'What are you learning right now?',
    alts: ['What are you currently studying?', 'What new skills are you working on?', 'What is Roop learning?'],
    a: 'System design, plus production practices (Docker, CI evals, observability) through the Service Manual Copilot.',
  },
  {
    id: 'strengths', group: 'Working style', q: 'What are your strengths?',
    alts: ['Why should we hire you?', 'Why should I hire Roop?', 'Why hire him?', 'What are you good at?', 'What makes you a strong engineer?'],
    a: 'Owning a system end to end, measuring before deciding, and building things that stay honest: cited, tested, and clear when they don’t know.',
  },
  {
    id: 'weakness', group: 'Working style', q: 'What is a weakness you are working on?',
    alts: ['What are your weaknesses?', 'What do you need to improve?', 'What is your biggest gap?'],
    a: 'Limited production experience. My work has been prototypes and internal systems, so I’m deliberately closing that gap by shipping a public, deployed project with CI and monitoring.',
  },
  {
    id: 'failure', group: 'Working style', q: 'Tell me about a time something failed and what you changed',
    alts: ['Tell me about a failure', 'What did you learn from a mistake?', 'When did something not work?'],
    a: 'Vector-only retrieval wasn’t reliable on questions with exact part numbers. Instead of tweaking prompts, I built a 64-question eval set, measured the problem, and added BM25 with Reciprocal Rank Fusion, which reached 91% hit@5.',
  },
  {
    id: 'explain', group: 'Working style', q: 'How do you explain technical work to non-technical stakeholders?',
    alts: ['How do you communicate with non-technical people?', 'How do you present results to business teams?', 'Communication skills?'],
    a: 'Show first, then explain: a live demo with clickable citations so they can check the sources themselves, then results in plain terms, like “the right page is in the top 5 for 58 of 64 questions.”',
  },
];
