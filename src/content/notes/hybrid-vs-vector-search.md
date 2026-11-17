---
title: 'Hybrid search vs pure vector search: what I measured on 64 questions'
summary: 'Same corpus, same questions, three retrievers: BM25, dense vectors, and both fused with RRF. Where pure vectors miss, and why exact identifiers decide it.'
draft: true
tags: [retrieval, evals, rag]
---

> **DRAFT.** The hybrid numbers are measured. The BM25-only and vector-only numbers marked ≈ are
> **approximate estimates, not measurements**. Re-run them on the same 64 questions and replace them
> before publishing, or keep the "estimate" label. Remaining `[TBD]`s need your own findings.
> Keep examples generic or synthetic: no internal manual text, questions, part numbers or screenshots.

## TL;DR

- On 64 labelled retrieval questions over 10 equipment service manuals, hybrid retrieval (BM25 + dense, fused with RRF) put the right page in the top 5 for **58/64 (91%)**, with a mean hit rank of **1.6**.
- Pure vector search: **≈45/64 (≈70%)**. BM25 alone: **≈50/64 (≈78%)**. *(Estimates; see note above.)*
- Each retriever alone misses questions the other one catches; fusing them recovers most of both.

## The setup

- **Corpus:** 10 service manuals (engines, generator sets, aircraft maintenance), 5,232 chunks, including 2 scanned manuals read with OCR.
- **Chunking:** structure-aware: chunks follow the manuals' own sections.
- **Questions:** 64 retrieval questions, each labelled with the page that answers it. **[TBD: how they were written and labelled]**
- **Metric:** hit@5, meaning the labelled page appears in the top 5 results. Plus mean rank of the first hit.

## The three retrievers

| Retriever | How | hit@5 | Mean hit rank |
|---|---|---|---|
| BM25 only | SQLite FTS5 | ≈50/64 (≈78%)* | ≈2.1* |
| Dense only | bge-small-en-v1.5, local | ≈45/64 (≈70%)* | ≈2.4* |
| Hybrid | both, merged with Reciprocal Rank Fusion | **58/64 (91%)** | **1.6** |

\* Approximate estimates, not measured. Hybrid row is measured.

## Where pure vectors miss

- **[TBD: pattern 1].** For example: questions that hinge on an exact identifier. Use a synthetic one, like "torque spec for part ABC-1234".
- **[TBD: pattern 2]**
- Why: embeddings are good at paraphrase and bad at "this exact string". BM25 is the opposite.

## Why RRF instead of a weighted score

- BM25 scores and cosine similarities live on different scales; weighting them means tuning a constant that drifts with the corpus.
- RRF only uses rank positions, so there's nothing to calibrate. **[TBD: did you try weighted fusion? numbers?]**

## The 6 misses

- **[TBD: what the 6 hybrid misses have in common, e.g. OCR noise, tables, cross-page answers]**

## What I'd do next

- **[TBD: e.g. reranker, better OCR on scanned manuals, more questions]**

## Takeaway

Evals before opinions: measure on your own questions before choosing a retriever. For manuals full of identifiers, hybrid wasn't optional.
