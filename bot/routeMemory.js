import * as mapMemoryStore from './mapMemory.js';
import * as waypointNavigator from './waypointNavigator.js';

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function dimension(bot) {
  return bot.game?.dimension || bot.game?.dimensionName || 'overworld';
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function startRouteRecording(bot, memory, mapMemory, routeName) {
  const name = String(routeName || '').trim();
  if (!name) return { ok: false, message: 'Give the route a name.' };
  memory.update({
    currentRouteRecording: {
      name,
      dimension: dimension(bot),
      startedAt: Date.now(),
      points: [point(bot.entity.position)]
    }
  });
  return { ok: true, message: `Recording route ${name}.` };
}

export function recordRoutePoint(bot, memory, mapMemory) {
  const recording = memory.get().currentRouteRecording;
  if (!recording) return { ok: false, message: 'No route recording is active.' };
  const current = point(bot.entity.position);
  const last = recording.points.at(-1);
  if (!last || distance(current, last) >= (bot.config?.breadcrumbSpacing || 12)) {
    recording.points.push(current);
    recording.points = recording.points.slice(-250);
    memory.update({ currentRouteRecording: recording });
  }
  return { ok: true, points: recording.points.length };
}

export function stopRouteRecording(bot, memory, mapMemory) {
  const recording = memory.get().currentRouteRecording;
  if (!recording) return { ok: false, message: 'No route recording is active.' };
  const route = saveRoute(bot, memory, mapMemory, {
    name: recording.name,
    dimension: recording.dimension,
    points: simplifyRoutePoints(recording.points),
    safe: true,
    notes: 'Recorded by tj while traveling.'
  });
  memory.update({ currentRouteRecording: null });
  return { ok: true, route, message: `Saved route ${recording.name} with ${route.points.length} points.` };
}

export function saveRoute(bot, memory, mapMemory, route) {
  const record = mapMemoryStore.addRoute(mapMemory, route);
  mapMemoryStore.saveMapMemory(mapMemory);
  return record;
}

export async function followKnownRoute(bot, memory, mapMemory, routeName, options = {}) {
  const route = mapMemoryStore.getKnownRoutes(mapMemory).find((item) => item.name.toLowerCase() === String(routeName).toLowerCase());
  if (!route) return { ok: false, message: `I do not know route ${routeName}.` };
  if (route.dimension !== dimension(bot)) return { ok: false, message: `Route ${route.name} is in ${route.dimension}.` };
  if (options.hasDangerOnRoute?.(route)) return { ok: false, message: `Route ${route.name} has a known danger near it.` };
  for (const routePoint of route.points) {
    options.throwIfCancelled?.();
    await waypointNavigator.goToPosition(bot, memory, routePoint, { ...options, range: options.range || 3 });
  }
  route.lastUsedAt = Date.now();
  mapMemoryStore.saveMapMemory(mapMemory);
  return { ok: true, message: `Followed route ${route.name}.`, route };
}

export function findRouteBetween(mapMemory, fromName, toName) {
  return mapMemoryStore.getKnownRoutes(mapMemory).find((route) => route.name.toLowerCase() === `${fromName}_to_${toName}`.toLowerCase());
}

export function reverseRoute(route) {
  return { ...route, points: [...route.points].reverse(), name: `${route.name}_reverse` };
}

export function simplifyRoutePoints(points = []) {
  if (points.length <= 2) return points;
  const simplified = [points[0]];
  for (const item of points.slice(1, -1)) {
    if (distance(item, simplified.at(-1)) >= 8) simplified.push(item);
  }
  simplified.push(points.at(-1));
  return simplified;
}

export function routeStatus(bot, memory, mapMemory) {
  const routes = mapMemoryStore.getKnownRoutes(mapMemory);
  return {
    active: memory.get().currentRouteRecording,
    routes,
    message: routes.length
      ? `Known routes: ${routes.slice(0, 6).map((route) => route.name).join(', ')}.`
      : 'I do not know any routes yet.'
  };
}
