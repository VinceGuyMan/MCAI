import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as homeBase from '../../homeBase.js';
import * as inventory from '../../inventory.js';
import * as mapMemoryStore from '../../mapMemory.js';
import * as netherSafety from './netherSafety.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function result(ok, message, extra = {}) {
  return { ok, success: ok, message, ...extra };
}

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function vec(pointLike) {
  if (!pointLike) return null;
  return new Vec3(Math.floor(pointLike.x), Math.floor(pointLike.y), Math.floor(pointLike.z));
}

function dimension(bot) {
  return /nether/i.test(String(bot.game?.dimension || bot.game?.dimensionName || '')) ? 'the_nether' : 'overworld';
}

function blockIds(bot, names) {
  return names.map((name) => bot.registry?.blocksByName?.[name]?.id).filter(Boolean);
}

function isReplaceable(block) {
  return ['air', 'cave_air', 'void_air', 'tall_grass', 'short_grass'].includes(block?.name);
}

export function findNearbyPortal(bot, radius = 16) {
  if (!bot.entity || typeof bot.findBlock !== 'function') return null;
  const ids = blockIds(bot, ['nether_portal']);
  if (!ids.length) return null;
  return bot.findBlock({ matching: ids, maxDistance: radius }) || null;
}

export function markPortalWaypoint(bot, mapMemory, portalDimension, position, name) {
  if (portalDimension === 'the_nether') return mapMemoryStore.rememberNetherPortal(mapMemory, position);
  return mapMemoryStore.rememberOverworldPortal(mapMemory, position || bot.entity?.position, name);
}

export function rememberOverworldPortal(bot, memory, mapMemory, portalBlock) {
  const position = point(portalBlock?.position || bot.entity?.position);
  if (!position) return null;
  const record = mapMemoryStore.rememberOverworldPortal(mapMemory, position);
  memory.update({ overworldPortalPosition: position });
  return record;
}

export function rememberNetherPortal(bot, memory, mapMemory, portalBlock) {
  const position = point(portalBlock?.position || bot.entity?.position);
  if (!position) return null;
  const record = mapMemoryStore.rememberNetherPortal(mapMemory, position);
  memory.update({ netherPortalPosition: position });
  return record;
}

export function portalSafetyCheck(bot, portalBlock) {
  if (!portalBlock) return result(false, 'No portal block found.');
  const pos = portalBlock.position;
  const lava = bot.findBlock?.({ matching: blockIds(bot, ['lava']), maxDistance: 8 });
  const fire = bot.findBlock?.({ matching: blockIds(bot, ['fire', 'soul_fire']), maxDistance: 8 });
  if (lava && lava.position.distanceTo(pos) <= 8) return result(false, 'Lava is too close to the portal.');
  if (fire && fire.position.distanceTo(pos) <= 8) return result(false, 'Fire is too close to the portal.');
  return result(true, 'Portal area looks safe enough.');
}

function findPortalOrigin(bot, memory, options = {}) {
  const home = homeBase.getHome(memory);
  const start = vec(home?.position || home || bot.entity?.position);
  if (!start || !bot.entity) return null;
  const maxRadius = options.maxRadius || 8;
  for (let radius = 2; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const origin = new Vec3(start.x + dx, start.y, start.z + dz);
        if (canBuildPortalAt(bot, origin).ok) return origin;
      }
    }
  }
  return null;
}

function portalFramePositions(origin) {
  const positions = [];
  for (const x of [1, 2]) positions.push(origin.offset(x, 0, 0), origin.offset(x, 4, 0));
  for (const y of [1, 2, 3]) positions.push(origin.offset(0, y, 0), origin.offset(3, y, 0));
  return positions;
}

function portalInteriorPositions(origin) {
  const positions = [];
  for (const x of [1, 2]) {
    for (const y of [1, 2, 3]) positions.push(origin.offset(x, y, 0));
  }
  return positions;
}

function canBuildPortalAt(bot, origin) {
  if (!origin) return result(false, 'no origin');
  for (const pos of [...portalFramePositions(origin), ...portalInteriorPositions(origin)]) {
    const block = bot.blockAt(pos);
    if (!block || (!isReplaceable(block) && block.name !== 'obsidian')) return result(false, `${block?.name || 'unknown'} is in the portal space`);
  }
  for (const x of [1, 2]) {
    const below = bot.blockAt(origin.offset(x, -1, 0));
    if (!below || below.boundingBox !== 'block' || ['lava', 'water', 'fire', 'soul_fire'].includes(below.name)) {
      return result(false, 'portal needs safe ground');
    }
  }
  return result(true, 'safe');
}

function adjacentReference(bot, pos) {
  const dirs = [
    new Vec3(0, -1, 0),
    new Vec3(-1, 0, 0),
    new Vec3(1, 0, 0),
    new Vec3(0, 0, -1),
    new Vec3(0, 0, 1),
    new Vec3(0, 1, 0)
  ];
  for (const dir of dirs) {
    const ref = bot.blockAt(pos.plus(dir));
    if (ref && ref.boundingBox === 'block' && !['lava', 'water', 'fire', 'soul_fire'].includes(ref.name)) {
      return { ref, face: dir.scaled(-1) };
    }
  }
  return null;
}

async function placeObsidianAt(bot, pos, options = {}) {
  const existing = bot.blockAt(pos);
  if (existing?.name === 'obsidian') return result(true, 'obsidian already placed');
  if (!isReplaceable(existing)) return result(false, `${existing?.name || 'unknown'} blocks the frame`);
  if (options.throwIfCancelled) options.throwIfCancelled();
  const item = bot.inventory.items().find((candidate) => candidate.name === 'obsidian');
  if (!item) return result(false, 'I am out of obsidian.');
  const adjacent = adjacentReference(bot, pos);
  if (!adjacent) return result(false, `No support to place obsidian at ${point(pos).x},${point(pos).y},${point(pos).z}.`);
  await bot.pathfinder.goto(new GoalNear(adjacent.ref.position.x, adjacent.ref.position.y, adjacent.ref.position.z, 4)).catch(() => null);
  await bot.equip(item, 'hand');
  await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);
  if (bot._placeBlockWithOptions) await bot._placeBlockWithOptions(adjacent.ref, adjacent.face, { swingArm: 'right', forceLook: true });
  else await bot.placeBlock(adjacent.ref, adjacent.face);
  await wait(500);
  return bot.blockAt(pos)?.name === 'obsidian' ? result(true, 'placed obsidian') : result(false, 'obsidian placement did not stick');
}

export async function buildNetherPortalFrame(bot, memory, options = {}) {
  if (!bot.mcaiConfig?.allowPortalBuilding) return result(false, 'Portal building is disabled.');
  if (netherSafety.isInNether(bot)) return result(false, 'I will not build an Overworld portal while in the Nether.');
  if (inventory.countObsidian(bot) < 10) return result(false, `I need 10 obsidian to build a basic portal frame. I have ${inventory.countObsidian(bot)}.`);
  const origin = findPortalOrigin(bot, memory, options);
  if (!origin) return result(false, 'I could not find a safe place near home for a portal frame.');
  console.log(`[portal] building portal frame at ${origin.x},${origin.y},${origin.z}`);
  for (const pos of portalFramePositions(origin)) {
    const placed = await placeObsidianAt(bot, pos, options);
    if (!placed.ok) return placed;
  }
  const portalBase = origin.offset(1, 1, 0);
  const mapMemory = options.mapMemory || mapMemoryStore.loadMapMemory();
  rememberOverworldPortal(bot, memory, mapMemory, { position: portalBase });
  mapMemoryStore.saveMapMemory(mapMemory);
  return result(true, `Built a Nether portal frame near ${portalBase.x}, ${portalBase.y}, ${portalBase.z}.`, { position: point(portalBase), origin: point(origin) });
}

export async function lightNetherPortal(bot, memory, options = {}) {
  if (!bot.mcaiConfig?.allowPortalLighting) return result(false, 'Portal lighting is disabled.');
  if (bot.mcaiConfig?.requireConfirmationForPortalLighting && !options.confirmed) {
    return result(false, 'Portal lighting needs confirmation.', { requiresConfirmation: 'portal_lighting' });
  }
  if (inventory.countFlintAndSteel(bot) < 1) return result(false, 'I need flint_and_steel to light the portal.');
  let portal = findNearbyPortal(bot, 10);
  if (portal) return result(true, 'Portal is already lit.', { block: portal, position: point(portal.position) });
  const obsidian = bot.findBlock?.({ matching: blockIds(bot, ['obsidian']), maxDistance: 10 });
  if (!obsidian) return result(false, 'I need a nearby portal frame to light.');
  const flint = bot.inventory.items().find((item) => item.name === 'flint_and_steel');
  await bot.equip(flint, 'hand');
  await bot.lookAt(obsidian.position.offset(0.5, 0.5, 0.5), true);
  await bot.activateBlock(obsidian);
  await wait(1500);
  portal = findNearbyPortal(bot, 10);
  if (!portal) return result(false, 'I tried to light it, but no portal appeared.');
  const mapMemory = options.mapMemory || mapMemoryStore.loadMapMemory();
  rememberOverworldPortal(bot, memory, mapMemory, portal);
  mapMemoryStore.saveMapMemory(mapMemory);
  return result(true, 'Portal lit and remembered.', { block: portal, position: point(portal.position) });
}

export async function waitForDimensionChange(bot, targetDimension, timeoutMs = 30000) {
  const started = Date.now();
  const target = String(targetDimension || '').toLowerCase();
  while (Date.now() - started < timeoutMs) {
    const current = String(bot.game?.dimension || bot.game?.dimensionName || '').toLowerCase();
    if ((target.includes('nether') && current.includes('nether')) || (target.includes('overworld') && !/nether|end/.test(current))) {
      return true;
    }
    await wait(500);
  }
  return false;
}

async function walkIntoPortal(bot, portal, options = {}) {
  if (options.throwIfCancelled) options.throwIfCancelled();
  await bot.pathfinder.goto(new GoalNear(portal.position.x, portal.position.y, portal.position.z, 1)).catch(() => null);
  await bot.lookAt(portal.position.offset(0.5, 0.5, 0.5), true);
  bot.setControlState('forward', true);
  await wait(3500);
  bot.setControlState('forward', false);
}

export async function enterNetherPortal(bot, memory, mapMemory, options = {}) {
  if (!bot.mcaiConfig?.allowNetherEntry) return result(false, 'Nether entry is disabled.');
  if (bot.mcaiConfig?.requireConfirmationForNetherEntry && !options.confirmed) {
    return result(false, 'Nether entry needs confirmation.', { requiresConfirmation: 'nether_entry' });
  }
  const portal = findNearbyPortal(bot, 16);
  if (!portal) return result(false, 'I need a lit nearby Nether portal.');
  const safe = portalSafetyCheck(bot, portal);
  if (!safe.ok && !options.override) return safe;
  rememberOverworldPortal(bot, memory, mapMemory, portal);
  await walkIntoPortal(bot, portal, options);
  const changed = await waitForDimensionChange(bot, 'the_nether', bot.mcaiConfig?.maxNetherEntryDurationMs || 120000);
  if (!changed) return result(false, 'I did not arrive in the Nether before timeout.');
  await wait(2500);
  const netherPortal = findNearbyPortal(bot, 24);
  rememberNetherPortal(bot, memory, mapMemory, netherPortal || { position: bot.entity?.position });
  mapMemoryStore.addNetherEntryRecord(mapMemory, { ok: true, enteredAt: Date.now(), overworldPortal: memory.get().overworldPortalPosition, netherPortal: memory.get().netherPortalPosition });
  mapMemoryStore.saveMapMemory(mapMemory);
  memory.update({ lastNetherEntryAt: Date.now(), netherEntryCount: (memory.get().netherEntryCount || 0) + 1, netherScoutActive: true });
  return result(true, 'Entered Nether and remembered the return portal.', { portal: memory.get().netherPortalPosition });
}

export function findReturnPortalInNether(bot, memory, mapMemory) {
  return findNearbyPortal(bot, 32) || (memory.get().netherPortalPosition ? { position: vec(memory.get().netherPortalPosition) } : null) || (mapMemoryStore.getKnownNetherPortal(mapMemory)?.position ? { position: vec(mapMemoryStore.getKnownNetherPortal(mapMemory).position) } : null);
}

export async function goToReturnPortal(bot, memory, mapMemory, options = {}) {
  const portal = findReturnPortalInNether(bot, memory, mapMemory);
  if (!portal?.position) return result(false, 'I do not know where the Nether return portal is.');
  await bot.pathfinder.goto(new GoalNear(portal.position.x, portal.position.y, portal.position.z, 1));
  return result(true, 'At the Nether return portal.', { portal: point(portal.position) });
}

export async function exitNetherPortal(bot, memory, mapMemory, options = {}) {
  if (!netherSafety.isInNether(bot)) return result(false, 'I am not in the Nether.');
  const atPortal = await goToReturnPortal(bot, memory, mapMemory, options);
  if (!atPortal.ok) return atPortal;
  const portal = findNearbyPortal(bot, 8) || { position: vec(memory.get().netherPortalPosition) };
  await walkIntoPortal(bot, portal, options);
  const changed = await waitForDimensionChange(bot, 'overworld', bot.mcaiConfig?.maxNetherEntryDurationMs || 120000);
  if (!changed) return result(false, 'I did not return to the Overworld before timeout.');
  await wait(2000);
  const overworldPortal = findNearbyPortal(bot, 24);
  rememberOverworldPortal(bot, memory, mapMemory, overworldPortal || { position: bot.entity?.position });
  mapMemoryStore.saveMapMemory(mapMemory);
  memory.update({ lastNetherExitAt: Date.now(), netherScoutActive: false, netherReturnTarget: null });
  return result(true, 'Returned from the Nether.');
}

export function portalStatus(bot, memory, mapMemory) {
  const nearbyPortal = findNearbyPortal(bot, 24);
  return {
    dimension: dimension(bot),
    nearbyPortal: nearbyPortal ? { name: nearbyPortal.name, position: point(nearbyPortal.position) } : null,
    overworldPortal: memory.get().overworldPortalPosition || mapMemoryStore.getKnownOverworldPortal(mapMemory)?.position || null,
    netherPortal: memory.get().netherPortalPosition || mapMemoryStore.getKnownNetherPortal(mapMemory)?.position || null,
    inventory: {
      obsidian: inventory.countObsidian(bot),
      flintAndSteel: inventory.countFlintAndSteel(bot)
    }
  };
}
