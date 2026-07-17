import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

export function setHome(bot, memory, position = bot.entity?.position, options = {}) {
  const home = point(position);
  if (!home) return { ok: false, message: 'I do not have a position to save as home.' };
  memory.update({
    homeBasePosition: home,
    homeBaseDimension: bot.game?.dimension || 'unknown',
    homeBaseSetAt: Date.now(),
    homeBaseName: options.name || 'home'
  });
  console.log(`[home] set home at ${home.x},${home.y},${home.z}`);
  return { ok: true, message: `Home set at ${home.x}, ${home.y}, ${home.z}.`, position: home };
}

export function getHome(memory) {
  return memory.get().homeBasePosition || null;
}

export function hasHome(memory) {
  return Boolean(getHome(memory));
}

export function clearHome(memory) {
  memory.update({
    homeBasePosition: null,
    homeBaseDimension: null,
    homeBaseSetAt: 0,
    homeBaseName: null,
    knownCampBlocks: [],
    knownStorageChests: [],
    knownCraftingTables: [],
    knownFurnaces: [],
    knownBeds: [],
    knownTorchPositions: []
  });
  return { ok: true, message: 'Home cleared.' };
}

export function distanceFromHome(bot, memory) {
  const home = getHome(memory);
  if (!home || !bot.entity?.position) return null;
  return Number(distance(point(bot.entity.position), home).toFixed(1));
}

export async function returnHome(bot, memory, options = {}) {
  const home = getHome(memory);
  if (!home) return { ok: false, message: 'I do not have a home set.' };
  if (options.throwIfCancelled) options.throwIfCancelled();
  await bot.pathfinder.goto(new GoalNear(home.x, home.y, home.z, options.range || 2));
  if (options.throwIfCancelled) options.throwIfCancelled();
  return { ok: true, message: 'Returned home.', position: home };
}

export function chooseNearbyCampSpot(bot, ownerPosition) {
  const base = point(ownerPosition || bot.players?.ModVinny?.entity?.position || bot.entity?.position);
  if (!base) return null;
  const candidates = [
    { x: base.x + 3, y: base.y, z: base.z + 3 },
    { x: base.x - 3, y: base.y, z: base.z + 3 },
    { x: base.x + 3, y: base.y, z: base.z - 3 },
    { x: base.x - 3, y: base.y, z: base.z - 3 },
    base
  ];
  return candidates.find((candidate) => {
    const block = bot.blockAt?.(new Vec3(candidate.x, candidate.y, candidate.z));
    const below = bot.blockAt?.(new Vec3(candidate.x, candidate.y - 1, candidate.z));
    return (!block || ['air', 'cave_air', 'void_air'].includes(block.name)) && (!below || below.boundingBox === 'block');
  }) || base;
}

export function isNearHome(bot, memory, radius = 12) {
  const dist = distanceFromHome(bot, memory);
  return typeof dist === 'number' && dist <= radius;
}

export function homeStatus(bot, memory) {
  const mem = memory.get();
  const home = mem.homeBasePosition || null;
  const dist = distanceFromHome(bot, memory);
  return {
    exists: Boolean(home),
    position: home,
    dimension: mem.homeBaseDimension || null,
    name: mem.homeBaseName || 'home',
    distance: dist,
    storageChests: mem.knownStorageChests?.length || 0,
    craftingTables: mem.knownCraftingTables?.length || 0,
    furnaces: mem.knownFurnaces?.length || 0,
    beds: mem.knownBeds?.length || 0,
    torches: mem.knownTorchPositions?.length || 0
  };
}

export function homeStatusText(bot, memory) {
  const status = homeStatus(bot, memory);
  if (!status.exists) return 'Home: not set. Say "tj set home" or "tj make camp".';
  return `Home: ${status.position.x}, ${status.position.y}, ${status.position.z}, ${status.distance ?? 'unknown'} blocks away. Storage ${status.storageChests}, tables ${status.craftingTables}, furnaces ${status.furnaces}, beds ${status.beds}, torches ${status.torches}.`;
}
