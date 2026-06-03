#!/usr/bin/env python3
"""
latex-doc build script
Converts a Markdown file (with optional Mermaid diagrams) to a PDF using LaTeX.

Usage:
  python3 build.py <input.md> [options]

Options:
  --template   master-thesis | whitepaper | minimal  (default: whitepaper)
  --output     output PDF path (default: <input-name>.pdf)
  --bib        path to .bib file for references
  --logo       path to logo image file
  --keep-tex   keep intermediate .tex file
  --toc        include table of contents
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ── Skill root ────────────────────────────────────────────────────────────────
SKILL_DIR = Path(__file__).parent.parent
TEMPLATES_DIR = SKILL_DIR / "assets" / "templates"
MERMAID_RENDERER = SKILL_DIR / "scripts" / "render-mermaid.cjs"

# ── Mermaid rendering ─────────────────────────────────────────────────────────

def render_mermaid_blocks(md_text: str, work_dir: Path) -> str:
    """
    Find all ```mermaid ... ``` blocks, render them to PNG via our Node renderer,
    and replace with ![Diagram N](path/to/diagram_N.png).
    Falls back to verbatim code block if rendering fails.
    """
    diagram_dir = work_dir / "diagrams"
    diagram_dir.mkdir(exist_ok=True)

    pattern = re.compile(r"```mermaid\n(.*?)```", re.DOTALL)
    counter = [0]
    node = shutil.which("node") or "node"

    def replace_block(match):
        counter[0] += 1
        n = counter[0]
        mmd_src = match.group(1).strip()
        png_path = diagram_dir / f"diagram_{n}.png"
        mmd_file = diagram_dir / f"diagram_{n}.mmd"
        mmd_file.write_text(mmd_src)

        rendered = False
        try:
            result = subprocess.run(
                [node, str(MERMAID_RENDERER), str(mmd_file), str(png_path)],
                capture_output=True, text=True, timeout=30,
            )
            rendered = png_path.exists() and png_path.stat().st_size > 0
            if not rendered:
                print(f"  ⚠ Mermaid render failed for diagram {n}: {result.stderr[:200]}", file=sys.stderr)
        except Exception as e:
            print(f"  ⚠ Mermaid render error for diagram {n}: {e}", file=sys.stderr)

        if rendered:
            rel = os.path.relpath(png_path, work_dir)
            return f"\n![Diagram {n}]({rel})\n"
        else:
            print(f"  ⚠ Diagram {n} not rendered — inserting verbatim code block", file=sys.stderr)
            return f"\n```\n{mmd_src}\n```\n"

    return pattern.sub(replace_block, md_text)


# ── Pandoc conversion ─────────────────────────────────────────────────────────

def md_to_tex(md_path: Path, template_path: Path, work_dir: Path,
              bib_path: Path | None, logo: str | None, toc: bool) -> Path:
    """Run pandoc to convert processed Markdown to LaTeX using our template."""
    tex_path = work_dir / (md_path.stem + ".tex")

    cmd = [
        "pandoc",
        str(md_path),
        "--from", "markdown+tex_math_dollars+smart",
        "--to", "latex",
        "--template", str(template_path),
        "--output", str(tex_path),
        "--standalone",
    ]

    if toc:
        cmd += ["--variable", "toc=true"]
    if logo:
        cmd += ["--variable", f"logo={logo}"]
    if bib_path:
        cmd += ["--bibliography", str(bib_path),
                "--variable", f"bibliography={bib_path.name}",
                "--citeproc"]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"pandoc error:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    return tex_path


# ── LaTeX compilation ─────────────────────────────────────────────────────────

def compile_pdf(tex_path: Path, work_dir: Path, has_bib: bool) -> Path:
    """Compile .tex → .pdf using xelatex (+ biber if bibliography present)."""
    engine = "xelatex"
    flags = ["-interaction=nonstopmode", "-halt-on-error",
             f"-output-directory={work_dir}", str(tex_path)]

    def run_engine():
        r = subprocess.run([engine] + flags, capture_output=True, text=True, cwd=work_dir)
        if r.returncode != 0:
            # Print last 40 lines of log for diagnosis
            log = r.stdout + r.stderr
            lines = log.splitlines()
            print("\n".join(lines[-40:]), file=sys.stderr)
            raise RuntimeError(f"{engine} failed (exit {r.returncode})")

    print(f"  ⟳  {engine} pass 1…")
    run_engine()

    if has_bib:
        stem = tex_path.stem
        print(f"  ⟳  biber…")
        r = subprocess.run(["biber", stem], capture_output=True, text=True, cwd=work_dir)
        if r.returncode != 0:
            print(r.stderr[-2000:], file=sys.stderr)

    print(f"  ⟳  {engine} pass 2…")
    run_engine()

    if has_bib:
        print(f"  ⟳  {engine} pass 3…")
        run_engine()

    pdf_path = work_dir / (tex_path.stem + ".pdf")
    if not pdf_path.exists():
        raise RuntimeError("PDF not produced — check LaTeX errors above")
    return pdf_path


# ── Quality check & self-healing ──────────────────────────────────────────────

def check_log_overflow(log_path: Path, threshold_pt: float = 2.0) -> list:
    """
    Parse xelatex log for Overfull \\hbox warnings exceeding threshold_pt.
    Returns list of warning strings (empty list = no overflow).
    """
    warnings = []
    if not log_path.exists():
        return warnings
    try:
        for line in log_path.read_text(errors="replace").splitlines():
            m = re.match(r"Overfull \\hbox \((\d+(?:\.\d+)?)pt too wide\)", line)
            if m and float(m.group(1)) > threshold_pt:
                warnings.append(line.strip())
    except Exception:
        pass
    return warnings


def check_pdf_bbox(pdf_path: Path) -> list:
    """
    Use Ghostscript bbox device to detect content spilling outside page bounds.
    A4 page is ~595×842 pt.  Flags any page where content bbox exceeds 600pt wide.
    Returns list of issue strings (empty = clean).  Silently skips if gs absent.
    """
    gs = shutil.which("gs") or shutil.which("ghostscript")
    if not gs:
        return []
    issues = []
    try:
        r = subprocess.run(
            [gs, "-sDEVICE=bbox", "-dBATCH", "-dNOPAUSE", "-dQUIET", str(pdf_path)],
            capture_output=True, text=True, timeout=30,
        )
        for line in (r.stdout + r.stderr).splitlines():
            m = re.match(r"%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)", line)
            if m:
                llx, lly, urx, ury = (int(m.group(i)) for i in range(1, 5))
                if llx < -5 or urx > 600:
                    issues.append(
                        f"Content bbox ({llx},{lly},{urx},{ury}) exceeds A4 page width (~595pt)"
                    )
    except Exception:
        pass
    return issues


def apply_adjustbox_fallback(tex_path: Path) -> bool:
    """
    Inject adjustbox + setkeys into a compiled .tex file that is missing them.
    Returns True if a patch was written, False if already present or patch failed.
    """
    try:
        tex = tex_path.read_text(encoding="utf-8")
    except Exception:
        return False

    if "adjustbox" in tex and "max width" in tex:
        return False  # already covered

    fix = (
        "\n% ── AUTO-FIX: clamp images to text width ──────────────────────────\n"
        "\\usepackage[export]{adjustbox}\n"
        "\\let\\OrigIncludeGraphics\\includegraphics\n"
        "\\renewcommand{\\includegraphics}[2][]{%\n"
        "  \\OrigIncludeGraphics[max width=\\linewidth,"
        " max totalheight=0.85\\textheight, keepaspectratio, #1]{#2}%\n"
        "}\n"
    )

    # Prefer inserting right after \usepackage{graphicx...}
    if "\\usepackage{graphicx" in tex:
        idx = tex.index("\\usepackage{graphicx")
        eol = tex.index("\n", idx)
        tex = tex[: eol + 1] + fix + tex[eol + 1 :]
    elif "\\begin{document}" in tex:
        idx = tex.index("\\begin{document}")
        tex = tex[:idx] + fix + tex[idx:]
    else:
        return False

    tex_path.write_text(tex, encoding="utf-8")
    return True


def quality_check_and_heal(tex_path: Path, pdf_path: Path, work_dir: Path,
                             has_bib: bool) -> Path:
    """
    1. Parse xelatex log for Overfull \\hbox warnings.
    2. Use Ghostscript to detect content outside page bounds.
    3. If any issues found → patch .tex → recompile (one retry).
    Returns the (possibly re-generated) PDF path.
    """
    log_path = work_dir / (tex_path.stem + ".log")

    # threshold_pt=50: minor typographic overflows (e.g. cover titles, URLs) are
    # ignored; only genuine wide-content issues (typically images) are acted on.
    overflow = check_log_overflow(log_path, threshold_pt=50.0)
    bbox_issues = check_pdf_bbox(pdf_path)

    all_issues = overflow + bbox_issues
    if not all_issues:
        print("  ✓  Quality check passed — no figure overflow detected")
        return pdf_path

    print(f"\n  ⚠  Figure overflow / clipping detected ({len(all_issues)} issue(s)):")
    for issue in all_issues[:6]:
        print(f"     • {issue}")
    if len(all_issues) > 6:
        print(f"     … and {len(all_issues) - 6} more")

    print("  ⟳  Applying auto-fix (adjustbox image width clamp)…")
    patched = apply_adjustbox_fallback(tex_path)

    if not patched:
        print("  ⚠  adjustbox already present — cannot auto-fix further; check template")
        return pdf_path

    # Recompile with the patch
    print("  ⟳  Recompiling with image-width fix…")
    fixed_pdf = compile_pdf(tex_path, work_dir, has_bib=has_bib)

    # Verify
    overflow_after  = check_log_overflow(log_path)
    bbox_after      = check_pdf_bbox(fixed_pdf)
    remaining       = overflow_after + bbox_after

    if not remaining:
        print("  ✓  Auto-fix resolved all clipping/overflow issues")
    else:
        print(f"  ⚠  {len(remaining)} issue(s) remain after auto-fix:")
        for issue in remaining[:4]:
            print(f"     • {issue}")

    return fixed_pdf


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Build PDF from Markdown via LaTeX")
    parser.add_argument("input", help="Input Markdown file")
    parser.add_argument("--template", default="whitepaper",
                        choices=["master-thesis", "whitepaper", "minimal"],
                        help="Template to use (default: whitepaper)")
    parser.add_argument("--output", help="Output PDF path")
    parser.add_argument("--bib", help="BibTeX/BibLaTeX .bib file")
    parser.add_argument("--logo", help="Logo image path")
    parser.add_argument("--toc", action="store_true", help="Include table of contents")
    parser.add_argument("--keep-tex", action="store_true", help="Keep intermediate .tex file")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        print(f"Error: {input_path} not found", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output).resolve() if args.output else input_path.with_suffix(".pdf")
    bib_path = Path(args.bib).resolve() if args.bib else None
    template_path = TEMPLATES_DIR / args.template / "template.tex"

    if not template_path.exists():
        print(f"Error: template '{args.template}' not found at {template_path}", file=sys.stderr)
        sys.exit(1)

    print(f"\n📄 Building PDF")
    print(f"   Input    : {input_path}")
    print(f"   Template : {args.template}")
    print(f"   Output   : {output_path}")

    with tempfile.TemporaryDirectory(prefix="latexdoc_") as tmp:
        work_dir = Path(tmp)

        # 1. Read and pre-process Markdown
        md_text = input_path.read_text(encoding="utf-8")
        print(f"  ⟳  Rendering Mermaid diagrams…")
        md_text = render_mermaid_blocks(md_text, work_dir)

        processed_md = work_dir / input_path.name
        processed_md.write_text(md_text, encoding="utf-8")

        # Copy .bib into work dir if provided
        if bib_path:
            shutil.copy(bib_path, work_dir / bib_path.name)

        # Copy logo into work dir if provided
        logo_arg = None
        if args.logo:
            logo_src = Path(args.logo).resolve()
            shutil.copy(logo_src, work_dir / logo_src.name)
            logo_arg = logo_src.name

        # 2. Pandoc: MD → TeX
        print(f"  ⟳  Running pandoc…")
        tex_path = md_to_tex(processed_md, template_path, work_dir,
                              bib_path, logo_arg, args.toc)

        # 3. Compile
        pdf_tmp = compile_pdf(tex_path, work_dir, has_bib=bool(bib_path))

        # 4. Quality check — detect figure overflow; auto-heal if needed
        print(f"  ⟳  Running quality checks…")
        pdf_tmp = quality_check_and_heal(tex_path, pdf_tmp, work_dir, has_bib=bool(bib_path))

        # 5. Copy PDF to output
        shutil.copy(pdf_tmp, output_path)

        # 6. Optionally keep .tex
        if args.keep_tex:
            tex_out = output_path.with_suffix(".tex")
            shutil.copy(tex_path, tex_out)
            print(f"  ✓  LaTeX saved: {tex_out}")

    print(f"\n✅  PDF ready: {output_path}\n")


if __name__ == "__main__":
    main()
