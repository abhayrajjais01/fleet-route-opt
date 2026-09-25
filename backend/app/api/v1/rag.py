"""
rag.py - RESTful API Endpoints for the RAG Compliance & SOP Knowledge Engine (US-006, Track A: Manthan Nimodiya)

Endpoints:
- POST /rag/search: Semantic policy search returning ranked SOP passages with citations & similarity scores.
- GET  /rag/categories: Knowledge base categories (Hazmat, Driver Rest, Cold Chain, ...) with document counts.
- GET  /rag/documents: SOP library listing, optionally filtered by category.
- GET  /rag/documents/{doc_id}: Full SOP document with every numbered section (citation preview).
- GET  /rag/stats: Vector index statistics (documents, chunks, vocabulary, embedder).
- GET  /rag/benchmark: Live WikiQA-style retrieval benchmark (Recall@k, MRR, latency).

All endpoints are read-only; the knowledge base is built once per process from the curated corpus.
"""

import time
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.services.rag.evaluation import evaluate
from app.services.rag.knowledge_base import CATEGORY_LABELS, get_knowledge_base
from app.schemas.rag import (
    CategoryResponse,
    DocumentSectionResponse,
    KnowledgeBaseStatsResponse,
    PolicyCitationResponse,
    PolicyDocumentResponse,
    PolicyDocumentSummary,
    PolicySearchRequest,
    PolicySearchResponse,
    RetrievalBenchmarkResponse,
)

router = APIRouter()


# ==================== SEMANTIC POLICY SEARCH ==================== #
@router.post("/search", response_model=PolicySearchResponse, summary="Semantic search over SOPs & regulations")
def search_policies(request: PolicySearchRequest):
    """
    Embeds the query with the knowledge base's TF-IDF embedder and ranks every SOP passage by cosine similarity.
    Each result carries its source document, section number, version and similarity score so the UI (and later
    the Policy Agent) can cite the exact clause instead of paraphrasing from memory.
    """
    kb = get_knowledge_base()
    started = time.perf_counter()
    hits = kb.search(request.query, top_k=request.top_k, min_score=request.min_score, categories=request.categories)
    latency_ms = (time.perf_counter() - started) * 1000

    results = [
        PolicyCitationResponse(
            chunk_id=h.chunk.chunk_id,
            doc_id=h.chunk.doc_id,
            doc_title=h.chunk.doc_title,
            category=h.chunk.category,
            section=h.chunk.section,
            heading=h.chunk.heading,
            excerpt=h.chunk.text,
            score=h.score,
            version=h.chunk.metadata.get("version", ""),
            effective_date=h.chunk.metadata.get("effective_date", ""),
        )
        for h in hits
    ]
    return PolicySearchResponse(
        query=request.query,
        categories=request.categories,
        results=results,
        top_score=results[0].score if results else 0.0,
        latency_ms=round(latency_ms, 3),
        total_chunks_indexed=len(kb.chunks),
        embedder=kb.store.embedder.name,
    )


# ==================== LIBRARY BROWSING ==================== #
@router.get("/categories", response_model=List[CategoryResponse], summary="List knowledge base categories")
def list_categories():
    kb = get_knowledge_base()
    return [
        CategoryResponse(
            code=code,
            label=label,
            document_count=sum(1 for d in kb.documents if d.category == code),
            chunk_count=sum(1 for c in kb.chunks if c.category == code),
        )
        for code, label in CATEGORY_LABELS.items()
    ]


def _summary(doc) -> dict:
    return dict(
        doc_id=doc.doc_id,
        title=doc.title,
        category=doc.category,
        version=doc.version,
        effective_date=doc.effective_date,
        references=doc.references,
        section_count=len(doc.sections),
    )


@router.get("/documents", response_model=List[PolicyDocumentSummary], summary="List SOP documents")
def list_documents(category: Optional[str] = Query(None, description="Filter by category code, e.g. HAZMAT")):
    docs = get_knowledge_base().documents
    if category:
        docs = [d for d in docs if d.category == category.upper()]
    return [PolicyDocumentSummary(**_summary(d)) for d in docs]


@router.get("/documents/{doc_id}", response_model=PolicyDocumentResponse, summary="Get a full SOP document")
def get_document(doc_id: str):
    doc = get_knowledge_base().get_document(doc_id.upper())
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SOP document '{doc_id}' not found.")
    return PolicyDocumentResponse(
        **_summary(doc),
        sections=[DocumentSectionResponse(section=f"§{s.number}", heading=s.heading, text=s.text) for s in doc.sections],
    )


# ==================== INDEX DIAGNOSTICS ==================== #
@router.get("/stats", response_model=KnowledgeBaseStatsResponse, summary="Vector index statistics")
def get_stats():
    kb = get_knowledge_base()
    return KnowledgeBaseStatsResponse(
        documents=len(kb.documents),
        chunks=len(kb.chunks),
        vocabulary_size=kb.store.embedder.dim,
        embedder=kb.store.embedder.name,
        build_ms=round(kb.build_ms, 2),
    )


@router.get("/benchmark", response_model=RetrievalBenchmarkResponse, summary="Run the retrieval benchmark")
def run_benchmark():
    """Runs the WikiQA-style evaluation set against the live index (~2 ms) and returns Recall@k, MRR and latency."""
    return RetrievalBenchmarkResponse(**evaluate().__dict__)
