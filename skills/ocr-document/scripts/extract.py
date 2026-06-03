#!/usr/bin/env python3
"""
Extract text from PDFs and images using multiple strategies:
1. Direct text extraction (pdfplumber/pymupdf) — for text-based PDFs
2. OCR (tesseract) — for scanned/image PDFs
3. Hybrid — try text first, fall back to OCR for pages with little text

Usage:
    python3 extract.py document.pdf                    # Auto-detect best method
    python3 extract.py document.pdf --method ocr       # Force OCR
    python3 extract.py document.pdf --method text      # Force text extraction
    python3 extract.py document.pdf --output out.md    # Save to file
    python3 extract.py image.jpg                       # OCR an image
    python3 extract.py document.pdf --pages 1-5        # Specific pages
    python3 extract.py document.pdf --lang nor+eng     # Norwegian + English OCR
"""
import argparse, os, sys, json, tempfile, subprocess
from pathlib import Path


def extract_text_pymupdf(pdf_path, pages=None):
    """Extract text using PyMuPDF (fitz) — fast, handles most PDFs well."""
    import fitz
    doc = fitz.open(pdf_path)
    results = []
    
    page_range = range(len(doc)) if pages is None else pages
    
    for i in page_range:
        if i >= len(doc):
            break
        page = doc[i]
        text = page.get_text("text")
        results.append({
            "page": i + 1,
            "text": text.strip(),
            "chars": len(text.strip()),
            "method": "pymupdf",
        })
    
    doc.close()
    return results


def extract_text_pdfplumber(pdf_path, pages=None):
    """Extract text using pdfplumber — better for tables."""
    import pdfplumber
    
    results = []
    with pdfplumber.open(pdf_path) as pdf:
        page_range = range(len(pdf.pages)) if pages is None else pages
        
        for i in page_range:
            if i >= len(pdf.pages):
                break
            page = pdf.pages[i]
            text = page.extract_text() or ""
            
            # Also try to extract tables
            tables = page.extract_tables()
            table_text = ""
            if tables:
                for table in tables:
                    for row in table:
                        row_text = " | ".join(str(cell or "") for cell in row)
                        table_text += row_text + "\n"
            
            results.append({
                "page": i + 1,
                "text": text.strip(),
                "tables": table_text.strip() if table_text else None,
                "chars": len(text.strip()),
                "method": "pdfplumber",
            })
    
    return results


def extract_ocr(pdf_path, pages=None, lang="nor+eng", dpi=300):
    """OCR extraction: convert PDF pages to images, then run tesseract."""
    from pdf2image import convert_from_path
    import pytesseract
    
    # Convert PDF to images
    images = convert_from_path(pdf_path, dpi=dpi, fmt="png")
    
    results = []
    page_range = range(len(images)) if pages is None else pages
    
    for i in page_range:
        if i >= len(images):
            break
        img = images[i]
        text = pytesseract.image_to_string(img, lang=lang)
        
        results.append({
            "page": i + 1,
            "text": text.strip(),
            "chars": len(text.strip()),
            "method": "ocr",
            "lang": lang,
            "dpi": dpi,
        })
    
    return results


def extract_image_ocr(image_path, lang="nor+eng"):
    """OCR a single image file."""
    import pytesseract
    from PIL import Image
    
    img = Image.open(image_path)
    text = pytesseract.image_to_string(img, lang=lang)
    
    return [{
        "page": 1,
        "text": text.strip(),
        "chars": len(text.strip()),
        "method": "ocr",
        "lang": lang,
    }]


def hybrid_extract(pdf_path, pages=None, lang="nor+eng", min_chars_per_page=50):
    """
    Smart extraction: try text first, fall back to OCR for pages with little text.
    This handles mixed PDFs (some pages text, some scanned).
    """
    # First try text extraction
    text_results = extract_text_pymupdf(pdf_path, pages)
    
    # Check which pages need OCR
    ocr_needed = []
    for r in text_results:
        if r["chars"] < min_chars_per_page:
            ocr_needed.append(r["page"] - 1)  # 0-indexed
    
    if not ocr_needed:
        return text_results  # All pages have enough text
    
    # OCR the pages that need it
    print(f"OCR needed for {len(ocr_needed)} pages: {[p+1 for p in ocr_needed]}", file=sys.stderr)
    ocr_results = extract_ocr(pdf_path, pages=ocr_needed, lang=lang)
    
    # Merge: replace low-text pages with OCR results
    ocr_map = {r["page"]: r for r in ocr_results}
    final = []
    for r in text_results:
        if r["page"] in ocr_map and ocr_map[r["page"]]["chars"] > r["chars"]:
            final.append(ocr_map[r["page"]])
        else:
            final.append(r)
    
    return final


def parse_page_range(page_str, max_pages=999):
    """Parse page range like '1-5' or '1,3,5' or '1-3,7'."""
    if not page_str:
        return None
    
    pages = []
    for part in page_str.split(","):
        if "-" in part:
            start, end = part.split("-", 1)
            pages.extend(range(int(start) - 1, min(int(end), max_pages)))
        else:
            pages.append(int(part) - 1)
    
    return sorted(set(pages))


def format_output(results, format="markdown"):
    """Format extracted text."""
    lines = []
    
    for r in results:
        lines.append(f"## Page {r['page']} [{r['method']}, {r['chars']} chars]")
        lines.append("")
        lines.append(r["text"])
        if r.get("tables"):
            lines.append("")
            lines.append("### Tables")
            lines.append(r["tables"])
        lines.append("")
        lines.append("---")
        lines.append("")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Extract text from PDFs and images")
    parser.add_argument("input", help="PDF or image file path")
    parser.add_argument("--method", choices=["auto", "text", "ocr", "hybrid", "pdfplumber"],
                       default="auto", help="Extraction method")
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument("--pages", help="Page range (e.g. 1-5, 1,3,5)")
    parser.add_argument("--lang", default="nor+eng", help="OCR language (default: nor+eng)")
    parser.add_argument("--dpi", type=int, default=300, help="OCR DPI")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--min-chars", type=int, default=50, help="Min chars before OCR fallback")
    args = parser.parse_args()
    
    input_path = args.input
    if not os.path.exists(input_path):
        print(f"File not found: {input_path}", file=sys.stderr)
        sys.exit(1)
    
    pages = parse_page_range(args.pages)
    ext = Path(input_path).suffix.lower()
    
    # Image files → always OCR
    if ext in [".jpg", ".jpeg", ".png", ".tiff", ".bmp", ".webp"]:
        results = extract_image_ocr(input_path, args.lang)
    elif ext == ".pdf":
        if args.method == "text":
            results = extract_text_pymupdf(input_path, pages)
        elif args.method == "pdfplumber":
            results = extract_text_pdfplumber(input_path, pages)
        elif args.method == "ocr":
            results = extract_ocr(input_path, pages, args.lang, args.dpi)
        elif args.method == "hybrid":
            results = hybrid_extract(input_path, pages, args.lang, args.min_chars)
        else:  # auto
            # Try text first
            results = extract_text_pymupdf(input_path, pages)
            total_chars = sum(r["chars"] for r in results)
            avg_chars = total_chars / len(results) if results else 0
            
            if avg_chars < args.min_chars:
                print(f"Low text content (avg {avg_chars:.0f} chars/page), switching to hybrid...", file=sys.stderr)
                results = hybrid_extract(input_path, pages, args.lang, args.min_chars)
            else:
                print(f"Text extraction successful (avg {avg_chars:.0f} chars/page)", file=sys.stderr)
    else:
        print(f"Unsupported file type: {ext}", file=sys.stderr)
        sys.exit(1)
    
    # Output
    if args.json:
        output = json.dumps(results, indent=2, ensure_ascii=False)
    else:
        output = format_output(results)
    
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        total_chars = sum(r["chars"] for r in results)
        print(f"Saved to {args.output} ({len(results)} pages, {total_chars} chars total)", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
