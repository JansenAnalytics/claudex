#!/usr/bin/env python3
"""
Document Analyzer — Higher-level analysis on extracted content.

Features:
- Financial statement detection and parsing
- Contract clause extraction
- Research paper structure analysis
- Table comparison across documents
- Key figure extraction (dates, amounts, percentages, names)
- Document classification

Usage:
  python3 analyze.py <file> [--type auto|financial|contract|research|generic]
                             [--extract-figures]
                             [--compare <other_file>]
                             [--output <file>]
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Import from sibling
sys.path.insert(0, str(Path(__file__).parent))
from extract import extract_document


# ==================== ENTITY EXTRACTION ====================

def extract_figures(text: str) -> dict:
    """Extract key figures from text: money, dates, percentages, names, etc."""
    figures = {
        "monetary": [],
        "percentages": [],
        "dates": [],
        "emails": [],
        "urls": [],
        "phone_numbers": [],
        "numbers_with_units": [],
    }

    # Money: $1,234.56, €500, £1M, USD 5,000, NOK 10 000
    money_patterns = [
        r'[\$€£¥]\s*[\d,]+(?:\.\d{1,2})?(?:\s*[KMBTkmbt](?:illion)?)?',
        r'(?:USD|EUR|GBP|NOK|SEK|DKK|CHF|JPY|CAD|AUD|NZD)\s*[\d,]+(?:\.\d{1,2})?(?:\s*[KMBTkmbt](?:illion)?)?',
        r'[\d,]+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|NOK|SEK|DKK|CHF|JPY|CAD|AUD|NZD)',
    ]
    for pattern in money_patterns:
        for match in re.finditer(pattern, text):
            val = match.group().strip()
            if val not in figures["monetary"]:
                figures["monetary"].append(val)

    # Percentages
    for match in re.finditer(r'-?\d+(?:\.\d+)?%', text):
        val = match.group()
        if val not in figures["percentages"]:
            figures["percentages"].append(val)

    # Dates (various formats)
    date_patterns = [
        r'\d{4}-\d{2}-\d{2}',  # 2024-01-15
        r'\d{1,2}/\d{1,2}/\d{2,4}',  # 01/15/2024 or 15/01/24
        r'\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}',  # 15 January 2024
        r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}',  # January 15, 2024
    ]
    for pattern in date_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            val = match.group()
            if val not in figures["dates"]:
                figures["dates"].append(val)

    # Emails
    for match in re.finditer(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', text):
        figures["emails"].append(match.group())

    # URLs
    for match in re.finditer(r'https?://[^\s<>"]+', text):
        figures["urls"].append(match.group())

    # Phone numbers
    for match in re.finditer(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}', text):
        val = match.group().strip()
        if len(val) >= 8:  # Minimum phone length
            figures["phone_numbers"].append(val)

    # Numbers with units
    for match in re.finditer(r'\d[\d,]*(?:\.\d+)?\s*(?:kg|lbs?|km|mi|m²|ft²|sq\s*(?:ft|m)|bps|Mbps|Gbps|MW|kW|GW|TWh|MWh|kWh|tons?|tonnes?|barrels?|bbl|oz|gallons?)', text, re.IGNORECASE):
        figures["numbers_with_units"].append(match.group().strip())

    # Remove empty lists
    return {k: v for k, v in figures.items() if v}


# ==================== DOCUMENT CLASSIFICATION ====================

def classify_document(text: str, metadata: dict = None) -> dict:
    """Classify document type based on content analysis."""
    text_lower = text.lower()

    scores = {
        "financial_statement": 0,
        "contract": 0,
        "research_paper": 0,
        "invoice": 0,
        "report": 0,
        "letter": 0,
        "resume": 0,
        "technical_manual": 0,
    }

    # Financial indicators
    financial_terms = ["revenue", "net income", "ebitda", "balance sheet", "cash flow",
                       "total assets", "shareholders", "earnings per share", "fiscal year",
                       "operating income", "gross profit", "depreciation", "amortization",
                       "accounts receivable", "accounts payable", "retained earnings"]
    scores["financial_statement"] = sum(1 for t in financial_terms if t in text_lower)

    # Contract indicators
    contract_terms = ["hereby", "whereas", "party", "agreement", "herein", "shall",
                      "terminate", "indemnify", "warranty", "liability", "governing law",
                      "jurisdiction", "confidential", "non-disclosure", "effective date",
                      "breach", "remedies", "arbitration", "force majeure"]
    scores["contract"] = sum(1 for t in contract_terms if t in text_lower)

    # Research paper indicators
    research_terms = ["abstract", "introduction", "methodology", "results", "discussion",
                      "conclusion", "references", "hypothesis", "literature review",
                      "findings", "p-value", "regression", "sample size", "et al",
                      "doi:", "issn", "citation"]
    scores["research_paper"] = sum(1 for t in research_terms if t in text_lower)

    # Invoice
    invoice_terms = ["invoice", "bill to", "due date", "subtotal", "tax",
                     "total due", "payment terms", "remittance", "purchase order"]
    scores["invoice"] = sum(1 for t in invoice_terms if t in text_lower)

    # Report
    report_terms = ["executive summary", "table of contents", "appendix", "recommendation",
                    "overview", "analysis", "assessment", "quarterly", "annual report"]
    scores["report"] = sum(1 for t in report_terms if t in text_lower)

    # Resume
    resume_terms = ["experience", "education", "skills", "objective", "references available",
                    "work history", "achievements", "certifications", "proficiency"]
    scores["resume"] = sum(1 for t in resume_terms if t in text_lower)

    # Sort by score
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top = ranked[0]

    return {
        "classification": top[0] if top[1] >= 3 else "generic",
        "confidence": min(top[1] / 8.0, 1.0),  # Normalize to 0-1
        "scores": {k: v for k, v in ranked if v > 0},
    }


# ==================== STRUCTURE ANALYSIS ====================

def analyze_structure(text: str) -> dict:
    """Analyze document structure: headings, sections, lists, etc."""
    lines = text.split("\n")
    structure = {
        "headings": [],
        "sections": [],
        "lists": 0,
        "paragraphs": 0,
        "blank_lines": 0,
        "page_markers": 0,
    }

    current_section = None

    for i, line in enumerate(lines):
        stripped = line.strip()

        if not stripped:
            structure["blank_lines"] += 1
            continue

        # Page markers
        if stripped.startswith("--- Page"):
            structure["page_markers"] += 1
            continue

        # Heading detection (markdown-style or ALL CAPS short lines)
        if stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            heading_text = stripped.lstrip("# ").strip()
            structure["headings"].append({
                "level": level,
                "text": heading_text,
                "line": i + 1,
            })
            current_section = heading_text
            structure["sections"].append(current_section)
        elif len(stripped) < 80 and stripped.isupper() and len(stripped.split()) > 1:
            structure["headings"].append({
                "level": 1,
                "text": stripped,
                "line": i + 1,
            })
            current_section = stripped
            structure["sections"].append(current_section)

        # List items
        if re.match(r'^[\-•●○◦]\s', stripped) or re.match(r'^\d+[\.\)]\s', stripped):
            structure["lists"] += 1

        # Count paragraphs (lines with substantial text)
        if len(stripped) > 50:
            structure["paragraphs"] += 1

    return structure


# ==================== FINANCIAL ANALYSIS ====================

def analyze_financial(text: str, tables: list) -> dict:
    """Extract financial data from statements."""
    result = {
        "type": "financial_analysis",
        "key_metrics": {},
        "periods": [],
        "tables_summary": [],
    }

    # Look for common financial metrics in text
    metrics_patterns = {
        "revenue": r'(?:total\s+)?revenue[s]?\s*[:\s]*[\$€£]?\s*([\d,]+(?:\.\d+)?)\s*(?:[KMBTkmbt](?:illion)?)?',
        "net_income": r'net\s+income\s*[:\s]*[\$€£]?\s*([\d,]+(?:\.\d+)?)',
        "ebitda": r'ebitda\s*[:\s]*[\$€£]?\s*([\d,]+(?:\.\d+)?)',
        "total_assets": r'total\s+assets\s*[:\s]*[\$€£]?\s*([\d,]+(?:\.\d+)?)',
        "total_liabilities": r'total\s+liabilities\s*[:\s]*[\$€£]?\s*([\d,]+(?:\.\d+)?)',
        "eps": r'earnings?\s+per\s+share\s*[:\s]*[\$€£]?\s*([\d,]+(?:\.\d+)?)',
    }

    text_lower = text.lower()
    for metric, pattern in metrics_patterns.items():
        matches = re.findall(pattern, text_lower)
        if matches:
            result["key_metrics"][metric] = matches[0]

    # Analyze tables for financial data
    for table in tables:
        data = table.get("data", [])
        if not data:
            continue

        # Check if table has financial column headers
        if data[0]:
            headers_text = " ".join(str(h).lower() for h in data[0])
            is_financial = any(term in headers_text for term in
                             ["revenue", "income", "assets", "balance", "cash", "profit",
                              "amount", "total", "q1", "q2", "q3", "q4", "fy"])
            if is_financial:
                result["tables_summary"].append({
                    "headers": data[0],
                    "row_count": len(data) - 1,
                    "sample_rows": data[1:4],
                })

    return result


# ==================== CONTRACT ANALYSIS ====================

def analyze_contract(text: str) -> dict:
    """Extract key clauses and terms from contracts."""
    result = {
        "type": "contract_analysis",
        "parties": [],
        "dates": [],
        "key_clauses": [],
        "obligations": [],
        "termination": [],
        "governing_law": "",
    }

    lines = text.split("\n")

    # Extract parties
    for line in lines[:50]:  # Usually in first section
        if re.search(r'(?:between|party|hereinafter)', line, re.IGNORECASE):
            # Look for quoted names or capitalized entities
            names = re.findall(r'"([^"]+)"', line)
            if names:
                result["parties"].extend(names)
            else:
                caps = re.findall(r'\b([A-Z][A-Z\s&.,]+(?:LLC|Inc|Ltd|Corp|GmbH|AS|AB)?)\b', line)
                result["parties"].extend([n.strip() for n in caps if len(n.strip()) > 3])

    # Extract dates
    figures = extract_figures(text)
    result["dates"] = figures.get("dates", [])[:10]

    # Key clauses
    clause_markers = [
        "confidentiality", "non-disclosure", "non-compete", "indemnification",
        "limitation of liability", "warranty", "representations", "termination",
        "governing law", "dispute resolution", "arbitration", "force majeure",
        "intellectual property", "assignment", "severability", "entire agreement",
        "amendment", "notice", "payment terms",
    ]

    for marker in clause_markers:
        for i, line in enumerate(lines):
            if marker in line.lower():
                # Grab the clause heading and first few lines
                context = "\n".join(lines[i:i + 3]).strip()
                result["key_clauses"].append({
                    "type": marker,
                    "line": i + 1,
                    "context": context[:200],
                })
                break

    # Governing law
    for line in lines:
        match = re.search(r'(?:governed?\s+by|governing\s+law)[:\s]*(?:the\s+)?(?:laws?\s+of\s+)?(.+?)(?:\.|$)',
                         line, re.IGNORECASE)
        if match:
            result["governing_law"] = match.group(1).strip()[:100]
            break

    return result


# ==================== MAIN ====================

def main():
    parser = argparse.ArgumentParser(description="Document Analyzer")
    parser.add_argument('file', help='Document file path')
    parser.add_argument('--type', choices=['auto', 'financial', 'contract', 'research', 'generic'],
                        default='auto', help='Analysis type')
    parser.add_argument('--extract-figures', action='store_true', help='Extract key figures')
    parser.add_argument('--output', '-o', type=str, help='Write output to file')
    parser.add_argument('--json', action='store_true', help='JSON output')
    args = parser.parse_args()

    # First extract the document
    extraction = extract_document(args.file, mode="summary", table_format="markdown")

    if extraction.get("error"):
        print(f"ERROR: {extraction['error']}")
        sys.exit(1)

    text = extraction.get("text", "")
    tables = extraction.get("tables", [])
    metadata = extraction.get("metadata", {})

    # Classify
    classification = classify_document(text, metadata)

    # Determine analysis type
    doc_type = args.type
    if doc_type == "auto":
        doc_type = classification["classification"]
        if doc_type in ("financial_statement",):
            doc_type = "financial"
        elif doc_type in ("contract",):
            doc_type = "contract"
        else:
            doc_type = "generic"

    result = {
        "file": args.file,
        "classification": classification,
        "metadata": metadata,
        "stats": extraction.get("stats", {}),
        "structure": analyze_structure(text),
    }

    # Type-specific analysis
    if doc_type == "financial":
        result["financial"] = analyze_financial(text, tables)
    elif doc_type == "contract":
        result["contract"] = analyze_contract(text)

    # Extract figures if requested
    if args.extract_figures or doc_type in ("financial", "contract"):
        result["figures"] = extract_figures(text)

    # Output
    if args.json:
        output = json.dumps(result, indent=2, default=str)
    else:
        parts = []
        parts.append(f"📄 Document Analysis: {Path(args.file).name}")
        parts.append(f"   Format: {extraction.get('format', '?')}")
        parts.append(f"   Classification: {classification['classification']} "
                    f"(confidence: {classification['confidence']:.0%})")
        if classification['scores']:
            parts.append(f"   Scores: {classification['scores']}")
        parts.append("")

        if metadata:
            parts.append("📋 Metadata:")
            for k, v in metadata.items():
                if v and str(v).strip():
                    parts.append(f"   {k}: {v}")
            parts.append("")

        stats = extraction.get("stats", {})
        if stats:
            parts.append(f"📊 Stats: {stats.get('words', 0)} words, {stats.get('lines', 0)} lines, "
                        f"{stats.get('tables_found', 0)} tables")
            parts.append("")

        structure = result.get("structure", {})
        if structure.get("headings"):
            parts.append("📑 Structure:")
            for h in structure["headings"][:20]:
                indent = "  " * h["level"]
                parts.append(f"   {indent}{h['text']}")
            parts.append("")

        if result.get("financial"):
            fin = result["financial"]
            if fin.get("key_metrics"):
                parts.append("💰 Key Financial Metrics:")
                for k, v in fin["key_metrics"].items():
                    parts.append(f"   {k}: {v}")
                parts.append("")

        if result.get("contract"):
            con = result["contract"]
            if con.get("parties"):
                parts.append(f"👥 Parties: {', '.join(con['parties'][:5])}")
            if con.get("governing_law"):
                parts.append(f"⚖️  Governing Law: {con['governing_law']}")
            if con.get("key_clauses"):
                parts.append(f"📜 Key Clauses ({len(con['key_clauses'])}):")
                for clause in con["key_clauses"]:
                    parts.append(f"   • {clause['type']} (line {clause['line']})")
            parts.append("")

        if result.get("figures"):
            figs = result["figures"]
            if figs.get("monetary"):
                parts.append(f"💵 Monetary values: {', '.join(figs['monetary'][:10])}")
            if figs.get("percentages"):
                parts.append(f"📊 Percentages: {', '.join(figs['percentages'][:10])}")
            if figs.get("dates"):
                parts.append(f"📅 Dates: {', '.join(figs['dates'][:10])}")
            if figs.get("emails"):
                parts.append(f"📧 Emails: {', '.join(figs['emails'][:5])}")

        output = "\n".join(parts)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f"Written to {args.output}")
    else:
        print(output)


if __name__ == '__main__':
    main()
