import * as homeBase from './homeBase.js';
import * as inventory from './inventory.js';
import * as storage from './storage.js';

const resourceItems = {
  wood: ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'bamboo_block', 'pale_oak_log'],
  stone: ['cobblestone', 'stone', 'cobbled_deepslate'],
  coal: ['coal', 'charcoal'],
  iron: ['raw_iron', 'iron_ore', 'deepslate_iron_ore', 'iron_ingot'],
  food: ['apple', 'bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton', 'cooked_cod', 'cooked_salmon', 'beef', 'porkchop', 'chicken', 'mutton', 'cod', 'salmon', 'potato', 'baked_potato', 'carrot', 'sweet_berries', 'melon_slice']
};

function normalize(resourceType) {
  return String(resourceType || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function countAny(bot, names) {
  const wanted = new Set(names);
  return (bot.inventory?.items?.() || [])
    .filter((item) => wanted.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

function defaultTarget(resourceType, config = {}) {
  if (resourceType === 'wood') return config.minimumLogCount || 16;
  if (resourceType === 'stone') return config.minimumCobblestoneCount || 32;
  if (resourceType === 'coal') return config.minimumCoalCount || 8;
  if (resourceType === 'iron') return config.minimumIronCount || 8;
  if (resourceType === 'food') return config.minimumFoodCount || 6;
  return 8;
}

function activeRunPatch(resourceType, targetCount) {
  return {
    activeResourceRun: {
      resourceType,
      targetCount,
      startedAt: Date.now()
    },
    lastResourceRunAt: Date.now()
  };
}

function finishRun(memory, resourceType, result) {
  const history = memory.get().resourceRunHistory || [];
  memory.update({
    activeResourceRun: null,
    resourceRunHistory: [
      { resourceType, ok: Boolean(result.ok), message: result.message, at: Date.now() },
      ...history
    ].slice(0, 20)
  });
}

export function resourceStatus(bot, memory, config = {}) {
  return {
    active: memory.get().activeResourceRun || null,
    counts: {
      wood: countAny(bot, resourceItems.wood),
      stone: countAny(bot, resourceItems.stone),
      coal: countAny(bot, resourceItems.coal),
      iron: countAny(bot, resourceItems.iron),
      food: countAny(bot, resourceItems.food)
    },
    minimums: {
      wood: config.minimumLogCount || 16,
      stone: config.minimumCobblestoneCount || 32,
      coal: config.minimumCoalCount || 8,
      iron: config.minimumIronCount || 8,
      food: config.minimumFoodCount || 6
    },
    home: homeBase.homeStatus(bot, memory)
  };
}

export function resourceStatusText(bot, memory, config = {}) {
  const status = resourceStatus(bot, memory, config);
  const active = status.active ? ` Active: ${status.active.resourceType} to ${status.active.targetCount}.` : '';
  return `Resources: wood ${status.counts.wood}/${status.minimums.wood}, stone ${status.counts.stone}/${status.minimums.stone}, coal ${status.counts.coal}/${status.minimums.coal}, iron ${status.counts.iron}/${status.minimums.iron}, food ${status.counts.food}/${status.minimums.food}.${active}`;
}

export async function returnAndDeposit(bot, memory, options = {}) {
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped before returning.' };
  const config = options.config || {};
  let returned = false;
  if (config.returnHomeAfterResourceRun && homeBase.hasHome(memory)) {
    const home = await homeBase.returnHome(bot, memory, { throwIfCancelled: options.throwIfCancelled, range: 3 }).catch((error) => ({ ok: false, message: error.message }));
    returned = Boolean(home.ok);
  } else if (options.actions?.comeToOwner) {
    await options.actions.comeToOwner().catch(() => null);
    returned = true;
  }

  if (config.storageEnabled && storage.findOwnedStorageChest(bot, memory)) {
    await storage.depositItems(bot, memory, { config, ownerUsername: config.ownerUsername, shouldStop: options.shouldStop }).catch((error) => console.warn(`[resource] deposit failed: ${error.message}`));
  }

  return { ok: true, message: returned ? 'Returned after the resource run.' : 'Resource run finished.' };
}

async function loopMineResource(bot, memory, resourceType, targetCount, blockName, options = {}) {
  const config = options.config || {};
  const maxDuration = config.maxResourceRunDurationMs || 180000;
  const started = Date.now();
  const target = Math.max(1, Number(targetCount) || defaultTarget(resourceType, config));
  memory.update(activeRunPatch(resourceType, target));
  let mined = 0;
  let lastFailure = null;

  while (countAny(bot, resourceItems[resourceType]) < target && Date.now() - started < maxDuration) {
    if (options.shouldStop?.()) {
      const result = { ok: false, message: `Stopped ${resourceType} run.` };
      finishRun(memory, resourceType, result);
      return result;
    }
    const state = options.perception?.();
    if (state?.dangerFlags?.hostileNearby || state?.dangerFlags?.lavaNearby || state?.dangerFlags?.fireNearby) {
      const result = { ok: false, message: `Stopped ${resourceType} run because I saw danger.` };
      finishRun(memory, resourceType, result);
      return result;
    }
    const dug = await options.actions?.digNearestSafeBlock?.(null, blockName);
    if (!dug || dug.failed) {
      lastFailure = dug?.reason || `no safe ${blockName} nearby`;
      break;
    }
    mined += 1;
    await options.actions?.collectNearbyDrops?.();
  }

  const count = countAny(bot, resourceItems[resourceType]);
  await returnAndDeposit(bot, memory, options);
  const ok = count >= target || mined > 0;
  const result = { ok, message: ok ? `${resourceType} run done: ${count}/${target}.` : `I could not gather ${resourceType}: ${lastFailure || 'nothing nearby'}.`, count, target };
  finishRun(memory, resourceType, result);
  return result;
}

export async function runWoodResourceRun(bot, memory, targetLogs = 16, options = {}) {
  const config = options.config || {};
  const target = Math.min(Math.max(1, Number(targetLogs) || defaultTarget('wood', config)), 64);
  memory.update(activeRunPatch('wood', target));
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped wood run.' };

  if (options.actions?.gatherWood) {
    await options.actions.gatherWood(target);
    const result = { ok: true, message: `Wood run started. I will gather up to ${target} logs, then return when the task finishes.` };
    finishRun(memory, 'wood', result);
    return result;
  }
  return loopMineResource(bot, memory, 'wood', target, 'logs', options);
}

export async function runStoneResourceRun(bot, memory, targetCobblestone = 32, options = {}) {
  const target = Math.min(Math.max(1, Number(targetCobblestone) || defaultTarget('stone', options.config)), 64);
  return loopMineResource(bot, memory, 'stone', target, 'stone', options);
}

export async function runCoalResourceRun(bot, memory, targetCoal = 8, options = {}) {
  const target = Math.min(Math.max(1, Number(targetCoal) || defaultTarget('coal', options.config)), 32);
  return loopMineResource(bot, memory, 'coal', target, 'coal_ore', options);
}

export async function runIronResourceRun(bot, memory, targetIron = 8, options = {}) {
  const config = options.config || {};
  const target = Math.min(Math.max(1, Number(targetIron) || defaultTarget('iron', config)), 32);
  const started = Date.now();
  const maxDuration = config.maxResourceRunDurationMs || 240000;
  const startCount = countAny(bot, resourceItems.iron);
  memory.update(activeRunPatch('iron', target));

  // Prefer thin-core collect with scout when available.
  if (options.actions?.executeAction || options.actions?.collect_resource) {
    const remaining = Math.max(1, target - startCount);
    const collect = options.actions.executeAction
      ? await options.actions.executeAction('collect_resource', {
        resource: 'iron',
        count: remaining,
        maxDistance: config.thinCoreIronMaxDistance || 48,
        surfaceScout: true
      }, { source: 'resourceRunIron', silent: true }).catch((error) => ({ ok: false, message: error.message }))
      : await options.actions.collect_resource?.({ resource: 'iron', count: remaining });
    const count = countAny(bot, resourceItems.iron);
    await returnAndDeposit(bot, memory, options);
    const result = {
      ok: count >= target || count > startCount,
      message: count >= target
        ? `Iron run done: ${count}/${target}.`
        : count > startCount
          ? `I got some iron (${count}/${target}). ${collect?.message || ''}`
          : `I could not gather iron: ${collect?.message || collect?.reason || 'none nearby'}.`,
      count,
      target
    };
    finishRun(memory, 'iron', result);
    return result;
  }

  // Legacy dig loop targeting iron ore blocks.
  const legacy = await loopMineResource(bot, memory, 'iron', target, 'iron_ore', options);
  if (Date.now() - started > maxDuration && !legacy.ok) {
    legacy.message = `${legacy.message} (iron run timed out)`;
  }
  return legacy;
}

export async function runFoodResourceRun(bot, memory, targetFood = 6, options = {}) {
  const config = options.config || {};
  const target = Math.min(Math.max(1, Number(targetFood) || defaultTarget('food', config)), 32);
  const started = Date.now();
  const maxDuration = config.maxResourceRunDurationMs || 180000;
  const startCount = countAny(bot, resourceItems.food);
  const needed = Math.max(1, target - startCount);
  const maxAttempts = Math.min(12, Math.max(1, Number(config.maxFoodRunAttempts) || needed));
  memory.update(activeRunPatch('food', target));
  if (options.shouldStop?.()) {
    const stopped = { ok: false, message: 'Stopped food run.' };
    finishRun(memory, 'food', stopped);
    return stopped;
  }
  let attempts = 0;
  let stagnantAttempts = 0;
  let lastCount = startCount;
  let lastFailure = null;
  while (countAny(bot, resourceItems.food) < target && attempts < maxAttempts && Date.now() - started < maxDuration) {
    if (options.shouldStop?.()) {
      const stopped = { ok: false, message: 'Stopped food run.' };
      finishRun(memory, 'food', stopped);
      return stopped;
    }
    const state = options.perception?.();
    if (state?.dangerFlags?.hostileNearby || state?.dangerFlags?.lavaNearby || state?.dangerFlags?.fireNearby) {
      const result = { ok: false, message: 'Stopped food run because I saw danger.' };
      finishRun(memory, 'food', result);
      return result;
    }
    if (!options.actions?.getFood) {
      lastFailure = 'food helper is unavailable';
      break;
    }

    const foodResult = await options.actions.getFood({ targetCount: target, resourceRun: true }).catch((error) => ({ ok: false, reason: error.message }));
    attempts += 1;
    const currentCount = countAny(bot, resourceItems.food);
    if (currentCount <= lastCount) {
      stagnantAttempts += 1;
      lastFailure = foodResult?.reason || foodResult?.message || 'no safe food found nearby';
      if (foodResult?.failed || foodResult?.ok === false || stagnantAttempts >= 2) break;
    } else {
      stagnantAttempts = 0;
    }
    lastCount = currentCount;
  }
  const countBeforeDeposit = countAny(bot, resourceItems.food);
  await returnAndDeposit(bot, memory, options);
  const count = countBeforeDeposit;
  const result = {
    ok: count >= target || count > startCount,
    message: count >= target
      ? `Food run done: ${count}/${target}.`
      : count > startCount
        ? `I found some food, but only ${count}/${target}.`
        : `I could not gather food: ${lastFailure || 'no safe food found nearby'}.`,
    count,
    target,
    attempts
  };
  finishRun(memory, 'food', result);
  return result;
}

export async function resourceRun(bot, memory, resourceType, targetCount, options = {}) {
  const type = normalize(resourceType);
  if (type === 'wood' || type === 'logs') return runWoodResourceRun(bot, memory, targetCount, options);
  if (type === 'stone' || type === 'cobblestone') return runStoneResourceRun(bot, memory, targetCount, options);
  if (type === 'coal') return runCoalResourceRun(bot, memory, targetCount, options);
  if (type === 'iron') return runIronResourceRun(bot, memory, targetCount, options);
  if (type === 'food') return runFoodResourceRun(bot, memory, targetCount, options);
  return { ok: false, message: `I do not know how to run for ${resourceType}.` };
}

export function inventoryResourceCounts(bot) {
  return {
    logs: countAny(bot, resourceItems.wood),
    planks: inventory.countItemsByCategory(bot).planks,
    cobblestone: inventory.countItem(bot, 'cobblestone'),
    coal: inventory.countItem(bot, 'coal') + inventory.countItem(bot, 'charcoal'),
    food: countAny(bot, resourceItems.food),
    torches: inventory.countItem(bot, 'torch'),
    iron: inventory.countItem(bot, 'iron_ingot'),
    wool: (bot.inventory?.items?.() || []).filter((item) => item.name.endsWith('_wool')).reduce((sum, item) => sum + item.count, 0)
  };
}
