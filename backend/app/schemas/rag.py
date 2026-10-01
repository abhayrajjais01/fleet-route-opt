"""Pydantic v2 Schemas for the RAG Compliance & SOP Knowledge Engine (US-006, Track A: Manthan Nimodiya)."""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

from app.services.rag.knowledge_base import CATEGORY_LABELS


# ---------------- Search ---------------- #
class PolicySearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500, description="Natural language policy question")
    top_k: int = Field(default=5, ge=1, le=20)
    categories: Optional[List[str]] = Field(
        default=None, description=f"Restrict to categories: {', '.join(CATEGORY_LABELS)}"
    )
    min_score: float = Field(default=0.05, ge=0.0, le=1.0, description="Minimum cosine similarity to return")

    @field_validator("query")
    @classmethod
    def strip_query(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Query must contain at least 2 non-space characters")
        return v

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if not v:
            return None
        normalised = [c.strip().upper() for c in v]
        unknown = sorted(set(normalised) - CATEGORY_LABELS.keys())
        if unknown:
            raise ValueError(f"Unknown categories {unknown}; expected any of {list(CATEGORY_LABELS)}")
        return normalised


class PolicyCitationResponse(BaseModel):
    """One retrieved SOP passage with everything needed to render an exact source citation."""

    chunk_id: str
    doc_id: str
    doc_title: str
    category: str
    section: str
    heading: str
    excerpt: str
    score: float = Field(..., description="Cosine similarity between query and passage (0-1)")
    version: str
    effective_date: str


class PolicySearchResponse(BaseModel):
    query: str
    categories: Optional[List[str]]
    results: List[PolicyCitationResponse]
    top_score: float
    latency_ms: float
    total_chunks_indexed: int
    embedder: str


# ---------------- Documents & Categories ---------------- #
class CategoryResponse(BaseModel):
    code: str
    label: str
    document_count: int
    chunk_count: int


class DocumentSectionResponse(BaseModel):
    section: str
    heading: str
    text: str


class PolicyDocumentSummary(BaseModel):
    doc_id: str
    title: str
    category: str
    version: str
    effective_date: str
    references: str
    section_count: int


class PolicyDocumentResponse(PolicyDocumentSummary):
    sections: List[DocumentSectionResponse]


# ---------------- Index Stats & Benchmark ---------------- #
class KnowledgeBaseStatsResponse(BaseModel):
    documents: int
    chunks: int
    vocabulary_size: int
    embedder: str
    build_ms: float


class RetrievalBenchmarkResponse(BaseModel):
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
