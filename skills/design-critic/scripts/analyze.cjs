#!/usr/bin/env node
/**
 * Design Critic — Analysis Engine
 *
 * Analyzes capture results: aggregates all issues, scores severity, generates
 * a prioritized report with actionable fixes.
 *
 * Usage:
 *   node analyze.cjs <capture-dir>                    # Analyze a capture
 *   node analyze.cjs <capture-dir> --format md        # Markdown report
 *   node analyze.cjs <capture-dir> --format json      # JSON report
 *   node analyze.cjs <capture-dir> --vision           # Include vision analysis prompts
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ==================== SEVERITY SCORING ====================

const SEVERITY = {
  critical: { score: 10, emoji: '🔴', label: 'Critical' },
  high:     { score: 7,  emoji: '🟠', label: 'High' },
  medium:   { score: 4,  emoji: '🟡', label: 'Medium' },
  low:      { score: 2,  emoji: '🔵', label: 'Low' },
  info:     { score: 1,  emoji: '⚪', label: 'Info' },
};

function createIssue(id, category, severity, title, description, details = {}) {
  return {
    id,
    category,
    severity,
    ...SEVERITY[severity],
    title,
    description,
    ...details,
    fix: details.fix || null,
    viewport: details.viewport || 'all',
  };
}

// ==================== ISSUE DETECTORS ====================

function analyzeOverflow(results) {
  const issues = [];
  for (const page of results) {
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const overflow = vp.metadata?.overflowing || [];
      if (overflow.length === 0) continue;

      // Group by severity
      const layoutBreakers = overflow.filter(o => o.right > o.viewportW + 50);
      const minorOverflow = overflow.filter(o => o.right <= o.viewportW + 50);

      if (layoutBreakers.length > 0) {
        issues.push(createIssue(
          `overflow-major-${vpName}`,
          'responsive',
          'critical',
          `Major horizontal overflow at ${vpName}`,
          `${layoutBreakers.length} element(s) extend significantly beyond viewport (${vp.width}px). This causes horizontal scrolling on ${vp.label}.`,
          {
            viewport: vpName,
            elements: layoutBreakers.slice(0, 5),
            fix: `Check elements with fixed widths, missing \`max-width: 100%\`, or \`overflow-x: hidden\` on containers. Common culprits: images without max-width, tables, pre/code blocks.`,
          }
        ));
      }

      if (minorOverflow.length > 0) {
        issues.push(createIssue(
          `overflow-minor-${vpName}`,
          'responsive',
          'medium',
          `Minor overflow at ${vpName}`,
          `${minorOverflow.length} element(s) slightly exceed viewport width.`,
          { viewport: vpName, elements: minorOverflow.slice(0, 5) }
        ));
      }
    }
  }
  return issues;
}

function analyzeTruncation(results) {
  const issues = [];
  for (const page of results) {
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const truncated = vp.metadata?.truncated || [];
      if (truncated.length === 0) continue;

      issues.push(createIssue(
        `truncation-${vpName}`,
        'visual',
        'high',
        `Text truncation at ${vpName} (${truncated.length} elements)`,
        `Text content is being cut off. Users cannot read the full content.`,
        {
          viewport: vpName,
          elements: truncated.slice(0, 10),
          fix: `Check for \`text-overflow: ellipsis\` without tooltip/expand, fixed-height containers cutting content, or flex items with \`min-width: 0\` missing.`,
        }
      ));
    }
  }
  return issues;
}

function analyzeOverlapping(results) {
  const issues = [];
  for (const page of results) {
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const overlapping = vp.metadata?.overlapping || [];
      if (overlapping.length === 0) continue;

      issues.push(createIssue(
        `overlap-${vpName}`,
        'visual',
        'critical',
        `Interactive elements hidden behind other elements at ${vpName}`,
        `${overlapping.length} buttons/links/inputs are covered by overlapping elements. Users cannot click them.`,
        {
          viewport: vpName,
          elements: overlapping.slice(0, 10),
          fix: `Check z-index stacking, position: absolute/fixed elements, sticky headers covering content. Add \`scroll-margin-top\` for anchored content under fixed headers.`,
        }
      ));
    }
  }
  return issues;
}

function analyzeContrast(results) {
  const issues = [];
  for (const page of results) {
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const contrast = vp.contrast || [];
      if (contrast.length === 0) continue;

      const critical = contrast.filter(c => c.level === 'critical');
      const warnings = contrast.filter(c => c.level === 'warning');

      if (critical.length > 0) {
        issues.push(createIssue(
          `contrast-critical-${vpName}`,
          'accessibility',
          'critical',
          `Critical contrast failures (${critical.length}) at ${vpName}`,
          `Text is nearly invisible against its background. Ratio below 3:1.`,
          {
            viewport: vpName,
            elements: critical.slice(0, 10),
            fix: `Increase contrast ratio to at least 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold). Use a contrast checker tool.`,
          }
        ));
      }

      if (warnings.length > 0) {
        issues.push(createIssue(
          `contrast-warning-${vpName}`,
          'accessibility',
          'high',
          `WCAG AA contrast failures (${warnings.length}) at ${vpName}`,
          `Text contrast below WCAG AA requirement (4.5:1 normal, 3:1 large).`,
          {
            viewport: vpName,
            elements: warnings.slice(0, 10),
            fix: `Darken text or lighten background to meet 4.5:1 ratio.`,
          }
        ));
      }
    }
  }
  return issues;
}

function analyzeDeadInteractive(results) {
  const issues = [];
  for (const page of results) {
    // Check all viewports, but dead buttons/links are usually same across viewports
    // Just use the first one that has data
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const deadButtons = vp.metadata?.deadButtons || [];
      const deadLinks = vp.metadata?.deadLinks || [];

      if (deadButtons.length > 0) {
        issues.push(createIssue(
          `dead-buttons`,
          'functionality',
          'high',
          `${deadButtons.length} non-functional button(s)`,
          `Buttons with no click handler, href, or form submission. Users click them and nothing happens.`,
          {
            elements: deadButtons,
            fix: `Add click handlers, wrap in forms, or convert to regular text if not interactive.`,
          }
        ));
      }

      if (deadLinks.length > 0) {
        issues.push(createIssue(
          `dead-links`,
          'functionality',
          'medium',
          `${deadLinks.length} placeholder link(s) (href="#" or empty)`,
          `Links that don't navigate anywhere. Common in prototypes but must be fixed before launch.`,
          {
            elements: deadLinks,
            fix: `Add real destinations, convert to buttons if they trigger JS actions, or remove if unused.`,
          }
        ));
      }

      break; // Only check one viewport for these
    }
  }
  return issues;
}

function analyzeBrokenLinks(results) {
  const issues = [];
  for (const page of results) {
    if (!page.brokenLinks?.broken?.length) continue;

    const broken = page.brokenLinks.broken;
    const notFound = broken.filter(b => b.status === 404);
    const serverError = broken.filter(b => b.status >= 500);
    const timeout = broken.filter(b => b.status === 0);

    if (notFound.length > 0) {
      issues.push(createIssue(
        `404-links`,
        'functionality',
        'high',
        `${notFound.length} broken link(s) (404 Not Found)`,
        `Links pointing to pages that don't exist.`,
        { elements: notFound, fix: `Update or remove broken links.` }
      ));
    }

    if (serverError.length > 0) {
      issues.push(createIssue(
        `500-links`,
        'functionality',
        'critical',
        `${serverError.length} link(s) returning server errors (5xx)`,
        `Links pointing to server endpoints that are failing.`,
        { elements: serverError }
      ));
    }

    if (timeout.length > 0) {
      issues.push(createIssue(
        `timeout-links`,
        'functionality',
        'medium',
        `${timeout.length} link(s) timing out`,
        `External links that didn't respond within 5 seconds.`,
        { elements: timeout }
      ));
    }
  }
  return issues;
}

function analyzeAccessibility(results) {
  const issues = [];
  for (const page of results) {
    if (!page.accessibility?.violations) continue;

    for (const violation of page.accessibility.violations) {
      const severityMap = {
        critical: 'critical',
        serious: 'high',
        moderate: 'medium',
        minor: 'low',
      };

      issues.push(createIssue(
        `a11y-${violation.id}`,
        'accessibility',
        severityMap[violation.impact] || 'medium',
        `[A11Y] ${violation.help} (${violation.count} instances)`,
        violation.description,
        {
          elements: violation.nodes.slice(0, 5),
          fix: `See: ${violation.helpUrl}`,
          axeId: violation.id,
        }
      ));
    }

    // Check heading structure
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const headings = vp.metadata?.headingStructure || [];
      if (headings.length === 0) continue;

      // Check for skipped heading levels
      let lastLevel = 0;
      const skipped = [];
      for (const h of headings) {
        if (h.level > lastLevel + 1 && lastLevel > 0) {
          skipped.push({ from: `h${lastLevel}`, to: `h${h.level}`, text: h.text });
        }
        lastLevel = h.level;
      }

      if (skipped.length > 0) {
        issues.push(createIssue(
          'heading-skip',
          'accessibility',
          'medium',
          `Skipped heading levels (${skipped.length} instances)`,
          `Heading hierarchy is not sequential. Screen readers use headings for navigation.`,
          { elements: skipped, fix: `Use sequential heading levels (h1 → h2 → h3). Don't skip h2 and go straight to h4.` }
        ));
      }

      // Check for multiple h1s
      const h1s = headings.filter(h => h.level === 1);
      if (h1s.length > 1) {
        issues.push(createIssue(
          'multiple-h1',
          'accessibility',
          'low',
          `Multiple h1 headings (${h1s.length})`,
          `Best practice: one h1 per page.`,
          { elements: h1s }
        ));
      }

      break; // Once per page
    }

    // Images without alt
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const noAlt = vp.metadata?.imagesNoAlt || [];
      if (noAlt.length > 0) {
        issues.push(createIssue(
          'img-no-alt',
          'accessibility',
          'high',
          `${noAlt.length} image(s) missing alt text`,
          `Screen readers cannot describe these images. Required for WCAG compliance.`,
          {
            elements: noAlt,
            fix: `Add descriptive alt="" to images, or alt="" (empty) for decorative images with role="presentation".`,
          }
        ));
      }

      // Unlabeled inputs
      const unlabeled = vp.metadata?.unlabeledInputs || [];
      if (unlabeled.length > 0) {
        issues.push(createIssue(
          'input-no-label',
          'accessibility',
          'high',
          `${unlabeled.length} form input(s) without labels`,
          `Inputs without labels are unusable for screen reader users.`,
          {
            elements: unlabeled,
            fix: `Add <label for="id">, aria-label, or aria-labelledby to all inputs.`,
          }
        ));
      }

      break;
    }
  }
  return issues;
}

function analyzeDesignSystem(results) {
  const issues = [];

  for (const page of results) {
    // Use desktop viewport for design system analysis
    const desktopVp = page.viewports['desktop'] || page.viewports['wide'] || Object.values(page.viewports)[0];
    if (!desktopVp?.metadata) continue;

    // Font consistency
    const fonts = desktopVp.metadata.fonts || [];
    const fontFamilies = [...new Set(fonts.map(f => f.family))];
    if (fontFamilies.length > 4) {
      issues.push(createIssue(
        'too-many-fonts',
        'design-system',
        'medium',
        `Too many font families (${fontFamilies.length})`,
        `Using ${fontFamilies.join(', ')}. Best practice: 2-3 font families max.`,
        {
          elements: fontFamilies,
          fix: `Consolidate to 2-3 font families: one for headings, one for body, optionally one for monospace/code.`,
        }
      ));
    }

    // Font size chaos — too many unique sizes
    const fontSizes = [...new Set(fonts.map(f => f.size))].sort();
    if (fontSizes.length > 10) {
      issues.push(createIssue(
        'too-many-font-sizes',
        'design-system',
        'low',
        `Inconsistent font sizing (${fontSizes.length} unique sizes)`,
        `Sizes: ${fontSizes.join(', ')}. A good type scale has 6-8 distinct sizes.`,
        {
          fix: `Define a type scale (e.g., 12, 14, 16, 18, 24, 32, 48px) and stick to it.`,
        }
      ));
    }

    // Color consistency
    const colors = desktopVp.metadata.colors || [];
    const uniqueColors = colors.length;
    if (uniqueColors > 12) {
      issues.push(createIssue(
        'too-many-colors',
        'design-system',
        'low',
        `Large color palette (${uniqueColors} unique colors)`,
        `May indicate inconsistent theming. A coherent design system uses 5-10 base colors.`,
        {
          elements: colors.slice(0, 15),
          fix: `Define a color palette with primary, secondary, accent, neutral, success, warning, error colors and use CSS variables.`,
        }
      ));
    }

    // Spacing inconsistency
    const spacings = desktopVp.metadata.spacings || [];
    const uniqueMargins = [...new Set(spacings.map(s => s.mt).concat(spacings.map(s => s.mb)))].filter(v => v !== '0px');
    if (uniqueMargins.length > 8) {
      issues.push(createIssue(
        'inconsistent-spacing',
        'design-system',
        'low',
        `Inconsistent spacing (${uniqueMargins.length} unique margin values)`,
        `Margins: ${uniqueMargins.sort().join(', ')}`,
        {
          fix: `Use a spacing scale (e.g., 4, 8, 12, 16, 24, 32, 48, 64px) with Tailwind or CSS variables.`,
        }
      ));
    }
  }

  return issues;
}

function analyzeResponsive(results) {
  const issues = [];

  for (const page of results) {
    const vpNames = Object.keys(page.viewports);
    if (vpNames.length < 2) continue;

    // Check if scroll height changes dramatically between viewports
    const heights = Object.entries(page.viewports).map(([name, vp]) => ({
      name, height: vp.scrollHeight, width: vp.width || VIEWPORTS[name]?.width,
    }));

    // Mobile should generally be taller than desktop (stacked layout)
    // If mobile is shorter, content may be hidden
    const mobileVp = heights.find(h => h.name.includes('mobile'));
    const desktopVp = heights.find(h => h.name.includes('desktop') || h.name === 'wide');

    if (mobileVp && desktopVp && mobileVp.height < desktopVp.height * 0.5) {
      issues.push(createIssue(
        'mobile-content-hidden',
        'responsive',
        'high',
        `Possible hidden content on mobile`,
        `Mobile scroll height (${mobileVp.height}px) is less than half of desktop (${desktopVp.height}px). Content may be hidden with display:none or overflow:hidden.`,
        {
          fix: `Check for desktop-only sections hidden on mobile. Content should be rearranged, not removed.`,
        }
      ));
    }

    // Check element counts across viewports — buttons/links disappearing
    const viewportMeta = Object.entries(page.viewports).map(([name, vp]) => ({
      name,
      buttons: vp.metadata?.counts?.buttons || 0,
      links: vp.metadata?.counts?.links || 0,
    }));

    const maxButtons = Math.max(...viewportMeta.map(v => v.buttons));
    for (const vm of viewportMeta) {
      if (vm.buttons < maxButtons * 0.5 && maxButtons > 5) {
        issues.push(createIssue(
          `missing-buttons-${vm.name}`,
          'responsive',
          'medium',
          `Buttons disappearing at ${vm.name} (${vm.buttons} vs ${maxButtons})`,
          `More than half the interactive buttons are missing. Some may be hidden behind a hamburger menu (OK), but verify all key CTAs are accessible.`,
          { viewport: vm.name }
        ));
      }
    }
  }

  return issues;
}

// ==================== VISION ANALYSIS PROMPTS ====================

function generateVisionPrompts(results) {
  const prompts = [];

  for (const page of results) {
    for (const [vpName, vp] of Object.entries(page.viewports)) {
      const fullScreenshot = vp.screenshots?.fullPage;
      if (!fullScreenshot) continue;

      prompts.push({
        viewport: vpName,
        screenshot: fullScreenshot,
        prompt: `You are a senior UI/UX designer reviewing this ${vp.label} screenshot of ${page.url}.

Analyze this screenshot for:

1. **Layout Issues**: Misaligned elements, uneven spacing, broken grids, overlapping text/images
2. **Visual Hierarchy**: Is the most important content prominent? Clear CTA buttons?
3. **Typography**: Readability, consistent sizing, proper line height, orphan/widow lines
4. **Color & Contrast**: Low-contrast text, clashing colors, inconsistent theme
5. **Whitespace**: Too cramped or too sparse? Balanced padding?
6. **Component Quality**: Broken cards, misaligned buttons, uneven borders, cut-off shadows
7. **Text Visibility**: Any text partially hidden, overlapped, or unreadable?
8. **Image Issues**: Stretched, pixelated, wrong aspect ratio, missing images (broken placeholders)
9. **Navigation**: Clear and accessible? Mobile: hamburger menu working?
10. **Professional Polish**: Does this look like a production-ready app or a rough prototype?

For each issue found, specify:
- Exact location (top/middle/bottom, left/center/right)
- Severity (critical/high/medium/low)
- Specific fix recommendation
- CSS/component-level suggestion

Rate overall visual quality: /10`,
      });
    }
  }

  return prompts;
}

// ==================== REPORT GENERATION ====================

function generateReport(results, allIssues, format = 'text') {
  // Deduplicate issues (same ID across viewports)
  const seen = new Set();
  const uniqueIssues = [];
  for (const issue of allIssues) {
    const key = issue.id.replace(/-mobile|-tablet|-desktop|-wide/, '');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueIssues.push(issue);
    } else {
      // Append viewport info to existing
      const existing = uniqueIssues.find(i => i.id.replace(/-mobile|-tablet|-desktop|-wide/, '') === key);
      if (existing && issue.viewport !== 'all') {
        existing.viewport = existing.viewport === 'all' ? issue.viewport : `${existing.viewport}, ${issue.viewport}`;
      }
    }
  }

  // Sort by severity
  uniqueIssues.sort((a, b) => b.score - a.score);

  // Group by category
  const categories = {};
  for (const issue of uniqueIssues) {
    if (!categories[issue.category]) categories[issue.category] = [];
    categories[issue.category].push(issue);
  }

  const categoryLabels = {
    'responsive': '📱 Responsive / Layout',
    'visual': '👁️ Visual / Text',
    'accessibility': '♿ Accessibility',
    'functionality': '⚙️ Functionality',
    'design-system': '🎨 Design System',
    'performance': '⚡ Performance',
  };

  // Calculate scores
  const totalScore = Math.max(0, 100 - uniqueIssues.reduce((sum, i) => sum + i.score, 0));
  const criticalCount = uniqueIssues.filter(i => i.severity === 'critical').length;
  const highCount = uniqueIssues.filter(i => i.severity === 'high').length;

  if (format === 'json') {
    return JSON.stringify({
      score: totalScore,
      summary: { total: uniqueIssues.length, critical: criticalCount, high: highCount },
      categories,
      issues: uniqueIssues,
    }, null, 2);
  }

  // Markdown report
  let md = `# 🔍 Design Critic Report\n\n`;
  md += `**URL:** ${results[0]?.url || 'Unknown'}\n`;
  md += `**Date:** ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Oslo' })} CET\n`;
  md += `**Pages analyzed:** ${results.length}\n\n`;

  // Score card
  const scoreEmoji = totalScore >= 80 ? '🟢' : totalScore >= 60 ? '🟡' : totalScore >= 40 ? '🟠' : '🔴';
  md += `## ${scoreEmoji} Quality Score: ${totalScore}/100\n\n`;
  md += `| Severity | Count |\n|----------|-------|\n`;
  md += `| 🔴 Critical | ${criticalCount} |\n`;
  md += `| 🟠 High | ${highCount} |\n`;
  md += `| 🟡 Medium | ${uniqueIssues.filter(i => i.severity === 'medium').length} |\n`;
  md += `| 🔵 Low | ${uniqueIssues.filter(i => i.severity === 'low').length} |\n`;
  md += `| ⚪ Info | ${uniqueIssues.filter(i => i.severity === 'info').length} |\n\n`;

  // Issues by category
  for (const [cat, catIssues] of Object.entries(categories)) {
    md += `## ${categoryLabels[cat] || cat}\n\n`;
    for (const issue of catIssues) {
      md += `### ${issue.emoji} ${issue.title}\n`;
      md += `**Severity:** ${issue.label} | **Viewport:** ${issue.viewport}\n\n`;
      md += `${issue.description}\n\n`;
      if (issue.fix) md += `**Fix:** ${issue.fix}\n\n`;
      if (issue.elements?.length) {
        md += `<details><summary>Details (${issue.elements.length} items)</summary>\n\n`;
        md += '```json\n' + JSON.stringify(issue.elements.slice(0, 5), null, 2) + '\n```\n\n</details>\n\n';
      }
    }
  }

  // Accessibility summary
  for (const page of results) {
    if (page.accessibility) {
      md += `## ♿ Accessibility Summary (axe-core)\n\n`;
      md += `- **Violations:** ${page.accessibility.violations.length}\n`;
      md += `- **Passes:** ${page.accessibility.passes}\n`;
      md += `- **Incomplete:** ${page.accessibility.incomplete}\n\n`;
    }
  }

  if (uniqueIssues.length === 0) {
    md += `\n## ✅ No issues found!\n\nThe app looks solid across all tested viewports.\n`;
  }

  return md;
}

// ==================== MAIN ====================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`Design Critic — Analysis Engine

Usage: node analyze.cjs <capture-dir> [options]

Options:
  --format md|json|text   Output format (default: md)
  --vision                Generate vision analysis prompts
  --output FILE           Write report to file`);
    process.exit(0);
  }

  const captureDir = args.find(a => !a.startsWith('--'));
  const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'md';
  const includeVision = args.includes('--vision');
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

  const resultsPath = path.join(captureDir, 'capture-results.json');
  if (!fs.existsSync(resultsPath)) {
    console.error(`❌ No capture results found at: ${resultsPath}`);
    console.error(`   Run capture.cjs first.`);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  console.log(`🔍 Analyzing ${results.length} page(s)...\n`);

  // Run all analyzers
  const allIssues = [
    ...analyzeOverflow(results),
    ...analyzeTruncation(results),
    ...analyzeOverlapping(results),
    ...analyzeContrast(results),
    ...analyzeDeadInteractive(results),
    ...analyzeBrokenLinks(results),
    ...analyzeAccessibility(results),
    ...analyzeDesignSystem(results),
    ...analyzeResponsive(results),
  ];

  console.log(`Found ${allIssues.length} issue(s)\n`);

  // Generate report
  const report = generateReport(results, allIssues, format);

  if (outputFile) {
    fs.writeFileSync(outputFile, report);
    console.log(`📄 Report saved: ${outputFile}`);
  } else {
    console.log(report);
  }

  // Generate vision prompts if requested
  if (includeVision) {
    const prompts = generateVisionPrompts(results);
    const promptsPath = path.join(captureDir, 'vision-prompts.json');
    fs.writeFileSync(promptsPath, JSON.stringify(prompts, null, 2));
    console.log(`\n👁️ Vision prompts saved: ${promptsPath} (${prompts.length} prompts)`);
    console.log(`   Use these with the image tool to get AI visual analysis.`);
  }

  // Save issues JSON alongside capture
  const issuesPath = path.join(captureDir, 'issues.json');
  fs.writeFileSync(issuesPath, JSON.stringify(allIssues, null, 2));

  return { issues: allIssues, report };
}

main();

module.exports = { analyzeOverflow, analyzeTruncation, analyzeOverlapping, analyzeContrast };
