import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Vec3 } from 'vec3';
import { loadConfig } from '../config.js';
import { validateConfig } from '../configSchema.js';
import { createActions } from '../actions.js';
import { getCommands, validateCommandWiring } from '../commandRegistry.js';
import { getSkills, validateSkillDefinitions } from '../skillRegistry.js';
import { listEvidenceDefinitions, getEvidenceDefinition } from '../progressEvidence.js';
import { validateMilestoneDefinitions } from '../progressionRegistry.js';
import { ensureSkillMemoryShape } from '../skillMemory.js';
import { ensureCurriculumMemoryShape } from '../curriculumMemory.js';
import { ensureProgressionStateShape } from '../progressionState.js';
import { ensureGearMemoryShape } from '../gearMemory.js';
import { ensureVillagerMemoryShape } from '../villagerMemory.js';
import { ensureBlueprintMemoryShape } from '../blueprintMemory.js';
import { validateDashboardConfig, redactSecrets as redactDashboardSecrets } from '../../dashboard/dashboardSecurity.js';
import { createDashboardRequestHandler } from '../../dashboard/dashboardRoutes.js';
import { canEnchantItem, canUseBook } from '../gearSafety.js';
import { canTradeWithVillager } from '../tradeSafety.js';
import { validateBlockSafety } from '../blueprintSafety.js';
import { validateBridgeConfig, validateBridgeEvent } from '../../bridge/bridgeValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(botDir, '..');

const phaseModules = {
  'skillRegistry.js': ['getSkills', 'validateSkillDefinitions'],
  'skillValidator.js': ['validateSkillCanRun', 'validateSkillForCurriculumExecution'],
  'skillRunner.js': ['runSkill', 'cancelActiveSkill', 'isSkillRunning'],
  'skillMemory.js': ['ensureSkillMemoryShape', 'getRecentSkillRuns'],
  'progressEvidence.js': ['listEvidenceDefinitions', 'verifySkillEvidence'],
  'curriculumEngine.js': ['suggestNextSkills', 'suggestCurriculumTrack'],
  'curriculumTemplates.js': ['getCurriculumTemplates', 'buildTrackSuggestion'],
  'curriculumScoring.js': ['scoreSkillCandidate', 'rankByScore'],
  'curriculumMemory.js': ['ensureCurriculumMemoryShape', 'getActiveCurriculum'],
  'curriculumExecutor.js': ['approveCurriculumSuggestion', 'executeNextCurriculumStep'],
  'curriculumGuard.js': ['canCurriculumExecuteSkill', 'explainCurriculumExecutionBlockers'],
  '../dashboard/server.js': ['startDashboard'],
  '../dashboard/dashboardState.js': ['buildDashboardState'],
  '../dashboard/dashboardRoutes.js': ['createDashboardRequestHandler'],
  '../dashboard/dashboardControl.js': ['dashboardStopAll', 'dashboardRunSkill'],
  '../dashboard/dashboardSecurity.js': ['validateDashboardConfig', 'redactSecrets'],
  'progressionRegistry.js': ['getProgressionMilestones', 'validateMilestoneDefinitions'],
  'progressionEvidence.js': ['verifyMilestoneEvidence', 'collectProgressionSnapshot'],
  'progressionState.js': ['ensureProgressionStateShape', 'loadProgressionState'],
  'progressionTracker.js': ['checkProgression', 'getProgressionSummary'],
  'progressionAdvisor.js': ['suggestNextMilestones', 'buildProgressionPlan'],
  'progressionPlanner.js': ['createPlanForMilestone', 'validateProgressionPlan'],
  'vanillaAdvancementBridge.js': ['vanillaAdvancementTrackingAvailable', 'explainVanillaTrackingLimits'],
  'progressionPaths.js': ['getProgressionPaths', 'getNextMilestoneInPath'],
  'gearScore.js': ['scoreGearItem', 'getGearSummary'],
  'enchanting.js': ['enchantingStatus', 'enchantItem'],
  'anvilSystem.js': ['anvilStatus', 'applyBookToItem'],
  'potionSystem.js': ['potionStatus', 'classifyPotion'],
  'brewing.js': ['brewingStatus', 'brewPotion'],
  'gearUpgradeSystem.js': ['gearUpgradeStatus', 'suggestGearUpgrades'],
  'gearMemory.js': ['ensureGearMemoryShape', 'recordGearStatus'],
  'gearSafety.js': ['canEnchantItem', 'canUseBook'],
  'villagerMemory.js': ['ensureVillagerMemoryShape', 'summarizeVillagerMemory'],
  'villagerScanner.js': ['scanNearbyVillagers', 'reportNearbyVillagers'],
  'villagerTrading.js': ['tradingStatus', 'inspectVillagerTrades'],
  'tradeScoring.js': ['scoreTrade', 'rankTrades'],
  'economyManager.js': ['economyStatus', 'getEmeraldCount'],
  'tradeSafety.js': ['canTradeWithVillager', 'validateTradeRequest'],
  'villageProtection.js': ['villageProtectionStatus', 'warnAboutVillageThreats'],
  'blueprintRegistry.js': ['getBlueprints', 'validateAllBlueprints'],
  'blueprintMemory.js': ['ensureBlueprintMemoryShape', 'cancelBuild'],
  'materialEstimator.js': ['estimateMaterials', 'hasEnoughMaterials'],
  'blueprintPlanner.js': ['createBuildPlan', 'planPlacementOrder'],
  'blueprintSafety.js': ['validateBlockSafety', 'validateBuildArea'],
  'blueprintBuilder.js': ['blueprintBuildStatus', 'cancelBuild'],
  'schematicImport.js': ['schematicImportStatus', 'importSchematic'],
  'blueprintPreview.js': ['generateChatPreview', 'generateMaterialPreview'],
  '../bridge/pluginBridge.js': ['initializePluginBridge', 'handleBridgeEmergencyStop'],
  '../bridge/bridgeClient.js': ['bridgeHealthCheck', 'sendEmergencyStop'],
  '../bridge/bridgeEvents.js': ['normalizeBridgeEvent', 'eventToEvidence'],
  '../bridge/bridgeValidator.js': ['validateBridgeEvent', 'validateBridgeConfig'],
  '../bridge/bridgeSecurity.js': ['redactSecrets', 'validateControlRequest'],
  '../bridge/bridgeEvidence.js': ['bridgeEventToEvidence', 'validateBridgeEvidenceName'],
  '../bridge/bridgeDashboard.js': ['getBridgeDashboardStatus']
};

function moduleUrl(relativePath) {
  return pathToFileURL(path.resolve(botDir, relativePath)).href;
}

function source(relativePath) {
  // Follow shim re-exports (bot/foo.js → bot/systems/<domain>/foo.js) for source audits.
  let full = path.resolve(botDir, relativePath);
  for (let i = 0; i < 4; i += 1) {
    const text = fs.readFileSync(full, 'utf8');
    const shim = text.match(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/);
    if (!shim) return text;
    full = path.resolve(path.dirname(full), shim[1]);
  }
  return fs.readFileSync(full, 'utf8');
}

function mockBot() {
  return {
    username: 'tj',
    entity: { position: new Vec3(0, 64, 0) },
    players: { ModVinny: { entity: { position: new Vec3(1, 64, 1) } } },
    entities: {},
    game: { dimension: 'overworld' },
    health: 20,
    food: 20,
    inventory: { items: () => [], slots: [], emptySlotCount: () => 36 },
    pathfinder: { setGoal: () => {}, setMovements: () => {} },
    clearControlStates: () => {},
    chat: () => {}
  };
}

function mockMemory() {
  return {
    get: () => ({ currentTask: null }),
    update: () => {},
    pushFailure: () => {}
  };
}

function mockTaskQueue() {
  return {
    clearTask: () => {},
    getCurrentTask: () => null,
    setTask: () => {}
  };
}

function mockCancellation() {
  let cancelled = false;
  return {
    cancelAll: () => { cancelled = true; },
    resetCancellation: () => { cancelled = false; },
    isCancelled: () => cancelled
  };
}

test('all Phase 10-16 modules import and expose expected functions', async () => {
  for (const [file, expectedExports] of Object.entries(phaseModules)) {
    const mod = await import(moduleUrl(file));
    for (const name of expectedExports) {
      assert.equal(typeof mod[name], 'function', `${file} missing export ${name}`);
    }
  }
});

test('configuration validates for local-only dashboard and bridge defaults', async () => {
  const config = loadConfig();
  const general = validateConfig(config);
  assert.equal(general.ok, true, general.errors.join('\n'));
  assert.equal(validateDashboardConfig(config).ok, true);
  assert.equal(validateBridgeConfig(config).ok, true);
  assert.equal(config.dashboardAllowRawCommand, false);
  assert.equal(config.serverPluginAllowServerCommands, false);
  assert.equal(config.serverPluginAllowTeleport, false);
  assert.equal(config.serverPluginAllowGiveItems, false);
});

test('commands wire to action handlers and representative Phase 10-16 commands exist', async () => {
  const config = loadConfig();
  const actions = await createActions(mockBot(), config, {
    memory: mockMemory(),
    taskQueue: mockTaskQueue(),
    safety: {},
    perception: () => ({}),
    cancellation: mockCancellation()
  });
  const wiring = validateCommandWiring(actions);
  assert.equal(wiring.ok, true, JSON.stringify(wiring.missing));

  const aliases = new Set(getCommands().flatMap((command) => command.aliases));
  for (const alias of [
    'tj evidence status',
    'tj suggest next skill',
    'tj curriculum status',
    'tj progression status',
    'tj gear status',
    'tj villager status',
    'tj blueprints',
    'tj bridge status'
  ]) {
    assert.equal(aliases.has(alias), true, `${alias} should be registered`);
  }
});

test('implemented skills reference available actions and valid evidence', async () => {
  const config = loadConfig();
  const actions = await createActions(mockBot(), config, {
    memory: mockMemory(),
    taskQueue: mockTaskQueue(),
    safety: {},
    perception: () => ({}),
    cancellation: mockCancellation()
  });
  const skillValidation = validateSkillDefinitions();
  assert.equal(skillValidation.ok, true, skillValidation.errors.join('\n'));

  for (const skill of getSkills()) {
    if (skill.implemented) assert.equal(typeof actions[skill.action], 'function', `${skill.name} action ${skill.action} missing`);
    for (const evidenceName of skill.successEvidence || []) {
      assert.ok(getEvidenceDefinition(evidenceName), `${skill.name} references missing evidence ${evidenceName}`);
    }
  }
});

test('evidence and progression registries validate cleanly', async () => {
  const evidenceNames = listEvidenceDefinitions().map((entry) => entry.name);
  assert.equal(new Set(evidenceNames).size, evidenceNames.length, 'evidence names must be unique');
  assert.equal(validateMilestoneDefinitions().ok, true);
});

test('dashboard rejects POST control without token and redacts secrets', async () => {
  const config = { ...loadConfig(), dashboardToken: 'test-token' };
  const server = http.createServer(createDashboardRequestHandler({ bot: mockBot(), memory: mockMemory(), config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/control/stop`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const redacted = redactDashboardSecrets({ dashboardToken: 'secret', apiKey: 'secret', path: 'E:\\Games\\MCAI\\config.json' });
  assert.equal(redacted.dashboardToken, '[redacted]');
  assert.equal(redacted.apiKey, '[redacted]');
  assert.equal(String(redacted.path).includes('E:\\'), false);
});

test('risky resource, trading, and blueprint operations are confirmation gated', async () => {
  const bot = { mcaiConfig: { ownerUsername: 'ModVinny', requireConfirmationForDiamondGearEnchanting: true, requireConfirmationForBookUse: true }, inventory: { items: () => [] } };
  assert.equal(canEnchantItem(bot, { name: 'diamond_pickaxe' }, { sender: 'ModVinny', confirmed: true }).ok, false);
  assert.equal(canUseBook(bot, { name: 'enchanted_book', enchants: [{ name: 'mending', level: 1 }] }, { name: 'iron_pickaxe' }, { sender: 'ModVinny', confirmed: true }).ok, false);
  assert.equal(canTradeWithVillager({ mcaiConfig: { ownerUsername: 'ModVinny' } }, {}, { wanted: [{ name: 'emerald', count: 1 }], offered: { name: 'book' } }, 1, { sender: 'ModVinny' }).ok, false);
  assert.equal(validateBlockSafety('tnt').ok, false);

  for (const skillName of ['execute_trade', 'blueprint_build_small', 'enchant_item', 'repair_item', 'apply_book_to_item', 'bridge_register_region']) {
    const skill = getSkills().find((item) => item.name === skillName);
    assert.ok(skill, `${skillName} missing`);
    assert.equal(skill.requiresConfirmation, true, `${skillName} must require confirmation`);
  }
});

test('memory shape hardening handles malformed data without throwing', async () => {
  assert.deepEqual(ensureSkillMemoryShape({ skills: 'bad' }).recentRuns, []);
  assert.deepEqual(ensureCurriculumMemoryShape({ activeCurriculum: 'bad', curriculumSessions: 'bad' }).curriculumSessions, []);
  assert.deepEqual(ensureProgressionStateShape({ completedMilestones: 'bad' }).completedMilestones, {});
  assert.deepEqual(ensureGearMemoryShape({ upgradeHistory: 'bad' }).upgradeHistory, []);
  assert.deepEqual(ensureVillagerMemoryShape({ knownVillagers: 'bad' }).knownVillagers, []);
  assert.deepEqual(ensureBlueprintMemoryShape({ buildHistory: 'bad' }).buildHistory, []);
});

test('bridge validates malformed events and does not expose cheat endpoints', async () => {
  assert.equal(validateBridgeEvent({ type: '', position: { x: Infinity, y: 64, z: 0 } }).ok, false);
  const bridgeSource = source('../bridge/bridgeClient.js') +
    fs.readFileSync(path.join(projectRoot, 'server-plugin/src/main/java/com/mcai/bridge/MCAIBridgePlugin.java'), 'utf8');
  assert.equal(/\/control\/command|\/teleport|\/give|worldedit/i.test(bridgeSource), false);
});

test('execution boundaries keep autonomy and raw actions out of orchestration layers', async () => {
  const skillRunnerSource = source('skillRunner.js');
  assert.equal(/from ['"]mineflayer|bot\.dig\s*\(|bot\.placeBlock\s*\(|bot\.attack\s*\(/.test(skillRunnerSource), false);

  const curriculumExecutorSource = source('curriculumExecutor.js');
  assert.match(curriculumExecutorSource, /skillRunner\.js|from '\.\/skillRunner\.js'/);
  assert.equal(/from ['"]\.\/actions\.js|ollama|openai|mineflayer|bot\.dig\s*\(|bot\.placeBlock\s*\(|bot\.attack\s*\(/i.test(curriculumExecutorSource), false);

  const progressionSource = [
    'progressionRegistry.js',
    'progressionTracker.js',
    'progressionAdvisor.js',
    'progressionPlanner.js',
    'progressionSystem.js'
  ].map(source).join('\n');
  assert.equal(/executeAction|runSkill|createActions|ollama|openai/i.test(progressionSource), false);

  const dashboardControlSource = source('../dashboard/dashboardControl.js');
  assert.equal(/executeAction\s*\(|bot\.dig\s*\(|bot\.placeBlock\s*\(|bot\.attack\s*\(/.test(dashboardControlSource), false);
});

test('stop and cancellation hooks exist for Phase 10-16 surfaces', async () => {
  const actions = await createActions(mockBot(), loadConfig(), {
    memory: mockMemory(),
    taskQueue: mockTaskQueue(),
    safety: {},
    perception: () => ({}),
    cancellation: mockCancellation()
  });
  for (const actionName of ['stop', 'cancel_curriculum', 'blueprint_cancel_build', 'bridge_emergency_stop']) {
    assert.equal(typeof actions[actionName], 'function', `${actionName} should be callable`);
  }
  assert.match(source('blueprintBuilder.js'), /isCancelled|cancel/i);
  assert.match(source('curriculumExecutor.js'), /cancelActiveSkill|cancel/i);
});
