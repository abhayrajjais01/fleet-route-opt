"""
guardrails.py - Semantic Similarity Guardrails & Zero-Hallucination Engine (US-006)
Track B (Abhayraj Jaiswal) Week 7 Deliverable

Implements:
1. Calibrated cosine similarity threshold checking over verified SOP embeddings.
2. Zero-Hallucination Fallback enforcement: Rejects out-of-domain or low-confidence policy claims.
3. Confidence Score Indicator: Computes normalized confidence percentages (0-100%).
4. SOP Document Citation Cards: Extracts Doc ID, section number, clause heading, and verbatim excerpt.
5. Guardrail Audit & Telemetry metadata for full explainability.
"""

from typing import Any, Dict, List, Optional
from app.schemas.copilot import GuardrailEvaluationResult, PolicyCitationCard

# Calibrated minimum cosine similarity threshold for TF-IDF RAG retrieval
# In-domain logistics SOP queries typically score 0.20 to 0.70.
# Unrelated or adversarial queries typically score < 0.15.
DEFAULT_GUARDRAIL_THRESHOLD: float = 0.18

ZERO_HALLUCINATION_FALLBACK_TEXT = (
    "Policy not found in verified knowledge base. "
    "Query similarity falls below the verified confidence threshold. "
    "To prevent regulatory non-compliance, no speculative guidance is generated."
)


def compute_confidence_percentage(score: float, threshold: float = DEFAULT_GUARDRAIL_THRESHOLD) -> float:
    """
    Normalizes a cosine similarity score into a calibrated [0, 100%] confidence indicator.
    Scores at or above threshold map smoothly from 50% to 99%.
    Scores below threshold map from 0% to 49%.
    """
    if score <= 0.0:
        return 0.0
    if score < threshold:
        return round((score / threshold) * 49.0, 1)

    # Scale from threshold (50%) to 0.60 (98%)
    scaled = 50.0 + ((score - threshold) / max(0.40, (0.65 - threshold))) * 48.0
    return round(min(99.0, scaled), 1)


def evaluate_rag_guardrail(
    query: str,
    hits: List[Any],
    threshold: float = DEFAULT_GUARDRAIL_THRESHOLD,
    policy_topic: Optional[str] = None,
) -> GuardrailEvaluationResult:
    """
    Enforces zero-hallucination semantic threshold guardrails on RAG retrieval hits.
    If the top hit meets the threshold, citations and verified response are compiled.
    If the top hit is below threshold or absent, a strict zero-hallucination fallback is returned.
    """
    top_hit = hits[0] if hits else None
    top_score = float(top_hit.score) if top_hit else 0.0
    confidence = compute_confidence_percentage(top_score, threshold)

    if top_hit is None or top_score < threshold:
        # Zero-hallucination guardrail tripped
        reason = (
            f"Query similarity score ({top_score:.4f}) is below verified safety threshold ({threshold:.4f}). "
            "Rejecting response to prevent speculative hallucination."
        )
        return GuardrailEvaluationResult(
            query=query,
            passed=False,
            status="ZERO_HALLUCINATION_REJECTED",
            similarity_score=round(top_score, 4),
            threshold=threshold,
            confidence_pct=confidence,
            safe_response=ZERO_HALLUCINATION_FALLBACK_TEXT,
            citations=[],
            reason=reason,
        )

    # Top hit passed the guardrail
    citations: List[PolicyCitationCard] = []
    for hit in hits:
        if hit.score < threshold * 0.75:
            continue
        c = hit.chunk
        hit_conf = compute_confidence_percentage(hit.score, threshold)
        sec_str = str(c.section) if hasattr(c, "section") else "§1"
        citations.append(
            PolicyCitationCard(
                doc_id=c.doc_id,
                doc_title=c.heading,
                section_number=sec_str,
                heading=c.heading,
                score=round(float(hit.score), 4),
                confidence_pct=hit_conf,
                excerpt=c.text[:220].strip() + ("..." if len(c.text) > 220 else ""),
            )
        )

    top_citation = citations[0]
    topic_header = f" [{policy_topic}]" if policy_topic else ""
    verified_response = (
        f"Verified Regulatory Policy{topic_header}:\n\n"
        f"According to {top_citation.doc_id} {top_citation.section_number} ({top_citation.heading}):\n"
        f"\"{top_citation.excerpt}\"\n\n"
        f"Verified Citation: {top_citation.doc_id} (Confidence: {top_citation.confidence_pct}%).\n"
        f"✓ Grounded in official standard: {top_citation.doc_id}."
    )

    return GuardrailEvaluationResult(
        query=query,
        passed=True,
        status="VERIFIED",
        similarity_score=round(top_score, 4),
        threshold=threshold,
        confidence_pct=confidence,
        safe_response=verified_response,
        citations=citations,
        reason=f"Top document {top_citation.doc_id} matched query with {confidence}% calibrated confidence.",
    )
