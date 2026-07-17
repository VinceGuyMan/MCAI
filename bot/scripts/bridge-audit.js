import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from '../commandRegistry.js';
import { getSkill } from '../skillRegistry.js';
import { getEvidenceDefinition } from '../progressEvidence.js';
import { loadConfig } from '../config.js';
import { validateBridgeConfig } from '../../bridge/bridgeValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(botDir, '..');

const requiredNodeModules = [
  'bridge/pluginBridge.js',
  'bridge/bridgeClient.js',
  'bridge/bridgeEvents.js',
  'bridge/bridgeValidator.js',
  'bridge/bridgeSecurity.js',
  'bridge/bridgeEvidence.js',
  'bridge/bridgeDashboard.js'
];

const requiredPluginFiles = [
  'server-plugin/build.gradle',
  'server-plugin/settings.gradle',
  'server-plugin/src/main/java/com/mcai/bridge/MCAIBridgePlugin.java',
  'server-plugin/src/main/resources/plugin.yml',
  'server-plugin/src/main/resources/config.yml',
  'server-plugin/README_PLUGIN.md'
];

const requiredActions = [
  'serverBridgeStatus',
  'serverStatus',
  'bridgeHealth',
  'bridgeRecentEvents',
  'bridgeRegions',
  'bridgeRegisterRegion',
  'bridgeEmergencyStop'
];

const requiredSkills = [
  'server_bridge_status',
  'bridge_health',
  'bridge_recent_events',
  'bridge_recent_deaths',
  'bridge_recent_advancements',
  'bridge_regions',
  'bridge_register_region',
  'bridge_emergency_stop'
];

const requiredEvidence = [
  'bridge_status_reported',
  'bridge_connected',
  'bridge_unavailable',
  'bridge_event_received',
  'bridge_emergency_stop_received',
  'bridge_region_registered',
  'bridge_region_deleted',
  'bridge_player_death_recorded',
  'bridge_player_respawn_recorded',
  'bridge_advancement_recorded',
  'bridge_protected_region_event',
  'bridge_villager_event_recorded',
  'bridge_portal_event_recorded',
  'bridge_danger_event_recorded'
];

function fail(message) {
  console.error(`ERROR ${message}`);
  process.exitCode = 1;
}

for (const file of [...requiredNodeModules, ...requiredPluginFiles]) {
  if (!fs.existsSync(path.join(projectRoot, file))) fail(`${file} is missing`);
}

const config = loadConfig();
const configValidation = validateBridgeConfig(config);
if (!configValidation.ok) fail(`bridge config invalid: ${configValidation.errors.join('; ')}`);
if (config.serverPluginAllowDangerousControl) fail('dangerous bridge control must remain disabled');
if (config.serverPluginAllowServerCommands) fail('raw server commands must remain disabled');
if (config.serverPluginAllowTeleport) fail('teleport bridge must remain disabled');
if (config.serverPluginAllowGiveItems) fail('give-items bridge must remain disabled');
if (config.serverPluginAllowWorldEdit) fail('world edit bridge must remain disabled');

const commandActions = new Set(getCommands().map((command) => command.action));
for (const action of requiredActions) {
  if (!commandActions.has(action)) fail(`command registry does not expose ${action}`);
}

for (const skillName of requiredSkills) {
  const skill = getSkill(skillName);
  if (!skill) {
    fail(`skill missing: ${skillName}`);
    continue;
  }
  if (skillName === 'bridge_register_region' && (!skill.requiresConfirmation || skill.riskLevel === 'low')) {
    fail('bridge_register_region must require confirmation and be non-low risk');
  }
}

for (const evidenceName of requiredEvidence) {
  if (!getEvidenceDefinition(evidenceName)) fail(`evidence definition missing: ${evidenceName}`);
}

const pluginSource = fs.readFileSync(path.join(projectRoot, 'server-plugin/src/main/java/com/mcai/bridge/MCAIBridgePlugin.java'), 'utf8');
for (const forbidden of ['teleport(', 'giveExp', 'setOp(', 'dispatchCommand']) {
  if (pluginSource.includes(forbidden)) fail(`plugin source contains forbidden capability: ${forbidden}`);
}
if (/\/control\/command|\/teleport|\/give/i.test(pluginSource)) fail('plugin source appears to expose dangerous endpoint names');

const nodeSource = requiredNodeModules.map((file) => fs.readFileSync(path.join(projectRoot, file), 'utf8')).join('\n');
if (/openai|chatgpt|api\.openai|cloud api/i.test(nodeSource)) fail('bridge modules must not depend on cloud AI APIs');

if (!process.exitCode) console.log('Bridge audit passed: local plugin bridge files, commands, skills, evidence, and safety flags are present.');
