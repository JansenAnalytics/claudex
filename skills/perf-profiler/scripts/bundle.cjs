#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HEAVY_ALTERNATIVES = {
  'moment': { alt: 'dayjs or date-fns', reason: 'moment.js is 300KB+, dayjs is 2KB' },
  'lodash': { alt: 'lodash-es or native', reason: 'lodash full bundle is 70KB+, use lodash-es for tree-shaking' },
  'axios': { alt: 'native fetch', reason: 'axios is 13KB+, fetch is built-in' },
  'jquery': { alt: 'native DOM APIs', reason: 'jQuery is 90KB+, modern browsers have equivalent APIs' },
  'underscore': { alt: 'lodash-es or native', reason: 'underscore is 16KB+' },
  'bluebird': { alt: 'native Promise', reason: 'native Promises are now fast enough' },
  'core-js': { alt: 'targeted polyfills', reason: 'core-js can add 100KB+, use browserslist targeting' },
  'uuid': { alt: 'crypto.randomUUID()', reason: 'built-in in modern runtimes' },
};

function findBuildDir(baseDir) {
  const candidates = ['dist', 'build', '.next/static', 'out', 'public/build'];
  for (const c of candidates) {
    const p = path.join(baseDir, c);
    if (fs.existsSync(p)) return p;
  }
  return baseDir;
}

function walkFiles(dir, exts) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        results.push(...walkFiles(full, exts));
      } else if (exts.some(ext => e.name.endsWith(ext))) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

function getGzipSize(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function parseSourceMap(mapPath) {
  try {
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const packages = {};
    if (!map.sources || !map.sourcesContent) return null;
    for (let i = 0; i < map.sources.length; i++) {
      const src = map.sources[i];
      const size = map.sourcesContent[i] ? Buffer.byteLength(map.sourcesContent[i]) : 0;
      const match = src.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
      if (match) {
        const pkg = match[1];
        packages[pkg] = (packages[pkg] || 0) + size;
      }
    }
    return packages;
  } catch { return null; }
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

function main() {
  const args = process.argv.slice(2);
  const useSourceMaps = args.includes('--source-maps');
  const buildDir = args.find(a => !a.startsWith('-'));
  if (!buildDir) { console.error('Usage: node bundle.cjs <build-dir> [--source-maps]'); process.exit(1); }

  const resolvedDir = path.resolve(buildDir);
  const scanDir = findBuildDir(resolvedDir);
  const jsFiles = walkFiles(scanDir, ['.js', '.mjs', '.cjs']);
  const cssFiles = walkFiles(scanDir, ['.css']);
  const allFiles = [...jsFiles, ...cssFiles];

  if (allFiles.length === 0) {
    console.log(`No JS/CSS files found in ${scanDir}`);
    process.exit(0);
  }

  const files = [];
  let totalSize = 0, totalGzip = 0;
  const allPackages = {};
  const findings = [];

  for (const f of allFiles) {
    const buf = fs.readFileSync(f);
    const size = buf.length;
    const gzip = getGzipSize(buf);
    const rel = path.relative(resolvedDir, f);
    const ext = path.extname(f);

    totalSize += size;
    totalGzip += gzip;

    const entry = { path: rel, size, gzipSize: gzip, type: ext === '.css' ? 'css' : 'js' };

    if (size > 500 * 1024) {
      findings.push({ severity: 'critical', message: `${rel} is ${formatBytes(size)} (>${formatBytes(500*1024)})`, file: rel });
      entry.flag = 'critical';
    } else if (size > 250 * 1024) {
      findings.push({ severity: 'warning', message: `${rel} is ${formatBytes(size)} (>${formatBytes(250*1024)})`, file: rel });
      entry.flag = 'warning';
    }

    if (useSourceMaps) {
      const mapPath = f + '.map';
      if (fs.existsSync(mapPath)) {
        const pkgs = parseSourceMap(mapPath);
        if (pkgs) {
          entry.packages = pkgs;
          for (const [k, v] of Object.entries(pkgs)) {
            allPackages[k] = (allPackages[k] || 0) + v;
          }
        }
      }
    }
    files.push(entry);
  }

  // Total bundle flags
  if (totalSize > 2 * 1024 * 1024) {
    findings.push({ severity: 'critical', message: `Total bundle ${formatBytes(totalSize)} exceeds 2MB` });
  } else if (totalSize > 1024 * 1024) {
    findings.push({ severity: 'warning', message: `Total bundle ${formatBytes(totalSize)} exceeds 1MB` });
  }

  // Check heavy packages
  const detectedHeavy = [];
  for (const pkg of Object.keys(allPackages)) {
    const base = pkg.replace(/@[^/]+\//, '').split('/')[0];
    if (HEAVY_ALTERNATIVES[base]) {
      detectedHeavy.push({ package: pkg, size: allPackages[pkg], ...HEAVY_ALTERNATIVES[base] });
      findings.push({ severity: 'warning', message: `Heavy package "${pkg}" (${formatBytes(allPackages[pkg])}): consider ${HEAVY_ALTERNATIVES[base].alt}` });
    }
  }

  // Check file contents for heavy package imports (even without source maps)
  if (!useSourceMaps) {
    const allContent = jsFiles.slice(0, 20).map(f => { try { return fs.readFileSync(f, 'utf8').slice(0, 50000); } catch { return ''; } }).join('\n');
    for (const [pkg, info] of Object.entries(HEAVY_ALTERNATIVES)) {
      if (allContent.includes(`"${pkg}"`) || allContent.includes(`'${pkg}'`) || allContent.includes(`/${pkg}/`)) {
        if (!detectedHeavy.find(h => h.package === pkg)) {
          detectedHeavy.push({ package: pkg, ...info });
          findings.push({ severity: 'info', message: `Detected "${pkg}" in bundle: consider ${info.alt}` });
        }
      }
    }
  }

  // Duplicate detection from source maps
  const dupCheck = {};
  if (useSourceMaps) {
    for (const f of jsFiles) {
      const mapPath = f + '.map';
      if (!fs.existsSync(mapPath)) continue;
      try {
        const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        for (const src of (map.sources || [])) {
          const m = src.match(/node_modules\/(?:(@[^/]+\/[^/]+|[^/]+)).*?\/package\.json/);
          if (!m) continue;
          // simplified dup detection by presence in multiple chunks
        }
      } catch {}
    }
  }

  const sortedFiles = [...files].sort((a, b) => b.size - a.size);
  const topPackages = Object.entries(allPackages).sort((a, b) => b[1] - a[1]).slice(0, 20);

  const result = {
    scanDir,
    totalFiles: allFiles.length,
    jsFiles: jsFiles.length,
    cssFiles: cssFiles.length,
    totalSize,
    totalGzipSize: totalGzip,
    files: sortedFiles,
    topPackages: topPackages.map(([name, size]) => ({ name, size, gzipSize: null })),
    heavyPackages: detectedHeavy,
    findings,
  };

  const outPath = path.join(process.cwd(), 'bundle-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  // Human-readable report
  console.log('\n📦 BUNDLE SIZE ANALYSIS');
  console.log('═'.repeat(60));
  console.log(`Directory: ${scanDir}`);
  console.log(`Files: ${jsFiles.length} JS, ${cssFiles.length} CSS`);
  console.log(`Total size: ${formatBytes(totalSize)} (gzip: ${formatBytes(totalGzip)})`);
  console.log('');

  console.log('Top files by size:');
  for (const f of sortedFiles.slice(0, 15)) {
    const flag = f.flag === 'critical' ? ' 🔴' : f.flag === 'warning' ? ' 🟡' : '';
    console.log(`  ${formatBytes(f.size).padStart(10)} (gz: ${formatBytes(f.gzipSize).padStart(10)}) ${f.path}${flag}`);
  }

  if (topPackages.length > 0) {
    console.log('\nTop npm packages by source size:');
    for (const [name, size] of topPackages.slice(0, 10)) {
      console.log(`  ${formatBytes(size).padStart(10)}  ${name}`);
    }
  }

  if (detectedHeavy.length > 0) {
    console.log('\n⚠️  Heavy packages detected:');
    for (const h of detectedHeavy) {
      console.log(`  ${h.package}: ${h.reason}`);
      console.log(`    → Alternative: ${h.alt}`);
    }
  }

  if (findings.length > 0) {
    console.log('\nFindings:');
    for (const f of findings) {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : 'ℹ️';
      console.log(`  ${icon} ${f.message}`);
    }
  }

  console.log(`\nFull report: ${outPath}`);
}

main();
