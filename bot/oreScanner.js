export const oreNamesByResource = {
  coal: ['coal_ore', 'deepslate_coal_ore'],
  iron: ['iron_ore', 'deepslate_iron_ore'],
  copper: ['copper_ore', 'deepslate_copper_ore'],
  redstone: ['redstone_ore', 'deepslate_redstone_ore'],
  lapis: ['lapis_ore', 'deepslate_lapis_ore'],
  gold: ['gold_ore', 'deepslate_gold_ore'],
  diamond: ['diamond_ore', 'deepslate_diamond_ore']
};

function normalize(resourceType) {
  return String(resourceType || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function distance(bot, pos) {
  if (!bot.entity || !pos) return Infinity;
  return bot.entity.position.distanceTo(pos);
}

function blockIds(bot, names) {
  return names.map((name) => bot.registry?.blocksByName?.[name]?.id).filter(Boolean);
}

export function getOreNamesForResource(resourceType) {
  const type = normalize(resourceType);
  return oreNamesByResource[type] || [];
}

export function scoreOreTarget(bot, block) {
  if (!block || !bot.entity) return -Infinity;
  const dist = distance(bot, block.position);
  const yScore = Math.max(0, 80 - Math.abs((block.position?.y ?? 64) - (bot.entity.position?.y ?? 64)));
  return Math.max(0, 100 - dist) + yScore;
}

export function findNearbyOreBlocks(bot, resourceType, radius = 32) {
  if (!bot.entity || typeof bot.findBlocks !== 'function') return [];
  const names = getOreNamesForResource(resourceType);
  const ids = blockIds(bot, names);
  if (!ids.length) return [];
  return bot.findBlocks({ matching: ids, maxDistance: radius, count: 48 })
    .map((pos) => bot.blockAt(pos))
    .filter(Boolean)
    .map((block) => ({
      block,
      name: block.name,
      position: point(block.position),
      distance: Number(distance(bot, block.position).toFixed(1)),
      score: scoreOreTarget(bot, block)
    }))
    .sort((a, b) => b.score - a.score);
}

export function findReachableOre(bot, resourceType, radius = 32, options = {}) {
  const maxDistance = options.maxDistance || radius;
  return findNearbyOreBlocks(bot, resourceType, radius)
    .filter((entry) => entry.distance <= maxDistance)
    .find((entry) => !options.isSafe || options.isSafe(entry.block).ok) || null;
}

export function scanMiningArea(bot, radius = 32) {
  const result = {};
  for (const resourceType of Object.keys(oreNamesByResource)) {
    result[resourceType] = findNearbyOreBlocks(bot, resourceType, radius)
      .slice(0, 8)
      .map(({ block, ...entry }) => entry);
  }
  return result;
}

export function reportVisibleOres(bot, radius = 32) {
  const scan = scanMiningArea(bot, radius);
  const parts = Object.entries(scan)
    .filter(([, entries]) => entries.length > 0)
    .map(([type, entries]) => `${type} ${entries.length}`);
  return {
    scan,
    message: parts.length ? `Visible ores nearby: ${parts.join(', ')}.` : 'I do not see reachable ores in loaded chunks nearby.'
  };
}
