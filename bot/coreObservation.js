const HOSTILE_NAMES = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'enderman', 'witch', 'drowned',
  'husk', 'stray', 'pillager', 'vindicator', 'ravager', 'phantom', 'slime', 'magma_cube',
  'blaze', 'ghast', 'piglin_brute', 'warden'
]);

function distance(a, b) {
  if (!a || !b || typeof a.distanceTo !== 'function') return null;
  return a.distanceTo(b);
}

function inventoryItems(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function countMatching(bot, predicate) {
  return inventoryItems(bot).reduce((sum, item) => sum + (predicate(item) ? item.count || 0 : 0), 0);
}

export function hasOwnerNearby(bot) {
  return Boolean(bot?.players?.[bot?.mcaiConfig?.ownerUsername || 'ModVinny']?.entity);
}

export function getOwnerDistance(bot) {
  const owner = bot?.players?.[bot?.mcaiConfig?.ownerUsername || 'ModVinny']?.entity;
  return distance(bot?.entity?.position, owner?.position);
}

export function getFoodState(bot) {
  const carriedFood = countMatching(bot, (item) => /beef|porkchop|chicken|mutton|rabbit|cod|salmon|bread|potato|carrot|apple|melon|berries|cookie|stew|pie/i.test(item.name || ''));
  return {
    food: bot?.food ?? null,
    health: bot?.health ?? null,
    carriedFood,
    hungry: typeof bot?.food === 'number' ? bot.food < 18 : false,
    critical: typeof bot?.food === 'number' ? bot.food <= 8 : false
  };
}

export function getToolState(bot) {
  const items = inventoryItems(bot);
  const hasPickaxe = items.some((item) => /pickaxe$/i.test(item.name || ''));
  const hasStonePickaxeOrBetter = items.some((item) => /(stone|iron|diamond|netherite)_pickaxe$/i.test(item.name || ''));
  const hasAxe = items.some((item) => /axe$/i.test(item.name || ''));
  return { hasPickaxe, hasStonePickaxeOrBetter, hasAxe };
}

export function getInventoryCounts(bot) {
  return {
    logs: countMatching(bot, (item) => /_log$|_stem$|_wood$/i.test(item.name || '')),
    planks: countMatching(bot, (item) => /_planks$/i.test(item.name || '')),
    sticks: countMatching(bot, (item) => item.name === 'stick'),
    cobblestone: countMatching(bot, (item) => item.name === 'cobblestone'),
    coal: countMatching(bot, (item) => item.name === 'coal' || item.name === 'charcoal'),
    rawIron: countMatching(bot, (item) => item.name === 'raw_iron' || item.name === 'iron_ingot'),
    torches: countMatching(bot, (item) => item.name === 'torch')
  };
}

export function getDangerState(bot) {
  const entities = Object.values(bot?.entities || {});
  const nearbyHostiles = entities.filter((entity) => {
    if (!entity?.name || !HOSTILE_NAMES.has(entity.name)) return false;
    const d = distance(bot?.entity?.position, entity.position);
    return d !== null && d <= 16;
  });
  return {
    activeDanger: nearbyHostiles.length > 0 || (typeof bot?.health === 'number' && bot.health <= 8),
    nearbyHostileCount: nearbyHostiles.length,
    nearbyHostiles: nearbyHostiles.slice(0, 5).map((entity) => entity.name)
  };
}

export function getHomeState(memory) {
  const state = memory?.get?.() || {};
  return {
    hasHome: Boolean(state.home || state.homePosition || state.base?.home),
    home: state.home || state.homePosition || state.base?.home || null
  };
}

export function getActiveWorkState(memory) {
  const state = memory?.get?.() || {};
  return {
    currentTask: state.currentTask || null,
    activeGoal: state.activeGoal || null,
    activeBuild: state.activeBuild || null,
    activeCoreMacro: state.activeCoreMacro || null,
    pendingNaturalCommandIntent: state.pendingNaturalCommandIntent || null
  };
}

export function getCoreObservation(bot, memory) {
  return {
    connected: Boolean(bot),
    spawned: Boolean(bot?.entity),
    alive: typeof bot?.health === 'number' ? bot.health > 0 : true,
    ownerNearby: hasOwnerNearby(bot),
    ownerDistance: getOwnerDistance(bot),
    food: getFoodState(bot),
    tools: getToolState(bot),
    inventory: getInventoryCounts(bot),
    danger: getDangerState(bot),
    home: getHomeState(memory),
    activeWork: getActiveWorkState(memory)
  };
}
