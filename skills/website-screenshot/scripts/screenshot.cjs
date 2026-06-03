#!/usr/bin/env node
/**
 * website-screenshot — take a headless screenshot of a URL
 *
 * Usage:
 *   node screenshot.js <url> [options]
 *
 * Options:
 *   --output <path>        Output file path (default: /tmp/screenshot-<timestamp>.png)
 *   --width <px>           Viewport width  (default: 1280)
 *   --height <px>          Viewport height (default: 900)
 *   --full-page            Capture full scrollable page (default: viewport only)
 *   --wait <strategy>      When to consider load done:
 *                            domcontentloaded  (fast, default)
 *                            load              (waits for all resources)
 *                            networkidle       (waits until network goes quiet)
 *   --delay <ms>           Extra wait after load event (default: 0)
 *   --timeout <ms>         Navigation timeout (default: 20000)
 *   --dark                 Emulate dark color scheme
 *   --mobile               Emulate mobile viewport (375×812, pixel ratio 2)
 *
 * Exit codes:
 *   0  success — output path printed to stdout
 *   1  error   — message printed to stderr
 */

const { chromium } = require("playwright-core");
const path = require("path");
const fs = require("fs");

// ── Parse args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  if (i !== -1) {
    args.splice(i, 1);
    return true;
  }
  return false;
}
function opt(name, def) {
  const i = args.indexOf(name);
  if (i !== -1 && args[i + 1]) {
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  }
  return def;
}

const fullPage = flag("--full-page");
const dark = flag("--dark");
const mobile = flag("--mobile");
const output = opt("--output", `/tmp/screenshot-${Date.now()}.png`);
const waitUntil = opt("--wait", "domcontentloaded");
const delay = parseInt(opt("--delay", "0"), 10);
const timeout = parseInt(opt("--timeout", "20000"), 10);
let width = parseInt(opt("--width", mobile ? "375" : "1280"), 10);
let height = parseInt(opt("--height", mobile ? "812" : "900"), 10);

const url = args[0];
if (!url) {
  console.error("Error: URL is required");
  console.error("Usage: node screenshot.js <url> [options]");
  process.exit(1);
}

// Ensure the URL has a scheme
const normalised = /^https?:\/\//i.test(url) ? url : `https://${url}`;

// ── Validate wait strategy ─────────────────────────────────────────────────
const validWait = ["domcontentloaded", "load", "networkidle", "commit"];
if (!validWait.includes(waitUntil)) {
  console.error(`Error: --wait must be one of: ${validWait.join(", ")}`);
  process.exit(1);
}

// ── Ensure output directory exists ────────────────────────────────────────
const outDir = path.dirname(path.resolve(output));
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// ── Screenshot ─────────────────────────────────────────────────────────────
(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
      ],
    });

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: mobile ? 2 : 1,
      colorScheme: dark ? "dark" : "light",
      userAgent: mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    });

    const page = await context.newPage();

    await page.goto(normalised, { waitUntil, timeout });

    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    const outPath = path.resolve(output);
    await page.screenshot({ path: outPath, fullPage });

    await browser.close();

    // Print the path so the caller can use it
    process.stdout.write(outPath + "\n");
    process.exit(0);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
})();
