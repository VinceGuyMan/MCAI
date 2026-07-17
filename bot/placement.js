import { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

const replaceableBlocks = new Set(['air', 'cave_air', 'void_air']);
const unsafeBlocks = new Set(['lava', 'water', 'fire', 'soul_fire']);
const blockedUtilityBlocks = new Set([
  'chest', 'trapped_chest', 'barrel', 'crafting_table', 'furnace', 'blast_furnace', 'smoker',
  'bed', 'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed', 'lime_bed', 'pink_bed',
  'gray_bed', 'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed', 'brown_bed', 'green_bed', 'red_bed', 'black_bed',
  'anvil', 'chipped_anvil', 'damaged_anvil', 'enchanting_table', 'brewing_stand', 'nether_portal', 'end_portal',
  'farmland'
]);
const forbiddenPlacementItems = new Set(['tnt', 'fire_charge', 'lava_bucket']);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(itemName) {
  return String(itemName || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function inventoryItem(bot, itemName) {
  const name = normalize(itemName);
  return bot.inventory?.items?.().find((item) => item.name === name) || null;
}

function entityOccupies(bot, position, radius = 0.9) {
  const center = position.offset(0.5, 0.5, 0.5);
  return Object.values(bot.entities || {}).some((entity) => {
    if (!entity?.position) return false;
    const closeX = Math.abs(entity.position.x - center.x) < radius;
    const closeY = entity.position.y > position.y - 0.1 && entity.position.y < position.y + 1.9;
    const closeZ = Math.abs(entity.position.z - center.z) < radius;
    return closeX && closeY && closeZ;
  });
}

function toVec3(position) {
  if (!position) return null;
  if (typeof position.floored === 'function') return position.floored();
  return new Vec3(Math.floor(position.x || 0), Math.floor(position.y || 0), Math.floor(position.z || 0));
}

function dimensionAllowsBlock(bot, blockName) {
  const name = normalize(blockName);
  const dimension = String(bot.game?.dimension || '');
  if ((name.endsWith('_bed') || name === 'bed') && /nether|end/.test(dimension)) return false;
  if (name === 'water_bucket' && /nether/.test(dimension)) return false;
  return true;
}

export function canPlaceBlockHere(bot, position, options = {}) {
  if (!bot.entity || !position) return { ok: false, reason: 'not spawned' };
  const blockName = normalize(options.blockName);
  if (forbiddenPlacementItems.has(blockName) && !options.explicitDangerous) return { ok: false, reason: `${blockName} placement is blocked` };
  if (!dimensionAllowsBlock(bot, blockName)) return { ok: false, reason: 'that block is unsafe in this dimension' };

  const dest = bot.blockAt(position);
  const below = bot.blockAt(position.offset(0, -1, 0));
  if (!dest || !below) return { ok: false, reason: 'unknown block' };
  if (!replaceableBlocks.has(dest.name)) return { ok: false, reason: `${dest.name} is in the way` };
  if (unsafeBlocks.has(dest.name) || unsafeBlocks.has(below.name)) return { ok: false, reason: 'unsafe liquid or fire nearby' };
  if (below.boundingBox !== 'block') return { ok: false, reason: 'no solid support' };
  if (blockedUtilityBlocks.has(below.name) || below.name.endsWith('_door')) return { ok: false, reason: `would block ${below.name}` };
  if (entityOccupies(bot, position)) return { ok: false, reason: 'entity in placement space' };

  const owner = bot.players?.[options.ownerUsername]?.entity;
  if (owner && owner.position.distanceTo(position.offset(0.5, 0, 0.5)) < 1.5) return { ok: false, reason: 'too close to owner' };
  return { ok: true, reason: 'safe' };
}

export function isPositionOccupiedByPlayerOrMob(bot, position) {
  return entityOccupies(bot, toVec3(position));
}

export function isProtectedBuildPosition(bot, position) {
  if (!bot?.blockAt || !position) return false;
  const block = bot.blockAt(toVec3(position));
  return Boolean(block && blockedUtilityBlocks.has(block.name));
}

export function canPlaceBlockAt(bot, position, blockName, options = {}) {
  return canPlaceBlockHere(bot, toVec3(position), { ...options, blockName });
}

export function findSafePlacementPosition(bot, blockName, options = {}) {
  if (!bot.entity) return null;
  const base = bot.entity.position.floored();
  for (const dy of [0, 1, -1]) {
    for (let radius = 1; radius <= (options.maxRadius || 4); radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const pos = base.offset(dx, dy, dz);
          const safe = canPlaceBlockHere(bot, pos, { ...options, blockName });
          if (safe.ok) return pos;
        }
      }
    }
  }
  return null;
}

export function findReferenceBlockForPlacement(bot, targetPosition) {
  const pos = toVec3(targetPosition);
  if (!bot?.blockAt || !pos) return null;
  const candidates = [
    { offset: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) },
    { offset: new Vec3(1, 0, 0), face: new Vec3(-1, 0, 0) },
    { offset: new Vec3(-1, 0, 0), face: new Vec3(1, 0, 0) },
    { offset: new Vec3(0, 0, 1), face: new Vec3(0, 0, -1) },
    { offset: new Vec3(0, 0, -1), face: new Vec3(0, 0, 1) },
    { offset: new Vec3(0, 1, 0), face: new Vec3(0, -1, 0) }
  ];
  for (const candidate of candidates) {
    const block = bot.blockAt(pos.offset(candidate.offset.x, candidate.offset.y, candidate.offset.z));
    if (block?.boundingBox === 'block' && !unsafeBlocks.has(block.name)) {
      return { block, face: candidate.face };
    }
  }
  return null;
}

export async function equipBlock(bot, blockName) {
  const name = normalize(blockName);
  const item = inventoryItem(bot, name);
  if (!item) return { ok: false, message: `I do not have ${name} to place.` };
  await bot.equip(item, 'hand');
  return { ok: true, item };
}

export function verifyBlockAt(bot, position, expectedBlock) {
  const pos = toVec3(position);
  const expected = normalize(expectedBlock);
  const block = bot?.blockAt?.(pos);
  if (!block) return { ok: false, reason: 'unknown block' };
  if (block.name !== expected) return { ok: false, reason: `expected ${expected}, found ${block.name}` };
  return { ok: true, block };
}

export async function pathNearPlacement(bot, position) {
  const pos = toVec3(position);
  if (!bot?.entity || !pos) return { ok: false, reason: 'not spawned' };
  if (bot.entity.position.distanceTo(pos.offset(0.5, 0, 0.5)) <= 3.5) return { ok: true };
  if (!bot.pathfinder?.goto) return { ok: false, reason: 'pathfinder unavailable' };
  await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 3));
  return { ok: true };
}

export async function placeBlockSafely(bot, blockName, targetOrOptions = {}, maybeOptions = {}) {
  const name = normalize(blockName);
  const hasTarget = targetOrOptions && typeof targetOrOptions === 'object' && Number.isFinite(Number(targetOrOptions.x));
  const options = hasTarget ? maybeOptions : targetOrOptions;
  if (forbiddenPlacementItems.has(name) && !options.explicitDangerous) return { ok: false, message: `${name} placement is blocked.` };
  const item = inventoryItem(bot, name);
  if (!item) return { ok: false, message: `I do not have ${name} to place.` };
  const pos = hasTarget ? toVec3(targetOrOptions) : findSafePlacementPosition(bot, name, options);
  if (!pos) return { ok: false, message: `I could not find a safe spot to place ${name}.` };
  const safe = canPlaceBlockAt(bot, pos, name, options);
  if (!safe.ok) return { ok: false, message: safe.reason };
  const reference = findReferenceBlockForPlacement(bot, pos);
  if (!reference) return { ok: false, message: 'I could not find a support block.' };

  try {
    console.log(`[placement] placing ${name} at ${pos.x},${pos.y},${pos.z}`);
    const pathResult = await pathNearPlacement(bot, pos);
    if (!pathResult.ok) return { ok: false, message: pathResult.reason };
    await bot.equip(item, 'hand');
    await wait(250);
    await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);
    if (bot._placeBlockWithOptions) {
      await bot._placeBlockWithOptions(reference.block, reference.face, { swingArm: 'right', forceLook: true });
    } else {
      await bot.placeBlock(reference.block, reference.face);
    }
    await wait(700);
    return { ok: true, message: `Placed ${name}.`, position: { x: pos.x, y: pos.y, z: pos.z }, block: bot.blockAt(pos) };
  } catch (error) {
    console.warn(`[placement] place ${name} failed: ${error.message}`);
    return { ok: false, message: `I could not place ${name}: ${error.message}` };
  }
}
