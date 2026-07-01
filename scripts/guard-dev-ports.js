#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('child_process');

function getArg(flagName) {
  const eqArg = process.argv.find(arg => arg.startsWith(`${flagName}=`));
  if (eqArg) {
    return eqArg.slice(flagName.length + 1).trim();
  }
  const idx = process.argv.indexOf(flagName);
  if (idx >= 0 && process.argv[idx + 1]) {
    return String(process.argv[idx + 1]).trim();
  }
  return '';
}

function getListeningPids(port) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Array.from(
      new Set(
        String(out || '')
          .split(/\r?\n/)
          .map(v => Number(v.trim()))
          .filter(n => Number.isInteger(n) && n > 0)
      )
    );
  } catch {
    return [];
  }
}

function getCommandForPid(pid) {
  try {
    return execSync(`ps -p ${pid} -o command=`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '(unknown command)';
  }
}

function collectListeners(port) {
  const pids = getListeningPids(port);
  return pids.map(pid => ({
    pid,
    command: getCommandForPid(pid),
    port,
  }));
}

function printListeners(listeners) {
  listeners.forEach(({ port, pid, command }) => {
    console.error(`- port ${port}: pid ${pid} -> ${command}`);
  });
}

function main() {
  if (String(process.env.RIPX_SKIP_PORT_GUARD || '').toLowerCase() === 'true') {
    console.log('[guard-dev-ports] skipped (RIPX_SKIP_PORT_GUARD=true)');
    process.exit(0);
  }

  const mode = String(getArg('--mode') || 'dev').toLowerCase();
  const ports = mode === 'shopify' ? [3000] : [3000, 3001];
  const listeners = ports.flatMap(collectListeners);

  if (listeners.length === 0) {
    console.log(`[guard-dev-ports] ok (${mode}) — required ports are free.`);
    process.exit(0);
  }

  console.error(`[guard-dev-ports] blocked (${mode}) — conflicting listeners found:`);
  printListeners(listeners);
  console.error('');
  if (mode === 'shopify') {
    console.error('To continue with Shopify dev, stop existing process on port 3000 first.');
    console.error('Common fix: stop root `npm run dev` before `shopify app dev`.');
  } else {
    console.error('To continue with local dev, free ports 3000/3001 first.');
    console.error('Common fix: stop Shopify CLI dev and stale node processes, then rerun.');
  }
  console.error('Override once (not recommended): RIPX_SKIP_PORT_GUARD=true');
  process.exit(1);
}

main();
