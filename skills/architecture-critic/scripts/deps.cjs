#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputFile = args.find((a,i) => args[i-1] === '--output') || 'dependency-graph.json';

function getFiles(dir, exts) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      if (entry.isDirectory()) results.push(...getFiles(full, exts));
      else if (exts.some(e => entry.name.endsWith(e))) results.push(full);
    }
  } catch(e) {}
  return results;
}

function resolveImport(from, importPath, files) {
  if (importPath.startsWith('.')) {
    const dir = path.dirname(from);
    let resolved = path.resolve(dir, importPath);
    // Try extensions
    for (const ext of ['', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '/index.js', '/index.ts']) {
      const full = resolved + ext;
      if (files.includes(full)) return full;
    }
  }
  return null; // external dependency
}

function run() {
  const absDir = path.resolve(projectDir);
  const files = getFiles(absDir, ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
  
  const graph = {}; // file -> [dependencies]
  const reverseGraph = {}; // file -> [dependents]
  
  for (const f of files) {
    graph[f] = [];
    reverseGraph[f] = reverseGraph[f] || [];
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const deps = new Set();
    
    for (const line of lines) {
      let m;
      // import ... from 'path'
      if ((m = line.match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/))) {
        const resolved = resolveImport(file, m[1], files);
        if (resolved) deps.add(resolved);
      }
      // require('path')
      if ((m = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/))) {
        const resolved = resolveImport(file, m[1], files);
        if (resolved) deps.add(resolved);
      }
    }
    
    graph[file] = [...deps];
    for (const dep of deps) {
      if (!reverseGraph[dep]) reverseGraph[dep] = [];
      reverseGraph[dep].push(file);
    }
  }

  // Detect circular dependencies (DFS)
  const cycles = [];
  function findCycles(node, visited, stack, stackSet) {
    visited.add(node);
    stack.push(node);
    stackSet.add(node);
    for (const dep of (graph[node] || [])) {
      if (stackSet.has(dep)) {
        const idx = stack.indexOf(dep);
        const cycle = stack.slice(idx).map(f => path.relative(absDir, f));
        cycle.push(path.relative(absDir, dep));
        cycles.push(cycle);
      } else if (!visited.has(dep)) {
        findCycles(dep, visited, stack, stackSet);
      }
    }
    stack.pop();
    stackSet.delete(node);
  }
  const visited = new Set();
  for (const f of files) {
    if (!visited.has(f)) findCycles(f, visited, [], new Set());
  }

  // Coupling metrics
  const metrics = files.map(f => {
    const rel = path.relative(absDir, f);
    const ca = (reverseGraph[f] || []).length; // afferent (who depends on me)
    const ce = (graph[f] || []).length; // efferent (who I depend on)
    const instability = (ca + ce) > 0 ? Math.round((ce / (ca + ce)) * 100) / 100 : 0;
    return { file: rel, afferentCoupling: ca, efferentCoupling: ce, instability };
  });

  const godModules = metrics.filter(m => m.afferentCoupling > 10)
    .map(m => ({ file: m.file, dependents: m.afferentCoupling }));

  // Deep chains (BFS from each file)
  const deepChains = [];
  for (const f of files) {
    const queue = [[f]];
    const seen = new Set([f]);
    while (queue.length) {
      const chain = queue.shift();
      if (chain.length > 5) {
        deepChains.push(chain.map(x => path.relative(absDir, x)));
        continue;
      }
      for (const dep of (graph[chain[chain.length - 1]] || [])) {
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push([...chain, dep]);
        }
      }
    }
  }

  // Fragile modules: high instability + high dependents
  const fragile = metrics.filter(m => m.instability > 0.7 && m.afferentCoupling > 3);

  const report = {
    summary: {
      filesAnalyzed: files.length,
      totalEdges: Object.values(graph).reduce((s, d) => s + d.length, 0),
      circularDependencies: cycles.length,
      godModules: godModules.length,
      deepChains: deepChains.length,
      fragileModules: fragile.length
    },
    graph: Object.fromEntries(Object.entries(graph).map(([k, v]) => [path.relative(absDir, k), v.map(x => path.relative(absDir, x))])),
    circularDependencies: cycles,
    godModules,
    deepChains: deepChains.slice(0, 10),
    fragileModules: fragile,
    metrics
  };

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

  console.log(`\n🕸️  Dependency Graph: ${files.length} files, ${report.summary.totalEdges} edges`);
  console.log(`   Circular deps: ${cycles.length}, God modules: ${godModules.length}, Deep chains: ${deepChains.length}\n`);
  
  for (const [file, deps] of Object.entries(report.graph)) {
    if (deps.length) console.log(`   ${file} → ${deps.join(', ')}`);
  }
  if (cycles.length) {
    console.log('\n   ⚠️ Circular dependencies:');
    for (const c of cycles) console.log(`     ${c.join(' → ')}`);
  }
  console.log(`\nReport: ${outputFile}`);
}

run();
