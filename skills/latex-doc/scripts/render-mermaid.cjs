#!/usr/bin/env node
/**
 * render-mermaid.cjs — render a Mermaid diagram to PNG
 * Uses playwright-core + system Chromium.
 *
 * Usage: node render-mermaid.cjs <input.mmd> <output.png>
 */

"use strict";
const fs = require("fs");
const path = require("path");

const [, , inputFile, outputFile] = process.argv;
if (!inputFile || !outputFile) {
  console.error("Usage: node render-mermaid.cjs <input.mmd> <output.png>");
  process.exit(1);
}

const mermaidSrc = fs.readFileSync(inputFile, "utf8").trim();

// Escape for JSON string embedding
const mermaidJson = JSON.stringify(mermaidSrc);

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 16px; background: white; font-family: Arial, sans-serif; }
    /* Keep SVG within a print-safe width (~A4 text column at 96dpi) */
    #out svg { max-width: 760px; width: 100%; height: auto; }
  </style>
</head>
<body>
  <div id="out"></div>
  <div id="status">loading</div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    try {
      const { svg } = await mermaid.render('d1', ${mermaidJson});
      document.getElementById('out').innerHTML = svg;
      document.getElementById('status').textContent = 'DONE';
    } catch(e) {
      document.getElementById('status').textContent = 'ERROR: ' + e.message;
    }
  </script>
</body>
</html>`;

(async () => {
  let browser;
  const chromiumExe = "/usr/bin/chromium-browser";
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ];

  // Try playwright-core
  try {
    const pw = require("playwright-core");
    browser = await pw.chromium.launch({ executablePath: chromiumExe, args: launchArgs });
  } catch (e) {
    console.error("playwright-core failed:", e.message);
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.setViewportSize({ width: 820, height: 700 });

  // Set content directly (no file:// URL needed)
  await page.setContent(html, { waitUntil: "domcontentloaded" });

  // Wait for mermaid to render
  try {
    await page.waitForFunction(
      () =>
        ["DONE", "ERROR"].some((s) =>
          document.getElementById("status")?.textContent?.startsWith(s),
        ),
      { timeout: 20000 },
    );
  } catch (_) {}

  await page.waitForTimeout(300);

  const status = await page.$eval("#status", (el) => el.textContent);
  if (status.startsWith("ERROR")) {
    console.error("Mermaid error:", status);
    await browser.close();
    process.exit(1);
  }

  // Screenshot the SVG element
  const svgEl = await page.$("#out svg");
  if (svgEl) {
    await svgEl.screenshot({ path: outputFile });
  } else {
    await page.screenshot({ path: outputFile, fullPage: true });
  }

  await browser.close();
  console.log("Rendered:", outputFile);
})().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
