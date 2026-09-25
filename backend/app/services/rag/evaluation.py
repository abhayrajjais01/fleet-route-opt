"""
evaluation.py - Retrieval Benchmark for the RAG Knowledge Base (US-006, Track A: Manthan Nimodiya)

Scores the retriever against the WikiQA-style question set in `eval_set.json`:
- Recall@k : share of answerable questions whose correct passage appears in the top-k results
- MRR      : mean reciprocal rank of the first correct passage (1.0 = always ranked first)
- Latency  : mean / p95 search time in milliseconds (target < 100 ms, see Week 15 hardening)
- Unanswerable top score: highest similarity returned for questions the corpus cannot answer.
  This is the evidence used to pick the zero-hallucination similarity threshold (Week 7 guardrail).

Run from `backend/`:  python -m app.services.rag.evaluation
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List

from app.services.rag.knowledge_base import KnowledgeBase, get_knowledge_base

EVAL_SET_PATH = Path(__file__).parent / "eval_set.json"


@dataclass
class RetrievalReport:
    answerable: int
    unanswerable: int
    recall_at_1: float
    recall_at_3: float
    mrr: float
    mean_latency_ms: float
    p95_latency_ms: float
    min_answerable_top_score: float
    max_unanswerable_top_score: float
    misses: List[str]


def evaluate(kb: KnowledgeBase | None = None, k: int = 3) -> RetrievalReport:
    kb = kb or get_knowledge_base()
    questions = json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))["questions"]

    hits_at_1 = hits_at_k = 0
    reciprocal_ranks: List[float] = []
    latencies: List[float] = []
    answerable_top: List[float] = []
    unanswerable_top: List[float] = [0.0]
    misses: List[str] = []

    for item in questions:
        started = time.perf_counter()
        results = kb.search(item["question"], top_k=10)
        latencies.append((time.perf_counter() - started) * 1000)
        top_score = results[0].score if results else 0.0

        relevant = set(item["relevant"])
        if not relevant:
            unanswerable_top.append(top_score)
            continue

        answerable_top.append(top_score)
        ranked_ids = [r.chunk.chunk_id for r in results]
        rank = next((i + 1 for i, cid in enumerate(ranked_ids) if cid in relevant), None)
        reciprocal_ranks.append(1.0 / rank if rank else 0.0)
        hits_at_1 += rank == 1
        if rank and rank <= k:
            hits_at_k += 1
        else:
            misses.append(f"{item['question']} -> got {ranked_ids[:k]}")

    n = len(reciprocal_ranks)
    latencies.sort()
    return RetrievalReport(
        answerable=n,
        unanswerable=len(unanswerable_top) - 1,
        recall_at_1=round(hits_at_1 / n, 3),
        recall_at_3=round(hits_at_k / n, 3),
        mrr=round(sum(reciprocal_ranks) / n, 3),
        mean_latency_ms=round(sum(latencies) / len(latencies), 3),
        p95_latency_ms=round(latencies[int(0.95 * (len(latencies) - 1))], 3),
        min_answerable_top_score=round(min(answerable_top), 4),
        max_unanswerable_top_score=round(max(unanswerable_top), 4),
        misses=misses,
    )


if __name__ == "__main__":
    report = evaluate()
    for key, value in report.__dict__.items():
        print(f"{key:>28}: {value}")
