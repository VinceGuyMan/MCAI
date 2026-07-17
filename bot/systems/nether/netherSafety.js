const lavaNames = new Set(['lava']);
const fireNames = new Set(['fire', 'soul_fire', 'magma_block']);
const unsafeNames = new Set(['lava', 'fire', 'soul_fire', 'magma_block', 'campfire', 'soul_campfire']);
const protectedNames = new Set([
  'chest',
  'trapped_chest',
  'barrel',
  'bed',
  'furnace',
  'crafting_table',
  'nether_portal',
  'respawn_anchor',
  'lodestone'
]);

const hostileNetherMobs = new Set([
  'ghast',
  'hoglin',
  'zoglin',
  'piglin_brute',
  'blaze',
  'wither_skeleton',
  'magma_cube',
  'skeleton'
]);

function entityName(entity) {
  return String(entity?.name || entity?.mobType || entity?.displayName || '').toLowerCase().replace(/\s+/g, '_');
}

function point(position) {
  if (!position) return null;
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
  };
}

function findBlocks(bot, names, radius = 16, count = 32) {
  if (!bot.registry || !bot.entity || typeof bot.findBlocks !== 'function') return [];
  const ids = names.map((name) => bot.registry.blocksByName[name]?.id).filter(Boolean);
  if (!ids.length) return [];
  return bot.findBlocks({ matching: ids, maxDistance: radius, count })
    .map((pos) => bot.blockAt(pos))
    .filter(Boolean)
    .map((block) => ({
      name: block.name,
      position: point(block.position),
      distance: Number(bot.entity.position.distanceTo(block.position).toFixed(1)),
      block
    }))
    .sort((a, b) => a.distance - b.distance);
}

function nearbyMobs(bot, predicate, radius = 32) {
  if (!bot.entity) return [];
  return Object.values(bot.entities || {})
    .filter((entity) => entity !== bot.entity && entity.position && entity.type === 'mob')
    .filter((entity) => predicate(entityName(entity), entity))
    .map((entity) => ({
      id: entity.id,
      name: entityName(entity),
      position: point(entity.position),
      distance: Number(bot.entity.position.distanceTo(entity.position).toFixed(1)),
      entity
    }))
    .filter((entry) => entry.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

function currentDimension(bot) {
  return String(bot.game?.dimension || bot.game?.dimensionName || '');
}

export function isInNether(bot) {
  return /nether/i.test(currentDimension(bot));
}

export function isInOverworld(bot) {
  const dimension = currentDimension(bot);
  return !/nether|end/i.test(dimension);
}

export function isUnsafeNetherBlock(block) {
  return unsafeNames.has(block?.name);
}

export function isNetherProtectedBlock(block) {
  const name = String(block?.name || '');
  return protectedNames.has(name) || name.endsWith('_bed') || name.endsWith('_shulker_box');
}

export function detectLavaHazard(bot, radius = 16) {
  return findBlocks(bot, [...lavaNames], radius, 16);
}

export function detectFallHazard(bot, radius = 8) {
  if (!bot.entity) return [];
  const hazards = [];
  const base = bot.entity.position.floored();
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      const pos = base.offset(dx, -1, dz);
      const below = bot.blockAt(pos);
      const farBelow = bot.blockAt(pos.offset(0, -4, 0));
      if (below && ['air', 'cave_air', 'void_air'].includes(below.name) && farBelow && ['air', 'cave_air', 'void_air'].includes(farBelow.name)) {
        hazards.push({ dangerType: 'fall', position: point(pos), distance: Number(bot.entity.position.distanceTo(pos).toFixed(1)) });
      }
    }
  }
  return hazards.slice(0, 8);
}

export const detectGhast = (bot, radius = 32) => nearbyMobs(bot, (name) => name === 'ghast', radius);
export const detectPiglins = (bot, radius = 32) => nearbyMobs(bot, (name) => name === 'piglin' || name === 'piglin_brute' || name === 'zombified_piglin', radius);
export const detectHoglins = (bot, radius = 32) => nearbyMobs(bot, (name) => name === 'hoglin' || name === 'zoglin', radius);
export const detectBlaze = (bot, radius = 32) => nearbyMobs(bot, (name) => name === 'blaze', radius);
export const detectWitherSkeleton = (bot, radius = 32) => nearbyMobs(bot, (name) => name === 'wither_skeleton', radius);
export const detectMagmaCubes = (bot, radius = 32) => nearbyMobs(bot, (name) => name === 'magma_cube', radius);

export function detectFortressLikeArea(bot, radius = 24) {
  return findBlocks(bot, ['nether_bricks', 'nether_brick_fence', 'nether_brick_stairs'], radius, 16);
}

export function detectBastionLikeArea(bot, radius = 24) {
  return findBlocks(bot, ['blackstone', 'polished_blackstone_bricks', 'gilded_blackstone', 'chiseled_polished_blackstone'], radius, 16);
}

export function scanNetherDangers(bot, radius = 32) {
  const lava = detectLavaHazard(bot, radius);
  const fire = findBlocks(bot, [...fireNames], radius, 16);
  const falls = detectFallHazard(bot, Math.min(10, radius));
  const ghasts = detectGhast(bot, radius);
  const piglins = detectPiglins(bot, radius);
  const hoglins = detectHoglins(bot, radius);
  const blazes = detectBlaze(bot, radius);
  const witherSkeletons = detectWitherSkeleton(bot, radius);
  const magmaCubes = detectMagmaCubes(bot, radius);
  const fortressBlocks = detectFortressLikeArea(bot, radius);
  const bastionBlocks = detectBastionLikeArea(bot, radius);
  const hostileMobs = nearbyMobs(bot, (name) => hostileNetherMobs.has(name), radius);

  return {
    lava,
    fire,
    falls,
    ghasts,
    piglins,
    hoglins,
    blazes,
    witherSkeletons,
    magmaCubes,
    fortressBlocks,
    bastionBlocks,
    hostileMobs,
    dangerCount: lava.length + fire.length + falls.length + ghasts.length + hoglins.length + blazes.length + witherSkeletons.length + magmaCubes.length + fortressBlocks.length + bastionBlocks.length
  };
}

export function netherAbortReason(bot, memory, options = {}) {
  const config = options.config || bot.mcaiConfig || {};
  if (options.isCancelled?.()) return 'Stopped.';
  if ((bot.health ?? 20) < (config.minimumHealthForNether || 18)) return 'health is too low';
  if ((bot.food ?? 20) < (config.minimumFoodForNether || 16)) return 'food is too low';
  if (isInNether(bot)) {
    const dangers = scanNetherDangers(bot, config.netherDangerScanRadius || 32);
    if (dangers.ghasts.length && config.avoidGhasts) return 'ghast nearby';
    if (dangers.hoglins.length && config.avoidHoglins) return 'hoglin nearby';
    if (dangers.blazes.length && config.avoidBlazes) return 'blaze nearby';
    if (dangers.witherSkeletons.length && config.avoidWitherSkeletons) return 'wither skeleton nearby';
    if (dangers.lava.length && config.avoidLavaInNether) return 'lava nearby';
    if (dangers.falls.length) return 'fall hazard nearby';
  }
  if (isInNether(bot) && !memory.get().netherPortalPosition) return 'return portal is not known';
  return null;
}

export function shouldAbortNetherEntry(bot, memory, options = {}) {
  const reason = netherAbortReason(bot, memory, options);
  return { abort: Boolean(reason), reason };
}

export function shouldReturnToPortal(bot, memory, options = {}) {
  const config = options.config || bot.mcaiConfig || {};
  const reason = netherAbortReason(bot, memory, options);
  if (reason) return { shouldReturn: true, reason };
  const portal = memory.get().netherPortalPosition;
  if (isInNether(bot) && portal && bot.entity?.position.distanceTo(portal) > (config.maxDistanceFromNetherPortal || 32)) {
    return { shouldReturn: true, reason: 'too far from Nether portal' };
  }
  return { shouldReturn: false, reason: null };
}

export function isSafeNearNetherPortal(bot, memory, options = {}) {
  const config = options.config || bot.mcaiConfig || {};
  const scan = scanNetherDangers(bot, config.netherPortalSecureRadius || 8);
  return {
    ok: scan.dangerCount === 0 && !netherAbortReason(bot, memory, options),
    scan
  };
}

export function netherSafetyStatus(bot, memory, mapMemory = null, options = {}) {
  const config = options.config || bot.mcaiConfig || {};
  const scan = isInNether(bot) ? scanNetherDangers(bot, config.netherDangerScanRadius || 32) : scanNetherDangers(bot, 16);
  const abortReason = netherAbortReason(bot, memory, options);
  const dangers = {
    lavaNearby: scan.lava.length > 0,
    fireNearby: scan.fire.length > 0,
    fallRisk: scan.falls.length > 0,
    ghastNearby: scan.ghasts.length > 0,
    piglinNearby: scan.piglins.length > 0,
    hoglinNearby: scan.hoglins.length > 0,
    blazeNearby: scan.blazes.length > 0,
    witherSkeletonNearby: scan.witherSkeletons.length > 0,
    magmaCubeNearby: scan.magmaCubes.length > 0,
    fortressPossibleNearby: scan.fortressBlocks.length > 0,
    bastionPossibleNearby: scan.bastionBlocks.length > 0
  };
  const summary = Object.entries(dangers)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return {
    isInNether: isInNether(bot),
    isInOverworld: isInOverworld(bot),
    abortReason,
    shouldReturn: shouldReturnToPortal(bot, memory, options),
    dangerNearby: Boolean(abortReason || scan.dangerCount > 0),
    dangers,
    summary,
    scan,
    knownNetherPortal: memory.get().netherPortalPosition || mapMemory?.netherPortalWaypoints?.[0]?.position || null,
    knownOverworldPortal: memory.get().overworldPortalPosition || mapMemory?.overworldPortalWaypoints?.[0]?.position || null
  };
}
