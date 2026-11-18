---
title: 'Hybrid search vs pure vector search: what I measured on 64 questions'
summary: 'Dense-only vs BM25-only vs both fused with RRF, on 64 hand-written questions over 10 equipment service manuals. Why exact identifiers decide it.'
draft: true
tags: [retrieval, evals, rag]
---

> **DRAFT. Not published.** Fill every `[[FILL]]` with real numbers, then set `draft: false` and add `date:`.
> Keep manual names and company specifics generic: the system is internal.

*[[FILL: date]] · ~5 min read*

When I built a RAG assistant over industrial equipment service manuals, I started with what most tutorials suggest: embed the chunks, embed the question, return the nearest neighbours. It worked well on "how do I…" questions. It failed on the questions technicians actually ask, which are full of part numbers, error codes, and torque values.

So I measured it instead of arguing about it.

## Setup

- **Corpus:** 10 service manuals, 5,232 chunks after structure-aware chunking (sections, tables and procedures kept intact). 2 manuals were scanned, so they went through OCR first.
- **Dense retriever:** `bge-small-en-v1.5` embeddings.
- **Sparse retriever:** BM25 via SQLite FTS5.
- **Hybrid:** both lists fused with Reciprocal Rank Fusion (RRF, k = [[FILL: k value]]).
- **Eval set:** 64 hand-written questions, each labelled with the chunk(s) that answer it. Metrics: **hit@5** (is a correct chunk in the top 5?) and **mean hit rank** (where the first correct chunk lands).

## Results

| Retriever | hit@5 | Mean hit rank |
|---|---|---|
| Dense only (bge-small) | [[FILL]] | [[FILL]] |
| BM25 only (FTS5) | [[FILL]] | [[FILL]] |
| **Hybrid (RRF)** | **91% (58/64)** | **1.6** |

## Where dense failed

[[FILL: 1–2 anonymised examples, e.g. a question with a part number or error code where the dense top 5 missed and BM25 caught it.]] Embeddings map "error E-214" close to every other error code. To a small embedding model, the exact token that matters looks like noise.

## Where BM25 failed

[[FILL: 1 example, e.g. a paraphrased question ("machine won't start after cleaning") where the manual uses different words.]] Keyword search has no idea that "won't start" and "fails to initialise" mean the same thing.

## Why RRF

RRF only uses ranks, not scores. So I didn't have to normalise BM25 scores against cosine similarities, which live on completely different scales. A chunk that ranks well in either list rises, and a chunk that ranks well in both rises more. It's a few lines of code and has no parameters to tune beyond k.

## The 6 misses

[[FILL: what the 6 failed questions had in common, e.g. answers split across tables, OCR noise in scanned manuals, questions needing two sections.]] These cases are my next work items, not retrieval-method problems.

## Caveats

64 questions is a small eval set, and one person wrote all of them. These numbers say "hybrid is clearly better on *this* corpus", not "hybrid always wins". What made the comparison trustworthy was that the set was fixed and re-run after every change.

## Takeaway

If your documents contain identifiers (part numbers, codes, SKUs, clause numbers), don't ship pure vector search. Add BM25, fuse with RRF, and measure. Writing the 64 questions took an afternoon and settled the decision.

*I'm rebuilding this approach in public as [Service Manual Copilot](/#project-copilot), on FAA maintenance handbooks, with the same eval harness running in CI.*
