import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
export const mapMemoryPath = path.join(projectRoot, 'map-memory.json');

function now() {
  return Date.now();
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function backupMalformedFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.bad-${now()}`;
  try {
    fs.copyFileSync(filePath, backupPath);
    console.warn(`[map-memory] malformed map-memory.json backed up to ${backupPath}`);
  } catch (error) {
    console.warn(`[map-memory] could not back up malformed map-memory.json: ${error.message}`);
  }
}

function point(position) {
  if (!position) return null;
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
  };
}

function makeId(prefix) {
  return `${prefix}_${now()}_${Math.floor(Math.random() * 10000)}`;
}

function normalName(name) {
  return String(name || '').trim().toLowerCase();
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function defaultMapMemory() {
  const timestamp = now();
  return {
    version: 1,
    worldId: 'local-1.21.11',
    createdAt: timestamp,
    updatedAt: timestamp,
    waypoints: [],
    discoveries: [],
    resources: [],
    structures: [],
    biomes: [],
    dangerZones: [],
    routes: [],
    visitedChunks: [],
    overworldPortalWaypoints: [],
    netherPortalWaypoints: [],
    netherDangerZones: [],
    netherEntryHistory: [],
    knownNetherSafeSpots: [],
    knownNetherLavaZones: [],
    knownNetherStructures: [],
    knownNetherRoutes: [],
    notes: []
  };
}

export function ensureMapMemoryShape(mapMemory = {}) {
  const shaped = { ...defaultMapMemory(), ...mapMemory };
  for (const key of ['waypoints', 'discoveries', 'resources', 'structures', 'biomes', 'dangerZones', 'routes', 'visitedChunks', 'overworldPortalWaypoints', 'netherPortalWaypoints', 'netherDangerZones', 'netherEntryHistory', 'knownNetherSafeSpots', 'knownNetherLavaZones', 'knownNetherStructures', 'knownNetherRoutes', 'notes']) {
    if (!Array.isArray(shaped[key])) shaped[key] = [];
  }
  if (!shaped.createdAt) shaped.createdAt = now();
  shaped.updatedAt = shaped.updatedAt || shaped.createdAt;
  return shaped;
}

export function loadMapMemory() {
  if (!fs.existsSync(mapMemoryPath)) {
    const created = defaultMapMemory();
    saveMapMemory(created);
    return created;
  }

  try {
    return ensureMapMemoryShape(JSON.parse(fs.readFileSync(mapMemoryPath, 'utf8')));
  } catch (error) {
    console.warn(`[map-memory] Could not read map-memory.json: ${error.message}`);
    backupMalformedFile(mapMemoryPath);
    const created = defaultMapMemory();
    saveMapMemory(created);
    return created;
  }
}

export function saveMapMemory(mapMemory) {
  const shaped = ensureMapMemoryShape(mapMemory);
  shaped.updatedAt = now();
  atomicWriteJson(mapMemoryPath, shaped);
  return shaped;
}

export function addWaypoint(mapMemory, waypoint) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const name = String(waypoint?.name || '').trim();
  const position = point(waypoint?.position);
  if (!name || !position) return null;

  const dimension = waypoint.dimension || 'overworld';
  const existing = shaped.waypoints.find((item) => normalName(item.name) === normalName(name) && item.dimension === dimension);
  const record = {
    id: existing?.id || waypoint.id || makeId('wp'),
    name,
    type: waypoint.type || existing?.type || 'custom',
    dimension,
    position,
    createdBy: waypoint.createdBy || existing?.createdBy || 'tj',
    createdAt: existing?.createdAt || waypoint.createdAt || now(),
    lastVisitedAt: waypoint.lastVisitedAt || now(),
    notes: waypoint.notes || existing?.notes || '',
    tags: Array.isArray(waypoint.tags) ? waypoint.tags : existing?.tags || []
  };

  if (existing) Object.assign(existing, record);
  else shaped.waypoints.push(record);
  return record;
}

export function updateWaypoint(mapMemory, id, updates) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const waypoint = shaped.waypoints.find((item) => item.id === id);
  if (!waypoint) return null;
  Object.assign(waypoint, updates, updates.position ? { position: point(updates.position) } : {});
  return waypoint;
}

export function removeWaypoint(mapMemory, idOrName) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const before = shaped.waypoints.length;
  const filtered = shaped.waypoints.filter((item) => item.id !== idOrName && normalName(item.name) !== normalName(idOrName));
  shaped.waypoints = filtered;
  mapMemory.waypoints = filtered;
  return before !== shaped.waypoints.length;
}

export function findWaypointByName(mapMemory, name) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const exact = shaped.waypoints.find((item) => normalName(item.name) === normalName(name));
  if (exact) return exact;
  return shaped.waypoints.find((item) => normalName(item.name).includes(normalName(name)));
}

export function listWaypoints(mapMemory, filters = {}) {
  const shaped = ensureMapMemoryShape(mapMemory);
  return shaped.waypoints.filter((item) => {
    if (filters.type && item.type !== filters.type) return false;
    if (filters.dimension && item.dimension !== filters.dimension) return false;
    if (filters.tag && !(item.tags || []).includes(filters.tag)) return false;
    return true;
  });
}

export function findNearestWaypoint(mapMemory, position, filters = {}) {
  const candidates = listWaypoints(mapMemory, filters);
  let best = null;
  let bestDistance = Infinity;
  for (const waypoint of candidates) {
    const nextDistance = distance(point(position), waypoint.position);
    if (nextDistance < bestDistance) {
      best = waypoint;
      bestDistance = nextDistance;
    }
  }
  return best ? { waypoint: best, distance: bestDistance } : null;
}

function upsertNear(list, record, radius = 8) {
  const existing = list.find((item) => item.dimension === record.dimension && item.name === record.name && distance(item.position, record.position) <= radius);
  if (existing) {
    Object.assign(existing, record, { id: existing.id, createdAt: existing.createdAt, lastSeenAt: now() });
    return existing;
  }
  list.push(record);
  return record;
}

export function addDiscovery(mapMemory, discovery) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const position = point(discovery?.position);
  if (!position) return null;
  return upsertNear(shaped.discoveries, {
    id: discovery.id || makeId('disc'),
    type: discovery.type || 'landmark',
    name: discovery.name || 'unknown',
    dimension: discovery.dimension || 'overworld',
    position,
    confidence: discovery.confidence || 'seen',
    createdAt: discovery.createdAt || now(),
    lastSeenAt: now(),
    notes: discovery.notes || ''
  });
}

export function addDangerZone(mapMemory, danger) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const position = point(danger?.position);
  if (!position) return null;
  return upsertNear(shaped.dangerZones, {
    id: danger.id || makeId('danger'),
    dangerType: danger.dangerType || danger.name || 'unknown',
    name: danger.dangerType || danger.name || 'unknown',
    dimension: danger.dimension || 'overworld',
    position,
    radius: danger.radius || 8,
    severity: danger.severity || 'medium',
    createdAt: danger.createdAt || now(),
    lastSeenAt: now(),
    notes: danger.notes || ''
  }, danger.radius || 8);
}

export function addResourceLocation(mapMemory, resource) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const position = point(resource?.position);
  if (!position) return null;
  return upsertNear(shaped.resources, {
    id: resource.id || makeId('res'),
    type: resource.type || 'resource',
    name: resource.name || resource.resourceType || 'unknown_resource',
    resourceType: resource.resourceType || resource.name || 'unknown_resource',
    dimension: resource.dimension || 'overworld',
    position,
    confidence: resource.confidence || 'seen',
    createdAt: resource.createdAt || now(),
    lastSeenAt: now(),
    notes: resource.notes || ''
  });
}

export function addStructureLocation(mapMemory, structure) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const position = point(structure?.position);
  if (!position) return null;
  return upsertNear(shaped.structures, {
    id: structure.id || makeId('struct'),
    type: structure.type || 'structure',
    name: structure.name || 'possible_structure',
    dimension: structure.dimension || 'overworld',
    position,
    confidence: structure.confidence || 'seen',
    createdAt: structure.createdAt || now(),
    lastSeenAt: now(),
    notes: structure.notes || ''
  }, 16);
}

export function addBiomeLocation(mapMemory, biome) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const position = point(biome?.position);
  const biomeName = biome?.biome || biome?.name;
  if (!position || !biomeName) return null;
  const existing = shaped.biomes.find((item) => item.biome === biomeName && item.dimension === (biome.dimension || 'overworld'));
  if (existing) {
    existing.position = position;
    existing.lastSeenAt = now();
    return existing;
  }
  const record = {
    biome: biomeName,
    dimension: biome.dimension || 'overworld',
    position,
    firstSeenAt: now(),
    lastSeenAt: now()
  };
  shaped.biomes.push(record);
  return record;
}

export function addRoute(mapMemory, route) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const name = String(route?.name || '').trim();
  if (!name || !Array.isArray(route.points) || route.points.length === 0) return null;
  const existing = shaped.routes.find((item) => normalName(item.name) === normalName(name) && item.dimension === (route.dimension || 'overworld'));
  const record = {
    id: existing?.id || route.id || makeId('route'),
    name,
    fromWaypointId: route.fromWaypointId || existing?.fromWaypointId || null,
    toWaypointId: route.toWaypointId || existing?.toWaypointId || null,
    dimension: route.dimension || existing?.dimension || 'overworld',
    points: route.points.map(point).filter(Boolean),
    safe: route.safe !== false,
    createdAt: existing?.createdAt || now(),
    lastUsedAt: route.lastUsedAt || existing?.lastUsedAt || 0,
    notes: route.notes || existing?.notes || ''
  };
  if (existing) Object.assign(existing, record);
  else shaped.routes.push(record);
  return record;
}

export function getKnownRoutes(mapMemory) {
  return ensureMapMemoryShape(mapMemory).routes;
}

export function getKnownDangerZones(mapMemory) {
  return ensureMapMemoryShape(mapMemory).dangerZones;
}

export function getKnownResources(mapMemory, resourceType = null) {
  const resources = ensureMapMemoryShape(mapMemory).resources;
  if (!resourceType) return resources;
  return resources.filter((item) => item.resourceType === resourceType || item.name.includes(resourceType));
}

export function summarizeMapMemory(mapMemory) {
  const shaped = ensureMapMemoryShape(mapMemory);
  return {
    waypoints: shaped.waypoints.length,
    discoveries: shaped.discoveries.length,
    resources: shaped.resources.length,
    structures: shaped.structures.length,
    biomes: shaped.biomes.length,
    dangerZones: shaped.dangerZones.length,
    routes: shaped.routes.length,
    visitedChunks: shaped.visitedChunks.length,
    updatedAt: shaped.updatedAt
  };
}

export function pruneOldLowValueDiscoveries(mapMemory) {
  const shaped = ensureMapMemoryShape(mapMemory);
  shaped.discoveries = shaped.discoveries.slice(-250);
  shaped.resources = shaped.resources.slice(-250);
  shaped.structures = shaped.structures.slice(-100);
  shaped.dangerZones = shaped.dangerZones.slice(-150);
  shaped.routes = shaped.routes.slice(-50);
  shaped.visitedChunks = shaped.visitedChunks.slice(-500);
  Object.assign(mapMemory, shaped);
  return shaped;
}

export function formatPoint(position) {
  const p = point(position);
  return p ? `${p.x}, ${p.y}, ${p.z}` : 'unknown';
}

export function rememberOverworldPortal(mapMemory, position) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const p = point(position);
  if (!p) return null;
  const waypoint = addWaypoint(shaped, {
    name: 'overworld portal',
    type: 'overworld_portal',
    dimension: 'overworld',
    position: p,
    createdBy: 'tj',
    notes: 'Known Overworld Nether portal.',
    tags: ['portal', 'nether']
  });
  upsertNear(shaped.overworldPortalWaypoints, { ...waypoint, position: p }, 8);
  Object.assign(mapMemory, shaped);
  return waypoint;
}

export function rememberNetherPortal(mapMemory, position) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const p = point(position);
  if (!p) return null;
  const waypoint = addWaypoint(shaped, {
    name: 'nether portal',
    type: 'nether_portal',
    dimension: 'the_nether',
    position: p,
    createdBy: 'tj',
    notes: 'Known Nether-side return portal.',
    tags: ['portal', 'nether', 'return']
  });
  upsertNear(shaped.netherPortalWaypoints, { ...waypoint, position: p }, 8);
  Object.assign(mapMemory, shaped);
  return waypoint;
}

export function addNetherDanger(mapMemory, danger) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const record = addDangerZone(shaped, {
    ...danger,
    dimension: danger?.dimension || 'the_nether'
  });
  if (record) upsertNear(shaped.netherDangerZones, record, record.radius || 8);
  Object.assign(mapMemory, shaped);
  return record;
}

export function addNetherEntryRecord(mapMemory, record) {
  const shaped = ensureMapMemoryShape(mapMemory);
  const entry = { id: record?.id || makeId('nether_entry'), at: now(), ...record };
  shaped.netherEntryHistory.unshift(entry);
  shaped.netherEntryHistory = shaped.netherEntryHistory.slice(0, 50);
  Object.assign(mapMemory, shaped);
  return entry;
}

export function getKnownNetherPortal(mapMemory) {
  const shaped = ensureMapMemoryShape(mapMemory);
  return shaped.netherPortalWaypoints[0] || listWaypoints(shaped, { type: 'nether_portal' })[0] || null;
}

export function getKnownOverworldPortal(mapMemory) {
  const shaped = ensureMapMemoryShape(mapMemory);
  return shaped.overworldPortalWaypoints[0] || listWaypoints(shaped, { type: 'overworld_portal' })[0] || null;
}

export function summarizeNetherMemory(mapMemory) {
  const shaped = ensureMapMemoryShape(mapMemory);
  return {
    overworldPortals: shaped.overworldPortalWaypoints.length,
    netherPortals: shaped.netherPortalWaypoints.length,
    netherDangers: shaped.netherDangerZones.length,
    entries: shaped.netherEntryHistory.length,
    safeSpots: shaped.knownNetherSafeSpots.length,
    structures: shaped.knownNetherStructures.length
  };
}
