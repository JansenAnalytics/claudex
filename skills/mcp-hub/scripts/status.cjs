#!/usr/bin/env node
/**
 * Quick health check for all configured MCP servers.
 * Usage: node status.cjs
 */

const { execSync } = require('child_process');

try {
  const output = execSync('mcporter list', { encoding: 'utf8', timeout: 60000 });
  console.log(output);
} catch (e) {
  console.error('Failed to list MCP servers:', e.message);
  process.exit(1);
}
