import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(botDir, 'package.json'), 'utf8'));
const scripts = packageJson.scripts || {};

const auditScripts = [
  'doctor',
  'smoke',
  'skill:audit',
  'skill:runner:test',
  'evidence:audit',
  'curriculum:audit',
  'curriculum:execution:audit',
  'dashboard:test',
  'progression:audit',
  'gear:audit',
  'villager:audit',
  'blueprint:audit',
  'bridge:audit',
  'test:phase10-16'
];

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

for (const scriptName of auditScripts) {
  if (!scripts[scriptName]) {
    results.push({ script: scriptName, status: 'missing', exitCode: null });
    console.warn(`[phase10-16] missing npm script: ${scriptName}`);
    continue;
  }

  console.log(`\n[phase10-16] running npm run ${scriptName}`);
  const startedAt = Date.now();
  const command = process.platform === 'win32' ? `${npmCommand} run ${scriptName}` : npmCommand;
  const args = process.platform === 'win32' ? [] : ['run', scriptName];
  const result = spawnSync(command, args, {
    cwd: botDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error && result.error.code !== 'ETIMEDOUT') {
    console.error(`[phase10-16] failed to spawn ${scriptName}: ${result.error.message}`);
  }

  const durationMs = Date.now() - startedAt;
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const exitCode = timedOut ? 124 : result.status ?? 1;
  results.push({
    script: scriptName,
    status: exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    durationMs
  });
}

console.log('\n[phase10-16] audit summary');
for (const item of results) {
  const suffix = item.durationMs == null ? '' : ` (${Math.round(item.durationMs / 100) / 10}s)`;
  console.log(`- ${item.script}: ${item.status}${item.exitCode == null ? '' : ` exit ${item.exitCode}`}${suffix}`);
}

const failures = results.filter((item) => item.status === 'failed');
if (failures.length) {
  console.error(`\n[phase10-16] ${failures.length} sub-audit(s) failed.`);
  process.exit(1);
}

const missing = results.filter((item) => item.status === 'missing');
if (missing.length) {
  console.warn(`\n[phase10-16] ${missing.length} optional sub-audit(s) were missing and should be reviewed.`);
}

console.log('\n[phase10-16] regression audit completed.');
