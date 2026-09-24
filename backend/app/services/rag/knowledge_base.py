"""
knowledge_base.py - Logistics SOP Knowledge Base Loader (US-006, Track A: Manthan Nimodiya)

Builds the RAG retrieval index once per process from the curated SOP corpus in `services/rag/corpus/`:
    load markdown -> chunk by section -> fit TF-IDF embedder -> index chunks in the vector store

The corpus covers Hazmat (49 CFR / ADR / CMVR), driver hours-of-service and rest breaks (MTW Act 1961,
EU 561/2006, FMCSA), cold chain, vehicle load safety, exception handling and delivery SLAs.

`get_knowledge_base()` is the single entry point used by the API and, later, by the Policy Agent (Track B).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from app.core.logging import logger
from app.services.rag.embeddings import Chunk, SourceDocument, TfidfEmbedder, chunk_document, load_corpus
from app.services.rag.vector_store import InMemoryVectorStore, SearchHit, embedding_text

CORPUS_DIR = Path(__file__).parent / "corpus"

CATEGORY_LABELS: Dict[str, str] = {
    "HAZMAT": "Hazardous Materials",
    "DRIVER_REST": "Driver Hours & Rest",
    "COLD_CHAIN": "Cold Chain",
    "VEHICLE_SAFETY": "Vehicle & Load Safety",
    "OPERATIONS": "Dispatch Operations",
}


@dataclass
class KnowledgeBase:
    documents: List[SourceDocument]
    store: InMemoryVectorStore
    build_ms: float

    def search(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.0,
        categories: Optional[Sequence[str]] = None,
        doc_id: Optional[str] = None,
    ) -> List[SearchHit]:
        return self.store.search(query, top_k=top_k, min_score=min_score, categories=categories, doc_id=doc_id)

    def get_document(self, doc_id: str) -> Optional[SourceDocument]:
        return next((d for d in self.documents if d.doc_id == doc_id), None)

    @property
    def chunks(self) -> Sequence[Chunk]:
        return self.store.chunks


def build_knowledge_base(corpus_dir: Path = CORPUS_DIR) -> KnowledgeBase:
    started = time.perf_counter()
    documents = load_corpus(corpus_dir)
    chunks = [chunk for doc in documents for chunk in chunk_document(doc)]

    embedder = TfidfEmbedder().fit([embedding_text(c) for c in chunks])
    store = InMemoryVectorStore(embedder)
    store.add(chunks)

    build_ms = (time.perf_counter() - started) * 1000
    logger.info(
        f"RAG knowledge base indexed: {len(documents)} documents, {len(chunks)} chunks, "
        f"vocab={embedder.dim} terms in {build_ms:.1f} ms"
    )
    return KnowledgeBase(documents=documents, store=store, build_ms=build_ms)


@lru_cache(maxsize=1)
def get_knowledge_base() -> KnowledgeBase:
    """Process-wide singleton: the corpus is static, so the index is built lazily on first use and reused."""
    return build_knowledge_base()
