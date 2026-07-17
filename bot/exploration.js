import { Vec3 } from 'vec3';
import * as mapMemoryStore from './mapMemory.js';
import * as worldScanner from './worldScanner.js';
import * as waypointNavigator from './waypointNavigator.js';
import * as routeMemory from './routeMemory.js';
import * as biomeMemory from './biomeMemory.js';

const directions = {
  north: new Vec3(0, 0, -1),
  south: new Vec3(0, 0, 1),
  east: new Vec3(1, 0, 0),
  west: new Vec3(-1, 0, 0),
  northeast: new Vec3(1, 0, -1),
  northwest: new Vec3(-1, 0, -1),
  southeast: new Vec3(1, 0, 1),
  southwest: new Vec3(-1, 0, 1)
};

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function dimension(bot) {
  return bot.game?.dimension || bot.game?.dimensionName || 'overworld';
}

function ownerEntity(bot, config) {
  return bot.players?.[config.ownerUsername]?.entity;
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function isNight(bot) {
  const time = bot.time?.timeOfDay ?? 0;
  return time >= 12542 && time <= 23459;
}

export function explorationStatus(bot, memory, mapMemory) {
  const mem = memory.get();
  const summary = mapMemoryStore.summarizeMapMemory(mapMemory);
  return {
    active: mem.activeExploration,
    mode: mem.explorationMode,
    breadcrumbs: (mem.explorationBreadcrumbs || []).length,
    returnTarget: mem.explorationReturnTarget,
    currentWaypointTarget: mem.currentWaypointTarget,
    map: summary
  };
}

export function canStartExploration(bot, memory, mapMemory, options = {}) {
  const config = options.config || {};
  if (!config.explorationEnabled) return { ok: false, message: 'Exploration is disabled in config.' };
  if (!config.allowOwnerCommandedExploration && !config.allowAutonomousExploration) return { ok: false, message: 'Exploration is disabled.' };
  if (!bot.entity?.position) return { ok: false, message: 'I do not know where I am yet.' };
  if ((bot.health ?? 20) < (config.minimumHealthForExploration || 16)) return { ok: false, message: 'My health is too low to explore safely.' };
  if ((bot.food ?? 20) < (config.minimumFoodForExploration || 14)) return { ok: false, message: 'My food is too low to explore safely.' };
  if (isNight(bot) && !config.allowNightExploration && !options.confirmedNight) return {
    ok: false,
    requiresConfirmation: 'night_exploration',
    message: 'It is night. Say "tj confirm night exploration" if you still want me to scout.'
  };
  if (dimension(bot).includes('nether') && !config.allowNetherExploration) return { ok: false, message: 'I do not explore the Nether yet.' };
  if (dimension(bot).includes('end') && !config.allowEndExploration) return { ok: false, message: 'I do not explore the End yet.' };
  return { ok: true };
}

export function startExploration(bot, memory, mapMemory, options = {}) {
  const start = point(bot.entity.position);
  memory.update({
    activeExploration: {
      mode: options.mode || 'scout_direction',
      startedAt: Date.now(),
      target: options.target || null
    },
    explorationMode: options.mode || 'scout_direction',
    explorationStartPosition: start,
    explorationReturnTarget: options.returnTarget || start,
    explorationStartedAt: Date.now(),
    explorationBreadcrumbs: [start],
    lastExplorationAbortReason: null
  });
  markVisitedChunk(bot, mapMemory);
  return { ok: true };
}

export function stopExploration(bot, memory, reason = 'stopped') {
  memory.update({
    activeExploration: null,
    explorationMode: null,
    explorationReturnTarget: null,
    currentWaypointTarget: null,
    lastExplorationAbortReason: reason
  });
  return { ok: true, message: `Exploration stopped: ${reason}.` };
}

export async function scoutDirection(bot, memory, mapMemory, direction, distanceBlocks, options = {}) {
  const config = options.config || {};
  const directionKey = String(direction || '').toLowerCase();
  const vector = directions[directionKey];
  if (!vector) return { ok: false, message: `I do not know direction ${direction}.` };
  const distanceLimit = config.maxScoutDistance || 96;
  const distanceToScout = Number(distanceBlocks || config.defaultScoutDistance || 48);
  if (distanceToScout > distanceLimit && !options.confirmedLong) {
    return {
      ok: false,
      requiresConfirmation: 'long_exploration',
      message: 'That is farther than my exploration safety limit. Say "tj confirm long exploration" to continue.'
    };
  }
  const safe = canStartExploration(bot, memory, mapMemory, options);
  if (!safe.ok) return safe;

  const start = point(bot.entity.position);
  const normalized = vector.normalize();
  const target = {
    x: Math.floor(start.x + normalized.x * Math.min(distanceToScout, distanceLimit)),
    y: start.y,
    z: Math.floor(start.z + normalized.z * Math.min(distanceToScout, distanceLimit))
  };

  startExploration(bot, memory, mapMemory, { mode: 'scout_direction', target, returnTarget: start });
  await scanAndRememberSurroundings(bot, memory, mapMemory, options);
  options.throwIfCancelled?.();
  await waypointNavigator.goToPosition(bot, memory, target, { ...options, range: 5 });
  recordBreadcrumb(bot, memory, mapMemory, options);
  await scanAndRememberSurroundings(bot, memory, mapMemory, options);
  options.throwIfCancelled?.();
  await waypointNavigator.goToPosition(bot, memory, start, { ...options, range: 4 });
  stopExploration(bot, memory, 'returned');
  return { ok: true, message: `Scouted ${directionKey} about ${Math.min(distanceToScout, distanceLimit)} blocks and returned.` };
}

export async function exploreAroundHome(bot, memory, mapMemory, radius, options = {}) {
  const home = mapMemoryStore.findWaypointByName(mapMemory, 'home') || (memory.get().homeBasePosition ? { position: memory.get().homeBasePosition, name: 'home' } : null);
  if (!home) return { ok: false, message: 'Set home first before exploring around it.' };
  return exploreCircle(bot, memory, mapMemory, home.position, radius || 32, { ...options, mode: 'circle_home' });
}

export async function exploreAroundOwner(bot, memory, mapMemory, radius, options = {}) {
  const owner = ownerEntity(bot, options.config || {});
  if (!owner) return { ok: false, message: `I cannot see ${options.config?.ownerUsername || 'the owner'}.` };
  return exploreCircle(bot, memory, mapMemory, owner.position, radius || 32, { ...options, mode: 'circle_owner' });
}

async function exploreCircle(bot, memory, mapMemory, center, radius, options = {}) {
  const config = options.config || {};
  const maxRadius = config.maxExploreRadiusFromHome || 128;
  if (radius > maxRadius && !options.confirmedLong) {
    return {
      ok: false,
      requiresConfirmation: 'long_exploration',
      message: 'That is farther than my exploration safety limit. Say "tj confirm long exploration" to continue.'
    };
  }
  const safe = canStartExploration(bot, memory, mapMemory, options);
  if (!safe.ok) return safe;
  const start = point(bot.entity.position);
  const base = point(center);
  const capped = Math.min(radius, maxRadius);
  const points = [
    { x: base.x + capped, y: base.y, z: base.z },
    { x: base.x, y: base.y, z: base.z + capped },
    { x: base.x - capped, y: base.y, z: base.z },
    { x: base.x, y: base.y, z: base.z - capped }
  ];
  startExploration(bot, memory, mapMemory, { mode: options.mode || 'circle_home', returnTarget: start });
  for (const target of points) {
    options.throwIfCancelled?.();
    await waypointNavigator.goToPosition(bot, memory, target, { ...options, range: 6 });
    recordBreadcrumb(bot, memory, mapMemory, options);
    await scanAndRememberSurroundings(bot, memory, mapMemory, options);
  }
  await waypointNavigator.goToPosition(bot, memory, start, { ...options, range: 4 });
  stopExploration(bot, memory, 'returned');
  return { ok: true, message: `Explored around ${options.mode === 'circle_owner' ? 'you' : 'home'} within ${capped} blocks and returned.` };
}

export async function returnFromExploration(bot, memory, mapMemory, options = {}) {
  const target = memory.get().explorationReturnTarget || memory.get().explorationStartPosition;
  if (target) {
    await waypointNavigator.goToPosition(bot, memory, target, { ...options, range: 4 });
    stopExploration(bot, memory, 'returned');
    return { ok: true, message: 'Returned from exploration.' };
  }
  const home = await waypointNavigator.returnToHome(bot, memory, mapMemory, options);
  stopExploration(bot, memory, home.ok ? 'returned home' : 'no return target');
  return home;
}

export function reportExplorationResults(bot, memory, mapMemory) {
  const summary = mapMemoryStore.summarizeMapMemory(mapMemory);
  const resources = mapMemoryStore.getKnownResources(mapMemory).slice(-5).map((item) => item.name);
  const dangers = mapMemoryStore.getKnownDangerZones(mapMemory).slice(-5).map((item) => item.dangerType);
  return {
    ok: true,
    summary,
    message: `Map memory: ${summary.waypoints} places, ${summary.resources} resources, ${summary.dangerZones} dangers, ${summary.routes} routes. Recent resources: ${resources.join(', ') || 'none'}. Recent dangers: ${dangers.join(', ') || 'none'}.`
  };
}

export function scanAndRememberSurroundings(bot, memory, mapMemory, options = {}) {
  const config = options.config || {};
  const scan = worldScanner.scanAndClassify(bot, options.radius || 24);
  if (config.markResourcesAutomatically !== false) {
    for (const resource of scan.resources || []) mapMemoryStore.addResourceLocation(mapMemory, resource);
  }
  if (config.markDangerZonesAutomatically !== false) {
    for (const danger of scan.dangers || []) mapMemoryStore.addDangerZone(mapMemory, danger);
  }
  if (config.markStructuresAutomatically !== false) {
    for (const structure of scan.structures || []) mapMemoryStore.addStructureLocation(mapMemory, structure);
  }
  if (config.markBiomesAutomatically !== false) biomeMemory.rememberCurrentBiome(bot, mapMemory);
  markVisitedChunk(bot, mapMemory);
  mapMemoryStore.pruneOldLowValueDiscoveries(mapMemory);
  mapMemoryStore.saveMapMemory(mapMemory);
  memory.update?.({ explorationLastScanAt: Date.now(), lastExplorationReport: worldScanner.reportScan(bot, scan) });
  return scan;
}

export function markVisitedChunk(bot, mapMemory) {
  if (!bot.entity?.position) return null;
  const pos = bot.entity.position;
  const chunk = {
    x: Math.floor(pos.x / 16),
    z: Math.floor(pos.z / 16),
    dimension: dimension(bot),
    firstVisitedAt: Date.now(),
    lastVisitedAt: Date.now()
  };
  const existing = mapMemory.visitedChunks.find((item) => item.x === chunk.x && item.z === chunk.z && item.dimension === chunk.dimension);
  if (existing) existing.lastVisitedAt = Date.now();
  else mapMemory.visitedChunks.push(chunk);
  return chunk;
}

export function recordBreadcrumb(bot, memory, mapMemory, options = {}) {
  const mem = memory.get();
  const current = point(bot.entity.position);
  const breadcrumbs = mem.explorationBreadcrumbs || [];
  const last = breadcrumbs.at(-1);
  if (!last || distance(current, last) >= (options.config?.breadcrumbSpacing || 12)) {
    breadcrumbs.push(current);
    memory.update({ explorationBreadcrumbs: breadcrumbs.slice(-100) });
  }
  routeMemory.recordRoutePoint(bot, memory, mapMemory);
}

export async function followBreadcrumbsBack(bot, memory, mapMemory, options = {}) {
  const breadcrumbs = [...(memory.get().explorationBreadcrumbs || [])].reverse();
  if (!breadcrumbs.length) return { ok: false, message: 'I do not have breadcrumbs to follow.' };
  for (const target of breadcrumbs) {
    options.throwIfCancelled?.();
    await waypointNavigator.goToPosition(bot, memory, target, { ...options, range: 4 });
  }
  stopExploration(bot, memory, 'followed breadcrumbs back');
  return { ok: true, message: 'Followed breadcrumbs back.' };
}

export { directions };
