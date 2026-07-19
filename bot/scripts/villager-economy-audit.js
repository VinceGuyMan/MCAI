import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from '../commandRegistry.js';
import { getSkill } from '../skillRegistry.js';
import { getEvidenceDefinition } from '../progressEvidence.js';
import * as villagerMemory from '../villagerMemory.js';
import * as villagerScanner from '../villagerScanner.js';
import * as villagerTrading from '../villagerTrading.js';
import * as tradeScoring from '../tradeScoring.js';
import * as economyManager from '../economyManager.js';
import * as tradeSafety from '../tradeSafety.js';
import * as villageProtection from '../villageProtection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');

const requiredModules = {
  villagerMemory,
  villagerScanner,
  villagerTrading,
  tradeScoring,
  economyManager,
  tradeSafety,
  villageProtection
};

const requiredActions = [
  'villagerStatus',
  'scanVillagers',
  'tradingStatus',
  'economyStatus',
  'inspectVillagerTrades',
  'executeApprovedTrade'
];

const requiredCommands = [
  'villager_status',
  'scan_villagers',
  'known_villagers',
  'valuable_villagers',
  'trading_status',
  'economy_status',
  'execute_trade',
  'confirm_trade',
  'mark_villager_valuable',
  'confirm_villager_memory',
  'trade_history'
];

const evidenceNames = [
  'village_found',
  'villager_seen',
  'villager_profession_recorded',
  'villager_trade_inspected',
  'trade_options_reported',
  'emerald_count_reported',
  'trade_completed',
  'emeralds_spent',
  'emeralds_earned',
  'valuable_trade_found',
  'librarian_found',
  'mending_trade_found',
  'villager_memory_updated',
  'village_waypoint_created',
  'villager_protected_reported'
];

const errors = [];
const warnings = [];

for (const [name, mod] of Object.entries(requiredModules)) {
  if (!mod || Object.keys(mod).length === 0) errors.push(`${name} did not load`);
}

const commands = getCommands();
for (const commandName of requiredCommands) {
  const command = commands.find((item) => item.name === commandName);
  if (!command) errors.push(`missing command ${commandName}`);
}

const tradeCommand = commands.find((item) => item.name === 'execute_trade');
if (!tradeCommand?.requiresConfirmation) errors.push('execute_trade command must require confirmation');

for (const skillName of ['villager_status', 'scan_villagers', 'trade_status', 'economy_status', 'suggest_trades', 'execute_trade']) {
  const skill = getSkill(skillName);
  if (!skill) errors.push(`missing skill ${skillName}`);
}
const executeTradeSkill = getSkill('execute_trade');
if (executeTradeSkill && (!executeTradeSkill.requiresConfirmation || executeTradeSkill.riskLevel !== 'medium')) {
  errors.push('execute_trade skill must be medium risk and confirmation-gated');
}

for (const name of evidenceNames) {
  if (!getEvidenceDefinition(name)) errors.push(`missing progress evidence ${name}`);
}

const packageText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
if (/openai|anthropic|google-ai|langchain/i.test(packageText)) errors.push('package.json appears to include cloud AI dependencies');

const mineflayerTypes = fs.readFileSync(path.join(root, 'node_modules', 'mineflayer', 'index.d.ts'), 'utf8');
const villagerPlugin = fs.readFileSync(path.join(root, 'node_modules', 'mineflayer', 'lib', 'plugins', 'villager.js'), 'utf8');
if (!/openVillager/.test(mineflayerTypes) && !/openVillager/.test(villagerPlugin)) warnings.push('Mineflayer runtime does not mention openVillager');
if (!/trade\(/.test(mineflayerTypes) && !/bot\.trade|function trade|async function trade/.test(villagerPlugin)) warnings.push('Mineflayer runtime does not mention trade');

const configText = fs.readFileSync(path.join(repo, 'config.json'), 'utf8');
const config = JSON.parse(configText);
if (config.allowAutomaticTrading) errors.push('allowAutomaticTrading must be false');
if (!config.requireConfirmationForTrades) errors.push('requireConfirmationForTrades must be true');
if (config.allowVillageLooting) errors.push('allowVillageLooting must be false');
if (config.allowVillagerTransport) errors.push('allowVillagerTransport must be false by default');
if (config.allowVillagerBreeding) errors.push('allowVillagerBreeding must be false by default');
if (config.allowIronGolemCombat) errors.push('allowIronGolemCombat must be false');

if (errors.length) {
  console.error('Villager economy audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  for (const warning of warnings) console.warn(`WARN ${warning}`);
  process.exit(1);
}

console.log('Villager economy audit passed.');
for (const warning of warnings) console.warn(`WARN ${warning}`);
