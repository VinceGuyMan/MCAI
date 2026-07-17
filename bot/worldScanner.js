const resourceNames = [
  'coal_ore', 'deepslate_coal_ore',
  'iron_ore', 'deepslate_iron_ore',
  'copper_ore', 'deepslate_copper_ore',
  'redstone_ore', 'deepslate_redstone_ore',
  'lapis_ore', 'deepslate_lapis_ore',
  'gold_ore', 'deepslate_gold_ore',
  'diamond_ore', 'deepslate_diamond_ore',
  'emerald_ore', 'deepslate_emerald_ore',
  'clay', 'sand', 'gravel',
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log',
  'dark_oak_log', 'mangrove_log', 'cherry_log',
  'sugar_cane', 'pumpkin', 'melon'
];

const dangerBlockNames = ['lava', 'fire', 'soul_fire', 'magma_block', 'cactus', 'powder_snow', 'water'];
const villageBlocks = ['bell', 'white_bed', 'yellow_bed', 'composter', 'lectern', 'smithing_table', 'fletching_table', 'cartography_table'];
const ruinedPortalBlocks = ['obsidian', 'crying_obsidian', 'netherrack', 'magma_block'];
const mineshaftBlocks = ['rail', 'cobweb', 'oak_planks'];
const dungeonBlocks = ['spawner', 'mossy_cobblestone', 'chest'];
const hostileNames = new Set(['zombie', 'skeleton', 'creeper', 'spider', 'witch', 'enderman', 'drowned', 'husk', 'stray', 'slime']);

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function dimension(bot) {
  return bot.game?.dimension || bot.game?.dimensionName || 'overworld';
}

function blockRecords(bot, names, radius = 24, count = 64) {
  const ids = names.map((name) => bot.registry?.blocksByName?.[name]?.id).filter((id) => id !== undefined);
  if (!ids.length || !bot.findBlocks) return [];
  const positions = bot.findBlocks({ matching: ids, maxDistance: radius, count });
  return positions.map((position) => {
    const block = bot.blockAt(position);
    return block ? {
      name: block.name,
      position: point(block.position),
      distance: Number(bot.entity.position.distanceTo(block.position).toFixed(1))
    } : null;
  }).filter(Boolean);
}

export function scanNearbyBlocks(bot, radius = 24) {
  const names = [...new Set([...resourceNames, ...dangerBlockNames, ...villageBlocks, ...ruinedPortalBlocks, ...mineshaftBlocks, ...dungeonBlocks])];
  return blockRecords(bot, names, radius, 128);
}

export function scanNearbyEntities(bot, radius = 24) {
  return Object.values(bot.entities || {})
    .filter((entity) => entity?.position && bot.entity?.position && bot.entity.position.distanceTo(entity.position) <= radius)
    .map((entity) => ({
      name: entity.name || entity.username || entity.displayName || entity.type || 'unknown',
      type: entity.type || 'unknown',
      username: entity.username || null,
      position: point(entity.position),
      distance: Number(bot.entity.position.distanceTo(entity.position).toFixed(1)),
      baby: Boolean(entity.metadata?.some?.((value) => value === true))
    }))
    .sort((a, b) => a.distance - b.distance);
}

export function scanVisibleResources(bot, radius = 24) {
  return blockRecords(bot, resourceNames, radius, 80).map((resource) => ({
    ...resource,
    type: 'resource',
    resourceType: resource.name,
    dimension: dimension(bot),
    confidence: 'seen'
  }));
}

export function scanDangerNearby(bot, radius = 16) {
  const dangers = blockRecords(bot, dangerBlockNames, radius, 48).map((block) => ({
    dangerType: block.name === 'water' ? 'water' : block.name.includes('fire') ? 'fire' : block.name,
    severity: ['lava', 'fire', 'soul_fire', 'magma_block'].includes(block.name) ? 'high' : 'medium',
    radius: block.name === 'lava' ? 10 : 6,
    position: block.position,
    dimension: dimension(bot),
    notes: `Visible ${block.name}`
  }));

  for (const entity of scanNearbyEntities(bot, radius)) {
    if (entity.type === 'mob' && hostileNames.has(entity.name)) {
      dangers.push({
        dangerType: 'hostile_mobs',
        severity: 'high',
        radius: 10,
        position: entity.position,
        dimension: dimension(bot),
        notes: `Hostile mob nearby: ${entity.name}`
      });
    }
  }

  if (hasFallRisk(bot)) {
    dangers.push({
      dangerType: 'fall',
      severity: 'medium',
      radius: 5,
      position: point(bot.entity.position),
      dimension: dimension(bot),
      notes: 'Possible drop nearby'
    });
  }

  return dangers;
}

function namesPresent(blocks, names) {
  return names.filter((name) => blocks.some((block) => block.name === name));
}

export function scanVisibleStructures(bot, radius = 24) {
  const blocks = scanNearbyBlocks(bot, radius);
  const entities = scanNearbyEntities(bot, radius);
  const structures = [];
  const dim = dimension(bot);

  if (entities.some((entity) => entity.name === 'villager') || namesPresent(blocks, villageBlocks).length >= 2) {
    structures.push({ name: 'possible_village', type: 'structure', confidence: 'seen', position: point(bot.entity.position), dimension: dim, notes: 'Village-like blocks or villagers visible' });
  }
  if (namesPresent(blocks, ruinedPortalBlocks).length >= 2) {
    const anchor = blocks.find((block) => ruinedPortalBlocks.includes(block.name));
    structures.push({ name: 'possible_ruined_portal', type: 'structure', confidence: 'seen', position: anchor.position, dimension: dim, notes: 'Portal-like blocks visible' });
  }
  if (namesPresent(blocks, mineshaftBlocks).length >= 2 && bot.entity.position.y < 62) {
    const anchor = blocks.find((block) => mineshaftBlocks.includes(block.name));
    structures.push({ name: 'possible_mineshaft', type: 'structure', confidence: 'seen', position: anchor.position, dimension: dim, notes: 'Rail/cobweb/planks underground' });
  }
  if (namesPresent(blocks, dungeonBlocks).length >= 2) {
    const anchor = blocks.find((block) => dungeonBlocks.includes(block.name));
    structures.push({ name: 'possible_dungeon', type: 'structure', confidence: 'seen', position: anchor.position, dimension: dim, notes: 'Dungeon-like blocks visible' });
  }

  return structures;
}

export function scanVisibleBiomes() {
  return [];
}

function hasFallRisk(bot) {
  if (!bot.entity?.position) return false;
  const base = bot.entity.position.floored();
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      const below = bot.blockAt(base.offset(dx, -2, dz));
      const farBelow = bot.blockAt(base.offset(dx, -5, dz));
      if (below?.name === 'air' && farBelow?.name === 'air') return true;
    }
  }
  return false;
}

export function classifyLandmark(bot, blocks = scanNearbyBlocks(bot, 24), entities = scanNearbyEntities(bot, 24)) {
  if (entities.some((entity) => entity.name === 'villager')) return 'possible_village';
  if (blocks.some((block) => block.name === 'obsidian' || block.name === 'crying_obsidian')) return 'possible_ruined_portal';
  if (blocks.some((block) => block.name === 'rail' || block.name === 'cobweb')) return 'possible_mineshaft';
  if (hasFallRisk(bot)) return 'possible_ravine_or_drop';
  return null;
}

export function scanAndClassify(bot, radius = 24) {
  const blocks = scanNearbyBlocks(bot, radius);
  const entities = scanNearbyEntities(bot, radius);
  return {
    position: point(bot.entity?.position),
    dimension: dimension(bot),
    resources: scanVisibleResources(bot, radius),
    structures: scanVisibleStructures(bot, radius),
    dangers: scanDangerNearby(bot, Math.min(radius, 20)),
    entities,
    blocks,
    landmark: classifyLandmark(bot, blocks, entities)
  };
}

export function reportScan(bot, scanResult) {
  const resources = [...new Set((scanResult.resources || []).map((item) => item.name))].slice(0, 6);
  const dangers = [...new Set((scanResult.dangers || []).map((item) => item.dangerType))].slice(0, 4);
  const structures = [...new Set((scanResult.structures || []).map((item) => item.name))].slice(0, 3);
  const entities = (scanResult.entities || []).filter((entity) => entity.type !== 'player').slice(0, 5).map((entity) => entity.name);
  const parts = [];
  parts.push(resources.length ? `Resources: ${resources.join(', ')}.` : 'Resources: none obvious.');
  parts.push(structures.length ? `Landmarks: ${structures.join(', ')}.` : 'Landmarks: none obvious.');
  parts.push(dangers.length ? `Dangers: ${dangers.join(', ')}.` : 'Dangers: none nearby.');
  if (entities.length) parts.push(`Entities: ${entities.join(', ')}.`);
  return parts.join(' ');
}
