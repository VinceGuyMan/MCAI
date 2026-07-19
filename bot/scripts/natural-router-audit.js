import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands, findCommandAlias, validateCommandWiring } from '../commandRegistry.js';
import { getNaturalCommandPatterns, getNaturalExamples } from '../naturalCommandMap.js';
import { routeNaturalCommand } from '../naturalCommandRouter.js';
import { isInformationalOwnerQuery } from '../thinCore.js';
import { createActions } from '../actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

async function mockActions() {
  const bot = {
    username: 'tj',
    players: {},
    entities: {},
    health: 20,
    food: 20,
    time: {},
    chat: () => {},
    pathfinder: { setMovements: () => {}, setGoal: () => {}, stop: () => {} },
    registry: { blocksByName: {}, itemsByName: {} },
    entity: { position: { distanceTo: () => 0 } },
    inventory: { items: () => [], slots: [] }
  };
  const memory = { get: () => ({}), update: () => {}, set: () => {} };
  return await createActions(bot, { ownerUsername: 'ModVinny', botUsername: 'tj', chatCooldownMs: 0 }, {
    memory,
    taskQueue: {},
    safety: {},
    perception: () => ({}),
    cancellation: { cancelAll: () => {}, reset: () => {}, isCancelled: () => false, throwIfCancelled: () => {} }
  });
}

const errors = [];
const commands = getCommands();
const commandAliases = new Set(commands.flatMap((command) => command.aliases || []));
const competentCoreOverrides = new Map([
  ['tj get food', 'tj run core get food'],
  ['tj find food', 'tj run core get food'],
  ['tj gather wood', 'tj run core gather wood'],
  ['tj mine stone', 'tj run core mine stone'],
  ['tj mine coal', 'tj run core mine coal'],
  ['tj mine iron', 'tj run core mine iron'],
  ['tj follow me', 'tj run core follow owner'],
  ['tj return home', 'tj run core return home'],
  ['tj store items', 'tj run core store items'],
  ['tj hunt food', 'tj get food'],
  ['tj smelt charcoal', 'tj run core smelt charcoal'],
  ['tj smelt iron', 'tj run core smelt iron'],
  ['tj craft basic tools', 'tj run core craft basic tools'],
  ['tj craft stone tools', 'tj run core craft stone tools'],
  ['tj progress to iron', 'tj run core progress to iron'],
  ['tj prepare for mining', 'tj run core prepare for mining'],
  ['tj prepare for night', 'tj run core prepare for night']
]);

for (const pattern of getNaturalCommandPatterns()) {
  if (pattern.canonicalCommand) {
    const command = findCommandAlias(pattern.canonicalCommand);
    if (!command || !command.implemented) errors.push(`${pattern.intent} maps to unknown/unimplemented command ${pattern.canonicalCommand}`);
    if (command?.requiresConfirmation && pattern.mode !== 'refuse' && pattern.riskLevel === 'low') {
      errors.push(`${pattern.intent} maps to confirmation command but claims low risk`);
    }
  }
  for (const alternative of pattern.alternatives || []) {
    const command = findCommandAlias(alternative.canonicalCommand);
    if (!command || !command.implemented) errors.push(`${pattern.intent} alternative maps to unknown command ${alternative.canonicalCommand}`);
  }
}

for (const example of getNaturalExamples()) {
  const bot = { mcaiConfig: { ownerUsername: 'ModVinny', botUsername: 'tj', naturalCommandRouterEnabled: true, llmFallbackForMessyCommands: false } };
  const memory = { state: {}, get() { return this.state; }, update(patch) { this.state = { ...this.state, ...patch }; } };
  const route = await routeNaturalCommand(bot, memory, {
    rawText: `tj ${example.example}`,
    isOwner: true,
    addressedToBot: true,
    dryRun: true,
    config: bot.mcaiConfig
  });
  const allowedOverride = competentCoreOverrides.get(example.canonicalCommand);
  if (route.mode === 'answer' && isInformationalOwnerQuery(example.example)) continue;
  if (example.canonicalCommand && route.canonicalCommand !== example.canonicalCommand && route.canonicalCommand !== allowedOverride) {
    errors.push(`natural example "${example.example}" expected ${example.canonicalCommand} but got ${route.canonicalCommand || route.mode}`);
  }
}

const wiring = validateCommandWiring(await mockActions());
if (!wiring.ok) errors.push(`command wiring missing actions: ${wiring.missing.map((item) => `${item.name}:${item.action}`).join(', ')}`);

const routerSource = fs.readFileSync(path.join(botDir, 'naturalCommandRouter.js'), 'utf8');
const classifierSource = fs.readFileSync(path.join(botDir, 'naturalIntentClassifier.js'), 'utf8');
if (/openai|api\.openai|anthropic|gemini|cloud/i.test(`${routerSource}\n${classifierSource}`)) errors.push('natural router contains a cloud/OpenAI reference');
if (/bot\.(dig|attack|placeBlock|chat|pathfinder\.goto)/.test(routerSource)) errors.push('natural router appears to call Mineflayer directly');

if (!commandAliases.has('tj stop')) errors.push('stop command alias missing');

console.log('Natural router audit');
console.log(`Commands: ${commands.length}`);
console.log(`Natural patterns: ${getNaturalCommandPatterns().length}`);
console.log(`Natural examples: ${getNaturalExamples().length}`);

if (errors.length) {
  console.error('FAIL natural router audit');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('PASS natural router audit');
