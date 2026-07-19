import net from 'node:net';
import { getCommands } from '../bot/commandRegistry.js';
import { listImplementedSkills, listRiskySkills, listUnimplementedSkills } from '../bot/skillRegistry.js';
import { getSkillRunStatus, getActiveSkill, listRunnableSkills } from '../bot/skillRunner.js';
import { getRecentSkillRuns as loadRecentSkillRuns, listSkillStats, loadSkillMemory } from '../bot/skillMemory.js';
import { getActiveCurriculum, getCurriculumProgress, getCurriculumExecutionHistory } from '../bot/curriculumExecutor.js';
import { getLastSuggestions, getSuggestionHistory } from '../bot/curriculumMemory.js';
import { loadGoals, listGoals, getActiveGoal, getGoalSummary } from '../bot/goals.js';
import { loadMapMemory, summarizeMapMemory, summarizeNetherMemory } from '../bot/mapMemory.js';
import { loadConversationMemory } from '../bot/conversationMemory.js';
import { getRecentLogs as getLoggerRecentLogs } from '../bot/logger.js';
import { getLastNaturalCommandRoute, getPendingNaturalIntent, getNaturalCommandHistory } from '../bot/naturalCommandRouter.js';
import { listLearnedMappings } from '../bot/commandLearningMemory.js';
import { getCompetencyReport } from '../bot/competencyTracker.js';
import { getRecentSessionEvents } from '../bot/sessionRecorder.js';
import { getIdleAutonomyStatus } from '../bot/idleAutonomy.js';
import { getProgressionSummary } from '../bot/progressionTracker.js';
import { listProgressionPaths } from '../bot/progressionPaths.js';
import { loadProgressionState, getProgressionHistory } from '../bot/progressionState.js';
import { getGearSummary, getGearUpgradeNeeds } from '../bot/gearScore.js';
import { getLapisCount, getXpStatus } from '../bot/inventory.js';
import { enchantingStatus } from '../bot/enchanting.js';
import { anvilStatus } from '../bot/anvilSystem.js';
import { potionStatus } from '../bot/potionSystem.js';
import { brewingStatus } from '../bot/brewing.js';
import { summarizeVillagerMemory, listKnownVillages, listKnownVillagers, listKnownTrades, loadVillagerMemory } from '../bot/villagerMemory.js';
import { economySummary } from '../bot/economyManager.js';
import { tradingStatus as villagerTradingStatus } from '../bot/villagerTrading.js';
import { scanNearbyVillagers } from '../bot/villagerScanner.js';
import { listBlueprints, getBlueprint } from '../bot/blueprintRegistry.js';
import { getActiveBuild, getBuildHistory } from '../bot/blueprintMemory.js';
import { blueprintStatus, previewBlueprint, blueprintMaterials } from '../bot/blueprintSystem.js';
import {
  getBridgeDashboardEvents,
  getBridgeDashboardHealth,
  getBridgeDashboardPlayers,
  getBridgeDashboardRegions,
  getBridgeDashboardStatus
} from '../bridge/bridgeDashboard.js';
import { sanitizeDashboardOutput } from './dashboardSecurity.js';

function now() {
  return Date.now();
}

function memoryState(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function round(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null;
}

function point(position) {
  if (!position) return null;
  return {
    x: round(position.x),
    y: round(position.y),
    z: round(position.z)
  };
}

function distance(a, b) {
  if (!a || !b) return null;
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);
  if (![dx, dy, dz].every(Number.isFinite)) return null;
  return round(Math.sqrt(dx * dx + dy * dy + dz * dz));
}

function inventoryItems(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function itemCounts(bot) {
  const counts = {};
  for (const item of inventoryItems(bot)) {
    counts[item.name] = (counts[item.name] || 0) + (Number(item.count) || 0);
  }
  return counts;
}

function compactEvidence(evidence) {
  return (Array.isArray(evidence) ? evidence : [])
    .slice(0, 8)
    .map((item) => typeof item === 'string' ? { name: item, status: 'reported' } : {
      name: item?.name || 'unknown',
      status: item?.status || 'reported',
      confidence: item?.confidence || 'low'
    });
}

function hostileEntities(bot, radius = 32) {
  const names = new Set(['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'drowned', 'husk', 'stray', 'pillager', 'ghast', 'hoglin', 'piglin_brute', 'blaze', 'wither_skeleton', 'magma_cube']);
  const origin = bot?.entity?.position;
  if (!origin || !bot?.entities) return [];
  return Object.values(bot.entities)
    .filter((entity) => {
      const entityDistance = entity?.position ? distance(origin, entity.position) : null;
      return entityDistance !== null && names.has(entity.name) && entityDistance <= radius;
    })
    .slice(0, 50);
}

export function getBotStatus(bot, memory, explicitConfig = {}) {
  const config = bot?.mcaiConfig || memory?.get?.()?.config || explicitConfig || {};
  const botName = bot?.username || config.botUsername || 'tj';
  const live = Boolean(bot && (bot.entity || bot._client?.state === 'play'));
  return {
    username: botName,
    online: live,
    connected: live,
    offline: !live,
    status: live ? 'online' : 'offline',
    message: live ? 'Bot is connected.' : `Bot is offline (server/dashboard only). Start All to put ${botName} in-game.`,
    health: live ? round(bot?.health ?? null) : null,
    food: live ? round(bot?.food ?? null) : null,
    position: live ? point(bot?.entity?.position) : null,
    dimension: live ? (bot?.game?.dimension || 'unknown') : 'offline'
  };
}

export function getOwnerStatus(bot, memory) {
  const config = bot?.mcaiConfig || {};
  const owner = bot?.players?.[config.ownerUsername]?.entity || null;
  const botPosition = bot?.entity?.position;
  const ownerDistance = distance(botPosition, owner?.position);
  return {
    username: config.ownerUsername || 'Player',
    nearby: ownerDistance !== null && ownerDistance <= 96,
    visible: Boolean(owner),
    distance: ownerDistance
  };
}

export function getTaskStatus(memory) {
  const state = memoryState(memory);
  const cancellation = state.cancelled || false;
  return {
    currentTask: state.currentTask?.name || state.currentTask || 'none',
    cancelled: Boolean(cancellation),
    lastAction: state.lastAction || null,
    lastActionAt: state.lastActionAt || 0
  };
}

export function getSkillStatus(memory) {
  const activeSkill = getActiveSkill();
  return {
    activeSkill,
    runStatus: getSkillRunStatus(),
    runnableSkills: listRunnableSkills(),
    implementedCount: listImplementedSkills().length,
    unimplementedCount: listUnimplementedSkills().length,
    riskyCount: listRiskySkills().length,
    recentRuns: loadRecentSkillRuns(10)
  };
}

export function getCurriculumStatus(memory) {
  return {
    activeCurriculum: getActiveCurriculum(),
    paused: ['paused', 'blocked'].includes(getActiveCurriculum()?.status),
    nextStep: getCurriculumProgress(memory).nextStep || null,
    progress: getCurriculumProgress(memory),
    recentRuns: getCurriculumExecutionHistory(10),
    lastSuggestions: getLastSuggestions().slice(0, 5),
    suggestionHistory: getSuggestionHistory(5)
  };
}

export function getGoalStatus(memory) {
  const goals = loadGoals();
  const active = getActiveGoal();
  return {
    activeGoal: active ? getGoalSummary(active) : null,
    activeGoals: listGoals({ status: 'active' }).map(getGoalSummary),
    counts: {
      active: goals.activeGoals?.length || 0,
      completed: goals.completedGoals?.length || 0,
      failed: goals.failedGoals?.length || 0,
      archived: goals.archivedGoals?.length || 0
    }
  };
}

export function getProgressionStatus(bot, memory) {
  const state = loadProgressionState();
  const summary = getProgressionSummary(bot, memory, { state });
  const suggestions = (state.lastSuggestions || []).slice(0, 3);
  return {
    percent: summary.percent,
    completed: summary.completed,
    total: summary.total,
    blockedCount: summary.blockedCount,
    recommended: suggestions[0] || null,
    suggestions,
    completedMilestones: Object.values(state.completedMilestones || {}).slice(-20),
    blockedMilestones: Object.values(state.blockedMilestones || {}).slice(-20),
    categoryProgress: summary.byCategory,
    tierProgress: summary.byTier,
    paths: listProgressionPaths(),
    history: getProgressionHistory(10)
  };
}

export function getSafetyStatus(bot, memory) {
  const state = memoryState(memory);
  const hostiles = hostileEntities(bot, bot?.mcaiConfig?.hostileDetectionRadius || 24);
  const health = Number(bot?.health ?? 20);
  const food = Number(bot?.food ?? 20);
  const dangerFlags = [];
  if (health <= 8) dangerFlags.push('critical_health');
  else if (health <= 14) dangerFlags.push('low_health');
  if (food <= 6) dangerFlags.push('critical_food');
  else if (food <= 10) dangerFlags.push('low_food');
  if (hostiles.length) dangerFlags.push('hostiles_nearby');
  if (state.netherScoutActive) dangerFlags.push('nether_scout_active');
  if (state.lastNetherAbortReason) dangerFlags.push('recent_nether_abort');
  return {
    dangerFlags,
    hostilesNearby: hostiles.length,
    lowHealth: health <= 14,
    lowFood: food <= 10,
    cancellation: bot?.mcaiCancellation?.getState?.() || null
  };
}

export function getInventorySummary(bot) {
  const counts = itemCounts(bot);
  const topItems = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));
  return {
    itemCount: inventoryItems(bot).length,
    freeSlots: Array.isArray(bot?.inventory?.slots) ? bot.inventory.slots.filter((slot) => !slot).length : null,
    topItems
  };
}

export function getPositionSummary(bot) {
  return {
    position: point(bot?.entity?.position),
    dimension: bot?.game?.dimension || 'unknown'
  };
}

export function getMemorySummary() {
  const conversation = loadConversationMemory();
  return {
    conversation: getConversationMemorySummary(conversation),
    map: getMapMemorySummary()
  };
}

export async function getOllamaStatus(config = {}) {
  const provider = String(config.llmProvider || 'ollama').toLowerCase();
  const base = String(config.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const models = config.models || { default: config.ollamaModel || 'qwen3:14b', fastFallback: 'phi4-mini:latest' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const openaiStyle = provider === 'lmstudio' || provider === 'openai_compatible' || provider === 'openai';
    const response = await fetch(openaiStyle ? `${base}/v1/models` : `${base}/api/tags`, { signal: controller.signal });
    if (!response.ok) return { reachable: false, provider, model: models.default, models, reason: `HTTP ${response.status}` };
    const payload = await response.json();
    const names = openaiStyle
      ? (payload.data || []).map((model) => model.id)
      : (payload.models || []).map((model) => model.name);
    return {
      reachable: true,
      provider,
      model: models.default,
      models,
      modelAvailable: names.includes(models.default),
      availableRoles: Object.fromEntries(Object.entries(models).map(([role, model]) => [role, names.includes(model)]))
    };
  } catch (error) {
    return { reachable: false, provider, model: models.default, models, reason: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getServerStatus(config = {}) {
  const host = config.host || '127.0.0.1';
  const port = Number(config.port || 25565);
  const reachable = await new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
  return { host, port, reachable };
}

export function getRecentLogs(limit = 200) {
  return getLoggerRecentLogs(limit);
}

export function getRecentEvidence(limit = 10) {
  return loadRecentSkillRuns(limit).map((run) => ({
    id: run.id,
    skillName: run.skillName,
    resultStatus: run.resultStatus,
    ok: run.ok,
    evidenceSummary: run.evidenceSummary || '',
    evidence: compactEvidence(run.evidence),
    finishedAt: run.finishedAt
  }));
}

export function getRecentSkillRunsSummary(limit = 10) {
  return loadRecentSkillRuns(limit * 2)
    .filter((run) => run.ok !== null && run.finishedAt > 0)
    .slice(0, limit)
    .map((run) => ({
      id: run.id,
      skillName: run.skillName,
      ok: run.ok,
      resultStatus: run.resultStatus,
      reason: run.reason || '',
      evidenceSummary: run.evidenceSummary || '',
      durationMs: run.durationMs || 0,
      finishedAt: run.finishedAt || 0
    }));
}

export function getRecentSkillRunsForDashboard(limit = 10) {
  return getRecentSkillRunsSummary(limit);
}

export function getRecentSkillRuns(limit = 10) {
  return getRecentSkillRunsForDashboard(limit);
}

export function getRecentCurriculumRuns(limit = 10) {
  return getCurriculumExecutionHistory(limit);
}

export function getMapMemorySummary(mapMemory = null) {
  const memory = mapMemory || loadMapMemory();
  return {
    ...summarizeMapMemory(memory),
    nether: summarizeNetherMemory(memory)
  };
}

export function getConversationMemorySummary(conversationMemory = null) {
  const memory = conversationMemory || loadConversationMemory();
  return {
    recentTurns: memory.recentTurns?.length || 0,
    memoryFacts: memory.memoryFacts?.length || 0,
    playerProfiles: Object.keys(memory.playerProfiles || {}).length,
    botSelfNotes: memory.botSelfNotes?.length || 0,
    relationshipNotes: memory.relationshipNotes?.length || 0,
    updatedAt: memory.updatedAt || 0
  };
}

export function getCommandsSummary() {
  const commands = getCommands();
  return {
    total: commands.length,
    implemented: commands.filter((command) => command.implemented).length,
    categories: commands.reduce((groups, command) => {
      groups[command.category] = (groups[command.category] || 0) + 1;
      return groups;
    }, {}),
    commands: commands.map((command) => ({
      name: command.name,
      category: command.category,
      ownerOnly: command.ownerOnly,
      implemented: command.implemented,
      requiresConfirmation: command.requiresConfirmation,
      description: command.description,
      aliases: command.aliases.slice(0, 3)
    }))
  };
}

export function getNaturalRoutingDashboardStatus(memory) {
  return {
    lastRoute: getLastNaturalCommandRoute(),
    pendingClarification: getPendingNaturalIntent(memory),
    learnedMappings: listLearnedMappings().slice(0, 50),
    history: getNaturalCommandHistory(),
    recentFailures: getRecentSessionEvents(50).filter((event) => /failure|recovery/i.test(event.type)).slice(-12)
  };
}

export function getCompetencyDashboardStatus() {
  return getCompetencyReport();
}

export function getSessionEventsDashboardStatus(limit = 50) {
  return getRecentSessionEvents(limit);
}

export function getIdleAutonomyDashboardStatus(memory, config = {}) {
  return getIdleAutonomyStatus(memory, { config });
}

export function getSkillMemorySummary() {
  const memory = loadSkillMemory();
  return {
    skillsTracked: Object.keys(memory.skills || {}).length,
    recentRuns: memory.recentRuns?.length || 0,
    evidenceStats: memory.evidenceStats || {},
    stats: listSkillStats().slice(0, 20)
  };
}

export function getGearDashboardStatus(bot, memory = null) {
  if (!bot?.inventory) {
    return {
      offline: true,
      message: 'Bot offline — gear unavailable.',
      xpLevel: 0,
      lapisCount: 0,
      armorScore: 0,
      best: {},
      needs: [],
      enchantedItems: [],
      damagedGear: [],
      enchanting: { ok: false, message: 'Bot offline' },
      anvil: { ok: false, message: 'Bot offline' },
      potions: { ok: false, message: 'Bot offline' },
      brewing: { ok: false, message: 'Bot offline' }
    };
  }
  try {
    const summary = getGearSummary(bot);
    const needs = getGearUpgradeNeeds(bot);
    return {
      offline: false,
      xpLevel: getXpStatus(bot).level,
      lapisCount: getLapisCount(bot),
      armorScore: summary.armorScore || 0,
      best: summary.best || {},
      needs,
      enchantedItems: (summary.enchantedItems || []).slice(0, 12),
      damagedGear: (summary.damagedGear || []).slice(0, 12),
      enchanting: getEnchantingDashboardStatus(bot, memory),
      anvil: getAnvilDashboardStatus(bot, memory),
      potions: getPotionDashboardStatus(bot, memory),
      brewing: getBrewingDashboardStatus(bot, memory)
    };
  } catch (error) {
    return {
      offline: true,
      message: `Gear status unavailable: ${error.message}`,
      xpLevel: 0,
      lapisCount: 0,
      armorScore: 0,
      best: {},
      needs: [],
      enchantedItems: [],
      damagedGear: []
    };
  }
}

export function getGearUpgradeDashboardStatus(bot) {
  if (!bot?.inventory) {
    return { offline: true, needs: [], summary: null, message: 'Bot offline — gear unavailable.' };
  }
  try {
    return {
      needs: getGearUpgradeNeeds(bot),
      summary: getGearSummary(bot)
    };
  } catch (error) {
    return { offline: true, needs: [], summary: null, message: error.message };
  }
}

export function getEnchantingDashboardStatus(bot, memory = null) {
  const result = enchantingStatus(bot, memory);
  return { ok: result.ok, message: result.message, ...(result.data || {}) };
}

export function getAnvilDashboardStatus(bot, memory = null) {
  const result = anvilStatus(bot, memory);
  return { ok: result.ok, message: result.message, ...(result.data || {}) };
}

export function getPotionDashboardStatus(bot, memory = null) {
  const result = potionStatus(bot, memory);
  return { ok: result.ok, message: result.message, ...(result.data || {}) };
}

export function getBrewingDashboardStatus(bot, memory = null) {
  const result = brewingStatus(bot, memory);
  return { ok: result.ok, message: result.message, ...(result.data || {}) };
}

export function getVillagerDashboardStatus(bot, memory = null) {
  const nearby = scanNearbyVillagers(bot, memory);
  return {
    nearby: nearby.villagers.slice(0, 20),
    memory: summarizeVillagerMemory(),
    valuableVillagers: listKnownVillagers({ valuable: true }).slice(0, 20),
    trading: getTradingDashboardStatus(bot, memory),
    economy: getEconomyDashboardStatus(bot, memory)
  };
}

export function getVillageDashboardStatus() {
  return {
    villages: listKnownVillages().slice(0, 50),
    summary: summarizeVillagerMemory()
  };
}

export function getTradingDashboardStatus(bot, memory = null) {
  const status = villagerTradingStatus(bot, memory);
  return {
    ok: status.ok,
    message: status.message,
    ...(status.data || {}),
    knownTrades: listKnownTrades().slice(0, 50)
  };
}

export function getEconomyDashboardStatus(bot, memory = null) {
  return {
    ...economySummary(bot, memory),
    tradeHistory: loadVillagerMemory().tradeHistory.slice(-20).reverse()
  };
}

export function getBlueprintDashboardStatus(bot, memory = null) {
  const status = blueprintStatus(bot, memory);
  const active = getActiveBuild();
  return {
    ok: status.ok,
    message: status.message,
    blueprints: listBlueprints(),
    activeBuild: active,
    history: getBuildHistory(20),
    counts: {
      available: listBlueprints().length,
      placed: active?.placedBlocks?.length || 0,
      remaining: active?.remainingBlocks?.length || 0,
      failed: active?.failedBlocks?.length || 0
    }
  };
}

export function getBlueprintPreviewDashboardStatus(bot, memory, blueprintId) {
  return previewBlueprint(bot, memory, blueprintId);
}

export function getBlueprintMaterialsDashboardStatus(bot, memory, blueprintId) {
  return blueprintMaterials(bot, memory, blueprintId);
}

export async function getServerBridgeDashboardStatus(config = {}) {
  return getBridgeDashboardStatus(config);
}

export async function getServerBridgeDashboardEvents(config = {}) {
  return getBridgeDashboardEvents(config);
}

export async function getServerBridgeDashboardRegions(config = {}) {
  return getBridgeDashboardRegions(config);
}

export async function getServerBridgeDashboardPlayers(config = {}) {
  return getBridgeDashboardPlayers(config);
}

export async function getServerBridgeDashboardHealth(config = {}) {
  return getBridgeDashboardHealth(config);
}

export async function buildDashboardState(bot, memory, context = {}) {
  const config = context.config || bot?.mcaiConfig || {};
  const botStatus = getBotStatus(bot, memory, config);
  const systems = {
    ollamaReachable: null,
    serverReachable: null,
    botOnline: botStatus.online,
    llmMode: config.llmMode || 'dialogue',
    model: config.models?.dialogue || config.models?.default || config.ollamaModel || 'gemma2-2b-local:latest',
    models: config.models || {}
  };

  if (context.checkSystems) {
    const [ollama, server] = await Promise.all([getOllamaStatus(config), getServerStatus(config)]);
    systems.ollamaReachable = ollama.reachable;
    systems.serverReachable = server.reachable;
  }

  // When dashboard runs without a live bot, return a calm offline snapshot (no gear/inventory throws).
  if (!botStatus.online) {
    return sanitizeDashboardOutput({
      timestamp: now(),
      bot: botStatus,
      owner: { username: config.ownerUsername || 'Player', nearby: false, visible: false, distance: null },
      task: getTaskStatus(memory),
      skill: getSkillStatus(memory),
      naturalRouting: getNaturalRoutingDashboardStatus(memory),
      competency: getCompetencyDashboardStatus(),
      idleAutonomy: { enabled: false, message: 'Bot offline' },
      curriculum: getCurriculumStatus(memory),
      goals: getGoalStatus(memory),
      progression: { ok: false, message: 'Bot offline' },
      gear: getGearDashboardStatus(null, memory),
      villagers: { ok: false, message: 'Bot offline' },
      blueprints: { ok: false, message: 'Bot offline', blueprints: [], activeBuild: null, history: [], counts: {} },
      serverBridge: await getServerBridgeDashboardStatus(config),
      safety: { ok: true, message: 'Bot offline — no live safety state' },
      inventory: { itemCount: 0, freeSlots: null, topItems: [], offline: true },
      systems,
      notice: `Bot is offline. Paper/dashboard can still run. Use AIO Start All for ${config.botUsername || 'tj'} in-game.`
    });
  }

  return sanitizeDashboardOutput({
    timestamp: now(),
    bot: botStatus,
    owner: getOwnerStatus(bot, memory),
    task: getTaskStatus(memory),
    skill: getSkillStatus(memory),
    naturalRouting: getNaturalRoutingDashboardStatus(memory),
    competency: getCompetencyDashboardStatus(),
    idleAutonomy: getIdleAutonomyDashboardStatus(memory, config),
    curriculum: getCurriculumStatus(memory),
    goals: getGoalStatus(memory),
    progression: getProgressionStatus(bot, memory),
    gear: getGearDashboardStatus(bot, memory),
    villagers: getVillagerDashboardStatus(bot, memory),
    blueprints: getBlueprintDashboardStatus(bot, memory),
    serverBridge: await getServerBridgeDashboardStatus(config),
    safety: getSafetyStatus(bot, memory),
    inventory: getInventorySummary(bot),
    systems
  });
}
