import fs from 'node:fs';
import crypto from 'node:crypto';
import { createDefaultConfig, loadConfig as loadRawConfig, configPath } from './config.js';

const criticalKeys = ['ownerUsername', 'botUsername', 'host', 'port', 'minecraftVersion', 'auth', 'ollamaUrl', 'ollamaModel'];
const expectedModelRoles = {
  default: 'qwen3:14b',
  commandRouter: 'qwen3:14b',
  planner: 'qwen3:14b',
  dialogue: 'mistral-nemo:12b',
  codingStructured: 'qwen2.5-coder:14b',
  codingHeavy: 'qwen2.5-coder:14b',
  fastFallback: 'phi4-mini:latest',
  legacyFallback: 'phi4-mini:latest'
};

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isLoopbackHost(host) {
  const value = String(host || '').toLowerCase();
  return value === '127.0.0.1' || value === 'localhost' || value === '::1';
}

export function isPlaceholderToken(value) {
  const token = String(value || '');
  return token.length < 20 || /change-me|generate-a-private|example|placeholder/i.test(token);
}

export function normalizeConfig(config = {}) {
  return {
    ...config,
    port: Number(config.port),
    friendlyPlayers: Array.isArray(config.friendlyPlayers) && config.friendlyPlayers.length > 0
      ? config.friendlyPlayers
      : [config.ownerUsername || 'Player'],
    botAliases: Array.isArray(config.botAliases) && config.botAliases.length > 0
      ? config.botAliases
      : ['tj', '@tj', '!tj']
  };
}

export function validateConfig(config = {}) {
  const errors = [];
  const warnings = [];
  for (const key of criticalKeys) {
    if (config[key] === undefined || config[key] === null || config[key] === '') errors.push(`${key} is required`);
  }
  if (!/^[A-Za-z0-9_]{1,16}$/.test(String(config.ownerUsername || ''))) errors.push('ownerUsername must be a valid 1-16 character Minecraft name');
  if (!/^[A-Za-z0-9_]{1,16}$/.test(String(config.botUsername || ''))) errors.push('botUsername must be a valid 1-16 character Minecraft name');
  if (config.ownerUsername && config.botUsername && config.ownerUsername === config.botUsername) errors.push('ownerUsername and botUsername must be different');
  if (config.minecraftVersion !== '1.21.11') warnings.push(`minecraftVersion ${config.minecraftVersion} is not the tested 1.21.11 release`);
  if (!isPositiveNumber(Number(config.port)) || Number(config.port) > 65535) errors.push(`port must be 1-65535, got ${config.port}`);
  const minecraftHost = config.host || '127.0.0.1';
  const publicMinecraft = !isLoopbackHost(minecraftHost);
  if (config.auth === 'offline' && publicMinecraft && config.allowLanServerBinding !== true) {
    errors.push('offline Minecraft hosting must use a loopback host unless allowLanServerBinding=true is explicitly set');
  } else if (publicMinecraft) {
    warnings.push(`Minecraft host ${minecraftHost} is not loopback; only use LAN binding on a trusted network`);
  }
  if (!/^https?:\/\//.test(String(config.ollamaUrl || ''))) errors.push('ollamaUrl must be http(s)');
  // Custom models (Andy, qwen3.6, etc.) are fine — only require that roles are set.
  if (!config.ollamaModel) warnings.push('ollamaModel is empty; set a model in Setup LLM');
  for (const [role] of Object.entries(expectedModelRoles)) {
    const model = config.models?.[role];
    if (!model) errors.push(`config.models.${role} is required`);
    if (!config.modelOptions?.[role]) warnings.push(`config.modelOptions.${role} is missing; defaults will be used`);
  }
  if (config.modelOptions?.commandRouter?.stream === true || config.modelOptions?.planner?.stream === true) warnings.push('commandRouter/planner modelOptions should keep stream=false for deterministic JSON handling');
  if (config.auth !== 'offline') warnings.push('1.0 local release is tested with auth=offline');

  const saneDistances = ['maxAutonomyDistanceFromOwner', 'maxFoodSearchDistance', 'maxMiningDistanceFromOwner', 'maxExploreRadiusFromOwner', 'maxDistanceFromNetherPortal'];
  for (const key of saneDistances) {
    if (config[key] !== undefined && (!isPositiveNumber(Number(config[key])) || Number(config[key]) > 512)) warnings.push(`${key} looks unusual: ${config[key]}`);
  }

  const saneCooldowns = ['chatCooldownMs', 'brainTickMs', 'ollamaDecisionCooldownMs', 'dialogueCooldownMs'];
  for (const key of saneCooldowns) {
    if (config[key] !== undefined && (!isPositiveNumber(Number(config[key])) || Number(config[key]) < 100)) warnings.push(`${key} looks too small: ${config[key]}`);
  }

  if (config.allowPvp) errors.push('allowPvp must stay false for 1.0');
  if (config.allowAutonomousNetherEntry) errors.push('allowAutonomousNetherEntry must stay false for 1.0');
  if (config.allowAutonomousMining && !config.allowOwnerCommandedMining) warnings.push('autonomous mining is enabled but owner-commanded mining is disabled');
  if (config.thinCoreEnabled) {
    for (const key of ['advancedAutonomyEnabled', 'curriculumExecutionEnabled', 'progressionExecutionEnabled', 'villagerSystemEnabled', 'netherSystemEnabled', 'blueprintSystemEnabled', 'experimentalCombatEnabled']) {
      if (config[key]) warnings.push(`thinCoreEnabled=true normally keeps ${key}=false`);
    }
  }
  if (config.dashboardEnabled) {
    const dashboardPort = Number(config.dashboardPort || 8787);
    const dashboardHost = config.dashboardHost || '127.0.0.1';
    const publicDashboard = dashboardHost === '0.0.0.0' || dashboardHost === '::' || !isLoopbackHost(dashboardHost);
    const placeholderDashboardToken = isPlaceholderToken(config.dashboardToken);
    if (!isPositiveNumber(dashboardPort) || dashboardPort > 65535) errors.push(`dashboardPort must be 1-65535, got ${config.dashboardPort}`);
    if (config.dashboardLocalOnly !== false && publicDashboard) errors.push('dashboardLocalOnly=true requires dashboardHost to be loopback');
    if (publicDashboard && placeholderDashboardToken) errors.push('public dashboard binding requires a private dashboardToken');
    if (config.dashboardAllowRawCommand) errors.push('dashboardAllowRawCommand must stay false');
    if (config.dashboardAllowDangerousControl) warnings.push('dashboardAllowDangerousControl should stay false for local 1.0 safety');
    if (!publicDashboard && placeholderDashboardToken) warnings.push('dashboardToken is a placeholder; the first-run launcher normally generates a private token');
  }
  if (config.progressionEnabled) {
    const riskLevels = new Set(['low', 'medium', 'high']);
    if (!riskLevels.has(config.progressionRiskCeiling || 'medium')) errors.push(`progressionRiskCeiling must be low, medium, or high, got ${config.progressionRiskCeiling}`);
    if (config.allowProgressionAutoExecution) errors.push('allowProgressionAutoExecution must stay false');
    if (config.allowProgressionEndEntry) errors.push('allowProgressionEndEntry must stay false until a future phase implements End safety');
    if (config.allowProgressionBossFights) errors.push('allowProgressionBossFights must stay false until a future phase implements boss safety');
    if (config.allowProgressionVillagerTrading) warnings.push('allowProgressionVillagerTrading is enabled, but villager trading is outside the current implemented scope');
    if (config.maxProgressionSuggestions !== undefined && (!isPositiveNumber(Number(config.maxProgressionSuggestions)) || Number(config.maxProgressionSuggestions) > 10)) warnings.push(`maxProgressionSuggestions looks unusual: ${config.maxProgressionSuggestions}`);
    if (config.maxProgressionPlanSteps !== undefined && (!isPositiveNumber(Number(config.maxProgressionPlanSteps)) || Number(config.maxProgressionPlanSteps) > 24)) warnings.push(`maxProgressionPlanSteps looks unusual: ${config.maxProgressionPlanSteps}`);
  }
  if (config.gearUpgradesEnabled) {
    const riskLevels = new Set(['low', 'medium', 'high']);
    if (!riskLevels.has(config.gearUpgradeRiskCeiling || 'medium')) errors.push(`gearUpgradeRiskCeiling must be low, medium, or high, got ${config.gearUpgradeRiskCeiling}`);
    if (config.allowAutomaticEnchanting) errors.push('allowAutomaticEnchanting must stay false');
    if (config.allowAutomaticAnvilUse) errors.push('allowAutomaticAnvilUse must stay false');
    if (config.allowAutomaticPotionUse) errors.push('allowAutomaticPotionUse must stay false');
    if (config.allowAutomaticBrewing) errors.push('allowAutomaticBrewing must stay false');
    if (!config.requireConfirmationForEnchanting) errors.push('requireConfirmationForEnchanting must stay true');
    if (!config.requireConfirmationForAnvilUse) errors.push('requireConfirmationForAnvilUse must stay true');
    if (!config.requireConfirmationForBookUse) errors.push('requireConfirmationForBookUse must stay true');
    if (!config.requireConfirmationForPotionUse) errors.push('requireConfirmationForPotionUse must stay true');
    if (!config.requireConfirmationForBrewing) errors.push('requireConfirmationForBrewing must stay true');
    if (!config.requireConfirmationForDiamondGearEnchanting) errors.push('diamond gear enchanting must require confirmation');
    if (!config.requireConfirmationForNetheriteGear) errors.push('netherite gear must require confirmation');
    if (config.allowNetheriteUpgrade) errors.push('allowNetheriteUpgrade must stay false until a future netherite phase');
    if (config.brewingEnabled) warnings.push('brewingEnabled is true, but Phase 13 only enables brewing if the local Mineflayer/window API is reliable');
    for (const key of ['minimumXpLevelsForEnchanting', 'keepLapisReserve', 'keepIronReserve', 'keepDiamondReserve']) {
      if (config[key] !== undefined && (!Number.isFinite(Number(config[key])) || Number(config[key]) < 0)) warnings.push(`${key} should be a non-negative number`);
    }
  }
  if (config.villagerEconomyEnabled) {
    if (config.allowAutomaticTrading) errors.push('allowAutomaticTrading must stay false');
    if (!config.requireConfirmationForTrades) errors.push('requireConfirmationForTrades must stay true');
    if (!config.requireConfirmationForEmeraldSpending) errors.push('requireConfirmationForEmeraldSpending must stay true');
    if (!config.requireConfirmationForRareItemTrading) errors.push('requireConfirmationForRareItemTrading must stay true');
    if (config.allowVillageLooting) errors.push('allowVillageLooting must stay false');
    if (config.allowVillagerTransport) warnings.push('allowVillagerTransport is a future feature and should stay false');
    if (config.allowVillagerBreeding) warnings.push('allowVillagerBreeding is a future feature and should stay false');
    if (config.allowIronGolemCombat) errors.push('allowIronGolemCombat must stay false');
    for (const key of ['maxTradeDistanceFromOwner', 'maxTradeDistanceFromHome', 'villagerScanRadius', 'villageMemoryRadius']) {
      if (config[key] !== undefined && (!isPositiveNumber(Number(config[key])) || Number(config[key]) > 512)) warnings.push(`${key} looks unusual: ${config[key]}`);
    }
    for (const key of ['minEmeraldReserve', 'maxEmeraldsPerTradeWithoutConfirmation', 'maxTradesPerSession']) {
      if (config[key] !== undefined && (!Number.isFinite(Number(config[key])) || Number(config[key]) < 0)) warnings.push(`${key} should be a non-negative number`);
    }
  }
  if (config.blueprintBuildingEnabled) {
    if (config.allowAutomaticBuilding) errors.push('allowAutomaticBuilding must stay false for blueprint safety');
    if (!config.requireConfirmationForBlueprintBuild) errors.push('blueprint builds must require confirmation');
    if (config.allowAreaClearing) warnings.push('allowAreaClearing should stay false until area clearing safety is implemented');
    if (config.allowBreakingBlocksForBuild) errors.push('allowBreakingBlocksForBuild must stay false in Phase 15');
    if (config.allowReplacingBlocks) warnings.push('allowReplacingBlocks should stay false for Phase 15');
    if (config.allowDangerousBlocksInBlueprints || config.allowTntInBlueprints || config.allowFireInBlueprints || config.allowLavaInBlueprints) {
      errors.push('dangerous blueprint blocks must stay disabled');
    }
    if (config.schematicImportEnabled || config.allowImportedSchematics) warnings.push('schematic import is scaffolded only unless a safe parser is installed and tested');
    for (const key of ['maxBlueprintBlocks', 'maxBlueprintWidth', 'maxBlueprintLength', 'maxBlueprintHeight', 'maxBlocksPlacedPerRun']) {
      if (config[key] !== undefined && (!isPositiveNumber(Number(config[key])) || Number(config[key]) > 2048)) warnings.push(`${key} looks unusual: ${config[key]}`);
    }
    for (const key of ['maxBuildDistanceFromOwner', 'maxBuildDistanceFromHome']) {
      if (config[key] !== undefined && (!isPositiveNumber(Number(config[key])) || Number(config[key]) > 512)) warnings.push(`${key} looks unusual: ${config[key]}`);
    }
  }
  if (config.serverPluginBridgeEnabled) {
    const bridgePort = Number(config.serverPluginPort || 8791);
    const bridgeHost = config.serverPluginHost || '127.0.0.1';
    const publicBridge = bridgeHost === '0.0.0.0' || bridgeHost === '::' || !isLoopbackHost(bridgeHost);
    const placeholderBridgeToken = isPlaceholderToken(config.serverPluginToken);
    if (config.serverPluginBridgeMode !== 'local_http') errors.push(`serverPluginBridgeMode must be local_http, got ${config.serverPluginBridgeMode}`);
    if (!isPositiveNumber(bridgePort) || bridgePort > 65535) errors.push(`serverPluginPort must be 1-65535, got ${config.serverPluginPort}`);
    if (config.serverPluginLocalOnly !== false && publicBridge) errors.push('serverPluginLocalOnly=true requires serverPluginHost to be loopback');
    if (config.serverPluginRequireToken !== false && !config.serverPluginToken) errors.push('serverPluginToken is required when serverPluginRequireToken=true');
    if (publicBridge && placeholderBridgeToken) errors.push('public server plugin bridge binding requires a private token');
    if (!publicBridge && placeholderBridgeToken) warnings.push('serverPluginToken is a placeholder; the first-run launcher normally generates a private token');
    if (config.serverPluginAllowDangerousControl) errors.push('serverPluginAllowDangerousControl must stay false');
    if (config.serverPluginAllowServerCommands) errors.push('serverPluginAllowServerCommands must stay false');
    if (config.serverPluginAllowTeleport) errors.push('serverPluginAllowTeleport must stay false');
    if (config.serverPluginAllowGiveItems) errors.push('serverPluginAllowGiveItems must stay false');
    if (config.serverPluginAllowWorldEdit) errors.push('serverPluginAllowWorldEdit must stay false');
    if (config.serverPluginAllowOperatorActions) errors.push('serverPluginAllowOperatorActions must stay false');
    if (config.serverPluginEventBufferSize !== undefined && (!isPositiveNumber(Number(config.serverPluginEventBufferSize)) || Number(config.serverPluginEventBufferSize) > 5000)) warnings.push(`serverPluginEventBufferSize looks unusual: ${config.serverPluginEventBufferSize}`);
    if (config.serverPluginPollIntervalMs !== undefined && (!isPositiveNumber(Number(config.serverPluginPollIntervalMs)) || Number(config.serverPluginPollIntervalMs) < 250)) warnings.push(`serverPluginPollIntervalMs looks unusual: ${config.serverPluginPollIntervalMs}`);
    if (config.serverPluginTimeoutMs !== undefined && (!isPositiveNumber(Number(config.serverPluginTimeoutMs)) || Number(config.serverPluginTimeoutMs) < 250)) warnings.push(`serverPluginTimeoutMs looks unusual: ${config.serverPluginTimeoutMs}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function explainConfigErrors(result) {
  const lines = [];
  for (const error of result.errors || []) lines.push(`ERROR ${error}`);
  for (const warning of result.warnings || []) lines.push(`WARN ${warning}`);
  return lines.join('\n') || 'Config is valid.';
}

export function createInstallConfig(overrides = {}) {
  const ownerUsername = String(overrides.ownerUsername || 'Player').trim() || 'Player';
  const botUsername = String(overrides.botUsername || 'tj').trim() || 'tj';
  return {
    ...createDefaultConfig(),
    ...overrides,
    ownerUsername,
    botUsername,
    friendlyPlayers: [ownerUsername],
    dashboardToken: overrides.dashboardToken || crypto.randomBytes(24).toString('base64url'),
    serverPluginToken: overrides.serverPluginToken || crypto.randomBytes(24).toString('base64url'),
    firstRunComplete: overrides.firstRunComplete === true
  };
}

export function writeDefaultConfigIfMissing(overrides = {}) {
  if (fs.existsSync(configPath)) return false;
  const config = createInstallConfig(overrides);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

export function loadConfig() {
  return normalizeConfig(loadRawConfig());
}
