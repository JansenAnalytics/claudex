#!/usr/bin/env node
/**
 * Design Critic — Multi-Viewport Capture Engine
 *
 * Captures full-page screenshots at multiple viewports (mobile/tablet/desktop/wide),
 * scrolls through the page collecting every section, and extracts page metadata.
 *
 * Usage:
 *   node capture.cjs <url> [--output-dir DIR] [--viewports mobile,tablet,desktop,wide]
 *                          [--delay MS] [--auth-cookie FILE] [--scroll-step PX]
 *                          [--discover] [--max-pages N] [--dark-mode]
 */

'use strict';

const { chromium } = require(require('path').join(
  require('os').homedir(), 'openclaw/node_modules/playwright-core'
));
const fs = require('fs');
const path = require('path');
const os = require('os');

// ==================== VIEWPORT DEFINITIONS ====================

const VIEWPORTS = {
  'mobile-sm': { width: 320, height: 568, label: 'Mobile Small (iPhone SE)', deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'mobile':    { width: 375, height: 812, label: 'Mobile (iPhone 14)', deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'mobile-lg': { width: 428, height: 926, label: 'Mobile Large (iPhone 14 Pro Max)', deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'tablet':    { width: 768, height: 1024, label: 'Tablet (iPad)', deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'tablet-lg': { width: 1024, height: 1366, label: 'Tablet Large (iPad Pro)', deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'desktop':   { width: 1280, height: 800, label: 'Desktop (Laptop)', deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  'desktop-lg':{ width: 1440, height: 900, label: 'Desktop Large (1440p)', deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  'wide':      { width: 1920, height: 1080, label: 'Wide (Full HD)', deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  'ultrawide': { width: 2560, height: 1440, label: 'Ultra-Wide (2K)', deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

const DEFAULT_VIEWPORTS = ['mobile', 'tablet', 'desktop', 'wide'];

// ==================== PAGE DISCOVERY ====================

async function discoverPages(page, baseUrl, maxPages = 20) {
  const base = new URL(baseUrl);
  const visited = new Set();
  const toVisit = [baseUrl];
  const pages = [];

  while (toVisit.length > 0 && pages.length < maxPages) {
    const url = toVisit.shift();
    const normalized = new URL(url, baseUrl).href.replace(/\/$/, '');
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      const title = await page.title();
      const pathname = new URL(page.url()).pathname;

      pages.push({ url: page.url(), title, pathname });

      // Extract same-origin links
      const links = await page.evaluate((origin) => {
        return [...document.querySelectorAll('a[href]')]
          .map(a => a.href)
          .filter(h => h.startsWith(origin) && !h.includes('#') && !h.match(/\.(pdf|png|jpg|gif|svg|zip|mp4)$/i));
      }, base.origin);

      for (const link of links) {
        const norm = link.replace(/\/$/, '');
        if (!visited.has(norm)) toVisit.push(link);
      }
    } catch (e) {
      // Skip unreachable pages
    }
  }

  return pages;
}

// ==================== METADATA EXTRACTION ====================

async function extractPageMetadata(page) {
  return page.evaluate(() => {
    const getComputed = (el, prop) => window.getComputedStyle(el).getPropertyValue(prop);

    // All interactive elements
    const buttons = [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], .btn, [class*="button"]')];
    const links = [...document.querySelectorAll('a[href]')];
    const inputs = [...document.querySelectorAll('input, textarea, select')];
    const images = [...document.querySelectorAll('img')];
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];

    // Check for overflow issues
    const overflowing = [];
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 1 || rect.left < -1) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className?.toString().slice(0, 50) || '';
        if (rect.width > 10 && rect.height > 10) { // Skip tiny elements
          overflowing.push({
            tag, cls,
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            right: Math.round(rect.right),
            viewportW: window.innerWidth,
          });
        }
      }
    });

    // Check for text truncation / hidden text
    const truncated = [];
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2 && style.overflow !== 'visible' &&
          rect.height > 0 && el.textContent.trim().length > 0) {
        truncated.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className?.toString().slice(0, 50) || '',
          text: el.textContent.trim().slice(0, 80),
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          y: Math.round(rect.top),
        });
      }
    });

    // Check for overlapping elements (z-index stacking issues)
    const overlapping = [];
    const interactiveEls = [...buttons, ...links, ...inputs];
    for (const el of interactiveEls.slice(0, 100)) { // Limit for perf
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(centerX, centerY);
      if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
        overlapping.push({
          element: { tag: el.tagName.toLowerCase(), text: (el.textContent || el.value || '').trim().slice(0, 40), y: Math.round(rect.top) },
          coveredBy: { tag: topEl.tagName.toLowerCase(), cls: topEl.className?.toString().slice(0, 40) || '' },
        });
      }
    }

    // Font inventory
    const fontMap = {};
    document.querySelectorAll('body *').forEach(el => {
      const font = getComputed(el, 'font-family').split(',')[0].trim().replace(/"/g, '');
      const size = getComputed(el, 'font-size');
      const weight = getComputed(el, 'font-weight');
      const key = `${font}/${size}/${weight}`;
      fontMap[key] = (fontMap[key] || 0) + 1;
    });
    const fonts = Object.entries(fontMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([key, count]) => {
        const [family, size, weight] = key.split('/');
        return { family, size, weight, count };
      });

    // Color inventory
    const colorMap = {};
    document.querySelectorAll('body *').forEach(el => {
      const bg = getComputed(el, 'background-color');
      const fg = getComputed(el, 'color');
      if (bg !== 'rgba(0, 0, 0, 0)') colorMap[bg] = (colorMap[bg] || 0) + 1;
      colorMap[fg] = (colorMap[fg] || 0) + 1;
    });
    const colors = Object.entries(colorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([color, count]) => ({ color, count }));

    // Spacing analysis — check for inconsistent gaps
    const spacings = [];
    document.querySelectorAll('section, [class*="container"], main > *, article').forEach(el => {
      const style = window.getComputedStyle(el);
      spacings.push({
        tag: el.tagName.toLowerCase(),
        cls: el.className?.toString().slice(0, 30) || '',
        mt: style.marginTop, mb: style.marginBottom,
        pt: style.paddingTop, pb: style.paddingBottom,
      });
    });

    // Images without alt
    const imagesNoAlt = images.filter(img => !img.alt && !img.getAttribute('aria-label') && !img.closest('[aria-hidden="true"]'))
      .map(img => ({ src: img.src?.slice(0, 80), w: img.naturalWidth, h: img.naturalHeight }));

    // Dead buttons (no onclick, no href, not in form)
    const deadButtons = buttons
      .filter(btn => {
        const hasClick = btn.onclick || btn.getAttribute('onclick');
        const inForm = btn.closest('form');
        const hasHref = btn.tagName === 'A' ? btn.href : false;
        const hasListeners = btn.getAttribute('data-action') || btn.getAttribute('wire:click') || btn.getAttribute('@click') || btn.getAttribute('hx-post') || btn.getAttribute('hx-get');
        // Check if visible
        const rect = btn.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        return visible && !hasClick && !inForm && !hasHref && !hasListeners;
      })
      .map(btn => ({
        text: (btn.textContent || btn.value || '').trim().slice(0, 40),
        tag: btn.tagName.toLowerCase(),
        cls: btn.className?.toString().slice(0, 40) || '',
        y: Math.round(btn.getBoundingClientRect().top),
      }));

    // Dead links (href="#", empty href, javascript:void)
    const deadLinks = links
      .filter(a => {
        const href = a.getAttribute('href') || '';
        return href === '#' || href === '' || href === 'javascript:void(0)' || href === 'javascript:;';
      })
      .map(a => ({
        text: a.textContent.trim().slice(0, 40),
        href: a.getAttribute('href'),
        y: Math.round(a.getBoundingClientRect().top),
      }));

    // Forms without labels
    const unlabeledInputs = inputs
      .filter(input => {
        if (input.type === 'hidden' || input.type === 'submit') return false;
        const hasLabel = input.labels?.length > 0;
        const hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
        const hasPlaceholder = input.placeholder;
        return !hasLabel && !hasAria && !hasPlaceholder;
      })
      .map(input => ({
        type: input.type,
        name: input.name || input.id || '',
        y: Math.round(input.getBoundingClientRect().top),
      }));

    return {
      title: document.title,
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollHeight: document.documentElement.scrollHeight,
      counts: {
        buttons: buttons.length,
        links: links.length,
        inputs: inputs.length,
        images: images.length,
        headings: headings.length,
      },
      headingStructure: headings.map(h => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent.trim().slice(0, 80),
      })),
      overflowing: overflowing.slice(0, 20),
      truncated: truncated.slice(0, 20),
      overlapping: overlapping.slice(0, 20),
      fonts,
      colors,
      spacings: spacings.slice(0, 30),
      imagesNoAlt: imagesNoAlt.slice(0, 20),
      deadButtons: deadButtons.slice(0, 20),
      deadLinks: deadLinks.slice(0, 20),
      unlabeledInputs: unlabeledInputs.slice(0, 20),
    };
  });
}

// ==================== CONTRAST CHECKING ====================

async function checkContrast(page) {
  return page.evaluate(() => {
    function parseRGB(color) {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    }

    function luminance([r, g, b]) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function contrastRatio(fg, bg) {
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function getEffectiveBg(el) {
      let current = el;
      while (current && current !== document.documentElement) {
        const bg = window.getComputedStyle(current).backgroundColor;
        const rgb = parseRGB(bg);
        if (rgb && !(rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0 &&
            bg.includes('0)'))) { // Not transparent
          return rgb;
        }
        current = current.parentElement;
      }
      return [255, 255, 255]; // Default white
    }

    const failures = [];
    const textEls = document.querySelectorAll('p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, button, input, textarea, [class*="text"], [class*="label"], [class*="title"]');

    for (const el of textEls) {
      const text = el.textContent?.trim();
      if (!text || text.length === 0) continue;

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const fgRGB = parseRGB(style.color);
      if (!fgRGB) continue;

      const bgRGB = getEffectiveBg(el);
      const ratio = contrastRatio(fgRGB, bgRGB);
      const fontSize = parseFloat(style.fontSize);
      const isBold = parseInt(style.fontWeight) >= 700;
      const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);

      // WCAG AA: 4.5:1 normal, 3:1 large text
      // WCAG AAA: 7:1 normal, 4.5:1 large text
      const aaThreshold = isLargeText ? 3 : 4.5;
      const aaaThreshold = isLargeText ? 4.5 : 7;

      if (ratio < aaThreshold) {
        failures.push({
          text: text.slice(0, 60),
          tag: el.tagName.toLowerCase(),
          fg: style.color,
          bg: `rgb(${bgRGB.join(',')})`,
          ratio: Math.round(ratio * 100) / 100,
          required: aaThreshold,
          level: ratio < 3 ? 'critical' : 'warning',
          fontSize: `${fontSize}px`,
          y: Math.round(rect.top),
          isLargeText,
        });
      }
    }

    return failures.slice(0, 50);
  });
}

// ==================== AXE ACCESSIBILITY AUDIT ====================

async function runAxeAudit(page) {
  const axePath = require.resolve('axe-core');
  const axeSource = fs.readFileSync(axePath, 'utf8');

  await page.evaluate(axeSource);

  return page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    });

    return {
      violations: results.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        count: v.nodes.length,
        nodes: v.nodes.slice(0, 5).map(n => ({
          html: n.html.slice(0, 200),
          target: n.target.join(' > ').slice(0, 100),
          failureSummary: n.failureSummary?.slice(0, 200),
        })),
      })),
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length,
    };
  });
}

// ==================== LINK CHECKER ====================

async function checkLinks(page, baseUrl) {
  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 40) }))
      .filter(l => l.href.startsWith('http'));
  });

  const uniqueLinks = [...new Map(links.map(l => [l.href, l])).values()];
  const results = [];

  for (const link of uniqueLinks.slice(0, 50)) {
    try {
      const response = await page.request.head(link.href, { timeout: 5000 });
      if (response.status() >= 400) {
        results.push({ ...link, status: response.status(), broken: true });
      }
    } catch (e) {
      results.push({ ...link, status: 0, broken: true, error: e.message?.slice(0, 60) });
    }
  }

  return { total: uniqueLinks.length, broken: results };
}

// ==================== MAIN CAPTURE ====================

async function capture(url, options = {}) {
  const {
    outputDir = path.join(os.homedir(), '.design-critic', 'captures', Date.now().toString()),
    viewports = DEFAULT_VIEWPORTS,
    delay = 2000,
    discover = false,
    maxPages = 10,
    darkMode = false,
    scrollStep = 800,
    checkLinksFlag = true,
    cookieFile = null,
  } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`🔍 Design Critic — Capturing ${url}`);
  console.log(`   Viewports: ${viewports.join(', ')}`);
  console.log(`   Output: ${outputDir}\n`);

  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
           '--disable-web-security', '--force-device-scale-factor=1'],
    headless: true,
  });

  try {
    const context = await browser.newContext({
      colorScheme: darkMode ? 'dark' : 'light',
      locale: 'en-US',
    });

    // Load cookies if provided
    if (cookieFile && fs.existsSync(cookieFile)) {
      const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
      await context.addCookies(cookies);
    }

    const page = await context.newPage();

    // Block analytics/ads for cleaner captures
    await page.route(/google-analytics|googletagmanager|doubleclick|facebook.*pixel|hotjar|mixpanel/, route => route.abort());

    // Discover pages if requested
    let pagesToCapture = [{ url, title: '', pathname: '/' }];
    if (discover) {
      console.log('📡 Discovering pages...');
      pagesToCapture = await discoverPages(page, url, maxPages);
      console.log(`   Found ${pagesToCapture.length} pages\n`);
    }

    const allResults = [];

    for (const pageInfo of pagesToCapture) {
      const pageSlug = pageInfo.pathname.replace(/\//g, '_').replace(/^_/, '') || 'index';
      const pageDir = path.join(outputDir, pageSlug);
      fs.mkdirSync(pageDir, { recursive: true });

      console.log(`📄 Page: ${pageInfo.url}`);

      const pageResults = {
        url: pageInfo.url,
        title: pageInfo.title,
        pathname: pageInfo.pathname,
        viewports: {},
        accessibility: null,
        contrast: null,
        brokenLinks: null,
      };

      // Capture each viewport
      for (const vpName of viewports) {
        const vp = VIEWPORTS[vpName];
        if (!vp) {
          console.log(`   ⚠️  Unknown viewport: ${vpName}`);
          continue;
        }

        console.log(`   📱 ${vp.label} (${vp.width}×${vp.height})`);

        await page.setViewportSize({ width: vp.width, height: vp.height });
        if (vp.isMobile) {
          await page.evaluate(mobile => {
            Object.defineProperty(navigator, 'userAgent', {
              value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
              writable: true,
            });
          });
        }

        await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(delay);

        // Dismiss cookie banners / modals
        try {
          await page.evaluate(() => {
            const selectors = [
              '[class*="cookie"] button', '[class*="consent"] button',
              '[id*="cookie"] button', '[class*="banner"] button[class*="accept"]',
              '[class*="modal"] button[class*="close"]', '[class*="popup"] button[class*="close"]',
            ];
            for (const sel of selectors) {
              const btn = document.querySelector(sel);
              if (btn && btn.offsetHeight > 0) { btn.click(); break; }
            }
          });
          await page.waitForTimeout(500);
        } catch (e) { /* ignore */ }

        // Full-page screenshot
        const screenshotPath = path.join(pageDir, `${vpName}-full.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Above-the-fold screenshot
        const foldPath = path.join(pageDir, `${vpName}-fold.png`);
        await page.screenshot({ path: foldPath, fullPage: false });

        // Scrolling section captures
        const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const sections = Math.ceil(scrollHeight / scrollStep);
        const sectionPaths = [];

        for (let s = 0; s < Math.min(sections, 20); s++) {
          await page.evaluate(y => window.scrollTo(0, y), s * scrollStep);
          await page.waitForTimeout(300); // Let lazy content load
          const secPath = path.join(pageDir, `${vpName}-section-${s}.png`);
          await page.screenshot({ path: secPath, fullPage: false });
          sectionPaths.push(secPath);
        }

        // Reset scroll
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);

        // Extract metadata for this viewport
        const metadata = await extractPageMetadata(page);
        const contrast = await checkContrast(page);

        pageResults.viewports[vpName] = {
          ...vp,
          screenshots: {
            fullPage: screenshotPath,
            aboveFold: foldPath,
            sections: sectionPaths,
          },
          metadata,
          contrast,
          scrollHeight,
          sections,
        };

        const issues = [];
        if (metadata.overflowing.length) issues.push(`${metadata.overflowing.length} overflow`);
        if (metadata.truncated.length) issues.push(`${metadata.truncated.length} truncated`);
        if (metadata.overlapping.length) issues.push(`${metadata.overlapping.length} overlapping`);
        if (metadata.deadButtons.length) issues.push(`${metadata.deadButtons.length} dead buttons`);
        if (metadata.deadLinks.length) issues.push(`${metadata.deadLinks.length} dead links`);
        if (contrast.length) issues.push(`${contrast.length} contrast fails`);

        const status = issues.length === 0 ? '✅' : `⚠️  ${issues.join(', ')}`;
        console.log(`      ${status}`);
      }

      // Run accessibility audit (on desktop viewport)
      console.log('   ♿ Accessibility audit...');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);

      try {
        pageResults.accessibility = await runAxeAudit(page);
        const v = pageResults.accessibility.violations;
        const critCount = v.filter(x => x.impact === 'critical').length;
        const seriousCount = v.filter(x => x.impact === 'serious').length;
        console.log(`      ${v.length} violations (${critCount} critical, ${seriousCount} serious), ${pageResults.accessibility.passes} passes`);
      } catch (e) {
        console.log(`      ❌ axe failed: ${e.message?.slice(0, 80)}`);
      }

      // Check links
      if (checkLinksFlag) {
        console.log('   🔗 Checking links...');
        try {
          pageResults.brokenLinks = await checkLinks(page, pageInfo.url);
          const bl = pageResults.brokenLinks.broken;
          console.log(`      ${pageResults.brokenLinks.total} links, ${bl.length} broken`);
        } catch (e) {
          console.log(`      ❌ link check failed: ${e.message?.slice(0, 80)}`);
        }
      }

      allResults.push(pageResults);
      console.log();
    }

    // Save results JSON
    const resultsPath = path.join(outputDir, 'capture-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
    console.log(`💾 Results saved: ${resultsPath}`);

    // Print summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 CAPTURE SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Pages: ${allResults.length}`);
    console.log(`Viewports: ${viewports.length}`);

    let totalScreenshots = 0;
    for (const r of allResults) {
      for (const vp of Object.values(r.viewports)) {
        totalScreenshots += 2 + vp.screenshots.sections.length;
      }
    }
    console.log(`Screenshots: ${totalScreenshots}`);
    console.log(`Output: ${outputDir}`);

    return { outputDir, results: allResults };

  } finally {
    await browser.close();
  }
}

// ==================== CLI ====================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`Design Critic — Multi-Viewport Capture Engine

Usage: node capture.cjs <url> [options]

Options:
  --output-dir DIR      Output directory (default: ~/.design-critic/captures/<timestamp>)
  --viewports LIST      Comma-separated: mobile-sm,mobile,mobile-lg,tablet,tablet-lg,desktop,desktop-lg,wide,ultrawide
  --delay MS            Wait after page load (default: 2000)
  --discover            Auto-discover pages from links
  --max-pages N         Max pages to discover (default: 10)
  --dark-mode           Capture in dark mode
  --scroll-step PX      Scroll step for section captures (default: 800)
  --no-links            Skip link checking
  --cookies FILE        JSON cookie file for auth`);
    process.exit(0);
  }

  const url = args.find(a => !a.startsWith('--'));
  const getFlag = (name) => args.includes(`--${name}`);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const viewportArg = getArg('viewports');
  const viewports = viewportArg ? viewportArg.split(',') : DEFAULT_VIEWPORTS;

  await capture(url, {
    outputDir: getArg('output-dir'),
    viewports,
    delay: parseInt(getArg('delay') || '2000'),
    discover: getFlag('discover'),
    maxPages: parseInt(getArg('max-pages') || '10'),
    darkMode: getFlag('dark-mode'),
    scrollStep: parseInt(getArg('scroll-step') || '800'),
    checkLinksFlag: !getFlag('no-links'),
    cookieFile: getArg('cookies'),
  });
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

module.exports = { capture, VIEWPORTS, DEFAULT_VIEWPORTS };
