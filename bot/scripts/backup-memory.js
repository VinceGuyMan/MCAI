import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../config.js';

const files = ['memory.json', 'map-memory.json', 'goals.json', 'conversation-memory.json'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(projectRoot, 'backups', `memory-${stamp}`);

fs.mkdirSync(backupDir, { recursive: true });

for (const file of files) {
  const source = path.join(projectRoot, file);
  if (!fs.existsSync(source)) {
    console.log(`SKIP ${file} missing`);
    continue;
  }
  fs.copyFileSync(source, path.join(backupDir, file));
  console.log(`BACKUP ${file}`);
}

console.log(`Memory backup written to ${backupDir}`);
