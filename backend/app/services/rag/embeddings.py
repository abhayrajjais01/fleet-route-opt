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
# Domain thesaurus: everyday words dispatchers and drivers use, rewritten to the vocabulary the SOPs use, so
# "the fridge truck got too warm" finds the temperature-excursion rule. Applied to documents and queries
# alike, in order, after lower-casing. Replacements keep the original word where the SOPs also use it.
_SYNONYMS: Sequence[tuple[str, str]] = (
    # --- hazardous materials ---
    (r"\bdangerous (?:goods?|cargo|loads?)\b", "hazmat"),
    (r"\bhazardous (?:materials?|goods|substances?|cargo)\b", "hazmat"),
    (r"\bhazchem\b", "hazmat"),
    (r"\b(?:chemicals?|acids?|ammonia|chlorine|corrosives?|corrosive cargo|paint thinners?|solvents?|lithium batter(?:y|ies)|gas cylinders?|lpg|explosives?)\b",
     lambda m: f"{m.group(0)} hazmat"),
    (r"\bflammables?\b", "flammable"),
    (r"\b(?:tankers?)\b", "tanker hazmat"),
    (r"\b(?:orange[- ]coloured plates?|orange plates?|hazard signs?|placards?)\b", "placard"),
    (r"\b(?:hazard labels?|warning labels?)\b", "label placard"),
    (r"\b(?:paperwork|papers|documents?)\b", "shipping papers document"),
    (r"\b(?:spill(?:ed|s)?|leak(?:ing|s|ed)?|overturned|rolled over)\b", "spill leak incident"),
    (r"\b(?:stand back|keep (?:people )?away|how far back|evacuation radius|radius)\b", "isolation distance evacuation"),
    (r"\b(?:control room|head office|the office)\b", "dispatch"),
    (r"\b(?:government|authorit(?:y|ies)|regulators?|police)\b", "authority regulatory"),
    (r"\b(?:clean[- ]?up|decontaminat\w*)\b", "decontaminate"),
    (r"\b(?:extinguishers?|spill kits?)\b", "extinguisher equipment"),
    (r"\b(?:unattended|left alone|dhaba|park(?:ed|ing)? overnight)\b", "parking attendance unattended"),
    # --- driver hours, fatigue, fitness ---
    (r"\bhours[- ]of[- ]service\b", "hos"),
    (r"\b(?:working|work|driving) (?:hours?|limits?|time)\b", "hos driving"),
    (r"\b(?:how many hours|hours (?:a|per) day|legal hours|hour limits?|hour rules?|overtime)\b", "hos driving"),
    (r"\b(?:tachographs?|logbooks?|eld)\b", "tachograph electronic logging"),
    (r"\b(?:exceed(?:s|ed|ing)?|go(?:es)? over|drove too long|driving too long|past the (?:legal )?(?:hours|limit))\b", "exceed violation"),
    (r"\b(?:written down|write down|note(?:d)? down)\b", "logged"),
    (r"\b(?:told|tell|inform(?:ed)?|let \w+ know)\b", "notify"),
    (r"\b(?:how quickly|how fast|how soon)\b", "within minutes"),
    (r"\b(?:germany|france|spain|italy|europe(?:an)?|eu)\b", "eu european"),
    (r"\b(?:usa|u\.s\.|united states|americans?|us trucker)\b", "us fmcsa"),
    (r"\b(?:india|indian)\b", "india"),
    (r"\btired(?:ness)?\b|\bdrowsy\b|\bsleepy\b|\byawn\w*|\bdozing\b|\bnodding off\b", "fatigue"),
    (r"\bdrift(?:ing|s|ed)? (?:across|out of) lanes?\b", "fatigue drifting lane"),
    (r"\b(?:drink|drinking|drunk|alcohol|hangover|medication|medicines? that|cough syrup)\b", "alcohol medication fit duty"),
    (r"\b(?:[0-4](?::\d\d)? ?am|midnight|overnight|late at night|night time)\b", "night"),
    (r"\b(?:between (?:two )?shifts|start again|back[- ]to[- ]back|rest gap|gap between)\b", "shift rest"),
    # --- cold chain ---
    (r"\brefrigerated (?:vehicles?|trucks?|units?|trailers?)\b", "reefer"),
    (r"\brefrigeration (?:units?|systems?)\b", "reefer unit"),
    (r"\b(?:fridge|freezer|cold box|cold room|reefer) ?(?:trucks?|vans?|units?|trailers?)?\b", "reefer"),
    (r"\bcold[- ]chain\b", "coldchain"),
    (r"\btemperature[- ]controlled\b", "coldchain"),
    (r"\b(?:vaccines?|insulin|medicines?|pharma)\b", "vaccine pharmaceutical"),
    (r"\b(?:ice[- ]?creams?|frozen)\b", "frozen"),
    (r"\b(?:dairy|chilled|milk)\b", "chilled"),
    (r"\b(?:too (?:warm|hot|cold)|got (?:warm|hot)|warmed up|stopped working|out of range)\b", "excursion"),
    (r"\b(?:data loggers?|loggers?|temperature readings?)\b", "data logger monitoring"),
    (r"\b(?:cool(?:ing)? (?:down|the)|pre[- ]?cool\w*)\b", "pre-cool"),
    # --- operations ---
    (r"\bbroke down\b|\bbroken down\b|\bbreaks? down\b", "breakdown"),
    (r"\b(?:engine (?:died|failed|stopped)|flat tyres?|puncture|won'?t start|cannot move|stalled)\b", "breakdown"),
    (r"\b(?:running late|stuck in traffic|traffic jam|(?:\d+ )?minutes? late|reach \w+ late)\b", "delay late"),
    (r"\b(?:different road|wrong road|detour|off the planned (?:route|path|road)|off route|off the route)\b", "deviation"),
    (r"\bnot (?:at )?home\b|\bnot available\b|\bunavailable\b|\bnobody (?:there|home)\b", "absent"),
    (r"\b(?:refused|rejected|returned the)\b", "refused failed delivery"),
    (r"\b(?:hand(?:ing)? ?over|handover|signature|otp|one[- ]time pin|photo)\b", "proof delivery"),
    (r"\breassign(?:ment|ing|ed)?\b", "re-assignment"),
    (r"\bsigns? off\b", "approval"),
    (r"\bon[- ]time in[- ]full\b", "otif"),
    (r"\b(?:items? short|short delivery|incomplete order|missing items?)\b", "in full otif"),
    (r"\bservice level agreements?\b", "sla"),
    (r"\b(?:promised window|counted as late|delivered late|after the (?:promised )?window)\b", "sla breach late"),
    (r"\b(?:delivery )?slots?\b", "time window"),
    (r"\bsame[- ]day\b", "express same-day"),
    # --- vehicle and load safety ---
    (r"\bkgs?\b|\bkilograms?\b", "kg"),
    (r"\b(?:overload(?:ed|ing)?|too heavy|heavier than|over the limit|extra (?:kg|weight|load))\b", "overload payload"),
    (r"\b(?:strap(?:s|ped|ping)?|tie(?:d)? down|stack(?:ed|ing)?|sliding|shifting|pallets?)\b", "secure load distribution"),
    (r"\b(?:every morning|before leaving|daily check|tyre pressure|lights? check|walk[- ]?around)\b", "pre-trip inspection"),
    (r"\b(?:brakes? (?:feel )?(?:soft|spongy|weak)|warning light|dashboard light|faults?|defects?)\b", "defect maintenance"),
    (r"\b(?:electric (?:vans?|vehicles?|trucks?)|ev|evs|battery|charge|charging)\b", "ev electric range"),
)

_STOPWORDS = frozenset(
    """a an and are as at be been before being by can could do does for from had has have how i if in into is it its
    may me must my no not of on or our shall should so such than that the their them then there these they this to
    under until up was we were what when where which while who whom why will with within would you your all any each
    every per via also only more most other same now got get gets please tell know need want happen happens
    still just really today yesterday tomorrow ok okay going""".split()
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
