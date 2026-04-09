---
name: doc-reader
description: PDF/DOCX/XLSX/image document intelligence — text extraction, table parsing, OCR, financial statement analysis, contract clause detection, document classification, and format conversion. Use when reading, analyzing, extracting data from, or converting documents.
triggers:
  - read pdf
  - extract text from document
  - parse tables from pdf
  - ocr image
  - analyze contract
  - financial statement
  - convert document
  - extract tables
  - read docx
  - read excel
  - document analysis
---

# Doc Reader — Document Intelligence

Extract text, tables, and insights from any document format. Handles native text PDFs, scanned documents (OCR), Word files, spreadsheets, images, and HTML.

## Quick Reference

```bash
SCRIPTS=~/openclaw/skills/doc-reader/scripts

# Extract text from any document
python3 $SCRIPTS/extract.py document.pdf

# Extract tables only
python3 $SCRIPTS/extract.py document.pdf --mode tables

# Full analysis (text + tables + metadata)
python3 $SCRIPTS/extract.py document.pdf --mode summary

# OCR scanned document
python3 $SCRIPTS/extract.py scanned.pdf --mode ocr --ocr-lang eng+nor

# Analyze document (classify, extract figures, structure)
python3 $SCRIPTS/analyze.py document.pdf --extract-figures

# Convert between formats
python3 $SCRIPTS/convert.py report.pdf report.md
python3 $SCRIPTS/convert.py data.xlsx data.csv
```

---

## Scripts

### 1. `extract.py` — Universal Text & Table Extraction

The core extraction engine. Supports PDF, DOCX, XLSX, CSV, images, HTML, and plain text.

#### Extraction Modes

| Mode | Description |
|------|-------------|
| `text` | Full text extraction (default). Auto-falls back to OCR for scanned pages |
| `tables` | Table extraction only (as markdown, CSV, or JSON) |
| `meta` | Document metadata (author, dates, page count, file size) |
| `summary` | Text + tables + metadata combined |
| `ocr` | Force OCR on all pages (for fully scanned documents) |
| `layout` | Layout-preserving text extraction via pdftotext (columns, spacing) |
| `images` | Extract embedded images from PDF |

#### Usage

```bash
# Basic text extraction
python3 extract.py report.pdf
python3 extract.py contract.docx
python3 extract.py financials.xlsx

# Specific pages
python3 extract.py annual-report.pdf --pages 1-5,8,12-15

# Table extraction as JSON
python3 extract.py financials.pdf --mode tables --table-format json

# OCR with Norwegian + English
python3 extract.py scan.pdf --mode ocr --ocr-lang eng+nor

# Full summary to file
python3 extract.py report.pdf --mode summary --output /tmp/report-summary.txt

# JSON output (for programmatic use)
python3 extract.py report.pdf --mode summary --json --output /tmp/report.json

# Excel: specific sheet
python3 extract.py data.xlsx --sheet "Revenue" --mode tables

# Layout mode (preserves columns in multi-column PDFs)
python3 extract.py newspaper.pdf --mode layout

# Limit page count
python3 extract.py huge-doc.pdf --max-pages 20
```

#### Supported Formats

| Format | Extensions | Text | Tables | OCR | Metadata |
|--------|-----------|------|--------|-----|----------|
| PDF | .pdf | ✅ PyMuPDF + pdftotext | ✅ pdfplumber + tabula | ✅ Tesseract | ✅ |
| Word | .docx, .doc | ✅ python-docx | ✅ | ❌ | ✅ |
| Excel | .xlsx, .xls | ✅ openpyxl | ✅ | ❌ | ✅ |
| CSV | .csv | ✅ | ✅ | ❌ | ⚠️ |
| Images | .png, .jpg, .tiff, .bmp | ✅ OCR | ❌ | ✅ | ✅ Pillow |
| HTML | .html, .htm | ✅ BeautifulSoup | ❌ | ❌ | ⚠️ |
| Text | .txt, .md, .json, .xml | ✅ | ❌ | ❌ | ⚠️ |

#### PDF Extraction Strategy

The extractor uses a multi-strategy approach:
1. **PyMuPDF** (primary) — fastest, best for native text PDFs
2. **pdftotext** (layout mode) — preserves column layouts, spacing
3. **Tesseract OCR** (fallback) — auto-triggered when a page has <20 chars of text
4. **pdfplumber** (tables) — best general-purpose table extractor
5. **tabula-java** (tables alt) — better for bordered/ruled tables

### 2. `analyze.py` — Document Intelligence

Higher-level analysis on extracted content.

```bash
# Auto-classify and analyze
python3 analyze.py document.pdf

# Force analysis type
python3 analyze.py statement.pdf --type financial
python3 analyze.py agreement.pdf --type contract

# Extract key figures (money, dates, percentages)
python3 analyze.py document.pdf --extract-figures

# JSON output
python3 analyze.py document.pdf --json --output /tmp/analysis.json
```

#### Document Classification

Automatically detects:
- **Financial statements** — balance sheets, income statements, cash flow
- **Contracts** — agreements, NDAs, terms of service
- **Research papers** — academic papers with abstract/methodology/results
- **Invoices** — bills with line items and totals
- **Reports** — business reports with executive summaries
- **Resumes** — CVs with experience/education sections

#### Financial Analysis

For financial documents, extracts:
- Key metrics (revenue, net income, EBITDA, EPS, total assets)
- Financial table detection and summarization
- Period identification (quarterly, annual)

#### Contract Analysis

For legal documents, extracts:
- Parties involved
- Key dates
- Clause inventory (confidentiality, termination, governing law, IP, etc.)
- Governing law jurisdiction
- Obligation detection

#### Figure Extraction

Extracts structured data from any document:
- **Monetary values** — $1,234.56, €500K, USD 5,000, NOK 10 000
- **Percentages** — 15.5%, -2.3%
- **Dates** — 2024-01-15, January 15 2024, 15/01/2024
- **Emails, URLs, phone numbers**
- **Numbers with units** — 500 MW, 1.2M barrels, 50 kg

### 3. `convert.py` — Format Conversion

Convert between document formats.

```bash
# PDF conversions
python3 convert.py report.pdf report.md          # PDF → Markdown
python3 convert.py report.pdf report.txt         # PDF → Text
python3 convert.py report.pdf report.html        # PDF → HTML
python3 convert.py report.pdf page.png           # PDF → PNG images (per-page)
python3 convert.py report.pdf report.json        # PDF → JSON (full extraction)

# Word conversions
python3 convert.py doc.docx doc.md               # DOCX → Markdown
python3 convert.py doc.docx doc.pdf              # DOCX → PDF (via pandoc)
python3 convert.py doc.docx doc.txt              # DOCX → Text

# Spreadsheet conversions
python3 convert.py data.xlsx data.csv            # XLSX → CSV
python3 convert.py data.xlsx data.json           # XLSX → JSON
python3 convert.py data.xlsx data.md             # XLSX → Markdown table
python3 convert.py data.csv data.json            # CSV → JSON
python3 convert.py data.csv data.xlsx            # CSV → XLSX

# Image OCR
python3 convert.py scan.png scan.txt             # Image → Text (OCR)
python3 convert.py photo.jpg photo.pdf           # Image → PDF

# Markdown conversions
python3 convert.py doc.md doc.pdf                # Markdown → PDF
python3 convert.py doc.md doc.html               # Markdown → HTML
python3 convert.py doc.md doc.docx               # Markdown → DOCX

# With options
python3 convert.py scan.pdf text.md --pages 1-10 --ocr-lang eng+nor
python3 convert.py data.xlsx out.csv --sheet "Q4 Revenue"
python3 convert.py report.pdf images.png --dpi 300
```

#### Conversion Matrix

| From ↓ / To → | .txt | .md | .pdf | .html | .csv | .json | .png | .docx |
|---------------|------|-----|------|-------|------|-------|------|-------|
| .pdf | ✅ | ✅ | — | ✅ | ❌ | ✅ | ✅ | ❌ |
| .docx | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | — |
| .xlsx | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| .csv | ✅ | ✅ | ❌ | ❌ | — | ✅ | ❌ | ❌ |
| .png/.jpg | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | — | ❌ |
| .html | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| .md | ❌ | — | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## Dependencies

**System packages** (installed):
- `tesseract-ocr` + `tesseract-ocr-eng` + `tesseract-ocr-nor` — OCR engine
- `poppler-utils` — pdftotext, pdftohtml
- `pandoc` — universal document converter
- `ghostscript` — PDF processing

**Python packages** (installed):
- `pymupdf` — PDF rendering, text extraction, image extraction
- `pdfplumber` — PDF table extraction
- `python-docx` — Word document parsing
- `openpyxl` — Excel file parsing
- `tabula-py` — Java-based PDF table extraction
- `Pillow` — Image processing
- `beautifulsoup4` — HTML parsing

**OCR languages installed:** English (eng), Norwegian (nor)

To add more OCR languages:
```bash
sudo apt-get install tesseract-ocr-<lang>
# e.g., tesseract-ocr-deu (German), tesseract-ocr-fra (French)
```

---

## Agent Workflow

### When to use which script:

1. **"Read this PDF"** → `extract.py <file>` (default text mode)
2. **"Get the tables from this document"** → `extract.py <file> --mode tables`
3. **"What kind of document is this?"** → `analyze.py <file>`
4. **"Extract all dollar amounts"** → `analyze.py <file> --extract-figures`
5. **"Is this contract safe to sign?"** → `analyze.py <file> --type contract`
6. **"Parse this financial statement"** → `analyze.py <file> --type financial`
7. **"Convert this PDF to markdown"** → `convert.py <file>.pdf <file>.md`
8. **"OCR this scanned document"** → `extract.py <file> --mode ocr`
9. **"What's on pages 5-10?"** → `extract.py <file> --pages 5-10`

### For large documents:
- Use `--pages` to extract specific sections
- Use `--max-pages 20` to limit processing
- Use `--mode meta` first to check page count before full extraction
- Use `--json` output for programmatic post-processing

### For scanned/image-heavy PDFs:
- Try `--mode text` first (auto-OCR fallback)
- If quality is poor, use `--mode ocr` to force full OCR
- Add `--ocr-lang eng+nor` for multi-language documents
- Use `--mode layout` for column-heavy layouts
