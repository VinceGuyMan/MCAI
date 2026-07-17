import mineflayer from 'mineflayer';
import { loadConfig } from './config.js';
import { validateConfig, explainConfigErrors } from './configSchema.js';
import { configureLogger, info, warn, error as logError, event } from './logger.js';
import { createMemory } from './memory.js';
import { collectPerception } from './perception.js';
import { createSafety } from './safety.js';
import { createTaskQueue } from './taskQueue.js';
import { createOllama } from './ollama.js';
import { createPlanner } from './planner.js';
import { createActions } from './actions.js';
import { setupChat } from './chat.js';
import { createBrain } from './brain.js';
import { createCancellation } from './cancellation.js';
import { resetConversationMemory } from './conversationMemory.js';
import * as mapMemoryStore from './mapMemory.js';
import * as goalsStore from './goals.js';
import { startDashboard } from '../dashboard/server.js';
import { initializePluginBridge, shutdownPluginBridge } from '../bridge/pluginBridge.js';
import { loadMineflayerPlugins } from './pluginLoader.js';
import { applyStarterKit, shouldAutoApplyStarterKit } from './starterKit.js';

const config = loadConfig();
configureLogger(config);
const configValidation = validateConfig(config);
if (configValidation.warnings.length) warn('[config]', explainConfigErrors({ errors: [], warnings: configValidation.warnings }));
if (!configValidation.ok) {
  logError('[config]', explainConfigErrors(configValidation));
  process.exit(1);
}

const memory = createMemory(config.memoryPath);
goalsStore.loadGoals();
const taskQueue = createTaskQueue(memory);
const cancellation = createCancellation();

function clearVolatileLogoutState(reason = 'bot logout') {
  memory.update({
    currentTask: null,
    activeGoalStepId: null,
    thinCoreTaskActive: false,
    activeThinCoreAction: null,
    thinCoreTaskStartedAt: 0,
    activeResourceRun: null,
    activeMiningExpedition: null,
    activeExploration: null,
    currentRouteRecording: null,
    currentWaypointTarget: null,
    followOwnerActive: false,
    movementMode: null,
    foodTaskActive: false,
    farmTaskActive: false,
    animalTaskActive: false,
    combatMode: 'off',
    activeThreat: null,
    activeThreatId: null,
    activeThreatType: null,
    netherScoutActive: false,
    pendingConfirmation: null,
    pendingConfirmationExpiresAt: 0,
    pendingCraftConfirmation: null,
    pendingCraftScavengeConfirmation: null,
    pendingBuildConfirmation: null,
    pendingMiningConfirmation: null,
    pendingFarmConfirmation: null,
    pendingAnimalConfirmation: null,
    pendingExplorationConfirmation: null,
    pendingCombatConfirmation: null,
    pendingGoalConfirmation: null,
    pendingGoalConfirmationExpiresAt: 0,
    pendingNetherConfirmation: null,
    pendingNetherConfirmationExpiresAt: 0,
    pendingDialogueClarification: null,
    pendingMemoryConfirmation: null,
    pendingClearConversationMemoryConfirmation: null,
    pendingProgressionConfirmation: null,
    pendingProgressionConfirmationExpiresAt: 0,
    pendingNaturalCommandIntent: null,
    pendingGearUpgradeConfirmation: null,
    pendingTradeConfirmation: null,
    pendingVillagerMemoryConfirmation: null,
    pendingBridgeRegionConfirmation: null,
    pendingIdleMemoryResetConfirmation: null,
    pendingBlueprintBuild: null,
    lastAction: reason,
    lastActionAt: Date.now()
  });
}

info('[bot] loaded config:', JSON.stringify({
  ownerUsername: config.ownerUsername,
  botUsername: config.botUsername,
  host: config.host,
  port: config.port,
  minecraftVersion: config.minecraftVersion,
  ollamaModel: config.ollamaModel,
  models: config.models
}));

const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: config.botUsername,
  version: config.minecraftVersion,
  auth: config.auth
});

bot.mcaiConfig = config;
await loadMineflayerPlugins(bot, config);

const perception = () => collectPerception(bot, config, memory, taskQueue);
const safety = createSafety(bot, config, memory);
bot.mcaiSafety = safety;
const ollama = createOllama(config);
const planner = createPlanner(config, ollama, memory);
const actions = await createActions(bot, config, { memory, taskQueue, safety, perception, cancellation });
const brain = createBrain(config, { bot, perception, safety, actions, taskQueue, planner, memory, cancellation });

setupChat(bot, config, { actions, planner, perception, memory });

startDashboard({
  bot,
  memory,
  config,
  actions,
  cancellation,
  logger: { info, warn, error: logError }
}).catch((dashboardError) => {
  warn('[dashboard] startup failed:', dashboardError.message);
});

initializePluginBridge(bot, memory, config).catch((bridgeError) => {
  warn('[bridge] startup failed:', bridgeError.message);
});

let hasSpawned = false;
let diedSinceLastSpawn = false;

function botPosition() {
  if (!bot.entity?.position) return null;
  return {
    x: Math.floor(bot.entity.position.x),
    y: Math.floor(bot.entity.position.y),
    z: Math.floor(bot.entity.position.z)
  };
}

bot.on('spawn', () => {
  event(`[bot] ${config.botUsername} spawned on ${config.host}:${config.port}`);
  actions.setupMovements();
  cancellation.resetCancellation();

  if (!hasSpawned) {
    const mode = memory.get().interactionMode || config.interactionMode || config.playMode || 'companion';
    if (mode === 'companion') {
      bot.chat(`${config.botUsername} online — companion mode. Soft-follow on near ${config.ownerUsername}.`);
    } else {
      bot.chat(`${config.botUsername} online. Staying near ${config.ownerUsername}.`);
    }
    hasSpawned = true;
  } else if (diedSinceLastSpawn) {
    bot.chat('I died. Last death location saved.');
    diedSinceLastSpawn = false;
    // Fresh kit after death if enabled (once-per-session still applies unless force restock).
    if (config.starterKitOnDeath === true) {
      memory.update({ starterKitAppliedThisSession: false });
    }
  }

  // Migrate older memory files onto companion defaults when config asks for companion.
  const mem = memory.get();
  const wantsCompanion = (config.playMode || config.interactionMode) === 'companion';
  if (wantsCompanion && (mem.companionSoftFollow === undefined || mem.playMode === undefined)) {
    memory.update({
      interactionMode: 'companion',
      playMode: 'companion',
      companionSoftFollow: config.companionSoftFollow !== false,
      companionTaskNarration: config.companionTaskNarration !== false,
      companionStuckRecovery: config.companionStuckRecovery !== false,
      companionAmbientGrounded: config.companionAmbientGrounded !== false,
      companionLookAtOwner: config.companionLookAtOwner !== false,
      allowAmbientComments: true,
      allowTaskCommentary: true
    });
  }

  memory.update({
    currentTask: taskQueue.getCurrentTask(),
    knownSafeLocation: perception().position,
    lastAction: 'spawn',
    lastActionAt: Date.now()
  });
  brain.start();

  // Iron-down starter kit (local op /give). Delay so spawn fully settles.
  if (shouldAutoApplyStarterKit(config, memory)) {
    setTimeout(() => {
      applyStarterKit(bot, memory, config)
        .then((result) => {
          if (result?.skipped) return;
          if (result?.message) bot.chat(String(result.message).slice(0, config.maxChatResponseLength || 280));
        })
        .catch((error) => logError('[starter-kit]', error.message || error));
    }, Number(config.starterKitSpawnDelayMs || 1500));
  }
});

bot.on('death', () => {
  event('[bot] died');
  const deathPosition = botPosition();
  if (deathPosition && config.mapMemoryEnabled) {
    const mapMemory = mapMemoryStore.loadMapMemory();
    mapMemoryStore.addWaypoint(mapMemory, {
      name: 'last death',
      type: 'danger',
      dimension: bot.game?.dimension || 'overworld',
      position: deathPosition,
      createdBy: 'tj',
      notes: 'Last death location.'
    });
    mapMemoryStore.addDangerZone(mapMemory, {
      dangerType: 'unknown',
      dimension: bot.game?.dimension || 'overworld',
      position: deathPosition,
      severity: 'high',
      notes: 'tj died here.'
    });
    mapMemoryStore.saveMapMemory(mapMemory);
  }
  diedSinceLastSpawn = true;
  cancellation.cancelAll('death');
  const activeGoal = goalsStore.getActiveGoal();
  if (activeGoal) goalsStore.pauseGoal(activeGoal.id, 'Paused because tj died.');
  taskQueue.clearTask();
  bot.pathfinder?.setGoal?.(null);
  bot.clearControlStates?.();
  memory.pushFailure('death');
  memory.update({
    currentTask: null,
    activeGoalStepId: null,
    plannerPausedReason: activeGoal ? 'Paused because tj died.' : memory.get().plannerPausedReason,
    lastDeathPosition: deathPosition,
    lastDeathReason: 'death',
    deathCount: (memory.get().deathCount || 0) + 1,
    lastAction: 'death',
    lastActionAt: Date.now()
  });
});

bot.on('kicked', (reason, loggedIn) => {
  let detail = 'unknown';
  try {
    if (reason == null) detail = 'null';
    else if (typeof reason === 'string') detail = reason;
    else if (typeof reason === 'object') {
      // Mineflayer/prismarine chat component or nbt-ish objects
      if (typeof reason.toString === 'function' && reason.toString() !== '[object Object]') detail = reason.toString();
      else if (reason.value !== undefined) detail = JSON.stringify(reason.value);
      else if (reason.text || reason.translate) detail = JSON.stringify({ text: reason.text, translate: reason.translate, extra: reason.extra });
      else detail = JSON.stringify(reason);
    } else detail = String(reason);
  } catch (error) {
    detail = `unprintable (${error.message})`;
  }
  logError(`[bot] kicked (loggedIn=${Boolean(loggedIn)}): ${detail}`);
});

let lastConnectError = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = Number(config.botReconnectAttempts ?? 30);
const reconnectDelayMs = Number(config.botReconnectDelayMs ?? 3000);

bot.on('error', (error) => {
  lastConnectError = error;
  logError('[bot] error:', error);
});

bot.on('spawn', () => {
  reconnectAttempts = 0;
  lastConnectError = null;
});

bot.on('end', () => {
  event('[bot] disconnected');
  brain.stop();
  shutdownPluginBridge();
  if (config.clearVolatileSessionMemoryOnLogout !== false) {
    try {
      clearVolatileLogoutState('bot logout');
      // Allow auto kit again after a full disconnect/reconnect cycle.
      memory.update({ starterKitAppliedThisSession: false });
      event('[memory] volatile session state cleared on logout; persistent memory kept');
    } catch (memoryError) {
      warn('[memory] could not clear volatile session state on logout:', memoryError.message);
    }
  }
  if (config.clearConversationMemoryOnLogout && config.allowFullMemoryClearOnLogout === true) {
    try {
      resetConversationMemory('bot logout');
      event('[memory] conversation memory cleared on logout');
    } catch (memoryError) {
      warn('[memory] could not clear conversation memory on logout:', memoryError.message);
    }
  } else if (config.clearConversationMemoryOnLogout) {
    warn('[memory] clearConversationMemoryOnLogout ignored because allowFullMemoryClearOnLogout is not true');
  }
  if (config.clearMemoryOnLogout && config.allowFullMemoryClearOnLogout === true) {
    try {
      memory.reset('bot logout');
      event('[memory] persistent memory cleared on logout');
    } catch (memoryError) {
      warn('[memory] could not clear persistent memory on logout:', memoryError.message);
    }
  } else if (config.clearMemoryOnLogout) {
    warn('[memory] clearMemoryOnLogout ignored because allowFullMemoryClearOnLogout is not true');
  }

  // If the server was not up yet (ECONNREFUSED), restart the process so the launcher can retry cleanly.
  const refused = /ECONNREFUSED/i.test(String(lastConnectError?.code || lastConnectError?.message || ''));
  if (refused && reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts += 1;
    warn(`[bot] server not ready (${config.host}:${config.port}). Restarting bot in ${reconnectDelayMs}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
    setTimeout(() => {
      // Fresh process avoids half-initialized mineflayer state after a refused connect.
      process.exit(2);
    }, reconnectDelayMs);
    return;
  }

  process.exit(0);
});
