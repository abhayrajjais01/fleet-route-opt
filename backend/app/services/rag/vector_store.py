"""
vector_store.py - In-Memory Vector Index with Cosine Similarity Search (US-006, Track A: Manthan Nimodiya)

Stores one L2-normalised embedding row per chunk in a single NumPy matrix. Because every row has unit length,
cosine similarity for a query is one matrix-vector product:  scores = M @ q   (O(n * d), ~1 ms for this corpus).

Supports:
- top-k retrieval with a minimum similarity cut-off
- metadata filtering by category (HAZMAT, DRIVER_REST, COLD_CHAIN, ...) and by document id

The public interface (add / search / __len__) is deliberately small so it can later be backed by PgVector
without changing the API layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence

import numpy as np

from app.services.rag.embeddings import Chunk, Embedder


@dataclass(frozen=True)
class SearchHit:
    chunk: Chunk
    score: float  # cosine similarity in [0, 1] (TF-IDF vectors are non-negative)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Reference cosine similarity for two raw (not necessarily normalised) vectors."""
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom else 0.0


class InMemoryVectorStore:
    def __init__(self, embedder: Embedder) -> None:
        self.embedder = embedder
        self._chunks: List[Chunk] = []
        self._matrix: np.ndarray = np.zeros((0, 0), dtype=np.float32)

    def __len__(self) -> int:
        return len(self._chunks)

    @property
    def chunks(self) -> Sequence[Chunk]:
        return tuple(self._chunks)

    def add(self, chunks: Iterable[Chunk]) -> None:
        """Embeds and indexes chunks. The embedder must already be fitted on the corpus vocabulary."""
        new_chunks = list(chunks)
        if not new_chunks:
            return
        vectors = self.embedder.embed([embedding_text(c) for c in new_chunks])
        self._matrix = vectors if not self._chunks else np.vstack([self._matrix, vectors])
        self._chunks.extend(new_chunks)

    def search(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.0,
        categories: Optional[Sequence[str]] = None,
        doc_id: Optional[str] = None,
    ) -> List[SearchHit]:
        """Returns up to `top_k` chunks ordered by descending cosine similarity to the query."""
        if not self._chunks or top_k <= 0:
            return []
        query_vec = self.embedder.embed([query])[0]
        if not query_vec.any():
            return []  # no query term exists in the knowledge base -> nothing can be grounded

        scores = self._matrix @ query_vec
        mask = np.ones(len(self._chunks), dtype=bool)
        if categories:
            wanted = {c.upper() for c in categories}
            mask &= np.array([c.category in wanted for c in self._chunks])
        if doc_id:
            mask &= np.array([c.doc_id == doc_id for c in self._chunks])
        mask &= (scores > 0) & (scores >= min_score)
        scores = np.where(mask, scores, -1.0)

        # Stable sort (mergesort) keeps corpus order on ties so results are fully deterministic.
        order = np.argsort(-scores, kind="mergesort")[:top_k]
        return [SearchHit(self._chunks[i], round(float(scores[i]), 4)) for i in order if mask[i]]


def embedding_text(chunk: Chunk) -> str:
    """
    Text actually embedded for a chunk. The document title and section heading carry strong topical signal
    (e.g. "Hazardous Materials ... Transport Policy"), so they are prepended to the section body.
    """
    return f"{chunk.doc_title}. {chunk.heading}. {chunk.text}"
