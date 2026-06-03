---
description: "Extracts text and tables from PDFs and images using PyMuPDF, pdfplumber, and Tesseract OCR (Norwegian/English), with auto/text/ocr/hybrid methods and page selection. Use when reading, OCR-ing, or extracting text/tables from a PDF, scanned document, or image."
name: ocr-document
triggers:
  - PDF
  - OCR
  - document
  - extract text
  - scan
  - read document
category: media
maturity: stable
tags: [ocr, tesseract, pdf-extraction, pymupdf, norwegian]
---

# OCR Document Skill

## Extract text from PDF/image

```bash
SKILL=${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/ocr-document/scripts

# Auto-detect best method (text vs OCR)
python3 $SKILL/extract.py document.pdf

# Force OCR (for scanned documents)
python3 $SKILL/extract.py document.pdf --method ocr --lang nor+eng

# Extract tables (pdfplumber)
python3 $SKILL/extract.py document.pdf --method pdfplumber

# Specific pages
python3 $SKILL/extract.py document.pdf --pages 1-5

# Save to file
python3 $SKILL/extract.py document.pdf --output extracted.md

# OCR an image
python3 $SKILL/extract.py photo.jpg --lang nor+eng
```

## Download Telegram files

```bash
# Download by file_id
python3 $SKILL/telegram_file.py --file-id <id> --output file.pdf

# Get most recent document from a chat
python3 $SKILL/telegram_file.py --chat-id <your-telegram-user-id> --recent --output file.pdf
```

## Methods
- **auto**: Try text extraction first, fall back to OCR if low text content
- **text**: PyMuPDF direct extraction (fastest)
- **pdfplumber**: Better for tables and structured data
- **ocr**: Tesseract OCR via pdf2image (for scanned docs)
- **hybrid**: Text first, OCR only for pages that need it

## Languages
Default: `nor+eng` (Norwegian + English). Change with `--lang`.
Available: `tesseract --list-langs`
