---
name: website-screenshot
description: Take a headless Chromium screenshot of any URL and send/save the result. Use when the user asks for a screenshot, snapshot, or visual of a website, webpage, or URL — including requests like "show me what X looks like", "capture the homepage of Y", or "screenshot this URL". Supports viewport vs full-page, mobile emulation, dark mode, and configurable wait strategies.
---

# Website Screenshot

Uses playwright-core + system Chromium to capture screenshots headlessly. Prints the output path to stdout; exits 0 on success, 1 on failure.

## Script

```
/home/ajans/openclaw/skills/website-screenshot/scripts/screenshot.cjs
```

> **Note:** The `.cjs` extension is required — OpenClaw's `package.json` has `"type": "module"`, which breaks `.js` files using `require`.

## Usage

```bash
node <script> <url> [options]
```

| Option              | Default                    | Description                                 |
| ------------------- | -------------------------- | ------------------------------------------- |
| `--output <path>`   | `/tmp/screenshot-<ts>.png` | Where to save the PNG                       |
| `--width <px>`      | `1280`                     | Viewport width                              |
| `--height <px>`     | `900`                      | Viewport height                             |
| `--full-page`       | off                        | Capture full scrollable page                |
| `--wait <strategy>` | `domcontentloaded`         | `domcontentloaded` / `load` / `networkidle` |
| `--delay <ms>`      | `0`                        | Extra wait after load (for JS-heavy pages)  |
| `--timeout <ms>`    | `20000`                    | Navigation timeout                          |
| `--dark`            | off                        | Emulate dark color scheme                   |
| `--mobile`          | off                        | 375×812 viewport, pixel ratio 2, mobile UA  |

The URL scheme is auto-added if missing (`example.com` → `https://example.com`).

## Workflow

1. Run the script, capture stdout as the output path.
2. Save to a **persistent path** — `/tmp` vanishes between exec calls. Use the workspace or a reliable path.
3. Send via `message` tool, then **delete the file**.

### Standard pattern

```bash
OUTFILE=/home/ajans/.openclaw/workspace/screenshot-$(date +%s).png

node /home/ajans/openclaw/skills/website-screenshot/scripts/screenshot.cjs \
  "https://example.com" \
  --output "$OUTFILE" \
  --wait domcontentloaded

# Then in message tool:
#   media: $OUTFILE
#   caption: "example.com"

# Then clean up:
rm "$OUTFILE"
```

### Choose the right `--wait`

| Scenario                              | Recommended                                     |
| ------------------------------------- | ----------------------------------------------- |
| News/article pages, most static sites | `domcontentloaded` (fast)                       |
| Resource-heavy pages (fonts, images)  | `load`                                          |
| SPA / JS-rendered content             | `networkidle` or `networkidle` + `--delay 1000` |

## Caveats

- Chromium exits 2 if `xdg-settings` is missing (WSL/headless environments) — harmless; check if the output file exists, not the exit code.
- `/tmp` is ephemeral across exec sessions — always write to workspace or an absolute path you know persists.
- Large full-page screenshots can hit Telegram's 10MB photo limit — send as `document` or crop if needed.
- `networkidle` can time out on pages with long-polling websockets — use `load` + `--delay` instead.
