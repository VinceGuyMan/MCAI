import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateSkillSummary,
  listRiskySkills,
  listUnimplementedSkills,
  validateSkillDefinitions
} from '../skillRegistry.js';
import { loadSkillMemory } from '../skillMemory.js';
import { loadConfig } from '../config.js';
import { createMemory } from '../memory.js';
import { createActions } from '../actions.js';
import { createCancellation } from '../cancellation.js';

async function createMockActions(config, memory) {
  const bot = {
    mcaiConfig: config,
    username: config.botUsername,
    entity: { position: { x: 0, y: 64, z: 0 } },
    players: {},
    entities: {},
    inventory: { items: () => [], slots: [] },
    registry: { itemsByName: {}, blocksByName: {} },
    game: { dimension: 'overworld' },
    health: 20,
    food: 20,
    chat: () => {},
    clearControlStates: () => {},
    lookAt: async () => {},
    equip: async () => {},
    consume: async () => {},
    blockAt: () => null,
    findBlock: () => null,
    findBlocks: () => [],
    nearestEntity: () => null,
    pathfinder: {
      setMovements: () => {},
      setGoal: () => {},
      goto: async () => {}
    }
  };
  const taskQueue = { getCurrentTask: () => null, hasWork: () => false, clearTask: () => {}, clearAll: () => {} };
  const perception = () => ({ position: { x: 0, y: 64, z: 0 }, nearbyPlayers: [], nearbyHostileMobs: [], dangerFlags: {}, health: 20, food: 20 });
  return await createActions(bot, config, { memory, taskQueue, perception, safety: {}, cancellation: createCancellation() });
}

const config = loadConfig();
const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-skill-audit-'));
const actions = await createMockActions(config, createMemory(path.join(auditDir, 'memory.json')));
const validation = validateSkillDefinitions(actions);
const summary = generateSkillSummary();
const auditSkillMemoryPath = path.join(auditDir, 'skill-memory.json');
const memory = loadSkillMemory(auditSkillMemoryPath);

console.log('Skill audit');
console.log(`Definitions: ${validation.count}`);
console.log(`Skill memory: ${auditSkillMemoryPath} (isolated)`);
console.log(`Tracked skill stats: ${Object.keys(memory.skills || {}).length}`);
console.log('');

for (const [category, counts] of Object.entries(summary)) {
  console.log(`${category}: ${counts.implemented}/${counts.total} implemented, ${counts.risky} risky`);
}

const unimplemented = listUnimplementedSkills();
const risky = listRiskySkills().filter((skill) => skill.requiresConfirmation);
console.log('');
console.log(`Unimplemented: ${unimplemented.length ? unimplemented.map((skill) => skill.name).join(', ') : 'none'}`);
console.log(`Confirmation required: ${risky.length ? risky.map((skill) => skill.name).join(', ') : 'none'}`);

if (validation.warnings.length) {
  console.log('');
  for (const warning of validation.warnings) console.log(`WARN ${warning}`);
}

if (validation.errors.length) {
  console.log('');
  for (const error of validation.errors) console.log(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  console.log('');
  console.log('PASS skill registry valid');
}
