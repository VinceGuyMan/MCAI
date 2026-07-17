/**
 * Central pathfinding owner for MCAI.
 * Prevents soft-follow / flee / collect from fighting over pathfinder goals.
 *
 * Priority (higher wins):
 *   stop/emergency > job(collect/dig) > come > flee > follow > soft_follow > idle
 */
import pathfinderPkg from 'mineflayer-pathfinder';

const { goals, Movements } = pathfinderPkg;
const { GoalNear, GoalFollow, GoalLookAtBlock } = goals || {};

export const MOVE_PRIORITY = {
  stop: 100,
  emergency: 90,
  job: 70,
  come: 60,
  flee: 55,
  follow: 50,
  soft_follow: 20,
  idle: 0
};

const DEFAULT_TIMEOUT = {
  come: 45000,
  follow: 30000,
  job: 25000,
  soft_follow: 20000,
  emergency: 15000,
  flee: 20000
};

function now() {
  return Date.now();
}

function memGet(memory) {
  return typeof memory?.get === 'function' ? (memory.get() || {}) : (memory || {});
}

function memUpdate(memory, patch) {
  if (typeof memory?.update === 'function') return memory.update(patch);
  if (memory && typeof memory === 'object') Object.assign(memory, patch);
  return memory;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ok(message, data = {}) {
  return { ok: true, message, data };
}

function fail(reason, data = {}) {
  return { ok: false, reason, message: reason, data };
}

/**
 * Current movement claim from memory (or null).
 */
export function getMoveClaim(memory) {
  const mem = memGet(memory);
  const claim = mem.moveClaim;
  if (!claim || !claim.owner) return null;
  // Auto-expire stale claims (crashed job left lock held)
  if (claim.expiresAt && now() > claim.expiresAt) return null;
  return claim;
}

export function getMovePriority(name) {
  const key = String(name || 'idle').toLowerCase();
  return MOVE_PRIORITY[key] ?? MOVE_PRIORITY.idle;
}

/**
 * True if a new claim with this priority may take the pathfinder.
 */
export function canClaimMove(memory, priority, owner = null) {
  const current = getMoveClaim(memory);
  if (!current) return true;
  if (owner && current.owner === owner) return true;
  const p = typeof priority === 'number' ? priority : getMovePriority(priority);
  return p >= Number(current.priority || 0);
}

/**
 * Claim exclusive pathfinder control.
 * @returns {{ ok: boolean, reason?: string, claim?: object }}
 */
export function claimMove(memory, options = {}) {
  const owner = options.owner || options.reason || `move_${now()}`;
  const priority = typeof options.priority === 'number'
    ? options.priority
    : getMovePriority(options.priority || options.kind || 'job');
  const ttlMs = Math.max(5000, Number(options.ttlMs || 180000));
  const current = getMoveClaim(memory);

  if (current && current.owner !== owner && priority < Number(current.priority || 0)) {
    return fail(`path busy (${current.kind || current.owner}, p=${current.priority})`, { current });
  }

  const claim = {
    owner,
    priority,
    kind: options.kind || options.priority || 'job',
    reason: options.reason || '',
    claimedAt: now(),
    expiresAt: now() + ttlMs
  };
  memUpdate(memory, {
    moveClaim: claim,
    movementMode: options.movementMode || memGet(memory).movementMode || claim.kind
  });
  return ok('claimed', { claim });
}

/**
 * Release claim if we still own it (or force).
 */
export function releaseMove(memory, owner = null, options = {}) {
  const current = getMoveClaim(memory);
  if (!current) return ok('already free');
  if (!options.force && owner && current.owner !== owner) {
    return fail('not claim owner', { current });
  }
  memUpdate(memory, {
    moveClaim: null,
    ...(options.clearMode ? { movementMode: null } : {})
  });
  return ok('released', { previous: current });
}

export function isMoveBusy(memory, minPriority = MOVE_PRIORITY.job) {
  const current = getMoveClaim(memory);
  if (!current) return false;
  return Number(current.priority || 0) >= minPriority;
}

/**
 * Clear pathfinder goal safely.
 */
export function clearGoal(bot) {
  if (typeof bot?.pathfinder?.setGoal === 'function') {
    try {
      bot.pathfinder.setGoal(null);
      return;
    } catch {
      // fall through
    }
  }
  try {
    bot?.pathfinder?.stop?.();
  } catch {
    // ignore
  }
}

function addFluidAvoid(movements, bot) {
  if (!movements?.blocksToAvoid || !bot?.registry?.blocksByName) return;
  for (const name of ['water', 'lava', 'bubble_column', 'fire', 'soul_fire', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass', 'magma_block']) {
    const id = bot.registry.blocksByName[name]?.id;
    if (id !== undefined && id !== null) movements.blocksToAvoid.add(id);
  }
  for (const [name, entry] of Object.entries(bot.registry.blocksByName || {})) {
    if ((/water|lava/.test(name)) && entry?.id !== undefined) movements.blocksToAvoid.add(entry.id);
  }
}

/**
 * Build a Movements profile.
 * @param {'default'|'dry'|'dig'|'follow'|'scout'} profile
 */
export function buildMovements(bot, profile = 'default', config = {}) {
  if (!bot || !Movements) return null;
  const m = new Movements(bot);
  m.canDig = profile === 'dig' || profile === 'default' || profile === 'dry';
  m.allowSprinting = profile !== 'dig';
  if ('allow1by1' in m) m.allow1by1 = true;
  if ('dontCreateFlow' in m) m.dontCreateFlow = true;

  const baseLiquid = Number(config.defaultLiquidCost || 80);
  if (profile === 'dry' || profile === 'dig' || profile === 'scout') {
    m.liquidCost = 10000;
    addFluidAvoid(m, bot);
  } else if (profile === 'follow') {
    m.liquidCost = Math.max(200, baseLiquid * 3);
    addFluidAvoid(m, bot);
  } else {
    m.liquidCost = Math.max(80, baseLiquid);
    addFluidAvoid(m, bot);
  }

  // Prefer not open-pit mining while pathing to dig targets
  if (profile === 'dig' && 'digCost' in m) {
    m.digCost = Math.max(1, Number(config.pathDigCost || 1));
  }
  return m;
}

/**
 * Apply a movement profile; returns previous movements for restore.
 */
export function applyProfile(bot, profile = 'default', config = {}) {
  if (!bot?.pathfinder?.setMovements) return null;
  const previous = bot.pathfinder.movements || null;
  try {
    const next = buildMovements(bot, profile, { ...(bot.mcaiConfig || {}), ...config });
    if (next) bot.pathfinder.setMovements(next);
    return previous;
  } catch {
    return previous;
  }
}

export function restoreProfile(bot, previous) {
  if (!bot?.pathfinder?.setMovements || !previous) return;
  try {
    bot.pathfinder.setMovements(previous);
  } catch {
    // ignore
  }
}

/**
 * Path to a GoalNear position with timeout + optional claim.
 */
export async function gotoNear(bot, position, options = {}) {
  if (!bot?.pathfinder?.goto || !GoalNear) return fail('pathfinder unavailable');
  if (!position || !Number.isFinite(position.x)) return fail('invalid position');

  const memory = options.memory || null;
  const owner = options.owner || 'gotoNear';
  const priority = options.priority ?? 'job';
  const range = Math.max(0, Number(options.range ?? options.distance ?? 2));
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || DEFAULT_TIMEOUT.job));
  const profile = options.profile || 'default';

  let claimed = false;
  if (memory) {
    const claim = claimMove(memory, {
      owner,
      priority,
      kind: options.kind || 'goto',
      reason: options.reason || 'gotoNear',
      ttlMs: timeoutMs + 10000,
      movementMode: options.movementMode
    });
    if (!claim.ok) return claim;
    claimed = true;
  }

  const prev = applyProfile(bot, profile, options.config || bot.mcaiConfig);
  clearGoal(bot);
  try {
    const goal = new GoalNear(
      Math.floor(position.x),
      Math.floor(position.y),
      Math.floor(position.z),
      range
    );
    const gotoPromise = bot.pathfinder.goto(goal);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(Object.assign(new Error('path timeout'), { timeout: true })), timeoutMs);
    });
    await Promise.race([gotoPromise, timeoutPromise]);
    return ok('arrived', { position, range, profile });
  } catch (error) {
    clearGoal(bot);
    if (error?.timeout) return fail('path timeout', { position });
    if (/goal was changed|PathStopped|cancel/i.test(String(error.message || error))) {
      return fail('goal interrupted', { detail: error.message });
    }
    return fail(error.message || 'path failed', { position });
  } finally {
    restoreProfile(bot, prev);
    if (claimed && memory && options.release !== false) {
      releaseMove(memory, owner);
    }
  }
}

/**
 * Path to look-at a block (preferred for dig — no jump-on-block).
 */
export async function gotoLookAtBlock(bot, block, options = {}) {
  if (!bot?.pathfinder?.goto) return fail('pathfinder unavailable');
  if (!block?.position) return fail('no block');

  const memory = options.memory || null;
  const owner = options.owner || 'gotoLookAt';
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 20000));
  const profile = options.profile || 'dig';
  let claimed = false;

  if (memory) {
    const claim = claimMove(memory, {
      owner,
      priority: options.priority || 'job',
      kind: 'dig',
      reason: options.reason || `look ${block.name}`,
      ttlMs: timeoutMs + 5000,
      movementMode: 'thin_collect_resource'
    });
    if (!claim.ok) return claim;
    claimed = true;
  }

  const prev = applyProfile(bot, profile, options.config || bot.mcaiConfig);
  clearGoal(bot);
  try {
    if (GoalLookAtBlock && bot.world) {
      const goal = new GoalLookAtBlock(block.position, bot.world, { reach: Number(options.reach || 4) });
      await Promise.race([
        bot.pathfinder.goto(goal),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('path timeout'), { timeout: true })), timeoutMs))
      ]);
    } else {
      // Fallback: stand beside block at bot Y when possible
      const py = Math.floor(bot.entity?.position?.y ?? block.position.y);
      const near = await gotoNear(bot, { x: block.position.x, y: py, z: block.position.z }, {
        ...options,
        memory: null, // already claimed
        range: 2,
        profile,
        release: false
      });
      if (!near.ok) return near;
    }
    try {
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
    } catch {
      // ignore
    }
    return ok('looking at block', { name: block.name, position: block.position });
  } catch (error) {
    clearGoal(bot);
    if (error?.timeout) return fail('path timeout');
    return fail(error.message || 'look-at path failed');
  } finally {
    restoreProfile(bot, prev);
    if (claimed && memory && options.release !== false) releaseMove(memory, owner);
  }
}

/**
 * Follow owner entity with claim + dry-preferring profile.
 */
export async function followEntity(bot, entity, options = {}) {
  if (!bot?.pathfinder?.setGoal || !GoalFollow) return fail('pathfinder unavailable');
  if (!entity) return fail('no entity to follow');

  const memory = options.memory || null;
  const owner = options.owner || 'follow';
  const range = Math.max(1, Number(options.range ?? options.distance ?? 3));
  const priority = options.priority || 'follow';

  if (memory) {
    const claim = claimMove(memory, {
      owner,
      priority,
      kind: 'follow',
      reason: options.reason || 'follow entity',
      ttlMs: Number(options.ttlMs || 600000),
      movementMode: options.movementMode || 'follow_owner'
    });
    if (!claim.ok) return claim;
  }

  applyProfile(bot, options.profile || 'follow', options.config || bot.mcaiConfig);
  try {
    bot.pathfinder.setGoal(new GoalFollow(entity, range), true);
    return ok('following', { range });
  } catch (error) {
    return fail(error.message || 'follow failed');
  }
}

/**
 * Small stuck recovery: clear goal, jump, random step, reapply dry profile.
 */
export async function unstuck(bot, options = {}) {
  clearGoal(bot);
  try {
    bot.clearControlStates?.();
  } catch {
    // ignore
  }
  try {
    bot.setControlState?.('jump', true);
    await wait(350);
    bot.setControlState?.('jump', false);
    bot.setControlState?.('forward', true);
    await wait(400);
    bot.setControlState?.('forward', false);
    bot.setControlState?.('back', true);
    await wait(250);
    bot.setControlState?.('back', false);
  } catch {
    // ignore
  }
  try {
    bot.clearControlStates?.();
  } catch {
    // ignore
  }
  applyProfile(bot, options.profile || 'default', options.config || bot.mcaiConfig);
  return ok('unstuck attempt');
}

/**
 * Run fn while holding a move claim; always release (unless keepClaim).
 */
export async function withMoveClaim(memory, options, fn) {
  const owner = options.owner || `claim_${now()}`;
  const claim = claimMove(memory, { ...options, owner });
  if (!claim.ok) return claim;
  try {
    return await fn(claim.claim || claim.data?.claim);
  } finally {
    if (options.keepClaim !== true) releaseMove(memory, owner);
  }
}

export default {
  MOVE_PRIORITY,
  getMoveClaim,
  getMovePriority,
  canClaimMove,
  claimMove,
  releaseMove,
  isMoveBusy,
  clearGoal,
  buildMovements,
  applyProfile,
  restoreProfile,
  gotoNear,
  gotoLookAtBlock,
  followEntity,
  unstuck,
  withMoveClaim
};
