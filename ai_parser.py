"""
ai_parser.py - Structured Parsing of Gemini Research Dossiers
=============================================================
Parses Stage 2 synthesis Markdown reports into structured, clean JSON cards
suitable for executive dashboard cards and stock deep dive presentation.
Preserves strict separation of facts, interpretations, and hypotheses.
"""

import re
from typing import Any, Dict, List, Optional


def parse_stock_ai_section(ticker: str, full_markdown: str) -> Optional[Dict[str, Any]]:
    """
    Finds and parses a specific stock's dossier from Section 3 of the Stage 2 Markdown report.
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
    
    # Pattern to locate `### [TICKER]` or `### TICKER`
    pattern = rf"###\s*\[?{re.escape(clean_tick)}\]?\b.*?(?=(?:\n###\s|\n##\s|\Z))"
    match = re.search(pattern, full_markdown, re.DOTALL | re.IGNORECASE)
    
    if not match:
        # Try finding just by symbol without brackets
        pattern_fallback = rf"###\s+.*?\b{re.escape(clean_tick)}\b.*?(?=(?:\n###\s|\n##\s|\Z))"
        match = re.search(pattern_fallback, full_markdown, re.DOTALL | re.IGNORECASE)

    if not match:
        return None

    section_text = match.group(0).strip()

    # Extract sub-sections using bullet headers
    def extract_bullets(label: str) -> List[str]:
        # Match e.g. - **Why it entered the shortlist**: ...
        sub_pat = rf"[-*]\s*\*\*{re.escape(label)}\*\*:\s*(.*?)(?=(?:\n[-*]\s*\*\*|\n###|\n##|\Z))"
        m = re.search(sub_pat, section_text, re.DOTALL | re.IGNORECASE)
        if not m:
            return []
        block = m.group(1).strip()
        # Parse individual sub-bullets or lines
        lines = [line.strip().lstrip("-*•").strip() for line in block.split("\n") if line.strip()]
        return [l for l in lines if l]

    def extract_text(label: str) -> str:
        sub_pat = rf"[-*]\s*\*\*{re.escape(label)}\*\*:\s*(.*?)(?=(?:\n[-*]\s*\*\*|\n###|\n##|\Z))"
        m = re.search(sub_pat, section_text, re.DOTALL | re.IGNORECASE)
        if not m:
            return ""
        return m.group(1).strip()

    # Contradiction sub-block
    contra_text = extract_text("Important contradiction")
    contradiction = {
        "evidence": "",
        "interpretation": "",
        "why_it_matters": "",
        "resolution": "",
    }
    if contra_text:
        e_m = re.search(r"(?:\*+\s*)?Evidence(?:\*+)?:\s*(.*?)(?=(?:\n\s*[-*•]?\s*\*+Interpretation|\Z))", contra_text, re.DOTALL | re.IGNORECASE)
        i_m = re.search(r"(?:\*+\s*)?Interpretation(?:\*+)?:\s*(.*?)(?=(?:\n\s*[-*•]?\s*\*+Why it matters|\Z))", contra_text, re.DOTALL | re.IGNORECASE)
        w_m = re.search(r"(?:\*+\s*)?Why it matters(?:\*+)?:\s*(.*?)(?=(?:\n\s*[-*•]?\s*\*+What would resolve|\Z))", contra_text, re.DOTALL | re.IGNORECASE)
        r_m = re.search(r"(?:\*+\s*)?What would resolve(?:\s*it)?(?:\*+)?:\s*(.*?)$", contra_text, re.DOTALL | re.IGNORECASE)
        if e_m: contradiction["evidence"] = e_m.group(1).strip().strip("-*• ")
        if i_m: contradiction["interpretation"] = i_m.group(1).strip().strip("-*• ")
        if w_m: contradiction["why_it_matters"] = w_m.group(1).strip().strip("-*• ")
        if r_m: contradiction["resolution"] = r_m.group(1).strip().strip("-*• ")

    # Research risks / unresolved issues sub-block
    risks_text = extract_text("Research risks / unresolved issues")
    risks = {
        "setup_invalidation": "",
        "trend_deterioration": "",
        "fundamental_risk": "",
    }
    if risks_text:
        si_m = re.search(r"(?:\*+\s*)?Setup Invalidation(?:\*+)?:\s*(.*?)(?=(?:\n\s*[-*•]?\s*\*+Trend Deterioration|\Z))", risks_text, re.DOTALL | re.IGNORECASE)
        td_m = re.search(r"(?:\*+\s*)?Trend Deterioration(?:\*+)?:\s*(.*?)(?=(?:\n\s*[-*•]?\s*\*+(?:Research|Fundamental)|\Z))", risks_text, re.DOTALL | re.IGNORECASE)
        fr_m = re.search(r"(?:\*+\s*)?(?:Research\s*/\s*Fundamental Risk|Fundamental Risk|Research Risk)(?:\*+)?:\s*(.*?)$", risks_text, re.DOTALL | re.IGNORECASE)
        if si_m: risks["setup_invalidation"] = si_m.group(1).strip().strip("-*• ")
        if td_m: risks["trend_deterioration"] = td_m.group(1).strip().strip("-*• ")
        if fr_m: risks["fundamental_risk"] = fr_m.group(1).strip().strip("-*• ")

    thesis = extract_bullets("Why it entered the shortlist")
    key_evidence = extract_bullets("Key evidence")
    announcements = extract_bullets("Recent Announcements & Filings")
    questions = extract_bullets("Research questions")
    strengthen = extract_bullets("What would strengthen the thesis")
    weaken = extract_bullets("What would weaken the thesis")

    return {
        "ticker": clean_tick,
        "thesis": thesis or [extract_text("Why it entered the shortlist")] if extract_text("Why it entered the shortlist") else [],
        "key_evidence": key_evidence or [extract_text("Key evidence")] if extract_text("Key evidence") else [],
        "announcements": announcements,
        "contradiction": contradiction,
        "risks": risks,
        "research_questions": questions,
        "strengthen_conditions": strengthen,
        "weaken_conditions": weaken,
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
    Parses a complete Gemini report into:
    - macro_backdrop: Text
    - cross_comparison: Text
    - stock_dossiers: Dict[ticker, parsed_stock_section]
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
