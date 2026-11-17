# Roopshankar10.github.io

Portfolio of **Roop Shankar Voruganti**, AI Engineer (Hyderabad, India): https://roopshankar10.github.io

The site is built like the systems it describes. Projects are **model cards**, experience is an **LLM trace**, skills sit in an **embedding space**, and **"Ask my portfolio"** is real retrieval-augmented search running entirely in the browser: hybrid BM25 + dense retrieval fused with RRF, cited sources, and an explicit `NOT_FOUND`. No server, no API keys, $0 hosting.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Framework | [Astro](https://astro.build) | Static HTML, zero JS by default: every fact reads without JavaScript |
| Styling | Tailwind CSS v4 + CSS variables | Dark (default) and light themes from one token set |
| Embeddings | `Xenova/bge-small-en-v1.5` (q8) via [transformers.js](https://huggingface.co/docs/transformers.js) | Same model family as the production assistant; runs in a Web Worker |
| Keyword search | BM25 (hand-written, ~80 lines) | Exact terms like `FTS5` and `hit@5` |
| Fusion | Reciprocal Rank Fusion, k = 60 | No score calibration between BM25 and cosine |
| Hosting | GitHub Pages + GitHub Actions | Free; model is cached between builds |

Lighthouse (mobile, local build): **100 / 100 / 100 / 100** for performance, accessibility, best practices and SEO.

## Run locally

```bash
npm ci --ignore-scripts   # --ignore-scripts skips optional GPU binaries
npm run dev               # http://localhost:4321  (drafts in src/content/notes are visible here)
npm run build             # index + eval + static build → dist/
npm run preview           # serve dist/
npm test                  # retrieval eval only
```

Node 22+. The first build downloads the embedding model (~34 MB) from Hugging Face into `public/models/` (git-ignored). Offline, the build still succeeds with a keyword-only index.

## How "Ask my portfolio" works

```
build  : src/data/*.ts ─▶ chunk (scripts/chunks.mjs) ─▶ embed (bge-small, Node) ─▶ public/search-index.json
                                                               └─▶ PCA of skill embeddings ─▶ skills-2d.json
browser: question ─▶ BM25 answers instantly
                 └─▶ Web Worker loads model on first use ─▶ embed query ─▶ cosine + BM25 ─▶ RRF
                     ─▶ evidence gate ─▶ top 3 passages with [S1]–[S3] citations, or NOT_FOUND
```

- **Evidence gate:** a passage counts only if it contains at least half of the question's meaningful terms, or its cosine similarity is ≥ 0.68 by itself. On this content, off-topic questions still score ~0.45–0.61, so similarity alone can't detect "not found". See `src/scripts/search-core.ts`.
- **Eval on every build:** `tests/search-eval.mjs` runs 14 answerable and 5 unanswerable questions in both modes. The score is published on `/how-this-site-works` and in the Actions run summary.
- **Self-hosted runtime:** the model and the ONNX Runtime wasm are served from this site (`/models/`, `/ort/`), not a CDN.

## Project layout

| Path | What |
|---|---|
| `src/data/site.ts` | Name, links, hero stats, photo, "open to opportunities" flag |
| `src/data/content.ts` | Projects, experience trace, skills, principles, education, certifications |
| `src/content/notes/*.md` | Notes. `draft: true` builds only in `npm run dev` |
| `src/components/` | Hero, ModelCard, Trace, SkillSpace, AskPanel, CommandPalette, Terminal, … |
| `src/scripts/search-core.ts` | BM25, RRF, evidence gate (pure, tested) |
| `src/scripts/embed.worker.ts` | transformers.js worker |
| `scripts/prepare-search.mjs` | Builds the search index and skill projection |
| `tests/search-eval.mjs` | Retrieval eval |
| `.github/workflows/deploy.yml` | Build → eval → deploy to Pages |

## Easter eggs

- `Ctrl/⌘ + K`: command palette
- `` ` ``: terminal (`help`, `whoami`, `eval --latest`, `cat resume.pdf`, `ask <question>`, …)

## Updating content

Edit `src/data/content.ts` or `src/data/site.ts` and push. The search index, terminal, trace and scatter all regenerate from the same data, so there's one place to change a fact.
