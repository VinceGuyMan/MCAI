/**
 * Water survival: surface for air, swim/path to nearest dry land,
 * optionally place emergency blocks to get out of deep water.
 */
import { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
import * as movement from './movementController.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals || {};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ok(message, data = {}) {
  return { ok: true, message, data };
}

function fail(reason, data = {}) {
  return { ok: false, reason, message: reason, data };
}

function isFluidName(name) {
  return name === 'water' || name === 'lava' || name === 'bubble_column'
    || String(name || '').includes('water')
    || String(name || '').includes('lava');
}

export function botIsInFluid(bot) {
  if (!bot?.entity?.position || !bot.blockAt) return false;
  const feet = bot.blockAt(bot.entity.position);
  const head = bot.blockAt(bot.entity.position.offset(0, 1, 0));
  return Boolean((feet && isFluidName(feet.name)) || (head && isFluidName(head.name)));
}

export function botHeadInFluid(bot) {
  if (!bot?.entity?.position || !bot.blockAt) return false;
  const head = bot.blockAt(bot.entity.position.offset(0, 1, 0));
  return Boolean(head && isFluidName(head.name));
}

function isSolidStandable(block) {
  if (!block) return false;
  if (isFluidName(block.name)) return false;
  if (block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') return false;
  if (block.name === 'short_grass' || block.name === 'tall_grass' || block.name === 'snow') return false;
  if (block.boundingBox && block.boundingBox !== 'block') return false;
  return true;
}

function isStandSpot(bot, x, y, z) {
  const floor = bot.blockAt(new Vec3(x, y - 1, z));
  const feet = bot.blockAt(new Vec3(x, y, z));
  const head = bot.blockAt(new Vec3(x, y + 1, z));
  if (!isSolidStandable(floor)) return false;
  if (feet && isFluidName(feet.name)) return false;
  if (head && isFluidName(head.name)) return false;
  if (feet && isSolidStandable(feet)) return false;
  if (head && isSolidStandable(head)) return false;
  return true;
}

/**
 * Find nearest dry stand coordinates within radius.
 */
export function findNearestDryStand(bot, options = {}) {
  if (!bot?.entity?.position || !bot.findBlocks) return null;
  const radius = Math.max(8, Number(options.radius || 32));
  const origin = bot.entity.position;
  const standNames = [
    'dirt', 'grass_block', 'coarse_dirt', 'podzol', 'mycelium', 'mud',
    'sand', 'red_sand', 'gravel', 'clay',
    'stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'deepslate', 'tuff',
    'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
    'oak_planks', 'spruce_planks', 'birch_planks',
    'sandstone', 'path', 'farmland'
  ];
  const ids = standNames.map((n) => bot.registry?.blocksByName?.[n]?.id).filter((id) => id !== undefined);
  let positions = [];
  try {
    positions = bot.findBlocks({
      matching: ids.length ? ids : (b) => standNames.includes(b?.name),
      maxDistance: radius,
      count: 80
    }) || [];
  } catch {
    return null;
  }

  const candidates = [];
  for (const p of positions) {
    // Stand on top of solid block
    const standY = Math.floor(p.y) + 1;
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    if (!isStandSpot(bot, x, standY, z)) continue;
    // Prefer not underwater stand (double-check)
    const feet = bot.blockAt(new Vec3(x, standY, z));
    if (feet && isFluidName(feet.name)) continue;
    const dist = origin.distanceTo(new Vec3(x + 0.5, standY, z + 0.5));
    candidates.push({ x, y: standY, z, dist, score: dist - (standY - origin.y) * 0.15 });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}

/**
 * Swim/surface toward air: hold jump + forward briefly while submerged.
 */
async function surfaceForAir(bot, options = {}) {
  const maxMs = Math.max(800, Number(options.maxMs || 2500));
  const start = Date.now();
  try {
    bot.clearControlStates?.();
  } catch {
    // ignore
  }
  while (Date.now() - start < maxMs) {
    if (!botIsInFluid(bot) && !botHeadInFluid(bot)) break;
    try {
      bot.setControlState?.('jump', true);
      bot.setControlState?.('sprint', true);
      // Slight forward helps reach shore while rising
      bot.setControlState?.('forward', true);
    } catch {
      // ignore
    }
    await wait(200);
    // Look slightly up
    try {
      const yaw = bot.entity?.yaw ?? 0;
      await bot.look(yaw, -0.6, true);
    } catch {
      // ignore
    }
  }
  try {
    bot.clearControlStates?.();
  } catch {
    // ignore
  }
  return { ok: !botHeadInFluid(bot), inFluid: botIsInFluid(bot) };
}

/**
 * Place a disposable block to create footing (under/toward shore).
 * mineflayer: placeBlock(referenceBlock, faceVector).
 */
async function placeEmergencyFooting(bot, toward = null) {
  const placeables = [
    'dirt', 'cobblestone', 'stone', 'andesite', 'diorite', 'granite',
    'netherrack', 'oak_planks', 'spruce_planks', 'birch_planks',
    'oak_log', 'spruce_log', 'sand', 'gravel'
  ];
  const items = bot.inventory?.items?.() || [];
  const stack = items.find((i) => placeables.includes(i.name) && i.count > 0);
  if (!stack) return fail('no placeable blocks for water escape');

  try {
    await bot.equip(stack, 'hand');
  } catch (error) {
    return fail(`equip failed: ${error.message}`);
  }

  const origin = bot.entity.position.floored();
  // Reference solids near the bot + face vectors to place against
  const tries = [];
  const sx = toward ? Math.sign(toward.x - origin.x) || 0 : 0;
  const sz = toward ? Math.sign(toward.z - origin.z) || 0 : 0;
  // Prefer placing under feet on anything solid we can touch
  tries.push({ refOff: new Vec3(0, -2, 0), face: new Vec3(0, 1, 0) });
  tries.push({ refOff: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) });
  if (sx || sz) {
    tries.push({ refOff: new Vec3(sx, -1, sz), face: new Vec3(0, 1, 0) });
    tries.push({ refOff: new Vec3(sx, 0, sz), face: new Vec3(-sx || 0, 0, -sz || 0) });
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    tries.push({ refOff: new Vec3(dx, -1, dz), face: new Vec3(0, 1, 0) });
    tries.push({ refOff: new Vec3(dx, 0, dz), face: new Vec3(-dx, 0, -dz) });
  }

  for (const { refOff, face } of tries) {
    const ref = bot.blockAt(origin.plus(refOff));
    if (!ref || !isSolidStandable(ref)) continue;
    try {
      await bot.lookAt(ref.position.offset(0.5, 0.5, 0.5), true);
      await bot.placeBlock(ref, face);
      await wait(250);
      return ok('placed footing');
    } catch {
      // try next
    }
  }
  return fail('could not place footing');
}

/**
 * Full rescue: get air → find land → swim/path there → place blocks if needed.
 */
export async function rescueFromWater(bot, options = {}) {
  if (!bot?.entity) return fail('not spawned');
  if (!botIsInFluid(bot) && !botHeadInFluid(bot)) {
    return ok('Already on dry land.', { dry: true });
  }

  const memory = options.memory || bot.mcaiMemory || null;
  const timeoutMs = Math.max(8000, Number(options.timeoutMs || 25000));
  const started = Date.now();
  const ownerName = options.ownerUsername || bot.mcaiConfig?.ownerUsername || 'ModVinny';

  // Claim emergency priority so soft-follow/flee don't thrash us mid-rescue.
  if (memory) {
    movement.claimMove(memory, {
      owner: 'water_rescue',
      priority: 'emergency',
      kind: 'emergency',
      reason: 'water shore rescue',
      ttlMs: timeoutMs + 5000,
      movementMode: 'water_rescue'
    });
  }

  try {
    // Phase 1: surface for air
    await surfaceForAir(bot, { maxMs: 2000 });
    if (!botIsInFluid(bot) && !botHeadInFluid(bot)) {
      return ok('Surfaced onto safety.', { dry: true });
    }

    // Phase 2: locate nearest dry stand (or owner if on land)
    let stand = findNearestDryStand(bot, { radius: Number(options.radius || 40) });
    const owner = bot.players?.[ownerName]?.entity;
    if (owner?.position) {
      try {
        const ownerFeet = bot.blockAt(owner.position);
        const ownerFloor = bot.blockAt(owner.position.offset(0, -1, 0));
        const ownerDry = (!ownerFeet || !isFluidName(ownerFeet.name)) && isSolidStandable(ownerFloor);
        if (ownerDry) {
          const oDist = bot.entity.position.distanceTo(owner.position);
          if (!stand || oDist < (stand.dist || 99) + 4) {
            stand = {
              x: Math.floor(owner.position.x),
              y: Math.floor(owner.position.y),
              z: Math.floor(owner.position.z),
              dist: oDist
            };
          }
        }
      } catch {
        // ignore
      }
    }

    // Phase 3: swim/path with swim-friendly profile (low liquid cost)
    if (stand && bot.pathfinder?.goto && GoalNear) {
      movement.applyProfile(bot, 'default', {
        ...(bot.mcaiConfig || {}),
        defaultLiquidCost: 1 // allow swimming to shore
      });
      // Override to very swim-friendly
      try {
        if (bot.pathfinder.movements) {
          bot.pathfinder.movements.liquidCost = 1;
          bot.pathfinder.movements.canDig = true;
        }
      } catch {
        // ignore
      }

      while (Date.now() - started < timeoutMs && botIsInFluid(bot)) {
        await surfaceForAir(bot, { maxMs: 600 });
        try {
          movement.clearGoal(bot);
          await Promise.race([
            bot.pathfinder.goto(new GoalNear(stand.x, stand.y, stand.z, 1)),
            wait(6000).then(() => {
              throw Object.assign(new Error('swim path timeout'), { timeout: true });
            })
          ]);
        } catch {
          movement.clearGoal(bot);
        }
        if (!botIsInFluid(bot)) break;

        // Place footing toward shore if still wet
        const place = await placeEmergencyFooting(bot, stand);
        if (place.ok) {
          try {
            bot.setControlState?.('jump', true);
            await wait(300);
            bot.setControlState?.('jump', false);
            bot.setControlState?.('forward', true);
            await wait(400);
            bot.setControlState?.('forward', false);
          } catch {
            // ignore
          }
        } else {
          // Re-scan land occasionally
          stand = findNearestDryStand(bot, { radius: 48 }) || stand;
        }
        await wait(150);
      }
    } else {
      // No land found — keep surfacing + place under feet + move randomly toward higher ground
      let attempts = 0;
      while (Date.now() - started < timeoutMs && botIsInFluid(bot) && attempts < 12) {
        attempts += 1;
        await surfaceForAir(bot, { maxMs: 800 });
        await placeEmergencyFooting(bot, null);
        try {
          bot.setControlState?.('forward', true);
          bot.setControlState?.('jump', true);
          await wait(500);
          bot.clearControlStates?.();
        } catch {
          // ignore
        }
      }
    }

    const dry = !botIsInFluid(bot) && !botHeadInFluid(bot);
    if (dry) return ok('Reached shore / dry ground.', { dry: true });
    return fail('Still in water — need land nearby or more blocks to bridge out.', {
      dry: false,
      oxygen: bot.oxygenLevel
    });
  } finally {
    try {
      bot.clearControlStates?.();
    } catch {
      // ignore
    }
    movement.applyProfile(bot, 'dry', bot.mcaiConfig || {});
    if (memory) {
      movement.releaseMove(memory, 'water_rescue', { force: true, clearMode: true });
    }
  }
}

/**
 * Call when oxygen is low or stuck in water; safe to spam (cooldowned by caller).
 */
export async function ensureNotDrowning(bot, options = {}) {
  const o2 = Number(bot?.oxygenLevel ?? 20);
  const minO2 = Number(options.minOxygen ?? bot?.mcaiConfig?.minOxygenToDig ?? 12);
  const inWater = botIsInFluid(bot) || botHeadInFluid(bot);
  if (!inWater) return ok('dry', { dry: true, skipped: true });
  if (o2 > minO2 + 4 && options.onlyIfLowOxygen) {
    return ok('oxygen ok for now', { dry: false, skipped: true, oxygen: o2 });
  }
  return rescueFromWater(bot, options);
}

export default {
  botIsInFluid,
  botHeadInFluid,
  findNearestDryStand,
  rescueFromWater,
  ensureNotDrowning
};
