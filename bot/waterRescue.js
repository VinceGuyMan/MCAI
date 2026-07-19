/**
 * Water survival + swimming.
 *
 * Design (playtest-driven):
 * 1) Detect wet with multi-sample + isInWater + oxygen (never false "dry").
 * 2) Surface for air when O2 is low.
 * 3) Find nearest dry/shallow stand with a bounded, strided scan (≤~36 blocks).
 * 4) MANUAL swim (look + forward + jump) — pathfinder only as last resort far away.
 * 5) If no horizontal progress (~hop in place): clear a whitelisted obstacle, then strafe.
 * 6) Place footing only when close to shore or no land found.
 * 7) Always release emergency move claim in finally; stop/come can force-cancel.
 */
import { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
import * as movement from './movementController.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals || {};
const activeWaterRescues = new WeakMap();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ok(message, data = {}) {
  return { ok: true, message, data };
}

function fail(reason, data = {}) {
  return { ok: false, reason, message: reason, data };
}

const EMERGENCY_DIG_BLOCKS = new Set([
  'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass', 'vine', 'cave_vines', 'cave_vines_plant',
  'dirt', 'coarse_dirt', 'rooted_dirt', 'mud', 'sand', 'red_sand', 'gravel', 'clay', 'snow'
]);

const EMERGENCY_FOOTING_BLOCKS = new Set([
  'dirt', 'coarse_dirt', 'rooted_dirt', 'mud', 'cobblestone', 'cobbled_deepslate',
  'stone', 'andesite', 'diorite', 'granite', 'deepslate', 'tuff', 'netherrack',
  'oak_planks', 'spruce_planks', 'birch_planks',
  'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks',
  'bamboo_planks', 'crimson_planks', 'warped_planks'
]);

function isFluidName(name) {
  const n = String(name || '');
  return n === 'water' || n === 'lava' || n === 'bubble_column'
    || n.includes('water')
    || n.includes('lava');
}

function isFluidBlock(block) {
  if (!block) return false;
  if (isFluidName(block.name)) return true;
  try {
    const props = typeof block.getProperties === 'function'
      ? block.getProperties()
      : (block._properties || block.properties || null);
    if (props && (props.waterlogged === true || props.waterlogged === 'true')) return true;
  } catch {
    // ignore
  }
  return false;
}

function isSolidStandable(block) {
  if (!block) return false;
  if (isFluidBlock(block)) return false;
  const n = String(block.name || '');
  if (n === 'air' || n === 'cave_air' || n === 'void_air') return false;
  if (n === 'short_grass' || n === 'tall_grass' || n === 'snow') return false;
  if (n.includes('kelp') || n.includes('seagrass') || n === 'bubble_column') return false;
  if (block.boundingBox && block.boundingBox !== 'block') return false;
  return true;
}

function isPlantPassable(block) {
  if (!block) return true;
  const n = String(block.name || '');
  return n === 'air' || n === 'cave_air' || n === 'void_air'
    || n === 'short_grass' || n === 'tall_grass' || n === 'snow'
    || n.includes('seagrass') || n.includes('kelp') || n === 'bubble_column'
    || n.includes('torch') || n === 'lily_pad' || n.includes('carpet');
}

function sampleFluidAt(bot, yOffset) {
  if (!bot?.entity?.position || !bot.blockAt) return false;
  const pos = bot.entity.position;
  for (const [dx, dy, dz] of [[0, yOffset, 0], [0.3, yOffset, 0], [-0.3, yOffset, 0], [0, yOffset, 0.3], [0, yOffset, -0.3]]) {
    try {
      if (isFluidBlock(bot.blockAt(pos.offset(dx, dy, dz)))) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

function hasSolidFloor(bot) {
  if (!bot?.entity?.position || !bot.blockAt) return false;
  for (const dy of [-0.15, -0.5, -1]) {
    const floor = bot.blockAt(bot.entity.position.offset(0, dy, 0));
    if (isSolidStandable(floor) && !isFluidBlock(floor)) return true;
  }
  return false;
}

export function botIsInFluid(bot) {
  if (!bot?.entity) return false;
  if (bot.entity.isInWater === true || bot.entity.isInLava === true) return true;
  if (sampleFluidAt(bot, 0) || sampleFluidAt(bot, 0.4) || sampleFluidAt(bot, 0.9)) return true;
  if (typeof bot.oxygenLevel === 'number' && bot.oxygenLevel < 20 && !hasSolidFloor(bot)) return true;
  return false;
}

export function botHeadInFluid(bot) {
  if (!bot?.entity) return false;
  if (sampleFluidAt(bot, 1.0) || sampleFluidAt(bot, 1.4) || sampleFluidAt(bot, 1.6)) return true;
  if (typeof bot.oxygenLevel === 'number' && bot.oxygenLevel < 20 && !hasSolidFloor(bot)) return true;
  return false;
}

export function botIsSafelyDry(bot) {
  if (!bot?.entity?.position || !bot.blockAt) return false;
  if (bot.entity.isInWater === true || bot.entity.isInLava === true) return false;
  if (sampleFluidAt(bot, 0) || sampleFluidAt(bot, 0.5) || sampleFluidAt(bot, 1.0) || sampleFluidAt(bot, 1.5)) return false;
  return hasSolidFloor(bot);
}

export function botNeedsWaterRescue(bot) {
  if (!bot?.entity) return false;
  if (botIsSafelyDry(bot)) return false;
  if (botIsInFluid(bot) || botHeadInFluid(bot)) return true;
  if (typeof bot.oxygenLevel === 'number' && bot.oxygenLevel < 20) return true;
  return false;
}

function surfaceOxygenThreshold(bot, options = {}) {
  const configured = options.surfaceOxygenThreshold
    ?? bot?.mcaiConfig?.waterSurfaceOxygenThreshold
    ?? 14;
  return Math.max(10, Math.min(18, Number(configured) || 14));
}

/**
 * Decide how to recover after a movement finishes in water. Reaching the
 * owner is not a reason to immediately swim away to a distant shore.
 */
export function waterRecoveryMode(bot, options = {}) {
  if (!botNeedsWaterRescue(bot)) return 'none';
  if (options.reachedTarget !== true) return 'shore_rescue';
  const oxygen = Number(bot?.oxygenLevel ?? 20);
  if (oxygen <= surfaceOxygenThreshold(bot, options) || botHeadInFluid(bot)) {
    return 'surface_near_target';
  }
  return 'hold_near_target';
}

function evaluateExitSpot(bot, x, y, z, readBlock = (position) => bot.blockAt(position)) {
  const floor = readBlock(new Vec3(x, y - 1, z));
  const feet = readBlock(new Vec3(x, y, z));
  const head = readBlock(new Vec3(x, y + 1, z));
  if (!isSolidStandable(floor)) return null;
  if (feet && isSolidStandable(feet) && !isPlantPassable(feet)) return null;
  if (head && isSolidStandable(head) && !isPlantPassable(head)) return null;
  const feetWet = isFluidBlock(feet);
  const headWet = isFluidBlock(head);
  if (!feetWet && !headWet) return { kind: 'dry', penalty: 0 };
  if (feetWet && !headWet) return { kind: 'shallow', penalty: 2.5 };
  return null;
}

/**
 * Nearest dry/shallow stand. Bounded rings prioritize nearby exits without
 * monopolizing the event loop during an oxygen emergency.
 */
export function findNearestDryStand(bot, options = {}) {
  if (!bot?.entity?.position || !bot.blockAt) return null;
  const radius = Math.max(12, Math.min(48, Number(options.radius || 36)));
  const origin = bot.entity.position;
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  const oz = Math.floor(origin.z);
  const candidates = [];
  const seen = new Set();
  const maxBlockReads = Math.max(300, Number(options.maxBlockReads || 9000));
  let blockReads = 0;

  function readBlock(position) {
    if (blockReads >= maxBlockReads) return null;
    blockReads += 1;
    return bot.blockAt(position);
  }

  function consider(x, y, z) {
    const key = `${x},${y},${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (blockReads >= maxBlockReads) return;
    const ev = evaluateExitSpot(bot, x, y, z, readBlock);
    if (!ev) return;
    const horiz = Math.hypot(x + 0.5 - origin.x, z + 0.5 - origin.z);
    const vert = Math.abs(y - origin.y);
    candidates.push({
      x, y, z,
      horiz,
      dist: origin.distanceTo(new Vec3(x + 0.5, y, z + 0.5)),
      kind: ev.kind,
      score: horiz + vert * 0.2 + ev.penalty
    });
  }

  const verticalOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
  scan:
  for (const dy of verticalOffsets) {
    for (let r = 1; r <= radius; r += 1) {
      const stride = r <= 10 ? 1 : r <= 24 ? 2 : 3;
      for (let dx = -r; dx <= r; dx += stride) {
        consider(ox + dx, oy + dy, oz - r);
        consider(ox + dx, oy + dy, oz + r);
        if (blockReads >= maxBlockReads) break scan;
      }
      for (let dz = -r + stride; dz <= r - stride; dz += stride) {
        consider(ox - r, oy + dy, oz + dz);
        consider(ox + r, oy + dy, oz + dz);
        if (blockReads >= maxBlockReads) break scan;
      }
      if (dy === 0 && candidates.some((c) => c.kind === 'dry' && c.horiz <= r) && r >= 8) break scan;
    }
  }

  // Supplement: named solids (bridges, beaches)
  if (bot.findBlocks) {
    const names = [
      'dirt', 'grass_block', 'sand', 'red_sand', 'gravel', 'clay', 'stone', 'cobblestone',
      'andesite', 'diorite', 'granite', 'deepslate', 'oak_planks', 'spruce_planks',
      'birch_planks', 'oak_log', 'sandstone', 'moss_block', 'mud', 'podzol'
    ];
    const ids = names.map((n) => bot.registry?.blocksByName?.[n]?.id).filter((id) => id !== undefined);
    try {
      const positions = bot.findBlocks({
        matching: ids.length ? ids : (b) => names.includes(b?.name),
        maxDistance: radius,
        count: 60
      }) || [];
      for (const p of positions) {
        consider(Math.floor(p.x), Math.floor(p.y) + 1, Math.floor(p.z));
        if (blockReads >= maxBlockReads) break;
      }
    } catch {
      // ignore
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  return { ...candidates[0], scanReads: blockReads };
}

function yawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function ownsClaim(memory, claimId = null) {
  if (!memory || !claimId) return true;
  return movement.getMoveClaim(memory)?.claimId === claimId;
}

function shouldAbort(memory, claimId = null, cancellation = null) {
  if (cancellation?.isCancelled?.() || cancellation?.getState?.().cancelled) return true;
  const mem = typeof memory?.get === 'function' ? memory.get() : memory;
  if (!mem) return false;
  if (mem.waterRescueAbort === true) return true;
  if (mem.lastManualStopAt && Date.now() - mem.lastManualStopAt < 2000) return true;
  if (claimId) {
    const current = movement.getMoveClaim(memory);
    if (!current || current.claimId !== claimId) return true;
  }
  return false;
}

export async function surfaceForAir(bot, options = {}) {
  const o2 = Number(bot?.oxygenLevel ?? 20);
  const maxMs = Math.max(600, Number(options.maxMs || (o2 < 8 ? 3000 : 1800)));
  const start = Date.now();
  const toward = options.toward || null;
  if (shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) return { ok: false };
  try { bot.clearControlStates?.(); } catch { /* ignore */ }

  while (Date.now() - start < maxMs) {
    if (shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) break;
    const oxygen = Number(bot?.oxygenLevel ?? 20);
    if (oxygen >= 18 && !sampleFluidAt(bot, 1.5)) break;
    try {
      if (toward) {
        const pos = bot.entity.position;
        const yaw = yawToward(pos, { x: toward.x + 0.5, z: toward.z + 0.5 });
        await bot.look(yaw, -0.85, true);
      } else {
        await bot.look(bot.entity?.yaw ?? 0, -1.1, true);
      }
      bot.setControlState?.('jump', true);
      bot.setControlState?.('sprint', true);
      // Pure surface when critical; otherwise surface while drifting shoreward
      bot.setControlState?.('forward', oxygen >= 8 && Boolean(toward));
    } catch { /* ignore */ }
    await wait(140);
  }
  try {
    if (!ownsClaim(options.memory, options.claimId)) return { ok: false };
    if (!shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) {
      bot.setControlState?.('jump', true);
      await wait(150);
    }
    bot.clearControlStates?.();
  } catch { /* ignore */ }
  return { ok: Number(bot?.oxygenLevel ?? 20) >= 14 || !sampleFluidAt(bot, 1.5) };
}

export function isEmergencyDiggableBlock(block) {
  if (!block || !block.name) return false;
  return !isFluidBlock(block) && EMERGENCY_DIG_BLOCKS.has(String(block.name));
}

/** Dig kelp/seagrass/soft block immediately ahead when hop-stuck. */
async function clearObstacleAhead(bot, options = {}) {
  if (!bot?.entity || !bot.blockAt) return false;
  const yaw = bot.entity.yaw ?? 0;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const base = bot.entity.position;
  for (const dist of [0.6, 1.0, 1.5, 2.0]) {
    for (const dy of [0, 0.5, 1.0, 1.5, -0.5]) {
      try {
        if (shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) return false;
        const b = bot.blockAt(base.offset(fx * dist, dy, fz * dist));
        if (!isEmergencyDiggableBlock(b)) continue;
        const safety = options.safety || bot.mcaiSafety;
        if (typeof safety?.safeToDig === 'function' && safety.safeToDig(b).ok === false) continue;
        if (shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) return false;
        await bot.dig(b, true).catch(() => {});
        return true;
      } catch { /* ignore */ }
    }
  }
  return false;
}

/**
 * Goal-directed manual swim. Vertical bobbing does not reset stuck detection.
 */
export async function manualSwimToward(bot, target, options = {}) {
  if (!target || !bot?.entity) return fail('no target');
  const maxMs = Math.max(1500, Number(options.maxMs || 6000));
  const memory = options.memory || null;
  const start = Date.now();
  const dest = new Vec3(
    Number(target.x) + (target.x % 1 === 0 ? 0.5 : 0),
    Number(target.y) + 0.5,
    Number(target.z) + (target.z % 1 === 0 ? 0.5 : 0)
  );
  // Normalize integer block coords
  if (Number.isInteger(target.x)) dest.x = target.x + 0.5;
  if (Number.isInteger(target.z)) dest.z = target.z + 0.5;

  if (shouldAbort(memory, options.claimId, options.cancellation || bot.mcaiCancellation)) return fail('swim aborted');

  try {
    movement.clearGoal(bot);
    bot.pathfinder?.stop?.();
    bot.clearControlStates?.();
  } catch { /* ignore */ }

  let lastPos = bot.entity.position.clone();
  let bestHorizontalDistance = Math.hypot(dest.x - lastPos.x, dest.z - lastPos.z);
  const startHorizontalDistance = bestHorizontalDistance;
  let lastProgressAt = Date.now();
  let strafeDir = 1;
  let minOxygen = Number(bot.oxygenLevel ?? 20);
  let surfaceAttempts = 0;

  while (Date.now() - start < maxMs) {
    if (shouldAbort(memory, options.claimId, options.cancellation || bot.mcaiCancellation)) break;
    if (botIsSafelyDry(bot)) break;

    const pos = bot.entity.position;
    const oxygen = Number(bot.oxygenLevel ?? 20);
    minOxygen = Math.min(minOxygen, oxygen);
    if (oxygen <= surfaceOxygenThreshold(bot, options) && botHeadInFluid(bot)) {
      surfaceAttempts += 1;
      const remainingMs = Math.max(600, maxMs - (Date.now() - start));
      await surfaceForAir(bot, {
        maxMs: Math.min(2600, remainingMs),
        toward: dest,
        memory,
        claimId: options.claimId,
        cancellation: options.cancellation || bot.mcaiCancellation
      });
      minOxygen = Math.min(minOxygen, Number(bot.oxygenLevel ?? 20));
      if (shouldAbort(memory, options.claimId, options.cancellation || bot.mcaiCancellation)) break;
      if (botIsSafelyDry(bot)) break;
      lastProgressAt = Date.now();
      bestHorizontalDistance = Math.hypot(dest.x - bot.entity.position.x, dest.z - bot.entity.position.z);
      continue;
    }
    const horizontalDistance = Math.hypot(dest.x - pos.x, dest.z - pos.z);
    if (horizontalDistance < bestHorizontalDistance - 0.3) {
      bestHorizontalDistance = horizontalDistance;
      lastPos = pos.clone();
      lastProgressAt = Date.now();
    } else if (Date.now() - lastProgressAt > 1100) {
      // Stuck hopping — dig then brief strafe
      await clearObstacleAhead(bot, options);
      if (shouldAbort(memory, options.claimId, options.cancellation || bot.mcaiCancellation)) break;
      try {
        bot.clearControlStates?.();
        bot.setControlState?.(strafeDir > 0 ? 'left' : 'right', true);
        bot.setControlState?.('jump', true);
        await wait(350);
        bot.clearControlStates?.();
        strafeDir *= -1;
      } catch { /* ignore */ }
      lastProgressAt = Date.now();
      lastPos = bot.entity.position.clone();
      bestHorizontalDistance = Math.hypot(dest.x - lastPos.x, dest.z - lastPos.z);
    }

    try {
      const o2 = Number(bot.oxygenLevel ?? 20);
      const yaw = yawToward(pos, dest);
      // Horizontal-ish look so forward actually moves; slight up for surface
      const pitch = o2 < 10 ? -0.9 : -0.25;
      await bot.look(yaw, pitch, true);
      bot.setControlState?.('forward', true);
      bot.setControlState?.('sprint', true);
      // Pulse jump: always in deep water, alternate near surface to avoid thrash
      const pulse = Math.floor((Date.now() - start) / 200) % 3 !== 0;
      bot.setControlState?.('jump', o2 < 14 || pulse);
    } catch { /* ignore */ }
    await wait(120);
  }

  if (ownsClaim(memory, options.claimId)) {
    try { bot.clearControlStates?.(); } catch { /* ignore */ }
  }
  const endHorizontalDistance = Math.hypot(
    dest.x - bot.entity.position.x,
    dest.z - bot.entity.position.z
  );
  return ok('manual swim burst', {
    dry: botIsSafelyDry(bot),
    durationMs: Date.now() - start,
    startHorizontalDistance,
    endHorizontalDistance,
    minOxygen,
    endOxygen: Number(bot.oxygenLevel ?? 20),
    surfaceAttempts
  });
}

export function chooseEmergencyFooting(items = []) {
  return items.find((item) => item?.count > 0 && EMERGENCY_FOOTING_BLOCKS.has(String(item.name))) || null;
}

async function placeEmergencyFooting(bot, toward = null, options = {}) {
  if (shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) return fail('rescue aborted');
  const items = bot.inventory?.items?.() || [];
  const stack = chooseEmergencyFooting(items);
  if (!stack) return fail('no placeable blocks');

  try { await bot.equip(stack, 'hand'); } catch (e) { return fail(e.message); }

  const origin = bot.entity.position.floored();
  const sx = toward ? Math.sign(toward.x - origin.x) || 0 : 0;
  const sz = toward ? Math.sign(toward.z - origin.z) || 0 : 0;
  const tries = [
    { refOff: new Vec3(0, -2, 0), face: new Vec3(0, 1, 0) },
    { refOff: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) }
  ];
  if (sx || sz) {
    tries.push({ refOff: new Vec3(sx, -1, sz), face: new Vec3(0, 1, 0) });
    tries.push({ refOff: new Vec3(sx, 0, sz), face: new Vec3(-sx || 0, 0, -sz || 0) });
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    tries.push({ refOff: new Vec3(dx, -1, dz), face: new Vec3(0, 1, 0) });
    tries.push({ refOff: new Vec3(dx, 0, dz), face: new Vec3(-dx, 0, -dz) });
  }

  for (const { refOff, face } of tries) {
    if (shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) return fail('rescue aborted');
    const ref = bot.blockAt(origin.offset(refOff.x, refOff.y, refOff.z));
    if (!ref || !isSolidStandable(ref)) continue;
    try {
      await bot.lookAt(ref.position.offset(0.5, 0.5, 0.5), true);
      if (shouldAbort(options.memory, options.claimId, options.cancellation || bot.mcaiCancellation)) return fail('rescue aborted');
      await bot.placeBlock(ref, face);
      await wait(200);
      const placed = bot.blockAt(ref.position.offset(face.x, face.y, face.z));
      if (isSolidStandable(placed)) return ok('placed footing');
    } catch { /* next */ }
  }
  return fail('could not place footing');
}

function applySwimProfile(bot) {
  const previous = movement.applyProfile(bot, 'swim', { ...(bot.mcaiConfig || {}), swimLiquidCost: 1 });
  try {
    if (bot.pathfinder?.movements) {
      bot.pathfinder.movements.liquidCost = 1;
      bot.pathfinder.movements.canDig = false;
      const avoid = bot.pathfinder.movements.blocksToAvoid;
      if (avoid && bot.registry?.blocksByName) {
        for (const name of Object.keys(bot.registry.blocksByName)) {
          if (/water|bubble_column|kelp|seagrass/.test(name)) {
            const id = bot.registry.blocksByName[name]?.id;
            if (id !== undefined) avoid.delete(id);
          }
        }
      }
    }
  } catch { /* ignore */ }
  return previous;
}

/** Abort flag for stop / higher-priority come. */
export function abortWaterRescue(memory) {
  if (typeof memory?.update === 'function') {
    memory.update({ waterRescueAbort: true, lastWaterRescueAt: Date.now() });
  }
  movement.releaseMove(memory, 'water_rescue', { clearMode: true });
}

/**
 * Swim toward any target (owner or stand). Used by come-here across water.
 */
export async function swimToTarget(bot, target, options = {}) {
  if (!bot?.entity || !target) return fail('no target');
  if (botIsSafelyDry(bot)) return ok('Already dry; hand off to normal pathing.', { dry: true, handoff: true });
  const memory = options.memory || bot.mcaiMemory || null;
  const cancellation = options.cancellation || bot.mcaiCancellation || null;
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 20000));
  const started = Date.now();
  const startOxygen = Number(bot.oxygenLevel ?? 20);
  let minOxygen = startOxygen;
  let surfaceAttempts = 0;
  const point = {
    x: Math.floor(target.x ?? target.position?.x ?? 0),
    y: Math.floor(target.y ?? target.position?.y ?? bot.entity.position.y),
    z: Math.floor(target.z ?? target.position?.z ?? 0)
  };

  const moveOwner = options.moveOwner || 'water_rescue';
  let claimId = null;
  if (memory) {
    const claimed = movement.claimMove(memory, {
      owner: moveOwner,
      priority: options.priority || 'emergency',
      kind: 'emergency',
      reason: 'swim to target',
      ttlMs: timeoutMs + 3000,
      movementMode: 'water_swim',
      force: options.force === true
    });
    if (!claimed.ok) return fail(claimed.reason || 'path busy', claimed.data);
    claimId = claimed.data?.claim?.claimId || null;
    memory.update?.({ waterRescueAbort: false });
  }

  let previousProfile = null;
  try {
    previousProfile = applySwimProfile(bot);
    movement.clearGoal(bot);
    while (Date.now() - started < timeoutMs) {
      if (shouldAbort(memory, claimId, cancellation)) return fail('swim aborted');
      const beforeBurst = bot.entity.position;
      const distanceBeforeBurst = Math.hypot(
        point.x + 0.5 - beforeBurst.x,
        point.z + 0.5 - beforeBurst.z
      );
      if (distanceBeforeBurst <= Number(options.range || 2.5)) {
        return ok('Reached swim target.', {
          dry: botIsSafelyDry(bot),
          durationMs: Date.now() - started,
          startOxygen,
          minOxygen,
          endOxygen: Number(bot.oxygenLevel ?? 20),
          endHorizontalDistance: distanceBeforeBurst,
          surfaceAttempts
        });
      }
      const o2 = Number(bot.oxygenLevel ?? 20);
      minOxygen = Math.min(minOxygen, o2);
      if (o2 <= surfaceOxygenThreshold(bot, options) && botHeadInFluid(bot)) {
        surfaceAttempts += 1;
        await surfaceForAir(bot, { maxMs: 2600, toward: point, memory, claimId, cancellation });
        minOxygen = Math.min(minOxygen, Number(bot.oxygenLevel ?? 20));
      }
      const burst = await manualSwimToward(bot, point, {
        maxMs: Math.min(5000, timeoutMs - (Date.now() - started)),
        memory,
        claimId,
        cancellation,
        surfaceOxygenThreshold: surfaceOxygenThreshold(bot, options)
      });
      surfaceAttempts += Number(burst.data?.surfaceAttempts || 0);
      minOxygen = Math.min(minOxygen, Number(burst.data?.minOxygen ?? bot.oxygenLevel ?? 20));
      if (shouldAbort(memory, claimId, cancellation)) return fail('swim aborted');
      const pos = bot.entity.position;
      const horiz = Math.hypot(point.x + 0.5 - pos.x, point.z + 0.5 - pos.z);
      if (horiz <= Number(options.range || 2.5)) {
        return ok('Reached swim target.', {
          dry: botIsSafelyDry(bot),
          durationMs: Date.now() - started,
          startOxygen,
          minOxygen,
          endOxygen: Number(bot.oxygenLevel ?? 20),
          endHorizontalDistance: horiz,
          surfaceAttempts
        });
      }
      if (botIsSafelyDry(bot) && horiz <= 4) {
        return ok('Reached dry near target.', {
          dry: true,
          durationMs: Date.now() - started,
          startOxygen,
          minOxygen,
          endOxygen: Number(bot.oxygenLevel ?? 20),
          endHorizontalDistance: horiz,
          surfaceAttempts
        });
      }
      if (botIsSafelyDry(bot)) {
        return ok('Reached dry ground; hand off to normal pathing.', {
          dry: true,
          handoff: true,
          durationMs: Date.now() - started,
          startOxygen,
          minOxygen,
          endOxygen: Number(bot.oxygenLevel ?? 20),
          endHorizontalDistance: horiz,
          surfaceAttempts
        });
      }
      await wait(50);
    }
    return fail('swim timeout', {
      dry: botIsSafelyDry(bot),
      durationMs: Date.now() - started,
      startOxygen,
      minOxygen,
      endOxygen: Number(bot.oxygenLevel ?? 20),
      endHorizontalDistance: Math.hypot(
        point.x + 0.5 - bot.entity.position.x,
        point.z + 0.5 - bot.entity.position.z
      ),
      surfaceAttempts
    });
  } finally {
    if (ownsClaim(memory, claimId)) {
      try { bot.clearControlStates?.(); } catch { /* ignore */ }
      movement.clearGoal(bot);
      movement.restoreProfile(bot, previousProfile);
      if (memory && claimId) {
        const released = movement.releaseMove(memory, moveOwner, { claimId, clearMode: true });
        if (released.ok) memory.update?.({ waterRescueAbort: false });
      }
    }
  }
}

/**
 * Full shore rescue: air → find land → swim → dig stuck → place if needed.
 */
async function runWaterRescue(bot, options = {}) {
  if (!bot?.entity) return fail('not spawned');
  if (!options.force && !botNeedsWaterRescue(bot)) {
    return ok('Already on dry land.', { dry: true });
  }

  const memory = options.memory || bot.mcaiMemory || null;
  const cancellation = options.cancellation || bot.mcaiCancellation || null;
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 32000));
  const started = Date.now();
  const ownerName = options.ownerUsername || bot.mcaiConfig?.ownerUsername || 'ModVinny';
  const scanRadius = Number(options.radius || 36);

  let claimId = null;
  if (memory) {
    const claimed = movement.claimMove(memory, {
      owner: 'water_rescue',
      priority: 'emergency',
      kind: 'emergency',
      reason: 'water shore rescue',
      ttlMs: Math.min(timeoutMs + 2000, 40000),
      movementMode: 'water_rescue',
      force: options.force === true
    });
    if (!claimed.ok) return fail(claimed.reason || 'path busy', claimed.data);
    claimId = claimed.data?.claim?.claimId || null;
    memory.update?.({ waterRescueAbort: false });
  }

  let previousProfile = null;
  try {
    previousProfile = applySwimProfile(bot);
    movement.clearGoal(bot);
    try { bot.pathfinder?.stop?.(); } catch { /* ignore */ }

    await surfaceForAir(bot, { maxMs: 2200, memory, claimId, cancellation });
    if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
    if (botIsSafelyDry(bot)) return ok('Surfaced onto safety.', { dry: true });

    let stand = findNearestDryStand(bot, { radius: scanRadius });
    const owner = bot.players?.[ownerName]?.entity;
    if (owner?.position) {
      try {
        const ox = Math.floor(owner.position.x);
        const oy = Math.floor(owner.position.y);
        const oz = Math.floor(owner.position.z);
        const spot = evaluateExitSpot(bot, ox, oy, oz);
        if (spot) {
          const oDist = bot.entity.position.distanceTo(owner.position);
          if (!stand || oDist < (stand.horiz ?? 99) + 2) {
            stand = { x: ox, y: oy, z: oz, horiz: oDist, kind: spot.kind, dist: oDist };
          }
        }
      } catch { /* ignore */ }
    }

    let loops = 0;
    while (Date.now() - started < timeoutMs && !botIsSafelyDry(bot) && loops < 24) {
      if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
      loops += 1;
      const o2 = Number(bot.oxygenLevel ?? 20);

      if (o2 < 9) {
        await surfaceForAir(bot, { maxMs: 2500, toward: stand, memory, claimId, cancellation });
        if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
        if (botIsSafelyDry(bot)) break;
      }

      if (!stand || loops % 2 === 0) {
        stand = findNearestDryStand(bot, { radius: scanRadius }) || stand;
      }

      if (stand) {
        const horiz = Math.hypot(
          stand.x + 0.5 - bot.entity.position.x,
          stand.z + 0.5 - bot.entity.position.z
        );
        await manualSwimToward(bot, stand, {
          maxMs: horiz <= 10 ? 4500 : 6000,
          memory,
          claimId,
          cancellation
        });
        if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
        if (botIsSafelyDry(bot)) break;

        if (horiz <= 5) {
          await placeEmergencyFooting(bot, stand, { memory, claimId, cancellation });
          if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
          await manualSwimToward(bot, stand, { maxMs: 2500, memory, claimId, cancellation });
          if (botIsSafelyDry(bot)) break;
        }

        // Far shore only: brief pathfinder assist (often fails; manual is primary)
        if (horiz > 14 && o2 >= 12 && bot.pathfinder?.goto && GoalNear) {
          if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
          applySwimProfile(bot);
          try {
            movement.clearGoal(bot);
            await Promise.race([
              bot.pathfinder.goto(new GoalNear(stand.x, stand.y, stand.z, 2)),
              wait(3000).then(() => { throw new Error('timeout'); })
            ]);
          } catch {
            if (ownsClaim(memory, claimId)) movement.clearGoal(bot);
          }
        }
      } else {
        await surfaceForAir(bot, { maxMs: 1000, memory, claimId, cancellation });
        if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
        // Spiral search for land
        try {
          const yaw = (bot.entity?.yaw || 0) + 0.9;
          await bot.look(yaw, -0.3, true);
          bot.setControlState?.('forward', true);
          bot.setControlState?.('jump', true);
          await wait(800);
          if (ownsClaim(memory, claimId)) bot.clearControlStates?.();
        } catch { /* ignore */ }
        if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
        await placeEmergencyFooting(bot, null, { memory, claimId, cancellation });
        stand = findNearestDryStand(bot, { radius: 48 });
      }

      if (!botIsSafelyDry(bot) && loops % 2 === 0) {
        if (shouldAbort(memory, claimId, cancellation)) return fail('rescue aborted');
        await placeEmergencyFooting(bot, stand, { memory, claimId, cancellation });
      }
    }

    if (botIsSafelyDry(bot)) return ok('Reached shore / dry ground.', { dry: true, stand });
    await surfaceForAir(bot, { maxMs: 2000, toward: stand, memory, claimId, cancellation });
    if (botIsSafelyDry(bot)) return ok('Reached shore / dry ground.', { dry: true });
    return fail('Still in water — need land nearby or more blocks to bridge out.', {
      dry: false,
      oxygen: bot.oxygenLevel,
      stand: stand || null
    });
  } finally {
    const current = ownsClaim(memory, claimId);
    if (current) {
      try { bot.clearControlStates?.(); } catch { /* ignore */ }
      movement.clearGoal(bot);
      try { bot.pathfinder?.stop?.(); } catch { /* ignore */ }
      movement.restoreProfile(bot, previousProfile);
    }
    if (memory) {
      const released = current && claimId
        ? movement.releaseMove(memory, 'water_rescue', { claimId, clearMode: true })
        : { ok: false };
      memory.update?.({
        ...(released.ok ? { waterRescueAbort: false } : {}),
        lastWaterRescueAt: Date.now()
      });
    }
  }
}

export function rescueFromWater(bot, options = {}) {
  if (bot && typeof bot === 'object') {
    const active = activeWaterRescues.get(bot);
    if (active) return active;
  }
  const rescue = runWaterRescue(bot, options);
  if (bot && typeof bot === 'object') {
    activeWaterRescues.set(bot, rescue);
    rescue.finally(() => {
      if (activeWaterRescues.get(bot) === rescue) activeWaterRescues.delete(bot);
    }).catch(() => {});
  }
  return rescue;
}

export async function ensureNotDrowning(bot, options = {}) {
  if (!botNeedsWaterRescue(bot)) return ok('dry', { dry: true, skipped: true });
  const o2 = Number(bot?.oxygenLevel ?? 20);
  const minO2 = Number(options.minOxygen ?? 12);
  if (o2 > minO2 + 4 && options.onlyIfLowOxygen) {
    return ok('oxygen ok', { skipped: true, oxygen: o2 });
  }
  return rescueFromWater(bot, options);
}

export default {
  botIsInFluid,
  botHeadInFluid,
  botIsSafelyDry,
  botNeedsWaterRescue,
  waterRecoveryMode,
  isEmergencyDiggableBlock,
  chooseEmergencyFooting,
  findNearestDryStand,
  manualSwimToward,
  surfaceForAir,
  swimToTarget,
  rescueFromWater,
  ensureNotDrowning,
  abortWaterRescue
};
