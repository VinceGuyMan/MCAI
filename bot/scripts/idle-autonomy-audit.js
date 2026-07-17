import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from '../commandRegistry.js';
import { getSkill } from '../skillRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(BOT_DIR, '..');

const requiredFiles = [
  'idleAutonomy.js',
  'idleDecision.js',
  'idleMemory.js',
  'idleSpeech.js'
];

const requiredCommands = [
  'idle_status',
  'idle_on',
  'idle_off',
  'quiet_idle',
  'chatty_idle',
  'suppress_idle_suggestion',
  'reset_idle_memory',
  'confirm_reset_idle_memory'
];

function readConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'config.json'), 'utf8'));
}

function fileText(relativePath) {
  return fs.readFileSync(path.join(BOT_DIR, relativePath), 'utf8');
}

function check(condition, message, errors) {
  if (!condition) errors.push(message);
}

function normalizeAllowedSkill(name) {
  if (name === 'bridge_status') return 'server_bridge_status';
  return name;
}

const errors = [];
const config = readConfig();

for (const file of requiredFiles) {
  check(fs.existsSync(path.join(BOT_DIR, file)), `${file} is missing`, errors);
}

for (const key of [
  'idleAutonomyEnabled',
  'idleAutonomyDelayMs',
  'idleAutonomyTickMs',
  'idleAutonomyGlobalCooldownMs',
  'idleAutonomyChatCooldownMs',
  'idleAutonomySuggestionCooldownMs',
  'idleAutonomyRepeatSuppressionMs',
  'idleAutonomyBlockedActions',
  'idleAutonomyAllowedSkills'
]) {
  check(Object.hasOwn(config, key), `config missing ${key}`, errors);
}

const blocked = new Set(config.idleAutonomyBlockedActions || []);
for (const action of ['mine_stone', 'build_shelter', 'execute_trade', 'enter_nether', 'attack']) {
  check(blocked.has(action), `idle blocked actions missing ${action}`, errors);
}

for (const skillName of config.idleAutonomyAllowedSkills || []) {
  const skill = getSkill(normalizeAllowedSkill(skillName));
  check(Boolean(skill), `idle allowed skill is not registered: ${skillName}`, errors);
  if (skill) {
    check(skill.riskLevel === 'low' && skill.requiresConfirmation === false, `idle allowed skill is not low-risk: ${skillName}`, errors);
  }
}

for (const file of ['idleDecision.js', 'idleSpeech.js']) {
  const text = fileText(file);
  check(!/\bbot\.(dig|attack|placeBlock|pathfinder|chat|open)/i.test(text), `${file} appears to call direct Mineflayer actions`, errors);
  check(!/executeAction\s*\(/.test(text), `${file} should not execute actions directly`, errors);
}

const commandNames = new Set(getCommands().map((command) => command.name));
for (const name of requiredCommands) {
  check(commandNames.has(name), `command not registered: ${name}`, errors);
}

check(fs.existsSync(path.join(BOT_DIR, 'test', 'idle-autonomy.test.js')), 'idle autonomy test file is missing', errors);

if (errors.length) {
  console.error(`Idle autonomy audit failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('Idle autonomy audit passed.');
