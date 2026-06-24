#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const distIndex = path.join(repoRoot, 'frontend/dist/index.html');
const distAssetsDir = path.join(repoRoot, 'frontend/dist/assets');
const sourceWatchRoots = [
  path.join(repoRoot, 'frontend/src/components/TestWizard/shipping'),
  path.join(repoRoot, 'frontend/src/components/TestWizard/TestWizard.jsx'),
];

const STEP1_DIST_MARKERS = ['Free over threshold', 'Select a shipping test type'];

function walkNewestMtime(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  let max = 0;
  const walk = currentPath => {
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath)) {
        walk(path.join(currentPath, entry));
      }
      return;
    }
    if (/\.(jsx?|css|mjs)$/.test(currentPath)) {
      max = Math.max(max, stat.mtimeMs);
    }
  };
  walk(targetPath);
  return max;
}

function distHasStep1WizardBundle() {
  if (!fs.existsSync(distAssetsDir)) return false;
  const bundleContents = fs
    .readdirSync(distAssetsDir)
    .filter(fileName => fileName.endsWith('.js'))
    .map(fileName => fs.readFileSync(path.join(distAssetsDir, fileName), 'utf8'));
  return STEP1_DIST_MARKERS.every(marker =>
    bundleContents.some(content => content.includes(marker))
  );
}

function getDistStatus() {
  if (!fs.existsSync(distIndex)) {
    return { stale: true, reason: 'frontend/dist/index.html is missing' };
  }
  const distMtime = fs.statSync(distIndex).mtimeMs;
  const sourceMtime = Math.max(...sourceWatchRoots.map(root => walkNewestMtime(root)), 0);
  if (sourceMtime > distMtime) {
    return { stale: true, reason: 'shipping wizard source is newer than frontend/dist' };
  }
  if (!distHasStep1WizardBundle()) {
    return {
      stale: true,
      reason: 'frontend/dist is missing Step 1 incentive wizard bundle markers',
    };
  }
  return { stale: false, reason: 'frontend/dist is up to date' };
}

function runBuild() {
  const result = spawnSync('npm', ['run', 'build:frontend'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const force = process.argv.includes('--force');
  const checkOnly = process.argv.includes('--check');
  const status = getDistStatus();

  if (checkOnly) {
    if (status.stale) {
      console.error(`[ensure-frontend-dist] FAIL - ${status.reason}`);
      console.error('[ensure-frontend-dist] Run: npm run build:frontend');
      process.exit(1);
    }
    console.log(`[ensure-frontend-dist] PASS - ${status.reason}`);
    return;
  }

  if (!force && !status.stale) {
    console.log(`[ensure-frontend-dist] ${status.reason}`);
    return;
  }

  console.log(
    `[ensure-frontend-dist] Rebuilding frontend${force ? ' (forced)' : ''}: ${status.reason}`
  );
  runBuild();

  const after = getDistStatus();
  if (after.stale) {
    console.error(
      `[ensure-frontend-dist] Build finished but dist still looks stale: ${after.reason}`
    );
    process.exit(1);
  }
  console.log(`[ensure-frontend-dist] ${after.reason}`);
}

main();
