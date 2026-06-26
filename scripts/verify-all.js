#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const STEPS = [
  {
    name: 'Committed tunnel URL guard',
    command: 'npm',
    args: ['run', 'verify:committed-tunnel-urls'],
  },
  {
    name: 'Production OAuth toml guard',
    command: 'npm',
    args: ['run', 'verify:oauth-alignment'],
  },
  { name: 'Backend tests', command: 'npm', args: ['run', 'test:backend'] },
  { name: 'Frontend tests', command: 'npm', args: ['run', 'test:frontend'] },
  { name: 'Shipping readiness', command: 'npm', args: ['run', 'verify:shipping-readiness'] },
  { name: 'Shipping wizard v3', command: 'npm', args: ['run', 'verify:shipping-wizard-v3'] },
];

function runStep(step) {
  console.log(`\n=== ${step.name} ===`);
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function main() {
  const failures = [];
  for (const step of STEPS) {
    if (!runStep(step)) {
      failures.push(step.name);
    }
  }

  console.log('\n=== verify:all summary ===');
  if (failures.length === 0) {
    console.log('✅ All verification steps passed.');
    return;
  }

  console.error('❌ Failed steps:');
  failures.forEach(name => console.error(`  - ${name}`));
  process.exit(1);
}

main();
