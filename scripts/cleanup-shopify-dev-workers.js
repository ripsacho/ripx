#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Stop orphaned RipX dev workers left behind after a failed `shopify app dev` run.
 * Prevents EADDRINUSE on ports 3001 / 9293 on the next start.
 *
 * Usage:
 *   node scripts/cleanup-shopify-dev-workers.js
 *   RIPX_CLEANUP_DRY_RUN=true node scripts/cleanup-shopify-dev-workers.js
 */

const { execSync } = require('child_process');

const MATCH_PATTERNS = [
  'npm run dev:shopify:web',
  'node backend/src/app.js',
  'vite --port 3001 --strictPort',
  'node_modules/.bin/concurrently',
  'node_modules/.bin/nodemon',
];

function getMatchingPids() {
  const pids = new Set();
  MATCH_PATTERNS.forEach(pattern => {
    try {
      const out = execSync(`pgrep -f "${pattern.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      out
        .split(/\r?\n/)
        .map(v => Number(v.trim()))
        .filter(n => Number.isInteger(n) && n > 0)
        .forEach(pid => pids.add(pid));
    } catch {
      // pgrep returns non-zero when no matches
    }
  });
  return Array.from(pids).sort((a, b) => a - b);
}

function getCommand(pid) {
  try {
    return execSync(`ps -p ${pid} -o command=`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '(unknown)';
  }
}

function main() {
  const dryRun = String(process.env.RIPX_CLEANUP_DRY_RUN || '').toLowerCase() === 'true';
  const selfPid = process.pid;
  const pids = getMatchingPids().filter(pid => pid !== selfPid);

  if (pids.length === 0) {
    console.log('[cleanup-shopify-dev-workers] no orphaned workers found');
    return;
  }

  pids.forEach(pid => {
    console.log(
      `[cleanup-shopify-dev-workers] ${dryRun ? 'would stop' : 'stopping'} pid ${pid}: ${getCommand(pid)}`
    );
  });

  if (dryRun) {
    return;
  }

  pids.forEach(pid => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  });

  // Give processes a moment to exit gracefully, then force-kill survivors.
  execSync('sleep 1', { stdio: 'ignore' });
  const survivors = getMatchingPids().filter(pid => pid !== selfPid);
  survivors.forEach(pid => {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  });

  if (survivors.length > 0) {
    console.log(
      `[cleanup-shopify-dev-workers] force-stopped ${survivors.length} stubborn process(es)`
    );
  } else {
    console.log(`[cleanup-shopify-dev-workers] stopped ${pids.length} process(es)`);
  }
}

main();
