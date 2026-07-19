import fs from 'node:fs';
import path from 'node:path';

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function backupMalformedFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.bad-${Date.now()}`;
  try {
    fs.copyFileSync(filePath, backupPath);
    console.warn(`[memory] Malformed memory backed up to ${backupPath}`);
  } catch (error) {
    console.warn(`[memory] Could not back up malformed memory: ${error.message}`);
  }
}

function cleanupStaleTempFiles(filePath, maxAgeMs = 5 * 60 * 1000) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name !== `${base}.tmp` && !name.startsWith(`${base}.tmp-`)) continue;
    const fullPath = path.join(dir, name);
    try {
      const ageMs = Date.now() - fs.statSync(fullPath).mtimeMs;
      if (ageMs >= maxAgeMs) fs.rmSync(fullPath, { force: true });
    } catch (error) {
      console.warn(`[memory] Could not clean stale temp file ${fullPath}: ${error.message}`);
    }
  }
}

function isExpired(entry, now = Date.now()) {
  if (!entry) return false;
  if (typeof entry === 'object' && Number(entry.expiresAt || 0) > 0) return now >= Number(entry.expiresAt);
  return false;
}

function scrubExpiredRuntimeState(state) {
  const now = Date.now();
  const patch = {};
  const expiringKeys = [
    'pendingConfirmation',
    'pendingCraftConfirmation',
    'pendingCraftScavengeConfirmation',
    'pendingBuildConfirmation',
    'pendingMiningConfirmation',
    'pendingFarmConfirmation',
    'pendingAnimalConfirmation',
    'pendingExplorationConfirmation',
    'pendingCombatConfirmation',
    'pendingGoalConfirmation',
    'pendingNetherConfirmation',
    'pendingDialogueClarification',
    'pendingMemoryConfirmation',
    'pendingClearConversationMemoryConfirmation',
    'pendingProgressionConfirmation',
    'pendingNaturalCommandIntent',
    'pendingGearUpgradeConfirmation',
    'pendingTradeConfirmation',
    'pendingVillagerMemoryConfirmation',
    'pendingBridgeRegionConfirmation',
    'pendingIdleMemoryResetConfirmation',
    'pendingBlueprintBuild'
  ];
  for (const key of expiringKeys) {
    if (isExpired(state[key], now)) patch[key] = null;
  }
  if (Number(state.pendingConfirmationExpiresAt || 0) > 0 && now >= Number(state.pendingConfirmationExpiresAt)) {
    patch.pendingConfirmation = null;
    patch.pendingConfirmationExpiresAt = 0;
  }
  if (Number(state.pendingGoalConfirmationExpiresAt || 0) > 0 && now >= Number(state.pendingGoalConfirmationExpiresAt)) {
    patch.pendingGoalConfirmation = null;
    patch.pendingGoalConfirmationExpiresAt = 0;
  }
  if (Number(state.pendingNetherConfirmationExpiresAt || 0) > 0 && now >= Number(state.pendingNetherConfirmationExpiresAt)) {
    patch.pendingNetherConfirmation = null;
    patch.pendingNetherConfirmationExpiresAt = 0;
  }
  if (Number(state.pendingProgressionConfirmationExpiresAt || 0) > 0 && now >= Number(state.pendingProgressionConfirmationExpiresAt)) {
    patch.pendingProgressionConfirmation = null;
    patch.pendingProgressionConfirmationExpiresAt = 0;
  }
  return Object.keys(patch).length ? { ...state, ...patch } : state;
}

const defaultMemory = {
  currentTask: null,
  thinCoreTaskActive: false,
  activeThinCoreAction: null,
  thinCoreTaskStartedAt: 0,
  lastCommand: null,
  lastOwnerPosition: null,
  knownWoodLocations: [],
  knownCoalLocations: [],
  knownSafeLocation: null,
  recentFailures: [],
  stuckCounter: 0,
  lastAction: null,
  lastActionAt: 0,
  lastManualStopAt: 0,
  lastWaterRescueAt: 0,
  waterRescueAbort: false,
  waterOwnerHoldUntil: 0,
  lastOllamaDecisionAt: 0,
  lastArmorStatus: null,
  pendingConfirmation: null,
  pendingConfirmationExpiresAt: 0,
  lastArmorSuggestionAt: 0,
  lastFoodStatus: null,
  lastFoodSearchAt: 0,
  knownFoodLocations: [],
  knownAnimalLocations: [],
  knownCropLocations: [],
  knownFurnaceLocations: [],
  lastMealAt: 0,
  lastHuntAt: 0,
  lastCookAt: 0,
  foodTaskActive: false,
  lastCraftedItem: null,
  lastCraftedAt: 0,
  failedCraftAttempts: [],
  knownCraftingTableLocation: null,
  knownFurnaceLocation: null,
  preferredWoodType: null,
  pendingCraftConfirmation: null,
  pendingCraftScavengeConfirmation: null,
  lastCraftSuggestionAt: 0,
  lastDeathPosition: null,
  lastDeathReason: null,
  deathCount: 0,
  lastKnownPosition: null,
  lastUnstuckAt: 0,
  lastTorchPlacedAt: 0,
  lastLightingStatus: null,
  homeBasePosition: null,
  homeBaseDimension: null,
  homeBaseSetAt: 0,
  homeBaseName: null,
  knownCampBlocks: [],
  knownStorageChests: [],
  knownCraftingTables: [],
  knownFurnaces: [],
  knownBeds: [],
  knownTorchPositions: [],
  baseBuildHistory: [],
  lastBaseMaintenanceAt: 0,
  lastResourceRunAt: 0,
  activeResourceRun: null,
  resourceRunHistory: [],
  storageInventorySnapshot: null,
  pendingBuildConfirmation: null,
  activeMiningExpedition: null,
  lastMiningExpeditionAt: 0,
  lastMiningStatus: null,
  knownMineEntrances: [],
  primaryMineEntrance: null,
  knownIronLocations: [],
  knownCopperLocations: [],
  knownRedstoneLocations: [],
  knownLapisLocations: [],
  knownGoldLocations: [],
  knownDiamondLocations: [],
  miningHistory: [],
  blocksMinedThisTrip: 0,
  oresFoundThisTrip: {},
  miningStartPosition: null,
  miningReturnTarget: null,
  lastMiningAbortReason: null,
  pendingMiningConfirmation: null,
  knownFarms: [],
  primaryFarmArea: null,
  farmCropTypes: [],
  lastFarmMaintenanceAt: 0,
  lastHarvestAt: 0,
  lastPlantingAt: 0,
  lastReplantAt: 0,
  knownAnimalPens: [],
  primaryCowPen: null,
  primarySheepPen: null,
  primaryPigPen: null,
  primaryChickenPen: null,
  primaryRabbitPen: null,
  lastAnimalCareAt: 0,
  lastBreedingAt: 0,
  knownAnimalLocations: [],
  farmTaskActive: false,
  animalTaskActive: false,
  farmHistory: [],
  animalCareHistory: [],
  pendingFarmConfirmation: null,
  pendingAnimalConfirmation: null,
  activeExploration: null,
  explorationMode: null,
  explorationStartPosition: null,
  explorationReturnTarget: null,
  explorationStartedAt: 0,
  explorationLastScanAt: 0,
  explorationBreadcrumbs: [],
  currentRouteRecording: null,
  lastExplorationReport: null,
  lastExplorationAbortReason: null,
  pendingExplorationConfirmation: null,
  currentWaypointTarget: null,
  lastWaypointVisited: null,
  combatMode: 'off',
  activeThreat: null,
  activeThreatId: null,
  activeThreatType: null,
  lastCombatStartedAt: 0,
  lastCombatEndedAt: 0,
  lastCombatResult: null,
  lastCombatAbortReason: null,
  combatKills: 0,
  combatDamageTaken: 0,
  knownDangerMobs: [],
  lastThreatScanAt: 0,
  lastThreatWarningAt: 0,
  lastFleeAt: 0,
  guardedPosition: null,
  pendingCombatConfirmation: null,
  activeGoalId: null,
  activeGoalStepId: null,
  lastPlannerTickAt: 0,
  lastPlannerDecisionAt: 0,
  lastGoalProgressReportAt: 0,
  lastGoalSuggestionAt: 0,
  pendingGoalConfirmation: null,
  pendingGoalConfirmationExpiresAt: 0,
  currentGoalRunStartedAt: 0,
  plannerPausedReason: null,
  lastPlannerFailure: null,
  lastCompletedGoalId: null,
  lastFailedGoalId: null,
  lastGoalSuggestion: null,
  ownerApprovedGoals: [],
  ownerRejectedGoals: [],
  plannerAutonomyLevel: 'semi',
  netherPrepStarted: false,
  netherPrepCompleted: false,
  netherReadyLastCheckedAt: 0,
  netherChecklistLastResult: null,
  overworldPortalPosition: null,
  netherPortalPosition: null,
  lastNetherEntryAt: 0,
  lastNetherExitAt: 0,
  netherEntryCount: 0,
  lastNetherAbortReason: null,
  netherScoutActive: false,
  netherReturnTarget: null,
  pendingNetherConfirmation: null,
  pendingNetherConfirmationExpiresAt: 0,
  netherGearSnapshot: null,
  netherSupplySnapshot: null,
  talkModeEnabled: true,
  banterEnabled: true,
  ambientDialogueEnabled: true,
  lastDialogueAt: 0,
  lastAmbientCommentAt: 0,
  lastEventCommentAt: 0,
  lastTaskCommentAt: 0,
  lastDialogueSender: null,
  lastDialogueTopic: null,
  pendingDialogueClarification: null,
  pendingMemoryConfirmation: null,
  pendingClearConversationMemoryConfirmation: null,
  personalityPreset: 'loyal_helper',
  responseLengthPreference: 'short',
  chattyLevel: 'normal',
  currentMood: 'calm',
  moodReason: null,
  lastPromptInjectionAttemptAt: 0,
  nonOwnerCommandAttempts: 0,
  lastProgressionCheckAt: 0,
  lastProgressionSuggestionAt: 0,
  activeProgressionPlanId: null,
  pendingProgressionConfirmation: null,
  pendingProgressionConfirmationExpiresAt: 0,
  lastProgressionQuestion: null,
  lastProgressionAnswer: null,
  pendingNaturalCommandIntent: null,
  interactionMode: 'companion',
  playMode: 'companion',
  companionSoftFollow: true,
  companionTaskNarration: true,
  companionStuckRecovery: true,
  companionAmbientGrounded: true,
  companionLookAtOwner: true,
  askBeforeMediumRisk: true,
  autoRunLowRiskNaturalCommands: true,
  explainFailures: true,
  learnNaturalCommands: true,
  sessionRecorderEnabled: true,
  chatVerbosity: 'normal',
  idleAutonomyEnabled: true,
  lastOwnerActivityAt: 0,
  lastIdleResetAt: 0,
  lastIdleResetReason: null,
  lastIdleAutonomyAt: 0,
  lastIdleAutonomyBehavior: null,
  pendingIdleMemoryResetConfirmation: null
};

export function createMemory(memoryPath) {
  let data = { ...defaultMemory };

  function load() {
    cleanupStaleTempFiles(memoryPath);
    if (!fs.existsSync(memoryPath)) {
      save();
      return data;
    }

    try {
      const loaded = { ...defaultMemory, ...JSON.parse(fs.readFileSync(memoryPath, 'utf8')) };
      data = scrubExpiredRuntimeState(loaded);
      if (data !== loaded) save();
    } catch (error) {
      console.warn(`[memory] Could not read memory.json: ${error.message}`);
      backupMalformedFile(memoryPath);
      data = { ...defaultMemory };
      save();
    }

    return data;
  }

  function save() {
    atomicWriteJson(memoryPath, data);
  }

  function get() {
    return data;
  }

  function set(key, value) {
    data[key] = value;
    save();
  }

  function update(patch) {
    data = { ...data, ...patch };
    save();
  }

  function rememberLocation(key, pos) {
    if (!pos) return;
    const point = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), at: Date.now() };

    if (Array.isArray(data[key])) {
      data[key].unshift(point);
      data[key] = data[key].slice(0, 20);
    } else {
      data[key] = point;
    }

    save();
  }

  function pushFailure(reason) {
    data.recentFailures.unshift({ reason, at: Date.now() });
    data.recentFailures = data.recentFailures.slice(0, 10);
    save();
  }

  function reset(reason = 'reset') {
    data = { ...defaultMemory, lastAction: reason, lastActionAt: Date.now() };
    save();
    return data;
  }

  load();

  return { load, save, get, set, update, rememberLocation, pushFailure, reset };
}
