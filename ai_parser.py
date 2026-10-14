"""
ai_parser.py - Structured Parsing of Qualitative AI Research Dossiers
====================================================================
Parses Stage 2 synthesis Markdown reports into structured, clean JSON cards
suitable for executive dashboard cards and stock deep dive presentation.
Bulletproof against markdown variations (bolding colons, single/double asterisks,
bullet formats, and heading levels) across both Local Qwen and Cloud Gemini.
Preserves strict separation of facts, interpretations, and hypotheses.
"""

import re
from typing import Any, Dict, List, Optional


SECTION_DEFINITIONS = {
    "thesis": [
        "Why it entered the shortlist",
        "Shortlist thesis",
        "Thesis",
        "Why it entered",
        "Shortlist rationale",
    ],
    "key_evidence": [
        "Key evidence",
        "Key empirical evidence",
        "Empirical evidence",
        "Evidence summary",
    ],
    "announcements": [
        "Corporate Catalysts & Filings (Short-Form Summary)",
        "Corporate Catalysts & Filings",
        "Recent Announcements & Filings",
        "Corporate Catalysts",
        "Recent Announcements",
        "Announcements & Filings",
        "Corporate News",
        "Recent Filings",
        "Corporate Filings",
    ],
    "contradiction": [
        "Important contradiction",
        "Analytical contradiction",
        "Bear thesis contradiction",
        "Contradiction",
    ],
    "risks": [
        "Research risks / unresolved issues",
        "Research risks",
        "Unresolved issues",
        "Kill switch & invalidation triggers",
        "Invalidation triggers",
        "Risk boundaries",
        "Risks",
    ],
    "research_questions": [
        "Research questions",
        "Decision-relevant questions",
        "Key questions",
        "Questions",
    ],
    "strengthen_conditions": [
        "What would strengthen the thesis",
        "Strengthen conditions",
        "Strengthen thesis",
        "What strengthens",
    ],
    "weaken_conditions": [
        "What would weaken the thesis",
        "Weaken conditions",
        "Weaken thesis",
        "What weakens",
    ],
}


def to_bullet_list(block: str) -> List[str]:
    """Converts a raw markdown block into a clean list of string bullet items."""
    if not block or not block.strip():
        return []
    raw_lines = [l.strip() for l in block.split("\n") if l.strip()]
    cleaned = []
    for line in raw_lines:
        c = re.sub(r"^[-*•\d.]+\s*", "", line).strip()
        if c.startswith("**") and c.endswith("**") and len(c) > 4:
            c = c[2:-2].strip()
        if c:
            cleaned.append(c)
    if not cleaned and block.strip():
        cleaned = [block.strip()]
    return cleaned


def parse_subfields(text: str, field_map: Dict[str, List[str]]) -> Dict[str, str]:
    """
    Extracts labeled subfields from a structured block (e.g. contradiction or risks).
    Handles colons inside or outside asterisks, dashes, numbers, etc.
    """
    result = {k: "" for k in field_map}
    field_keys = list(field_map.keys())
    for i, (key, aliases) in enumerate(field_map.items()):
        alias_pat = "|".join([re.escape(a) for a in aliases])
        next_aliases = []
        for next_k in field_keys[i + 1:]:
            next_aliases.extend(field_map[next_k])
        if next_aliases:
            next_pat = "|".join([re.escape(a) for a in next_aliases])
            pat = rf"(?:^|\n)\s*[-*•#\d.]*\s*\**\s*(?:{alias_pat})[\s:*]*\**\s*[:\-–—]?\s*(.*?)(?=(?:\n\s*[-*•#\d.]*\s*\**\s*(?:{next_pat})[\s:*]*\**|\Z))"
        else:
            pat = rf"(?:^|\n)\s*[-*•#\d.]*\s*\**\s*(?:{alias_pat})[\s:*]*\**\s*[:\-–—]?\s*(.*?)$"
        m = re.search(pat, text, re.DOTALL | re.IGNORECASE)
        if m:
            result[key] = m.group(1).strip().strip("-*• ")
    return result


def parse_stock_ai_section(ticker: str, full_markdown: str) -> Optional[Dict[str, Any]]:
    """
    Finds and parses a specific stock's dossier from Stage 2 Markdown.
    Returns structured fields:
    - thesis: List of bullet points
    - key_evidence: List of bullet points
    - announcements: List of bullet points
    - contradiction: Dict with evidence, interpretation, why_it_matters, resolution
    - risks: Dict with setup_invalidation, trend_deterioration, fundamental_risk
    - research_questions: List of questions
    - strengthen_conditions: List of observable conditions
    - weaken_conditions: List of observable conditions
    - raw_section: The raw markdown section for this stock
    """
    if not full_markdown:
        return None

    clean_tick = ticker.replace(".NS", "").replace(".BO", "").strip().upper()

    # 1. Locate the stock's section
    header_patterns = [
        rf"(?:^|\n)\s*#{1,4}\s*\[?\**\s*{re.escape(clean_tick)}\b[^\n]*\n(.*?)(?=(?:\n\s*#{1,4}\s|\Z))",
        rf"(?:^|\n)\s*\**\[?{re.escape(clean_tick)}\b[^\n]*\**\n(.*?)(?=(?:\n\s*#{1,4}\s|\Z))",
    ]

    section_text = None
    for hp in header_patterns:
        m = re.search(hp, full_markdown, re.DOTALL | re.IGNORECASE)
        if m:
            section_text = m.group(0).strip()
            break

    # If full_markdown is a dedicated single-stock output that contains the ticker or section keywords,
    # use full_markdown directly as section_text
    if not section_text:
        has_keywords = any(
            alias.lower() in full_markdown.lower()
            for aliases in SECTION_DEFINITIONS.values()
            for alias in aliases[:2]
        )
        if clean_tick in full_markdown.upper() or has_keywords:
            section_text = full_markdown.strip()

    if not section_text:
        return None

    # 2. Extract sections using universal alias regex
    all_aliases = []
    alias_to_key = {}
    for k, aliases in SECTION_DEFINITIONS.items():
        for a in aliases:
            all_aliases.append(a)
            alias_to_key[a.lower()] = k

    all_aliases.sort(key=len, reverse=True)
    all_pat = "|".join(re.escape(a) for a in all_aliases)

    section_pat = rf"(?:^|\n)\s*[-*•#\d.]*\s*\**\s*({all_pat})[\s:*]*\**\s*[:\-–—]?\s*(.*?)(?=(?:\n\s*[-*•#\d.]*\s*\**\s*(?:{all_pat})[\s:*]*\**|\n#{1,4}\s+[A-Z0-9]|\Z))"

    extracted_blocks = {}
    for m in re.finditer(section_pat, section_text, re.IGNORECASE | re.DOTALL):
        matched_header = m.group(1).strip()
        key = alias_to_key.get(matched_header.lower())
        content = m.group(2).strip()
        if key and key not in extracted_blocks:
            extracted_blocks[key] = content

    # 3. Parse contradiction subfields
    contra_text = extracted_blocks.get("contradiction", "")
    contra_fields = {
        "evidence": ["Evidence", "Empirical Evidence", "Starkest Contradiction"],
        "interpretation": ["Interpretation", "Context", "Devil's Advocate"],
        "why_it_matters": ["Why it matters", "Why this matters", "Risk Impact", "Danger"],
        "resolution": ["What would resolve it", "What would resolve", "Resolution", "Proof"],
    }
    contradiction = parse_subfields(contra_text, contra_fields) if contra_text else {k: "" for k in contra_fields}
    if contra_text and not any(contradiction.values()):
        contradiction["evidence"] = contra_text.strip()

    # 4. Parse risks subfields
    risks_text = extracted_blocks.get("risks", "")
    risk_fields = {
        "setup_invalidation": ["Setup Invalidation", "Invalidation Level", "Stop Level", "Hard Stop"],
        "trend_deterioration": ["Trend Deterioration", "Deterioration Signal", "Danger Signal", "Trend Breakdown"],
        "fundamental_risk": ["Research / Fundamental Risk", "Fundamental Risk", "Research Risk", "Governance Risk", "Core Risk"],
    }
    risks = parse_subfields(risks_text, risk_fields) if risks_text else {k: "" for k in risk_fields}
    if risks_text and not any(risks.values()):
        risks["setup_invalidation"] = risks_text.strip()

    # 5. Build final structured payload
    thesis = to_bullet_list(extracted_blocks.get("thesis", ""))
    key_evidence = to_bullet_list(extracted_blocks.get("key_evidence", ""))
    announcements = to_bullet_list(extracted_blocks.get("announcements", ""))
    research_questions = to_bullet_list(extracted_blocks.get("research_questions", ""))
    strengthen_conditions = to_bullet_list(extracted_blocks.get("strengthen_conditions", ""))
    weaken_conditions = to_bullet_list(extracted_blocks.get("weaken_conditions", ""))

    return {
        "ticker": clean_tick,
        "thesis": thesis,
        "key_evidence": key_evidence,
        "announcements": announcements,
        "contradiction": contradiction,
        "risks": risks,
        "research_questions": research_questions,
        "strengthen_conditions": strengthen_conditions,
        "weaken_conditions": weaken_conditions,
        "raw_section": section_text,
    }


def parse_macro_backdrop(full_markdown: str) -> str:
    """Extracts the concise Section 1 (Market Backdrop) summary."""
    if not full_markdown:
        return ""
    m = re.search(r"##\s*1\.\s*Market Backdrop\s*(.*?)(?=(?:\n##\s|\Z))", full_markdown, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


def parse_cross_stock_comparison(full_markdown: str) -> str:
    """Extracts the Section 4 (Cross-Stock Trade-Off Analysis) summary."""
    if not full_markdown:
        return ""
    m = re.search(r"##\s*4\.\s*Cross-Stock Comparison.*?\s*(.*?)(?=(?:\n##\s|\Z))", full_markdown, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


def parse_full_report_by_tickers(tickers: List[str], full_markdown: str) -> Dict[str, Any]:
    """
    Parses a complete Gemini or Qwen multi-stock report into:
    - macro_backdrop: Text
    - cross_comparison: Text
    - dossiers: Dict[ticker, parsed_stock_section]
    """
    dossiers = {}
    for t in tickers:
        clean = t.replace(".NS", "").replace(".BO", "").strip().upper()
        parsed = parse_stock_ai_section(clean, full_markdown)
        if parsed:
            dossiers[clean] = parsed
            dossiers[f"{clean}.NS"] = parsed

    return {
        "macro_backdrop": parse_macro_backdrop(full_markdown),
        "cross_comparison": parse_cross_stock_comparison(full_markdown),
        "dossiers": dossiers,
    }
