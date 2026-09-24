"""
test_rag.py - RAG Knowledge Base & Vector Store Tests (US-006, Track A: Manthan Nimodiya)

Covers:
- Corpus parsing & section-aware chunking (every chunk carries a citable doc id + § section)
- Text normalisation (domain synonyms, stemming) and TF-IDF embedding properties
- Vector store cosine ranking, top-k, category filters and empty-query handling
"""

import numpy as np
import pytest

from app.services.rag.embeddings import (
    TfidfEmbedder,
    chunk_document,
    parse_sop_markdown,
    tokenize,
)
from app.services.rag.knowledge_base import CATEGORY_LABELS, get_knowledge_base
from app.services.rag.vector_store import InMemoryVectorStore, cosine_similarity

SAMPLE_DOC = """---
doc_id: SOP-TEST-001
title: Test Policy
category: hazmat
version: 1.0
effective_date: 2026-01-01
references: Unit test fixture
---

## §1 First Rule
Hazmat loads require placards. Drivers need training.

## §2 Second Rule
Reefer temperature is logged every 15 minutes.
"""


# ==================== PARSING & CHUNKING ==================== #
def test_parse_sop_markdown_extracts_metadata_and_sections():
    doc = parse_sop_markdown(SAMPLE_DOC)
    assert doc.doc_id == "SOP-TEST-001"
    assert doc.category == "HAZMAT"  # normalised to upper case
    assert [s.number for s in doc.sections] == ["1", "2"]
    assert doc.sections[1].heading == "Second Rule"


def test_parse_rejects_document_without_front_matter():
    with pytest.raises(ValueError):
        parse_sop_markdown("## §1 Orphan section\nNo metadata here.")


def test_long_sections_are_split_into_overlapping_windows():
    doc = parse_sop_markdown(SAMPLE_DOC)
    chunks = chunk_document(doc, max_words=6, overlap_sentences=1)
    first_section = [c for c in chunks if c.section == "§1"]
    assert [c.chunk_id for c in first_section] == ["SOP-TEST-001#1.1", "SOP-TEST-001#1.2"]
    # the overlap sentence is repeated so no rule is cut in half
    assert first_section[0].text.split(". ")[-1].rstrip(".") in first_section[1].text


def test_corpus_loads_every_category_with_citable_chunks():
    kb = get_knowledge_base()
    assert len(kb.documents) >= 8
    assert {d.category for d in kb.documents} == set(CATEGORY_LABELS)
    ids = [c.chunk_id for c in kb.chunks]
    assert len(ids) == len(set(ids)), "chunk ids must be unique to be usable as citations"
    for chunk in kb.chunks:
        assert chunk.section.startswith("§") and chunk.text and chunk.doc_title


# ==================== NORMALISATION & EMBEDDINGS ==================== #
def test_tokenize_maps_domain_synonyms_and_stems():
    assert "hazmat" in tokenize("Dangerous goods transport")
    assert "hazmat" in tokenize("hazardous materials")
    assert tokenize("breaks") == tokenize("break")
    assert tokenize("driving") == tokenize("drive")
    assert "the" not in tokenize("the driver")


def test_tfidf_embeddings_are_unit_length_and_ignore_unknown_terms():
    embedder = TfidfEmbedder().fit(["hazmat placard rules", "reefer temperature log"])
    vectors = embedder.embed(["hazmat placard", "completely unrelated words"])
    assert np.isclose(np.linalg.norm(vectors[0]), 1.0)
    assert not vectors[1].any(), "out-of-vocabulary queries must embed to the zero vector"


def test_cosine_similarity_reference_values():
    a = np.array([1.0, 0.0])
    assert cosine_similarity(a, a) == pytest.approx(1.0)
    assert cosine_similarity(a, np.array([0.0, 2.0])) == pytest.approx(0.0)
    assert cosine_similarity(a, np.zeros(2)) == 0.0


# ==================== VECTOR STORE ==================== #
@pytest.fixture
def small_store():
    chunks = chunk_document(parse_sop_markdown(SAMPLE_DOC))
    from app.services.rag.vector_store import embedding_text

    embedder = TfidfEmbedder().fit([embedding_text(c) for c in chunks])
    store = InMemoryVectorStore(embedder)
    store.add(chunks)
    return store


def test_vector_store_ranks_by_descending_similarity(small_store):
    hits = small_store.search("reefer temperature logging", top_k=2)
    assert hits[0].chunk.chunk_id == "SOP-TEST-001#2"
    assert all(hits[i].score >= hits[i + 1].score for i in range(len(hits) - 1))


def test_vector_store_respects_top_k_and_empty_queries(small_store):
    assert len(small_store.search("hazmat reefer", top_k=1)) == 1
    assert small_store.search("zebra giraffe", top_k=5) == []
    assert small_store.search("hazmat", top_k=0) == []


def test_category_filter_restricts_results():
    kb = get_knowledge_base()
    hits = kb.search("cargo handling at the stop", top_k=10, categories=["COLD_CHAIN"])
    assert hits and all(h.chunk.category == "COLD_CHAIN" for h in hits)


@pytest.mark.parametrize(
    "query, expected_category",
    [
        ("HAZMAT transport requirements", "HAZMAT"),
        ("driver rest break after continuous driving", "DRIVER_REST"),
        ("vaccine temperature excursion", "COLD_CHAIN"),
        ("vehicle overloaded beyond payload", "VEHICLE_SAFETY"),
        ("truck broke down on the highway", "OPERATIONS"),
    ],
)
def test_top_result_comes_from_expected_category(query, expected_category):
    hits = get_knowledge_base().search(query, top_k=1)
    assert hits[0].chunk.category == expected_category
