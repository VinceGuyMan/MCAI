import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

const { goals } = pathfinderPkg;
const { GoalNear, GoalBlock } = goals;

function normalize(vec) {
  const len = Math.max(1, Math.sqrt((vec.x * vec.x) + (vec.z * vec.z)));
  return { x: vec.x / len, z: vec.z / len };
}

function safePoint(bot, x, y, z) {
  const bx = Math.floor(x);
  const by = Math.floor(y);
  const bz = Math.floor(z);
  const base = bot.blockAt(new Vec3(bx, by - 1, bz));
  const feet = bot.blockAt(new Vec3(bx, by, bz));
  const head = bot.blockAt(new Vec3(bx, by + 1, bz));
  if (!base || !feet || !head) return false;
  if (!base.boundingBox || base.boundingBox === 'empty') return false;
  if (['lava', 'fire', 'soul_fire', 'cactus', 'magma_block'].includes(base.name)) return false;
  return feet.boundingBox === 'empty' && head.boundingBox === 'empty';
}

function isPathInterrupted(error) {
  const message = String(error?.message || error || '');
  return message.includes('GoalChanged') || message.includes('goal was changed') || message.includes('Path was stopped');
}

export async function moveToCombatRange(bot, target, options = {}) {
  if (!target?.position) return { ok: false, message: 'No combat target.' };
  options.throwIfCancelled?.();
  const range = options.range || 3;
  try {
    await bot.pathfinder.goto(new GoalNear(target.position.x, target.position.y, target.position.z, range));
  } catch (error) {
    if (isPathInterrupted(error)) return { ok: false, cancelled: true, message: 'Combat movement was interrupted.' };
    throw error;
  }
  options.throwIfCancelled?.();
  return { ok: true, message: 'In combat range.' };
}

export async function maintainSafeDistance(bot, target, options = {}) {
  if (!target?.position || !bot.entity?.position) return { ok: false, message: 'No target.' };
  const distance = bot.entity.position.distanceTo(target.position);
  if (distance < (options.minDistance || 3)) return retreatFromTarget(bot, target, options.retreatDistance || 8, options);
  if (distance > (options.maxDistance || 5)) return moveToCombatRange(bot, target, { ...options, range: options.maxDistance || 5 });
  return { ok: true, message: 'Holding position.' };
}

export async function retreatFromTarget(bot, target, distance = 18, options = {}) {
  if (!bot.entity?.position || !target?.position) return { ok: false, message: 'No retreat vector.' };
  const away = normalize({
    x: bot.entity.position.x - target.position.x,
    z: bot.entity.position.z - target.position.z
  });
  const y = Math.floor(bot.entity.position.y);
  let destination = null;
  for (const scale of [distance, distance * 0.75, distance * 0.5, 6]) {
    const x = Math.floor(bot.entity.position.x + away.x * scale);
    const z = Math.floor(bot.entity.position.z + away.z * scale);
    if (safePoint(bot, x, y, z)) {
      destination = { x, y, z };
      break;
    }
  }
  if (!destination) return { ok: false, message: 'I could not find a safe retreat spot.' };
  options.throwIfCancelled?.();
  try {
    await bot.pathfinder.goto(new GoalNear(destination.x, destination.y, destination.z, 2));
  } catch (error) {
    if (isPathInterrupted(error)) return { ok: false, cancelled: true, message: 'Retreat was interrupted.' };
    throw error;
  }
  return { ok: true, message: `Retreated to ${destination.x}, ${destination.y}, ${destination.z}.`, position: destination };
}

export async function kiteTarget(bot, target, options = {}) {
  await maintainSafeDistance(bot, target, { ...options, minDistance: 5, maxDistance: 9 });
  return { ok: true, message: 'Kiting target.' };
}

export function avoidHazardsDuringCombat(bot) {
  if (!bot.entity?.position) return { ok: true };
  const pos = bot.entity.position.floored();
  const nearby = [];
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      const block = bot.blockAt(pos.offset(dx, -1, dz));
      if (block && ['lava', 'fire', 'soul_fire', 'cactus', 'magma_block'].includes(block.name)) nearby.push(block.name);
    }
  }
  return nearby.length ? { ok: false, reason: `hazard nearby: ${nearby[0]}` } : { ok: true };
}

export function findSafeRetreatPosition(bot, threat, options = {}) {
  if (!bot.entity?.position || !threat?.position) return null;
  const away = normalize({ x: bot.entity.position.x - threat.position.x, z: bot.entity.position.z - threat.position.z });
  const y = Math.floor(bot.entity.position.y);
  for (const scale of [options.distance || 18, 12, 8, 5]) {
    const x = Math.floor(bot.entity.position.x + away.x * scale);
    const z = Math.floor(bot.entity.position.z + away.z * scale);
    if (safePoint(bot, x, y, z)) return { x, y, z };
  }
  return null;
}

export async function returnAfterCombat(bot, memory, options = {}) {
  const config = bot.mcaiConfig || {};
  const owner = bot.players?.[config.ownerUsername]?.entity;
  if (config.returnToOwnerAfterCombat && owner) {
    try {
      await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, config.followDistance || 3));
    } catch (error) {
      if (isPathInterrupted(error)) return { ok: false, cancelled: true, message: 'Return after combat was interrupted.' };
      throw error;
    }
    return { ok: true, message: 'Returned to ModVinny after combat.' };
  }
  const home = memory.get?.().homeBasePosition;
  if (home && config.returnHomeAfterBaseDefense) {
    try {
      await bot.pathfinder.goto(new GoalBlock(home.x, home.y, home.z));
    } catch (error) {
      if (isPathInterrupted(error)) return { ok: false, cancelled: true, message: 'Return home after combat was interrupted.' };
      throw error;
    }
    return { ok: true, message: 'Returned home after combat.' };
  }
  return { ok: true, message: 'Combat ended.' };
}
