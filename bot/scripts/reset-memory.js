import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../config.js';
import { ensureMapMemoryShape, saveMapMemory } from '../mapMemory.js';
import { ensureGoalsShape, saveGoals } from '../goals.js';
import { ensureConversationMemoryShape, saveConversationMemory } from '../conversationMemory.js';

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to reset memory without --confirm. Run: npm run reset:memory -- --confirm');
  process.exit(1);
}

const files = ['memory.json', 'map-memory.json', 'goals.json', 'conversation-memory.json'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(projectRoot, 'backups', `pre-reset-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });

for (const file of files) {
  const source = path.join(projectRoot, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(backupDir, file));
}

fs.writeFileSync(path.join(projectRoot, 'memory.json'), `${JSON.stringify({}, null, 2)}\n`);
saveMapMemory(ensureMapMemoryShape({ createdAt: Date.now(), updatedAt: Date.now() }));
saveGoals(ensureGoalsShape({ createdAt: Date.now(), updatedAt: Date.now() }));
saveConversationMemory(ensureConversationMemoryShape({ createdAt: Date.now(), updatedAt: Date.now() }));

console.log(`Memory reset complete. Previous files backed up to ${backupDir}`);
