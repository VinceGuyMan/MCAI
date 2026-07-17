import { loadConfig } from '../../config.js';
import * as villagerMemory from './villagerMemory.js';
import * as mapMemory from '../../mapMemory.js';

const config = loadConfig();

const PROFESSIONS = [
  'armorer',
  'butcher',
  'cartographer',
  'cleric',
  'farmer',
  'fisherman',
  'fletcher',
  'leatherworker',
  'librarian',
  'mason',
  'nitwit',
  'shepherd',
  'toolsmith',
  'weaponsmith',
  'unemployed'
];

const LEVELS = ['novice', 'apprentice', 'journeyman', 'expert', 'master'];
const JOB_SITE_BLOCKS = [
  'barrel',
  'blast_furnace',
  'brewing_stand',
  'cartography_table',
  'cauldron',
  'composter',
  'fletching_table',
  'grindstone',
  'lectern',
  'loom',
  'smithing_table',
  'smoker',
  'stonecutter'
];

function now() {
  return Date.now();
}

function posToObject(position) {
  return {
    x: Math.round(Number(position?.x ?? 0)),
    y: Math.round(Number(position?.y ?? 64)),
    z: Math.round(Number(position?.z ?? 0))
  };
}

function botDimension(bot) {
  return bot?.game?.dimension || bot?.entity?.dimension || 'overworld';
}

function entityText(entity) {
  const parts = [
    entity?.name,
    entity?.username,
    entity?.displayName,
    entity?.customName,
    entity?.metadata ? JSON.stringify(entity.metadata) : ''
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function getVillagerProfession(entity) {
  const explicit = entity?.profession || entity?.villagerProfession || entity?.metadata?.profession;
  if (explicit) return String(explicit).toLowerCase().replace(/^minecraft:/, '');
  const text = entityText(entity);
  return PROFESSIONS.find((profession) => text.includes(profession)) || 'unknown';
}

export function getVillagerLevel(entity) {
  const explicit = entity?.level || entity?.villagerLevel || entity?.metadata?.level;
  if (explicit) return String(explicit).toLowerCase();
  const text = entityText(entity);
  return LEVELS.find((level) => text.includes(level)) || 'unknown';
}

export function getVillagerPosition(entity) {
  return posToObject(entity?.position);
}

export function classifyVillagerEntity(entity) {
  const type = entity?.name || entity?.mobType || entity?.type || 'unknown';
  const isVillager = ['villager', 'wandering_trader', 'zombie_villager'].includes(String(type).toLowerCase());
  if (!isVillager) return null;
  return {
    entityId: entity.id ?? null,
    customName: String(entity.customName || entity.username || ''),
    profession: getVillagerProfession(entity),
    level: getVillagerLevel(entity),
    type,
    lastKnownPosition: getVillagerPosition(entity),
    dimension: entity.dimension || 'overworld',
    valuable: getVillagerProfession(entity) === 'librarian',
    notes: type === 'wandering_trader' ? 'wandering trader' : ''
  };
}

function nearbyEntities(bot, radius) {
  if (!bot?.entities || !bot?.entity?.position) return [];
  return Object.values(bot.entities)
    .filter(Boolean)
    .filter((entity) => entity.position && bot.entity.position.distanceTo(entity.position) <= radius);
}

export function scanNearbyVillagers(bot, memory = null, radius = Number(config.villagerScanRadius || 32)) {
  const villagers = nearbyEntities(bot, radius)
    .map((entity) => ({ entity, info: classifyVillagerEntity(entity) }))
    .filter((entry) => entry.info)
    .map((entry) => ({
      ...entry.info,
      dimension: botDimension(bot),
      distance: Math.round(bot.entity.position.distanceTo(entry.entity.position))
    }))
    .sort((a, b) => a.distance - b.distance);
  return {
    ok: true,
    count: villagers.length,
    villagers
  };
}

function countBlocks(bot, names, radius) {
  if (!bot?.findBlocks || !bot?.registry?.blocksByName || !bot?.entity?.position) return 0;
  const matchingIds = names
    .map((name) => bot.registry.blocksByName[name]?.id)
    .filter((id) => id != null);
  if (matchingIds.length === 0) return 0;
  try {
    return bot.findBlocks({
      matching: matchingIds,
      maxDistance: radius,
      count: 64
    }).length;
  } catch {
    return 0;
  }
}

export function detectVillageLikeArea(bot, radius = Number(config.villageMemoryRadius || 96)) {
  const villagers = scanNearbyVillagers(bot, null, Math.min(radius, Number(config.villagerScanRadius || 32))).villagers;
  const bedNames = Object.keys(bot?.registry?.blocksByName || {}).filter((name) => name.endsWith('_bed'));
  const beds = countBlocks(bot, bedNames, radius);
  const bells = countBlocks(bot, ['bell'], radius);
  const jobSites = countBlocks(bot, JOB_SITE_BLOCKS, radius);
  const ironGolems = nearbyEntities(bot, radius).filter((entity) => String(entity.name || '').toLowerCase() === 'iron_golem').length;
  const evidence = { villagers: villagers.length, beds, bells, jobSites, ironGolems };
  let confidence = 'none';
  if (villagers.length >= 2 || bells > 0 || (villagers.length >= 1 && (beds > 0 || jobSites > 0))) confidence = 'confirmed';
  else if (villagers.length >= 1 || beds > 1 || jobSites > 1 || ironGolems > 0) confidence = 'possible';
  return {
    ok: true,
    confidence,
    evidence,
    center: posToObject(bot?.entity?.position),
    dimension: botDimension(bot)
  };
}

function rememberMapWaypoint(type, name, position, tags = []) {
  try {
    const memory = mapMemory.loadMapMemory();
    const waypoint = mapMemory.addWaypoint(memory, {
      name,
      type,
      position,
      dimension: position.dimension || 'overworld',
      tags
    });
    mapMemory.saveMapMemory(memory);
    return waypoint;
  } catch (error) {
    return null;
  }
}

export function rememberNearbyVillagers(bot, memory = null) {
  const scan = scanNearbyVillagers(bot, memory);
  const village = detectVillageLikeArea(bot);
  let rememberedVillage = null;
  if (village.confidence !== 'none') {
    rememberedVillage = villagerMemory.rememberVillage({
      name: village.confidence === 'confirmed' ? 'Village near tj' : 'Possible village near tj',
      dimension: village.dimension,
      center: village.center,
      lastVisitedAt: now(),
      tags: [village.confidence === 'confirmed' ? 'village' : 'possible_village']
    });
    rememberMapWaypoint('village', rememberedVillage.name, { ...rememberedVillage.center, dimension: rememberedVillage.dimension }, rememberedVillage.tags);
  }

  const rememberedVillagers = scan.villagers.map((villager) => {
    const saved = villagerMemory.rememberVillager({
      ...villager,
      villageId: rememberedVillage?.id || null,
      dimension: botDimension(bot)
    });
    rememberMapWaypoint(
      saved.valuable ? 'valuable_villager' : 'villager',
      `${saved.profession} villager`,
      { ...saved.lastKnownPosition, dimension: saved.dimension },
      ['villager', saved.profession]
    );
    return saved;
  });

  return {
    ok: true,
    village: rememberedVillage,
    villagers: rememberedVillagers,
    evidence: ['villager_memory_updated']
  };
}

export function reportNearbyVillagers(bot, memory = null) {
  const scan = scanNearbyVillagers(bot, memory);
  if (scan.count === 0) {
    return { ok: true, message: 'No nearby villagers spotted.', evidence: ['villager_seen'], data: scan };
  }
  const summary = scan.villagers.slice(0, 5).map((v) => `${v.profession} (${v.distance}m)`).join(', ');
  return {
    ok: true,
    message: `Nearby villagers: ${summary}.`,
    evidence: ['villager_seen', 'villager_profession_recorded'],
    data: scan
  };
}

export function findNearestVillager(bot, filters = {}) {
  const scan = scanNearbyVillagers(bot, null, filters.radius || Number(config.villagerScanRadius || 32));
  const match = scan.villagers.find((villager) => {
    if (filters.profession && villager.profession !== filters.profession) return false;
    return true;
  });
  if (!match) return null;
  return Object.values(bot.entities || {}).find((entity) => entity.id === match.entityId) || null;
}

export function findVillagerByProfession(bot, profession) {
  return findNearestVillager(bot, { profession });
}

export function findValuableKnownVillager(bot, memory = null, filters = {}) {
  const villagers = villagerMemory.listKnownVillagers({ valuable: true, ...filters });
  return villagers[0] || null;
}

export default {
  scanNearbyVillagers,
  classifyVillagerEntity,
  getVillagerProfession,
  getVillagerLevel,
  getVillagerPosition,
  detectVillageLikeArea,
  rememberNearbyVillagers,
  reportNearbyVillagers,
  findNearestVillager,
  findVillagerByProfession,
  findValuableKnownVillager
};
