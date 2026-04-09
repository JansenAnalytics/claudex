---
name: visual-review
description: "Screenshot comparison and visual regression detection: pixel diffing, before/after overlays, threshold-based change detection."
---

# visual-review

Screenshot comparison and visual regression detection: pixel diffing, before/after overlays, threshold-based change detection.

## When to Use

- Comparing UI states before and after changes
- Detecting visual regressions in CI or manual review
- Creating before/after diff images for stakeholder review
- Validating that CSS/layout changes didn't break other components
- Generating visual regression reports across multiple pages

## Scripts

### screenshot-diff.py

Compares two PNG screenshots pixel-by-pixel and generates a diff image.

```bash
python3 scripts/screenshot-diff.py \
  --before before.png \
  --after after.png \
  --output diff.png \
  --threshold 0.5
```

**Arguments:**

- `--before` — Path to the baseline screenshot (required)
- `--after` — Path to the new screenshot (required)
- `--output` — Path for the diff image output (default: `diff.png`)
- `--threshold` — Maximum allowed change percentage, 0-100 (default: `0.5`)

**Output:**

- Diff image with changed pixels highlighted in red on a dimmed background
- Prints change percentage to stdout
- Exit code 0 if change% ≤ threshold, exit code 1 if above

**Notes:**

- Images must be the same dimensions (script will error if not)
- Uses per-pixel RGB distance comparison (threshold per-pixel: 30/255)

### visual-report.py

Generates a Markdown report from a directory of before/after screenshot pairs.

```bash
python3 scripts/visual-report.py \
  --dir ./screenshots \
  --output report.md \
  --threshold 0.5
```

**Arguments:**

- `--dir` — Directory containing before/after pairs (required)
- `--output` — Output report path (default: stdout)
- `--threshold` — Pass/fail threshold percentage (default: `0.5`)

**Naming convention:** Files must be named `<name>-before.png` and `<name>-after.png`.

**Report includes:**

- Each pair with change percentage and pass/fail status
- Sorted by most changed first
- Summary: total pairs, pass count, fail count

### overlay-gen.py

Creates visual comparison images in different modes.

```bash
python3 scripts/overlay-gen.py \
  --before before.png \
  --after after.png \
  --mode side-by-side \
  --output comparison.png
```

**Arguments:**

- `--before` — Baseline image (required)
- `--after` — New image (required)
- `--mode` — Comparison mode: `side-by-side`, `overlay`, `swipe` (default: `side-by-side`)
- `--output` — Output path (default: `comparison.png`)

**Modes:**

- `side-by-side` — Before and after placed next to each other with labels
- `overlay` — Semi-transparent blend (50/50) of both images
- `swipe` — Left half shows before, right half shows after, with a divider line

## References

- `references/visual-testing-guide.md` — Threshold tuning, dynamic content handling, stabilization tips

## Dependencies

- Python 3 with Pillow (`pip3 install Pillow`)
