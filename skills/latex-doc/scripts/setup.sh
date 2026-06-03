#!/usr/bin/env bash
# latex-doc: Install all dependencies
set -e

echo "📦 Installing LaTeX + Pandoc…"
sudo apt-get install -y \
  texlive-xetex \
  texlive-latex-extra \
  texlive-fonts-recommended \
  texlive-bibtex-extra \
  texlive-science \
  biber \
  pandoc \
  fonts-liberation

echo "📦 Installing Mermaid CLI (mmdc)…"
npm install -g @mermaid-js/mermaid-cli 2>/dev/null || \
  npx --yes @mermaid-js/mermaid-cli --version

echo "✅ All dependencies installed."
echo "   Test with: python3 $(dirname "$0")/build.py --help"
