import * as mapMemoryStore from './mapMemory.js';

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function dimension(bot) {
  return bot.game?.dimension || bot.game?.dimensionName || 'overworld';
}

export function getCurrentBiome(bot) {
  try {
    const block = bot.blockAt(bot.entity.position.floored());
    const raw = block?.biome?.name || block?.biome || bot.world?.getBiome?.(bot.entity.position.floored());
    if (!raw) return { ok: false, message: 'Biome detection is unavailable from Mineflayer here.' };
    const biome = typeof raw === 'string' ? raw : String(raw);
    return { ok: true, biome };
  } catch (error) {
    return { ok: false, message: `Biome detection is unavailable: ${error.message}` };
  }
}

export function rememberCurrentBiome(bot, mapMemory) {
  const current = getCurrentBiome(bot);
  if (!current.ok) return current;
  const record = mapMemoryStore.addBiomeLocation(mapMemory, {
    biome: current.biome,
    dimension: dimension(bot),
    position: point(bot.entity.position)
  });
  return { ok: true, biome: current.biome, record };
}

export function listKnownBiomes(mapMemory) {
  return mapMemoryStore.ensureMapMemoryShape(mapMemory).biomes;
}

export function findNearestKnownBiome(mapMemory, biomeName, position = null) {
  const biomes = listKnownBiomes(mapMemory).filter((item) => item.biome.includes(String(biomeName || '').toLowerCase()));
  if (!position) return biomes[0] || null;
  return biomes
    .map((item) => ({ item, distance: Math.hypot(item.position.x - position.x, item.position.y - position.y, item.position.z - position.z) }))
    .sort((a, b) => a.distance - b.distance)[0]?.item || null;
}

export function biomeStatus(bot, mapMemory) {
  const current = getCurrentBiome(bot);
  const known = listKnownBiomes(mapMemory);
  return {
    current: current.ok ? current.biome : null,
    available: current.ok,
    knownCount: known.length,
    known
  };
}
