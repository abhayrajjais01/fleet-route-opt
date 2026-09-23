"""
test_rag.py - RAG Corpus Parsing, Chunking & Embedding Tests (US-006, Track A: Manthan Nimodiya)

Covers:
- Corpus parsing & section-aware chunking (every chunk carries a citable doc id + § section)
- Text normalisation (domain synonyms, stemming) and TF-IDF embedding properties
"""

import numpy as np
import pytest

from app.services.rag.embeddings import (
    TfidfEmbedder,
    chunk_document,
    parse_sop_markdown,
    tokenize,
)

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
