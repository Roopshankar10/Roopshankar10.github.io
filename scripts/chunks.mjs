// Turns the portfolio content (src/data/*.ts) into retrieval chunks.
// Each chunk = one self-contained passage + the anchor its citation chip scrolls to.
// Text is assembled only from the content files, so search can never surface a fact the site doesn't state.

const load = async () => ({
  ...(await import('../src/data/site.ts')),
  ...(await import('../src/data/content.ts')),
  ...(await import('../src/data/faq.ts')),
});

const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export async function buildChunks() {
  const { profile, heroStats, allProjects: projects, trace, skills, clusterOrder, principles, education, certifications, faq, faqAnchor } = await load();
  const C = [];
  const add = (id, section, anchor, title, text) => C.push({ id, section, anchor, title, text });

  add('about', 'About', '#hero', `${profile.name} · ${profile.title}`,
    `${profile.name} is an ${profile.title} based in ${profile.location}. ${profile.summary}`);
  if (profile.openToOpportunities)
    add('availability', 'About', '#hero', 'Open to opportunities',
      `${profile.name} is open to opportunities. He is based in ${profile.location}.`);

  add('key-results', 'About', '#hero', 'Key results',
    `Key results from the Service Instructions Assistant: ${heroStats.map((h) => `${h.value} ${h.label}`).join('; ')}.`);

  for (const p of projects) {
    const a = `#project-${p.id}`;
    const soon = p.status === 'coming-soon';
    add(`${p.id}-problem`, 'Projects', a, p.name,
      `${p.name} (${p.context}${p.date ? `, ${p.date}` : ''}${soon ? ', coming soon' : ''}). ${p.problem}`);
    const steps = p.pipeline.filter((s) => s.detail).map((s) => `${s.stage}: ${s.detail}`);
    if (steps.length)
      add(`${p.id}-architecture`, 'Projects', a, `${p.name} · architecture`,
        `Pipeline of ${p.name}: ${steps.join('; ')}. Stack: ${list(p.stack)}.`);
    add(`${p.id}-decisions`, 'Projects', a, `${p.name} · ${soon ? 'planned' : 'key decisions'}`,
      `${soon ? 'Planned for' : 'Key decisions in'} ${p.name}: ${p.decisions.join('; ')}.`);
    if (p.metrics.length)
      add(`${p.id}-evals`, 'Projects', a, `${p.name} · eval results`,
        `Evaluation results for ${p.name}: ${p.metrics.map((m) => `${m.label} ${m.value}${m.note ? ` (${m.note})` : ''}`).join('; ')}.`);
    if (p.linksNote) add(`${p.id}-links`, 'Projects', a, `${p.name} · availability`, p.linksNote);
  }

  for (const s of trace) {
    const kids = (s.children ?? []).map((c) => c.name);
    const id = s.name.startsWith('Tata') ? 'exp-tcs' : 'exp-mgit';
    const text = id === 'exp-tcs'
      ? `${profile.name} works at ${s.name} (TCS) as ${s.meta}, ${s.when}. Work there includes ${list(kids)}.`
      : `${profile.name} studied at ${s.meta}: ${s.name}, ${s.when}.`;
    add(id, 'Experience', '#experience', s.name, text);
    for (const c of s.children ?? [])
      if (c.children?.length)
        add(`exp-${c.projectId ?? c.name}`, 'Experience', '#experience', c.name,
          `${c.name} (${c.meta}) at ${s.name}: ${c.children.map((k) => `${k.name} (${k.meta})`).join('; ')}.`);
  }

  for (const cl of clusterOrder) {
    const names = skills.filter((s) => s.cluster === cl).map((s) => s.name);
    add(`skills-${cl.toLowerCase().replace(/[^a-z]+/g, '-')}`, 'Skills', '#skills', `Skills · ${cl}`,
      `${cl} skills: ${list(names)}.`);
  }

  principles.forEach((p, i) => add(`principle-${i + 1}`, 'How I build', '#principles', p.title, `${p.title}. ${p.body}`));

  for (const e of education)
    add('education', 'Education', '#education', e.degree, `Education: ${profile.name} studied ${e.degree} at ${e.school}, ${e.years}.`);
  add('certifications', 'Education', '#education', 'Certifications',
    `Certifications: ${certifications.map((c) => `${c.name} (${c.issuer})`).join('; ')}.`);

  add('notes', 'Notes', '#notes', 'Notes',
    'Draft post, coming soon: Hybrid search vs pure vector search: what I measured on 64 questions.');
  add('contact', 'Contact', '#contact', 'Contact',
    `Email ${profile.email}. LinkedIn ${profile.links.linkedin}. GitHub ${profile.links.github}. Resume available as a PDF download.`);
  add('site', 'This site', '#ask', 'How this site works',
    'This portfolio runs semantic search in the browser: content is chunked and embedded at build time with bge-small-en-v1.5, the query is embedded in a Web Worker with transformers.js, and dense and BM25 keyword results are merged with Reciprocal Rank Fusion. No server and no API keys.');

  // Q&A answers are also ordinary passages, so they can support other questions.
  for (const f of faq) add(`faq-${f.id}`, 'Q&A', faqAnchor[f.group], f.q, f.a);

  return C;
}

export async function buildSkillTexts() {
  const { skills } = await load();
  // Embedded as "skill (category)" so the projection reflects how the skill is used here.
  return skills.map((s) => ({ name: s.name, text: `${s.name} (${s.cluster})` }));
}
