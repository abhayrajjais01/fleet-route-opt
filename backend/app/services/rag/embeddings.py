"""
embeddings.py - Document Chunking & Embedding Pipeline (US-006, Track A: Manthan Nimodiya)

Turns the logistics SOP corpus into numeric vectors that the vector store can compare with cosine similarity.

Pipeline:
1. Parse each SOP markdown file (front-matter metadata + "## §N Heading" sections).
2. Chunk the document: one chunk per section, splitting long sections into overlapping sentence windows.
3. Normalise text: lowercase, map domain synonyms ("dangerous goods" -> "hazmat"), drop stopwords, light stemming.
4. Embed: TF-IDF weighted unigrams + bigrams, L2-normalised so a dot product equals cosine similarity.

Why TF-IDF instead of a neural embedding model?
- Runs fully offline with zero API keys and no GPU / torch download (works on the free Render tier).
- Deterministic: the same query always returns the same scores, which makes retrieval testable.
- The `Embedder` protocol below lets us swap in a sentence-transformer later without touching the vector store.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Protocol, Sequence

import numpy as np


# ==================== DATA CONTAINERS ==================== #
@dataclass(frozen=True)
class SourceDocument:
    """One SOP / regulation document loaded from the corpus folder."""

    doc_id: str
    title: str
    category: str
    version: str
    effective_date: str
    references: str
    sections: List["DocumentSection"]


@dataclass(frozen=True)
class DocumentSection:
    number: str   # e.g. "3"
    heading: str  # e.g. "Placarding, Labelling and Weight Thresholds"
    text: str


@dataclass
class Chunk:
    """The unit of retrieval. Every chunk keeps enough metadata to build an exact source citation."""

    chunk_id: str  # e.g. "SOP-HZ-001#3" or "SOP-HZ-001#3.2" when a long section was split
    doc_id: str
    doc_title: str
    category: str
    section: str   # human-readable citation, e.g. "§3"
    heading: str
    text: str
    metadata: Dict[str, str] = field(default_factory=dict)


# ==================== CORPUS PARSING ==================== #
_SECTION_RE = re.compile(r"^##\s+§(?P<num>[\d.]+)\s+(?P<heading>.+)$")


def parse_sop_markdown(raw: str) -> SourceDocument:
    """Parses a corpus file: a `---` front-matter block of `key: value` lines followed by `## §N Heading` sections."""
    parts = raw.split("---", 2)
    if len(parts) < 3:
        raise ValueError("SOP document is missing its front-matter block")
    meta: Dict[str, str] = {}
    for line in parts[1].strip().splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()

    sections: List[DocumentSection] = []
    current: Dict[str, object] | None = None
    for line in parts[2].strip().splitlines():
        match = _SECTION_RE.match(line.strip())
        if match:
            if current:
                sections.append(DocumentSection(current["num"], current["heading"], " ".join(current["body"]).strip()))
            current = {"num": match["num"], "heading": match["heading"].strip(), "body": []}
        elif current is not None and line.strip():
            current["body"].append(line.strip())
    if current:
        sections.append(DocumentSection(current["num"], current["heading"], " ".join(current["body"]).strip()))

    missing = {"doc_id", "title", "category"} - meta.keys()
    if missing:
        raise ValueError(f"SOP document front-matter missing keys: {sorted(missing)}")
    return SourceDocument(
        doc_id=meta["doc_id"],
        title=meta["title"],
        category=meta["category"].upper(),
        version=meta.get("version", "1.0"),
        effective_date=meta.get("effective_date", ""),
        references=meta.get("references", ""),
        sections=sections,
    )


def load_corpus(corpus_dir: Path) -> List[SourceDocument]:
    """Loads every `*.md` SOP file in the corpus directory, sorted by filename for deterministic ordering."""
    return [parse_sop_markdown(p.read_text(encoding="utf-8")) for p in sorted(corpus_dir.glob("*.md"))]


# ==================== CHUNKING ==================== #
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def chunk_document(doc: SourceDocument, max_words: int = 120, overlap_sentences: int = 1) -> List[Chunk]:
    """
    Section-aware chunking: each `§` section is a natural citation boundary, so it becomes one chunk.
    Sections longer than `max_words` are split into sentence windows that overlap by `overlap_sentences`
    so that a rule spanning two sentences is never cut in half.
    """
    chunks: List[Chunk] = []
    for sec in doc.sections:
        base = dict(
            doc_id=doc.doc_id,
            doc_title=doc.title,
            category=doc.category,
            section=f"§{sec.number}",
            heading=sec.heading,
            metadata={"version": doc.version, "effective_date": doc.effective_date},
        )
        if len(sec.text.split()) <= max_words:
            chunks.append(Chunk(chunk_id=f"{doc.doc_id}#{sec.number}", text=sec.text, **base))
            continue

        sentences = _SENTENCE_SPLIT_RE.split(sec.text)
        windows: List[List[str]] = []
        window: List[str] = []
        for sentence in sentences:
            if window and len(" ".join(window + [sentence]).split()) > max_words:
                windows.append(window)
                window = window[-overlap_sentences:] if overlap_sentences else []
            window.append(sentence)
        if window:
            windows.append(window)
        for i, win in enumerate(windows, start=1):
            chunks.append(Chunk(chunk_id=f"{doc.doc_id}#{sec.number}.{i}", text=" ".join(win), **base))
    return chunks


# ==================== TEXT NORMALISATION ==================== #
# Domain synonyms are rewritten to one canonical token so "dangerous goods" and "hazmat" match each other.
_SYNONYMS: Sequence[tuple[str, str]] = (
    (r"\bdangerous goods?\b", "hazmat"),
    (r"\bhazardous (?:materials?|goods|substances?|cargo)\b", "hazmat"),
    (r"\bhazchem\b", "hazmat"),
    (r"\bhours[- ]of[- ]service\b", "hos"),
    (r"\bworking hours?\b", "hos"),
    (r"\bdriving hours?\b", "hos driving"),
    (r"\brefrigerated (?:vehicles?|trucks?|units?)\b", "reefer"),
    (r"\bcold[- ]chain\b", "coldchain"),
    (r"\btemperature[- ]controlled\b", "coldchain"),
    (r"\bfridge\b", "reefer"),
    (r"\b(?:petrol|gasoline|diesel|fuel|paint|solvents?)\b", "flammable liquid"),
    (r"\bbroke down\b|\bbroken down\b", "breakdown"),
    (r"\bbreaks? down\b", "breakdown"),
    (r"\bnot (?:at )?home\b|\bnot available\b|\bunavailable\b", "absent"),
    (r"\bon[- ]time in[- ]full\b", "otif"),
    (r"\bservice level agreements?\b", "sla"),
    (r"\bkgs?\b|\bkilograms?\b", "kg"),
    (r"\bplacards?\b|\borange[- ]coloured plates?\b", "placard"),
    (r"\btired(?:ness)?\b|\bdrowsy\b|\bsleepy\b", "fatigue"),
)

_STOPWORDS = frozenset(
    """a an and are as at be been before being by can could do does for from had has have how i if in into is it its
    may me must my no not of on or our shall should so such than that the their them then there these they this to
    under until up was we were what when where which while who whom why will with within would you your all any each
    every per via also only more most other same""".split()
)

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_\-]*")


def _stem(token: str) -> str:
    """
    Tiny suffix stripper (a cut-down Porter stemmer): maps 'breaks'/'break', 'driving'/'drive' and
    'loaded'/'load' to the same stem without an NLP dependency. Stems are only compared with each other,
    so they do not need to be real words.
    """
    if len(token) > 4 and token.endswith("ies"):
        token = token[:-3] + "y"
    elif len(token) > 3 and token.endswith("s") and not token.endswith(("ss", "us", "is")):
        token = token[:-1]
    if len(token) > 5 and token.endswith("ing"):
        token = token[:-3]
    elif len(token) > 5 and token.endswith("ed") and not token.endswith("eed"):
        token = token[:-2]
    if len(token) > 4 and token.endswith("e"):
        token = token[:-1]
    return token


def tokenize(text: str) -> List[str]:
    """Normalises text into the token stream used for both documents and queries."""
    text = text.lower().replace("§", " ")
    for pattern, replacement in _SYNONYMS:
        text = re.sub(pattern, replacement, text)
    return [_stem(t) for t in _TOKEN_RE.findall(text) if t not in _STOPWORDS]


def _with_bigrams(tokens: List[str]) -> List[str]:
    return tokens + [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]


# ==================== EMBEDDERS ==================== #
class Embedder(Protocol):
    """Interface every embedding backend must satisfy (TF-IDF today; a neural model can be plugged in later)."""

    name: str
    dim: int

    def fit(self, texts: Sequence[str]) -> "Embedder": ...
    def embed(self, texts: Sequence[str]) -> np.ndarray: ...


class TfidfEmbedder:
    """
    TF-IDF vectoriser over unigrams + bigrams.

    weight(term, doc) = (1 + log tf) * idf,   idf = log((1 + N) / (1 + df)) + 1
    Each row is L2-normalised, so cosine similarity between two texts is just a dot product.
    Query terms that never appear in the corpus are ignored (they cannot be grounded in any SOP).
    """

    name = "tfidf-bigram-v1"

    def __init__(self) -> None:
        self.vocab: Dict[str, int] = {}
        self.idf: np.ndarray = np.zeros(0, dtype=np.float32)

    @property
    def dim(self) -> int:
        return len(self.vocab)

    def fit(self, texts: Sequence[str]) -> "TfidfEmbedder":
        doc_freq: Counter[str] = Counter()
        for text in texts:
            doc_freq.update(set(_with_bigrams(tokenize(text))))
        self.vocab = {term: i for i, term in enumerate(sorted(doc_freq))}
        n_docs = len(texts)
        self.idf = np.array(
            [math.log((1 + n_docs) / (1 + doc_freq[t])) + 1.0 for t in sorted(doc_freq)], dtype=np.float32
        )
        return self

    def embed(self, texts: Sequence[str]) -> np.ndarray:
        matrix = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row, text in enumerate(texts):
            for term, tf in Counter(_with_bigrams(tokenize(text))).items():
                col = self.vocab.get(term)
                if col is not None:
                    matrix[row, col] = (1.0 + math.log(tf)) * self.idf[col]
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return matrix / norms
