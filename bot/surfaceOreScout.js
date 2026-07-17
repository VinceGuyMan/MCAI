/**
 * Safe surface scout for visible ores in loaded chunks.
 * Does NOT dig caves or strip-mine — walks short land legs and re-scans.
 */
import pathfinderPkg from 'mineflayer-pathfinder';
import { findNearbyOreBlocks, findReachableOre } from './oreScanner.js';
import { applyDryPathMovements } from './pluginWrappers.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals || {};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearGoal(bot) {
  try {
    bot?.pathfinder?.setGoal?.(null);
  } catch {
    // best effort
  }
}

/**
 * Walk surface legs (dry path) without requiring ore. Used for stone/wood relocation.
 * @returns {{ ok: boolean, legsTried: number, message: string }}
 */
export async function walkSurfaceLegs(bot, options = {}) {
  const maxLegs = Math.max(1, Math.min(8, Number(options.maxLegs || 4)));
  const leg = Math.max(12, Math.min(40, Number(options.legDistance || 24)));
  const shouldStop = options.shouldStop;
  if (!bot?.pathfinder?.goto || !GoalNear || !bot.entity?.position) {
    return { ok: false, legsTried: 0, message: 'Cannot walk scout without pathfinder.' };
  }
  const origin = bot.entity.position.clone();
  const legs = [[leg, 0], [-leg, 0], [0, leg], [0, -leg], [leg, leg], [-leg, -leg]].slice(0, maxLegs);
  applyDryPathMovements(bot);
  let legsTried = 0;
  for (const [dx, dz] of legs) {
    if (shouldStop?.()) break;
    const x = Math.floor(origin.x + dx);
    const z = Math.floor(origin.z + dz);
    const y = Math.floor(origin.y);
    try {
      clearGoal(bot);
      await Promise.race([
        bot.pathfinder.goto(new GoalNear(x, y, z, 3)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))
      ]);
    } catch {
      clearGoal(bot);
    }
    legsTried += 1;
    await wait(250);
    if (typeof options.onLeg === 'function') {
      const early = await options.onLeg({ legsTried, x, y, z });
      if (early?.found) return { ok: true, legsTried, message: early.message || 'Found after walk.', found: true };
    }
  }
  return { ok: true, legsTried, message: `Walked ${legsTried} surface leg(s).` };
}

/**
 * Prefer ores near current Y (surface band), then closer.
 */
export function pickSurfaceOre(bot, resourceType, radius = 48) {
  const entries = findNearbyOreBlocks(bot, resourceType, radius);
  if (!entries.length) return null;
  const y0 = bot.entity?.position?.y ?? 64;
  const ranked = [...entries].sort((a, b) => {
    const ay = Math.abs((a.position?.y ?? y0) - y0);
    const by = Math.abs((b.position?.y ?? y0) - y0);
    if (ay !== by) return ay - by;
    return (a.distance ?? 99) - (b.distance ?? 99);
  });
  return ranked[0] || null;
}

function sampleY(bot, x, z, baseY) {
  // Prefer solid ground near baseY rather than pathing into air/void.
  if (!bot?.blockAt) return baseY;
  for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const y = Math.floor(baseY + dy);
    const feet = bot.blockAt({ x, y, z });
    const below = bot.blockAt({ x, y: y - 1, z });
    const head = bot.blockAt({ x, y: y + 1, z });
    const belowSolid = below && below.boundingBox === 'block' && !String(below.name || '').includes('water') && !String(below.name || '').includes('lava');
    const feetFree = !feet || feet.name === 'air' || feet.boundingBox !== 'block';
    const headFree = !head || head.name === 'air' || head.boundingBox !== 'block';
    if (belowSolid && feetFree && headFree) return y;
  }
  return baseY;
}

/**
 * Walk short offsets on land and look for ore. Stops early if found.
 * @returns {{ ok: boolean, found: boolean, message: string, entry?: object, legsTried?: number }}
 */
export async function scoutSurfaceForOre(bot, resourceType, options = {}) {
  const radius = Number(options.radius || options.maxDistance || bot?.mcaiConfig?.thinCoreOreScoutMaxDistance || 96);
  const maxLegs = Math.max(1, Math.min(12, Number(options.maxLegs || bot?.mcaiConfig?.surfaceOreScoutLegs || 8)));
  const leg = Math.max(16, Math.min(48, Number(options.legDistance || bot?.mcaiConfig?.surfaceOreScoutLegBlocks || 32)));
  const shouldStop = options.shouldStop;

  const first = pickSurfaceOre(bot, resourceType, radius)
    || findReachableOre(bot, resourceType, radius, options);
  if (first) {
    return { ok: true, found: true, message: `Found ${resourceType} nearby.`, entry: first, legsTried: 0 };
  }

  if (!bot?.pathfinder?.goto || !GoalNear || !bot.entity?.position) {
    return { ok: false, found: false, message: `No ${resourceType} in loaded chunks and I cannot scout.`, legsTried: 0 };
  }

  const origin = bot.entity.position.clone();
  // Spiral-ish legs with increasing distance so we do not hop in place.
  const legs = [];
  const rings = [
    [leg, 0], [-leg, 0], [0, leg], [0, -leg],
    [leg, leg], [-leg, leg], [leg, -leg], [-leg, -leg],
    [leg * 1.5, 0], [-leg * 1.5, 0], [0, leg * 1.5], [0, -leg * 1.5]
  ];
  for (const pair of rings.slice(0, maxLegs)) {
    legs.push([Math.round(pair[0]), Math.round(pair[1])]);
  }

  applyDryPathMovements(bot);
  let legsTried = 0;

  for (const [dx, dz] of legs) {
    if (shouldStop?.()) {
      return { ok: false, found: false, message: 'Stopped ore scout.', legsTried };
    }
    const targetX = Math.floor(origin.x + dx);
    const targetZ = Math.floor(origin.z + dz);
    const targetY = sampleY(bot, targetX, targetZ, Math.floor(origin.y));
    try {
      clearGoal(bot);
      // Longer timeout per leg so pathfinder actually walks instead of micro-hop.
      const gotoPromise = bot.pathfinder.goto(new GoalNear(targetX, targetY, targetZ, 3));
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('scout leg timeout')), 25000);
      });
      await Promise.race([gotoPromise, timeoutPromise]);
      legsTried += 1;
    } catch {
      clearGoal(bot);
      legsTried += 1;
      // Partial progress still counts — re-scan where we are.
    }
    await wait(400);
    const hit = pickSurfaceOre(bot, resourceType, radius)
      || findReachableOre(bot, resourceType, Math.min(radius, 48), options);
    if (hit) {
      return {
        ok: true,
        found: true,
        message: `Scout found ${resourceType} after ${legsTried} leg(s).`,
        entry: hit,
        legsTried
      };
    }
  }

  // Return toward start (best effort)
  try {
    clearGoal(bot);
    await bot.pathfinder.goto(new GoalNear(Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z), 3));
  } catch {
    clearGoal(bot);
  }

  return {
    ok: false,
    found: false,
    legsTried,
    message: `I walked ${legsTried} surface leg(s) (~${leg}m each) and still see no ${resourceType} in loaded chunks. Move with me to a new area or open more terrain.`
  };
}
