import * as builder from './builder.js';
import * as crafting from './crafting.js';
import * as homeBase from './homeBase.js';
import * as resourceRuns from './resourceRuns.js';
import * as storage from './storage.js';

function oncePer(memory, key, ms) {
  const now = Date.now();
  if (now - (memory.get()[key] || 0) < ms) return false;
  memory.update({ [key]: now });
  return true;
}

export function needsBaseMaintenance(bot, memory, config = {}) {
  const home = homeBase.homeStatus(bot, memory);
  const counts = resourceRuns.inventoryResourceCounts(bot);
  const hasStorage = storage.storageStatus(bot, memory).hasStorage;
  const missing = [];

  if (!home.exists) missing.push('home');
  if (home.exists && !hasStorage) missing.push('storage');
  if (counts.torches < (config.minimumTorchCount || 8)) missing.push('torches');
  if (counts.food < (config.minimumFoodCount || 6)) missing.push('food');
  if (counts.logs < (config.minimumLogCount || 16)) missing.push('wood');
  if (counts.cobblestone < (config.minimumCobblestoneCount || 32)) missing.push('stone');
  if (counts.coal < (config.minimumCoalCount || 8)) missing.push('coal');

  return { needed: missing.length > 0, missing, counts, home, hasStorage };
}

export function baseMaintenanceStatusText(bot, memory, config = {}) {
  const status = needsBaseMaintenance(bot, memory, config);
  if (!status.home.exists) return 'Base: no home set yet.';
  if (!status.needed) return `Base: looks stocked. Wood ${status.counts.logs}, stone ${status.counts.cobblestone}, coal ${status.counts.coal}, food ${status.counts.food}, torches ${status.counts.torches}.`;
  return `Base needs: ${status.missing.join(', ')}. Counts: wood ${status.counts.logs}, stone ${status.counts.cobblestone}, coal ${status.counts.coal}, food ${status.counts.food}, torches ${status.counts.torches}.`;
}

export async function maintainLighting(bot, memory, options = {}) {
  const config = options.config || {};
  if (!config.homeLightingEnabled || !homeBase.hasHome(memory)) return { ok: false, message: 'Home lighting is not enabled or home is not set.' };
  if (!homeBase.isNearHome(bot, memory, config.maxBaseBuildRadius || 12)) return { ok: false, message: 'I should be near home before lighting it.' };
  if (crafting.countItem(bot, 'torch') <= 0) return { ok: false, message: 'I need torches to light home.' };
  return builder.buildTorchRing(bot, memory, options);
}

export async function maintainStorage(bot, memory, options = {}) {
  const config = options.config || {};
  if (!config.storageEnabled || !config.allowAutonomousChestUse) return { ok: false, message: 'Storage maintenance is disabled.' };
  if (!storage.findOwnedStorageChest(bot, memory)) return { ok: false, message: 'No registered storage chest.' };
  return storage.depositItems(bot, memory, options);
}

export async function maintainFoodMinimum(bot, memory, options = {}) {
  const config = options.config || {};
  const counts = resourceRuns.inventoryResourceCounts(bot);
  if (counts.food >= (config.minimumFoodCount || 6)) return { ok: true, message: 'Food minimum is met.' };
  if (options.actions?.getFood) return options.actions.getFood();
  return { ok: false, message: 'Food is low, but no food action is available.' };
}

export async function maintainWoodMinimum(bot, memory, options = {}) {
  const config = options.config || {};
  const counts = resourceRuns.inventoryResourceCounts(bot);
  if (counts.logs >= (config.minimumLogCount || 16)) return { ok: true, message: 'Wood minimum is met.' };
  if (!config.allowAutonomousTreeFarming) return { ok: false, message: 'Wood is low, but autonomous tree gathering is disabled.' };
  return resourceRuns.runWoodResourceRun(bot, memory, Math.min(config.minimumLogCount || 16, 16), options);
}

export async function maintainStoneMinimum(bot, _memory, options = {}) {
  const config = options.config || {};
  const counts = resourceRuns.inventoryResourceCounts(bot);
  if (counts.cobblestone >= (config.minimumCobblestoneCount || 32)) return { ok: true, message: 'Stone minimum is met.' };
  if (!config.allowAutonomousMining) return { ok: false, message: 'Stone is low. I will not mine it automatically.' };
  return { ok: false, message: 'Autonomous stone mining is intentionally limited right now.' };
}

export async function maintainCoalMinimum(bot, _memory, options = {}) {
  const config = options.config || {};
  const counts = resourceRuns.inventoryResourceCounts(bot);
  if (counts.coal >= (config.minimumCoalCount || 8)) return { ok: true, message: 'Coal minimum is met.' };
  if (!config.allowAutonomousMining) return { ok: false, message: 'Coal is low. I will not cave mine automatically.' };
  return { ok: false, message: 'Autonomous coal mining is intentionally limited right now.' };
}

export function maintainSafetyAtHome(bot, memory, state = {}) {
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'No home set.' };
  const flags = state.homeDangerFlags || {};
  const dangerous = Object.entries(flags).filter(([, value]) => value).map(([name]) => name);
  return dangerous.length
    ? { ok: false, message: `Home danger: ${dangerous.join(', ')}.` }
    : { ok: true, message: 'Home safety looks okay.' };
}

export async function baseMaintenanceTick(bot, memory, options = {}) {
  const config = options.config || {};
  const state = options.state || options.perception?.() || {};
  if (!config.homeBaseEnabled || !config.allowAutonomousBaseMaintenance) return { ok: false, message: 'Base maintenance is disabled.' };
  if (!homeBase.hasHome(memory)) return { ok: false, message: 'No home set.' };
  if (state.dangerFlags?.hostileNearby || state.dangerFlags?.lavaNearby || state.dangerFlags?.fireNearby) {
    return { ok: false, message: 'Skipping base maintenance while danger is nearby.' };
  }
  if (!homeBase.isNearHome(bot, memory, config.maxBaseBuildRadius || 12)) {
    return { ok: false, message: 'I am not near home for base maintenance.' };
  }
  if (!oncePer(memory, 'lastBaseMaintenanceAt', options.force ? 0 : 45000)) {
    return { ok: false, message: 'Base maintenance checked recently.' };
  }

  const notes = [];
  const need = needsBaseMaintenance(bot, memory, config);
  if (need.counts.torches > 0 && need.counts.torches < (config.minimumTorchCount || 8)) {
    notes.push((await maintainLighting(bot, memory, options)).message);
  }
  if (storage.findOwnedStorageChest(bot, memory)) {
    notes.push((await maintainStorage(bot, memory, options)).message);
  }
  if (need.counts.food < (config.minimumFoodCount || 6) && state.criticalFood) {
    notes.push((await maintainFoodMinimum(bot, memory, options)).message);
  }
  if (need.counts.logs < Math.min(config.minimumLogCount || 16, 8) && !state.dangerFlags?.nightTime) {
    notes.push((await maintainWoodMinimum(bot, memory, options)).message);
  }

  return {
    ok: notes.length > 0,
    message: notes.length ? `Base maintenance: ${notes.join(' ')}` : baseMaintenanceStatusText(bot, memory, config)
  };
}
