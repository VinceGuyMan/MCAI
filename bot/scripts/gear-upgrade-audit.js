import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from '../commandRegistry.js';
import { listEvidenceDefinitions } from '../progressEvidence.js';
import { getSkill, getSkills } from '../skillRegistry.js';
import { validateMilestoneDefinitions } from '../progressionRegistry.js';
import { loadConfig } from '../config.js';
import { brewingApiAvailable } from '../brewing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

function pass(message) {
  console.log(`[gear:audit] OK ${message}`);
}

function fail(message) {
  console.error(`[gear:audit] FAIL ${message}`);
  process.exitCode = 1;
}

function readSource(fileName) {
  return fs.readFileSync(path.join(botDir, fileName), 'utf8');
}

for (const fileName of [
  'gearScore.js',
  'enchanting.js',
  'anvilSystem.js',
  'potionSystem.js',
  'brewing.js',
  'gearUpgradeSystem.js',
  'gearMemory.js',
  'gearSafety.js'
]) {
  if (!fs.existsSync(path.join(botDir, fileName))) fail(`${fileName} is missing`);
}
pass('gear upgrade modules exist');

const actionSource = readSource('actions.js');
for (const actionName of [
  'gear_status',
  'gear_upgrade_status',
  'enchant_status',
  'enchant_item',
  'anvil_status',
  'repair_item',
  'apply_book_to_item',
  'potion_status',
  'use_potion',
  'brewing_status',
  'brew_potion',
  'nether_gear_readiness'
]) {
  if (!new RegExp(`\\b${actionName}\\b`).test(actionSource)) fail(`actions.js missing ${actionName}`);
}
pass('gear actions are registered in actions.js');

const commandNames = new Set(getCommands().map((command) => command.name));
for (const commandName of ['gear_status', 'enchant_status', 'enchant_item', 'anvil_status', 'anvil_item', 'potion_status', 'use_potion', 'brewing_status', 'brew_potion']) {
  if (!commandNames.has(commandName)) fail(`commandRegistry missing ${commandName}`);
}
pass('gear commands are registered');

const evidenceNames = new Set(listEvidenceDefinitions().map((item) => item.name));
for (const evidenceName of [
  'gear_status_reported',
  'gear_upgrade_status_reported',
  'enchant_status_reported',
  'item_enchanted',
  'anvil_status_reported',
  'item_repaired',
  'book_applied',
  'potion_status_reported',
  'potion_used',
  'brewing_status_reported',
  'nether_gear_ready'
]) {
  if (!evidenceNames.has(evidenceName)) fail(`missing gear evidence ${evidenceName}`);
}
pass('gear evidence names are registered');

const skillNames = new Set(getSkills().map((skill) => skill.name));
for (const skillName of ['gear_status', 'suggest_gear_upgrades', 'enchant_status', 'anvil_status', 'potion_status', 'brewing_status', 'nether_gear_readiness']) {
  if (!skillNames.has(skillName)) fail(`skillRegistry missing ${skillName}`);
}
for (const skillName of ['enchant_item', 'repair_item', 'apply_book_to_item', 'use_potion', 'brew_potion']) {
  const skill = getSkill(skillName);
  if (!skill) fail(`skillRegistry missing ${skillName}`);
  else if (!skill.requiresConfirmation || !['medium', 'high'].includes(skill.riskLevel)) fail(`${skillName} must be risky and confirmation-gated`);
}
pass('gear skills are registered with safety metadata');

const brewSkill = getSkill('brew_potion');
const brewCommand = getCommands().find((command) => command.name === 'brew_potion');
if (brewingApiAvailable(null)) {
  pass('brewing API appears available in this runtime');
} else {
  if (brewSkill?.implemented) fail('brew_potion skill must not be implemented when brewing API support is unavailable');
  if (brewCommand?.implemented) fail('brew_potion command must not be advertised as implemented when brewing API support is unavailable');
  pass('brewing mutation remains blocked/scaffolded');
}

const config = loadConfig();
if (!config.requireConfirmationForDiamondGearEnchanting) fail('diamond gear enchanting must require confirmation');
if (!config.requireConfirmationForNetheriteGear) fail('netherite gear must require confirmation');
if (config.allowNetheriteUpgrade) fail('netherite upgrades must remain disabled');
if (config.allowAutomaticEnchanting || config.allowAutomaticAnvilUse || config.allowAutomaticPotionUse || config.allowAutomaticBrewing) {
  fail('automatic gear upgrade mutation flags must stay disabled');
}
pass('rare resource and automatic upgrade safeguards are configured');

const progression = validateMilestoneDefinitions();
if (!progression.ok) progression.errors.forEach((error) => fail(`progression: ${error}`));
else pass('progression milestones validate with gear additions');

for (const fileName of ['gearUpgradeSystem.js', 'enchanting.js', 'anvilSystem.js', 'potionSystem.js', 'brewing.js']) {
  const source = readSource(fileName);
  if (/openai|api\.openai|chatgpt|cloud api|generated code/i.test(source)) fail(`${fileName} references forbidden cloud/LLM execution patterns`);
}
pass('no OpenAI/cloud or LLM-generated execution dependency found in gear modules');

if (!process.exitCode) console.log('[gear:audit] Gear upgrade audit passed.');
