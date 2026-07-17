import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as mapMemoryStore from './mapMemory.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function dimension(bot) {
  return bot.game?.dimension || bot.game?.dimensionName || 'overworld';
}

export async function goToPosition(bot, memory, position, options = {}) {
  const target = point(position);
  if (!target) return { ok: false, message: 'I do not have a valid target position.' };
  options.throwIfCancelled?.();
  const range = options.range || 3;
  await bot.pathfinder.goto(new GoalNear(target.x, target.y, target.z, range));
  options.throwIfCancelled?.();
  return { ok: true, message: `Arrived near ${mapMemoryStore.formatPoint(target)}.`, position: target };
}

export async function goToWaypoint(bot, memory, mapMemory, waypointName, options = {}) {
  const waypoint = mapMemoryStore.findWaypointByName(mapMemory, waypointName);
  if (!waypoint) return { ok: false, message: `I do not know a place named ${waypointName}.` };
  if (waypoint.dimension && waypoint.dimension !== dimension(bot)) {
    return { ok: false, message: `${waypoint.name} is in ${waypoint.dimension}, and I am in ${dimension(bot)}.` };
  }
  memory.update?.({ currentWaypointTarget: waypoint.name });
  const result = await goToPosition(bot, memory, waypoint.position, options);
  if (result.ok) {
    waypoint.lastVisitedAt = Date.now();
    memory.update?.({ currentWaypointTarget: null, lastWaypointVisited: waypoint.name });
    mapMemoryStore.saveMapMemory(mapMemory);
  }
  return { ...result, waypoint };
}

export async function returnToHome(bot, memory, mapMemory, options = {}) {
  const home = mapMemoryStore.findWaypointByName(mapMemory, 'home');
  if (home) return goToWaypoint(bot, memory, mapMemory, home.name, options);
  const memHome = memory.get?.().homeBasePosition;
  if (!memHome) return { ok: false, message: 'I do not have a home waypoint yet.' };
  return goToPosition(bot, memory, memHome, options);
}

export async function returnToOwner(bot, memory, options = {}) {
  const owner = bot.players?.[options.ownerUsername]?.entity;
  if (!owner) return { ok: false, message: `I cannot see ${options.ownerUsername}.` };
  return goToPosition(bot, memory, owner.position, options);
}

export function rememberCurrentLocation(bot, mapMemory, name, type = 'custom', notes = '', createdBy = 'ModVinny') {
  const record = mapMemoryStore.addWaypoint(mapMemory, {
    name,
    type,
    dimension: dimension(bot),
    position: point(bot.entity?.position || new Vec3(0, 0, 0)),
    createdBy,
    notes,
    tags: type === 'home' ? ['safe', 'base'] : []
  });
  mapMemoryStore.saveMapMemory(mapMemory);
  return record;
}

export function forgetLocation(mapMemory, name) {
  const removed = mapMemoryStore.removeWaypoint(mapMemory, name);
  if (removed) mapMemoryStore.saveMapMemory(mapMemory);
  return removed;
}

export function waypointStatus(bot, mapMemory, name) {
  const waypoint = mapMemoryStore.findWaypointByName(mapMemory, name);
  if (!waypoint) return { ok: false, message: `I do not know a place named ${name}.` };
  const distance = bot.entity?.position ? bot.entity.position.distanceTo(new Vec3(waypoint.position.x, waypoint.position.y, waypoint.position.z)) : null;
  return {
    ok: true,
    waypoint,
    message: `${waypoint.name}: ${waypoint.type} at ${mapMemoryStore.formatPoint(waypoint.position)}${distance !== null ? `, ${distance.toFixed(1)} blocks away` : ''}.`
  };
}

export function listKnownPlaces(mapMemory, filters = {}) {
  return mapMemoryStore.listWaypoints(mapMemory, filters);
}
