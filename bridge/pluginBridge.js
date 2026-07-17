import { loadConfig } from '../bot/config.js';
import * as bridgeClient from './bridgeClient.js';
import { routeBridgeEvent, normalizeBridgeEvent, summarizeBridgeEvent } from './bridgeEvents.js';
import { validateBridgeConfig, validateBridgeEvent, validateBridgeRegion } from './bridgeValidator.js';

const state = {
  initialized: false,
  available: false,
  lastStatus: null,
  lastHealth: null,
  lastError: '',
  lastEventId: '',
  recentEvents: [],
  pollTimer: null,
  startedAt: 0
};

function memoryState(memory) {
  return typeof memory?.get === 'function' ? memory.get() : memory || {};
}

function remember(memory, patch) {
  if (typeof memory?.update === 'function') memory.update(patch);
  else Object.assign(memory || {}, patch);
}

function botPosition(bot) {
  const pos = bot?.entity?.position;
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), world: bot?.game?.dimension || 'world' };
}

export async function initializePluginBridge(bot, memory, config = loadConfig()) {
  if (!config.serverPluginBridgeEnabled) return pluginBridgeStatus();
  const validation = validateBridgeConfig(config);
  if (!validation.ok) {
    state.lastError = validation.errors.join('; ');
    return pluginBridgeStatus();
  }
  state.initialized = true;
  state.startedAt = Date.now();
  state.lastEventId = String(memoryState(memory).bridgeLastEventId || state.lastEventId || '');
  const health = await bridgeClient.bridgeHealthCheck(config);
  state.lastHealth = health;
  state.available = Boolean(health.ok);
  state.lastError = health.ok ? '' : health.reason || 'Bridge unavailable.';
  bot.mcaiPluginBridge = state;
  if (!state.pollTimer) {
    state.pollTimer = setInterval(() => {
      pollBridgeEvents(bot, memory).catch((error) => {
        state.lastError = error.message;
      });
    }, Number(config.serverPluginPollIntervalMs || 1000));
    state.pollTimer.unref?.();
  }
  return pluginBridgeStatus();
}

export function pluginBridgeStatus() {
  return {
    initialized: state.initialized,
    available: state.available,
    lastStatus: state.lastStatus,
    lastHealth: state.lastHealth,
    lastError: state.lastError,
    lastEventId: state.lastEventId,
    recentEvents: state.recentEvents.slice(-20),
    startedAt: state.startedAt
  };
}

export async function pollBridgeEvents(bot, memory, config = loadConfig()) {
  if (!config.serverPluginBridgeEnabled) return { ok: false, reason: 'Bridge disabled.' };
  const status = await bridgeClient.getBridgeStatus(config);
  state.lastStatus = status.data || null;
  state.available = Boolean(status.ok);
  if (!status.ok) {
    state.lastError = status.reason || 'Bridge unavailable.';
    return { ok: false, reason: state.lastError };
  }

  const since = state.lastEventId || String(memoryState(memory).bridgeLastEventId || '');
  const response = await bridgeClient.getRecentBridgeEvents({ since, config });
  if (!response.ok) {
    state.lastError = response.reason || 'Could not fetch bridge events.';
    return { ok: false, reason: state.lastError };
  }
  const events = Array.isArray(response.data?.events) ? response.data.events : [];
  let processed = 0;
  let skipped = 0;
  for (const event of events) {
    const result = processBridgeEvent(bot, memory, event);
    if (result?.skipped) skipped += 1;
    else if (result?.ok) processed += 1;
  }
  return { ok: true, count: processed, skipped };
}

export function processBridgeEvent(bot, memory, event) {
  const normalized = normalizeBridgeEvent(event);
  const validation = validateBridgeEvent(normalized);
  if (!validation.ok) {
    state.lastError = validation.errors.join('; ');
    return { ok: false, reason: state.lastError };
  }
  const current = memoryState(memory);
  const processedIds = Array.isArray(current.bridgeProcessedEventIds) ? current.bridgeProcessedEventIds : [];
  if (processedIds.includes(normalized.id)) {
    state.lastEventId = normalized.id;
    remember(memory, { bridgeLastEventId: normalized.id });
    return { ok: true, skipped: true, reason: 'Bridge event already processed.', event: normalized };
  }
  const routed = routeBridgeEvent(bot, memory, normalized);
  state.lastEventId = normalized.id;
  state.recentEvents = [...state.recentEvents.slice(-49), normalized];
  remember(memory, {
    bridgeLastEventId: normalized.id,
    bridgeProcessedEventIds: [...processedIds, normalized.id].slice(-200)
  });
  if (normalized.type === 'bridge_emergency_stop') handleBridgeEmergencyStop(bot, memory, normalized);
  return routed;
}

export async function syncBridgeRegions(bot, memory, config = loadConfig()) {
  const response = await bridgeClient.getRegions(config);
  if (!response.ok) return response;
  const regions = Array.isArray(response.data?.regions) ? response.data.regions.filter((region) => validateBridgeRegion(region).ok) : [];
  remember(memory, { bridgeRegions: regions, bridgeRegionsUpdatedAt: Date.now() });
  return { ok: true, regions };
}

function regionFromCenter(id, name, type, position, radius = 8) {
  return {
    id,
    name,
    type,
    world: position.world || 'world',
    dimension: position.dimension || 'overworld',
    min: { x: position.x - radius, y: Math.max(-64, position.y - 4), z: position.z - radius },
    max: { x: position.x + radius, y: position.y + 12, z: position.z + radius },
    protected: true,
    createdBy: 'ModVinny',
    createdAt: Date.now(),
    notes: 'Registered by tj through the local bridge.'
  };
}

export async function registerHomeRegionWithBridge(bot, memory, config = loadConfig()) {
  const current = memoryState(memory);
  const home = current.home?.position || current.home || botPosition(bot);
  if (!home) return { ok: false, reason: 'No home or bot position available.' };
  const region = regionFromCenter('home_base', 'home_base', 'home', { ...home, world: home.world || 'world' }, 12);
  return bridgeClient.registerRegion(region, config);
}

export async function registerFarmRegionWithBridge(bot, memory, farm, config = loadConfig()) {
  const position = farm?.position || botPosition(bot);
  if (!position) return { ok: false, reason: 'No farm position available.' };
  return bridgeClient.registerRegion(regionFromCenter(`farm_${Date.now()}`, farm?.name || 'farm', 'farm', position, 10), config);
}

export async function registerVillageRegionWithBridge(bot, memory, village, config = loadConfig()) {
  const position = village?.center || village?.position || botPosition(bot);
  if (!position) return { ok: false, reason: 'No village position available.' };
  return bridgeClient.registerRegion(regionFromCenter(`village_${Date.now()}`, village?.name || 'village', 'village', position, 24), config);
}

export async function registerPortalRegionWithBridge(bot, memory, portal, config = loadConfig()) {
  const position = portal?.position || botPosition(bot);
  if (!position) return { ok: false, reason: 'No portal position available.' };
  return bridgeClient.registerRegion(regionFromCenter(`portal_${Date.now()}`, portal?.name || 'portal', 'portal', position, 8), config);
}

export async function registerBlueprintBuildRegionWithBridge(bot, memory, build, config = loadConfig()) {
  const position = build?.origin || botPosition(bot);
  if (!position) return { ok: false, reason: 'No build position available.' };
  return bridgeClient.registerRegion(regionFromCenter(`blueprint_${build?.id || Date.now()}`, build?.blueprintId || 'blueprint_build', 'custom', position, 12), config);
}

export function handleBridgeEmergencyStop(bot, memory, event) {
  bot?.mcaiCancellation?.cancelAll?.('server plugin bridge emergency stop');
  remember(memory, {
    lastBridgeEmergencyStopAt: Date.now(),
    lastBridgeEmergencyStop: event,
    currentTask: null
  });
  return { ok: true, message: 'Bridge emergency stop processed.' };
}

export function shutdownPluginBridge() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
  state.initialized = false;
  return { ok: true };
}

export function summarizeBridgeStatus() {
  if (!state.initialized) return 'Server plugin bridge is not initialized.';
  if (!state.available) return `Server plugin bridge unavailable: ${state.lastError || 'not connected'}`;
  const last = state.recentEvents.at(-1);
  return `Server plugin bridge connected. Recent events: ${state.recentEvents.length}${last ? `. Last: ${summarizeBridgeEvent(last)}` : '.'}`;
}
