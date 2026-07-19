import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const listed = spawnSync('git', ['ls-files', '-z', '--', '*.js', '*.mjs'], {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
});

if (listed.error || listed.status !== 0) {
  console.error(listed.error?.message || listed.stderr || 'Unable to list tracked JavaScript files.');
  process.exit(1);
}

const files = listed.stdout.split('\0').filter(Boolean);
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(projectRoot, file)], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    failures.push({ file, detail: result.stderr || result.stdout || `exit ${result.status}` });
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n[syntax] ${failure.file}\n${failure.detail.trim()}`);
  }
  console.error(`\n[syntax] ${failures.length}/${files.length} tracked JavaScript files failed.`);
  process.exit(1);
}

console.log(`[syntax] ${files.length} tracked JavaScript files passed.`);
