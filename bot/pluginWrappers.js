import pathfinderPkg from 'mineflayer-pathfinder';
import { isCancelledError } from './cancellation.js';
import { getPluginRuntimeStatus } from './pluginStatus.js';

const { GoalNear, GoalFollow, GoalLookAtBlock } = pathfinderPkg.goals || {};
const Movements = pathfinderPkg.Movements || pathfinderPkg.default?.Movements;

const RESOURCE_BLOCKS = {
  wood: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log'],
  stone: ['stone', 'cobblestone', 'deepslate', 'andesite', 'diorite', 'granite'],
  coal: ['coal_ore', 'deepslate_coal_ore'],
  iron: ['iron_ore', 'deepslate_iron_ore'],
  dirt: ['dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'mud'],
  sand: ['sand', 'red_sand'],
  gravel: ['gravel'],
  clay: ['clay']
};

function ok(message, data = {}, evidence = []) {
  return { ok: true, message, evidence, data };
}

function fail(reason, data = {}) {
  return { ok: false, reason, message: reason, evidence: [], data, error: null };
}

function configFrom(bot, options = {}) {
  return { ...(bot?.mcaiConfig || {}), ...(options.config || {}) };
}

function allowFallback(bot, options = {}) {
  return options.allowFallbackWithoutPlugin === true || configFrom(bot, options).allowFallbackWithoutPlugin === true;
}

function cancellationFrom(bot, options = {}) {
  return options.cancellation || bot?.mcaiCancellation || null;
}

function cancellationActive(bot, options = {}) {
  const cancellation = cancellationFrom(bot, options);
  return Boolean(cancellation?.isCancelled?.() || cancellation?.getState?.().cancelled);
}

function throwIfCancelled(bot, options = {}) {
  cancellationFrom(bot, options)?.throwIfCancelled?.();
}

async function safely(label, bot, options, fn) {
  try {
    throwIfCancelled(bot, options);
    const result = await fn();
    throwIfCancelled(bot, options);
    return result;
  } catch (error) {
    if (isCancelledError(error) || cancellationActive(bot, options)) return fail('cancelled');
    return fail(`${label} failed: ${error.message || String(error)}`);
  }
}

function clearPathfinderGoal(bot) {
  if (typeof bot?.pathfinder?.setGoal === 'function') {
    try {
      bot.pathfinder.setGoal(null);
      return;
    } catch {
      // Fall through to stop() when a test double or plugin edge case rejects null goals.
    }
  }
  if (typeof bot?.pathfinder?.stop === 'function') {
    bot.pathfinder.stop();
  }
}

function cancelCollection(bot) {
  if (typeof bot?.collectBlock?.cancelTask === 'function') {
    try {
      const result = bot.collectBlock.cancelTask();
      if (result?.catch) result.catch(() => {});
    } catch {
      // Clearing pathfinder below is still the important escape hatch.
    }
  }
  clearPathfinderGoal(bot);
}

function registerCancelableTask(bot, options, taskId, cancelFn) {
  const cancellation = cancellationFrom(bot, options);
  if (typeof cancellation?.registerCancelableTask !== 'function') return () => {};
  cancellation.registerCancelableTask(taskId, cancelFn);
  return () => cancellation.unregisterCancelableTask?.(taskId);
}

function namesFromInput(blockNameOrBlock, options = {}) {
  if (Array.isArray(blockNameOrBlock)) return blockNameOrBlock.map((value) => String(value?.name || value).trim()).filter(Boolean);
  if (blockNameOrBlock?.name) return [blockNameOrBlock.name];
  const resourceName = options.resourceName || options.kind || options.resource;
  if (resourceName && RESOURCE_BLOCKS[resourceName]) return RESOURCE_BLOCKS[resourceName];
  if (typeof blockNameOrBlock === 'string' && RESOURCE_BLOCKS[blockNameOrBlock]) return RESOURCE_BLOCKS[blockNameOrBlock];
  if (typeof blockNameOrBlock === 'string' && blockNameOrBlock.trim()) return [blockNameOrBlock.trim()];
  return [];
}

function isFluidName(name) {
  return name === 'water' || name === 'lava' || name === 'bubble_column'
    || String(name || '').includes('water')
    || String(name || '').includes('lava');
}

function isPassableName(name) {
  return !name
    || name === 'air'
    || name === 'cave_air'
    || name === 'void_air'
    || name === 'short_grass'
    || name === 'tall_grass'
    || name === 'snow'
    || name.endsWith('_carpet');
}

function isSolidStandable(block) {
  if (!block) return false;
  if (isFluidName(block.name)) return false;
  if (isPassableName(block.name)) return false;
  // mineflayer: solid blocks usually have boundingBox === 'block'
  if (block.boundingBox && block.boundingBox !== 'block') return false;
  return true;
}

function isWetTarget(bot, block) {
  if (!block?.position || !bot?.blockAt) return false;
  if (typeof bot?.mcaiSafety?.isHazardousFluidDig === 'function') {
    try {
      if (bot.mcaiSafety.isHazardousFluidDig(block)) return true;
    } catch {
      // fall through
    }
  }
  const above = bot.blockAt(block.position.offset(0, 1, 0));
  if (above && isFluidName(above.name)) return true;
  // Water/lava in the dig cell itself
  if (isFluidName(block.name)) return true;
  return false;
}

/** True if there is a dry adjacent stand spot to dig this block without swimming. */
function hasDryStandSpot(bot, block) {
  if (!block?.position || !bot?.blockAt) return false;
  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2]
  ];
  for (const [dx, dz] of offsets) {
    const floor = bot.blockAt(block.position.offset(dx, -1, dz));
    const feet = bot.blockAt(block.position.offset(dx, 0, dz));
    const head = bot.blockAt(block.position.offset(dx, 1, dz));
    if (!isSolidStandable(floor)) continue;
    if (feet && isFluidName(feet.name)) continue;
    if (head && isFluidName(head.name)) continue;
    if (feet && !isPassableName(feet.name) && feet.boundingBox === 'block') continue;
    return true;
  }
  // Stand on top of the block if free air above (common for bank sand)
  const top = bot.blockAt(block.position.offset(0, 1, 0));
  const top2 = bot.blockAt(block.position.offset(0, 2, 0));
  if (top && isPassableName(top.name) && !isFluidName(top.name)
    && (!top2 || (isPassableName(top2.name) && !isFluidName(top2.name)))) {
    return true;
  }
  return false;
}

function isSafeDrySurfaceTarget(bot, block) {
  if (!block) return false;
  if (isWetTarget(bot, block)) return false;
  if (!hasDryStandSpot(bot, block)) return false;
  return true;
}

function botIsInFluid(bot) {
  if (!bot?.entity?.position || !bot.blockAt) return false;
  const feet = bot.blockAt(bot.entity.position);
  const head = bot.blockAt(bot.entity.position.offset(0, 1, 0));
  return Boolean((feet && isFluidName(feet.name)) || (head && isFluidName(head.name)));
}

function addFluidAvoidIds(movements, bot) {
  if (!movements?.blocksToAvoid || !bot?.registry?.blocksByName) return;
  for (const name of ['water', 'lava', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass']) {
    const id = bot.registry.blocksByName[name]?.id;
    if (id !== undefined && id !== null) movements.blocksToAvoid.add(id);
  }
  // Flowing variants if present in registry
  for (const [name, entry] of Object.entries(bot.registry.blocksByName || {})) {
    if (isFluidName(name) && entry?.id !== undefined) movements.blocksToAvoid.add(entry.id);
  }
}

/** Install high liquidCost movements so pathfinder will not swim for surface digs. */
export function applyDryPathMovements(bot) {
  if (!bot?.pathfinder?.setMovements || !Movements) return null;
  const previous = bot.pathfinder.movements || null;
  try {
    const dry = new Movements(bot);
    dry.canDig = true;
    dry.allowSprinting = true;
    dry.allow1by1 = true;
    // Extremely expensive liquids so A* prefers dry land (or fails cleanly).
    dry.liquidCost = 10000;
    if ('dontCreateFlow' in dry) dry.dontCreateFlow = true;
    addFluidAvoidIds(dry, bot);
    bot.pathfinder.setMovements(dry);
    return previous;
  } catch {
    return null;
  }
}

function restorePathMovements(bot, previous) {
  if (!bot?.pathfinder?.setMovements) return;
  try {
    if (previous) bot.pathfinder.setMovements(previous);
  } catch {
    // best effort
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cancel dig path and swim/path to dry land when air is low. */
async function emergencySurface(bot) {
  cancelCollection(bot);
  try {
    bot.clearControlStates?.();
  } catch {
    // ignore
  }
  // Swim/jump upward first
  try {
    bot.setControlState?.('jump', true);
    bot.setControlState?.('sprint', true);
    await waitMs(900);
    bot.setControlState?.('jump', false);
    bot.setControlState?.('sprint', false);
  } catch {
    // ignore
  }

  if (!bot?.pathfinder?.goto || !bot.entity?.position) return;

  const prev = applyDryPathMovements(bot);
  try {
    // Prefer a dry solid block we can stand on nearby
    const standNames = new Set([
      'dirt', 'grass_block', 'coarse_dirt', 'sand', 'red_sand', 'gravel', 'clay',
      'stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'deepslate',
      'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'
    ]);
    const positions = bot.findBlocks?.({
      matching: (block) => Boolean(block?.name && standNames.has(block.name) && isSafeDrySurfaceTarget(bot, block)),
      maxDistance: 24,
      count: 30
    }) || [];
    const origin = bot.entity.position;
    const ranked = positions
      .map((p) => bot.blockAt?.(p))
      .filter(Boolean)
      .sort((a, b) => {
        // Prefer higher Y (out of water), then closer
        const dy = (b.position.y - a.position.y);
        if (dy !== 0) return dy;
        return origin.distanceTo(a.position) - origin.distanceTo(b.position);
      });

    for (const block of ranked.slice(0, 8)) {
      try {
        // Stand on top of the solid block
        await bot.pathfinder.goto(new GoalNear(block.position.x, block.position.y + 1, block.position.z, 1));
        if (!botIsInFluid(bot)) return;
      } catch {
        clearPathfinderGoal(bot);
      }
    }

    // Last resort: path toward owner if visible (usually on land)
    const ownerName = bot.mcaiConfig?.ownerUsername || 'ModVinny';
    const owner = bot.players?.[ownerName]?.entity;
    if (owner) {
      try {
        await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, 2));
      } catch {
        clearPathfinderGoal(bot);
      }
    }
  } finally {
    restorePathMovements(bot, prev);
    try {
      bot.clearControlStates?.();
    } catch {
      // ignore
    }
  }
}

function blockTargets(bot, names, options = {}) {
  const nameSet = new Set(names);
  const want = Math.max(1, options.count || options.targetCount || 1);
  const resourceName = String(options.resourceName || options.resource || '');
  const shovelSurface = ['dirt', 'sand', 'gravel', 'clay'].includes(resourceName);
  // Shovel surface: strict dry stand. Stone/ore/wood: only reject fluid-soaked blocks.
  const preferDry = options.preferDry !== false;
  const strictDry = preferDry && (shovelSurface || options.strictDry === true);
  const positions = bot.findBlocks?.({
    matching: (block) => Boolean(block?.name && nameSet.has(block.name)),
    maxDistance: options.maxDistance || 16,
    count: Math.max(want * 12, 48)
  }) || [];
  const safety = options.safety || bot?.mcaiSafety || null;
  const state = options.state || null;
  let blocks = positions
    .map((position) => bot.blockAt?.(position))
    .filter(Boolean)
    .filter((block) => {
      if (typeof safety?.safeToDig !== 'function') return true;
      try {
        return safety.safeToDig(block, state).ok !== false;
      } catch {
        return false;
      }
    });

  if (strictDry) {
    blocks = blocks.filter((block) => isSafeDrySurfaceTarget(bot, block));
  } else if (preferDry) {
    // Soft dry: skip underwater / lava-covered only (hillside stone stays valid).
    blocks = blocks.filter((block) => !isWetTarget(bot, block));
  }

  // Prefer nearest cluster: finish one tree/vein face before hopping far away.
  const origin = bot?.entity?.position;
  if (origin && blocks.length > 1) {
    blocks = [...blocks].sort((a, b) => origin.distanceTo(a.position) - origin.distanceTo(b.position));
    const seed = blocks[0];
    const rest = blocks.slice(1).sort((a, b) => seed.position.distanceTo(a.position) - seed.position.distanceTo(b.position));
    blocks = [seed, ...rest];
  }
  return blocks;
}

const KEEP_TOOLS = /_(pickaxe|axe|shovel|hoe|sword)$/;
const KEEP_ARMOR = /_(helmet|chestplate|leggings|boots)$/;
const KEEP_FOOD = /^(bread|cooked_|apple|carrot|potato|beef|pork|chicken|mutton|rabbit|cod|salmon|berry|cookie|pie|stew|honey|melon)/;
const KEEP_CORE = new Set([
  'crafting_table', 'furnace', 'chest', 'torch', 'stick', 'shield',
  'bucket', 'water_bucket', 'lava_bucket', 'flint_and_steel', 'fishing_rod',
  'shears', 'bow', 'crossbow', 'arrow', 'coal', 'charcoal',
  'raw_iron', 'iron_ingot', 'iron_nugget', 'iron_block'
]);

function isProtectedInventoryItem(item) {
  if (!item?.name) return true;
  const n = item.name;
  if (KEEP_CORE.has(n)) return true;
  if (KEEP_TOOLS.test(n) || KEEP_ARMOR.test(n)) return true;
  if (KEEP_FOOD.test(n)) return true;
  // Keep a modest wood reserve for crafting
  if (n.endsWith('_log') || n.endsWith('_planks')) return false; // may trim excess below
  return false;
}

/** Free inventory slots so dig/collect can run after kit fills packs. */
async function ensureInventorySlotsForCollect(bot, need = 2, options = {}) {
  const emptyCount = () => {
    try {
      return Number(bot?.inventory?.emptySlotCount?.() ?? 0);
    } catch {
      return 0;
    }
  };
  if (emptyCount() >= need) return { ok: true, freed: 0 };

  // Prefer depositing to registered storage when available (no drop).
  const actionsApi = options.actions || bot?.mcaiActions;
  if (options.allowStore !== false && actionsApi?.executeAction) {
    try {
      await actionsApi.executeAction('store_items', { mode: 'safe_excess' }, {
        source: 'inventory_free',
        silent: true
      });
    } catch {
      // fall through to toss
    }
    if (emptyCount() >= need) return { ok: true, freed: 0, stored: true };
  }

  // Toss bulk junk from kits / dig excess — never tools/armor/food/ores/torches.
  const tossPriority = [
    'dirt', 'coarse_dirt', 'grass_block', 'rooted_dirt', 'mud',
    'sand', 'red_sand', 'gravel', 'clay',
    'stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'deepslate', 'cobbled_deepslate',
    'stone_bricks', 'glass', 'oak_fence', 'spruce_fence', 'birch_fence',
    'oak_fence_gate', 'ladder', 'oak_sign', 'oak_door',
    'white_wool', 'string', 'bone_meal', 'wheat_seeds', 'iron_nugget',
    'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks',
    'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log'
  ];

  let freed = 0;
  const tryToss = async (stack, dropCount) => {
    if (!stack || dropCount <= 0) return false;
    const type = stack.type ?? stack.id;
    if (type == null) return false;
    try {
      await bot.toss(type, stack.metadata ?? null, dropCount);
      freed += 1;
      return true;
    } catch {
      try {
        if (typeof bot.tossStack === 'function') {
          await bot.tossStack(stack);
          freed += 1;
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  };

  // Pass 1: named junk list (full stacks first)
  for (let pass = 0; pass < 3 && emptyCount() < need; pass += 1) {
    const items = bot?.inventory?.items?.() || [];
    for (const name of tossPriority) {
      if (emptyCount() >= need) break;
      const stacks = items.filter((item) => item.name === name && item.count > 0)
        .sort((a, b) => b.count - a.count);
      for (const stack of stacks) {
        if (emptyCount() >= need) break;
        // Keep a small reserve of logs/planks for crafting
        if (name.endsWith('_log') || name.endsWith('_planks')) {
          const total = items.filter((i) => i.name === name).reduce((s, i) => s + i.count, 0);
          if (total <= 8) continue;
          const drop = Math.min(stack.count, Math.max(1, total - 8), 32);
          await tryToss(stack, drop);
        } else {
          await tryToss(stack, Math.min(stack.count, 64));
        }
      }
    }
  }

  // Pass 2: any non-protected stackable junk (kit leftovers)
  if (emptyCount() < need) {
    const items = (bot?.inventory?.items?.() || [])
      .filter((item) => item.count > 0 && !isProtectedInventoryItem(item))
      .sort((a, b) => b.count - a.count);
    for (const stack of items) {
      if (emptyCount() >= need) break;
      if (stack.name.endsWith('_log') || stack.name.endsWith('_planks')) {
        const total = items.filter((i) => i.name === stack.name).reduce((s, i) => s + i.count, 0);
        if (total <= 8) continue;
      }
      await tryToss(stack, Math.min(stack.count, 32));
    }
  }

  if (emptyCount() >= need) return { ok: true, freed };
  if (emptyCount() >= 1) return { ok: true, freed, partial: true };
  return {
    ok: false,
    freed,
    reason: 'Inventory full. Say "tj store items" or drop junk, then try again. Kit packs can fill every slot.'
  };
}

/**
 * Expand a seed log/ore into a connected vein so we finish one tree before hopping.
 */
function expandVeinTargets(bot, seed, names, maxBlocks = 32) {
  if (!seed?.position) return [seed];
  const nameSet = new Set(names);
  const isWood = names.some((n) => String(n).includes('log'));

  // Prefer plugin vein flood-fill when available.
  if (bot?.collectBlock?.findFromVein) {
    try {
      const vein = bot.collectBlock.findFromVein(seed, maxBlocks, isWood ? 28 : 16, isWood ? 2 : 1) || [];
      const filtered = vein.filter((block) => block?.name && nameSet.has(block.name));
      if (filtered.length) {
        if (isWood) {
          // Bottom → top so we stay grounded while climbing the trunk.
          filtered.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x) || (a.position.z - b.position.z));
        } else {
          filtered.sort((a, b) => seed.position.distanceTo(a.position) - seed.position.distanceTo(b.position));
        }
        return filtered;
      }
    } catch {
      // fall through to manual column scan
    }
  }

  // Manual trunk column for wood: same XZ ±1, scan Y up/down.
  if (isWood && bot?.blockAt) {
    const column = [seed];
    const sx = seed.position.x;
    const sy = seed.position.y;
    const sz = seed.position.z;
    for (let dy = 1; dy <= 12 && column.length < maxBlocks; dy += 1) {
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const b = bot.blockAt(seed.position.offset(dx, dy, dz));
        if (b?.name && nameSet.has(b.name)) column.push(b);
      }
    }
    for (let dy = -1; dy >= -2 && column.length < maxBlocks; dy -= 1) {
      const b = bot.blockAt(seed.position.offset(0, dy, 0));
      if (b?.name && nameSet.has(b.name)) column.push(b);
    }
    const seen = new Set();
    const unique = [];
    for (const b of column) {
      const key = `${b.position.x},${b.position.y},${b.position.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(b);
    }
    unique.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
    if (unique.length) return unique;
  }
  return [seed];
}

/** Dig one block without collectblock chest deposit logic. Prefer look-at over jump-on-block. */
async function digOneBlockDirect(bot, block, options = {}) {
  if (!block?.position) throw new Error('No block to dig.');
  const live = bot.blockAt?.(block.position) || block;
  if (!live || live.name === 'air') return { dug: false };
  clearPathfinderGoal(bot);
  if (preferDryPath(options) || options.preferDry !== false) {
    applyDryPathMovements(bot);
  }
  if (bot?.tool?.equipForBlock) {
    try {
      await bot.tool.equipForBlock(live, { requireHarvest: true, getFromChest: false });
    } catch {
      // best effort
    }
  }

  // GoalLookAtBlock stands beside the face — avoids jump-spam up tree trunks.
  try {
    if (bot?.pathfinder?.goto && GoalLookAtBlock && bot.world) {
      await bot.pathfinder.goto(new GoalLookAtBlock(live.position, bot.world, { reach: 4 }));
    } else if (bot?.pathfinder?.goto && bot.entity?.position.distanceTo(live.position) > 3.2) {
      // Stand next to block at feet Y when possible (not on top).
      const px = live.position.x;
      const pz = live.position.z;
      const py = Math.floor(bot.entity.position.y);
      await bot.pathfinder.goto(new GoalNear(px, py, pz, 2));
    }
  } catch {
    clearPathfinderGoal(bot);
    // Last try: near the block
    try {
      if (bot?.pathfinder?.goto) {
        await bot.pathfinder.goto(new GoalNear(live.position.x, live.position.y, live.position.z, 2));
      }
    } catch {
      clearPathfinderGoal(bot);
    }
  }

  const still = bot.blockAt?.(live.position);
  if (!still || still.name === 'air') return { dug: false };
  await bot.lookAt(still.position.offset(0.5, 0.5, 0.5), true).catch(() => {});
  await bot.dig(still);
  await new Promise((r) => setTimeout(r, 200));
  // Pickup nearby drops without long side quests
  try {
    const drops = Object.values(bot.entities || {}).filter((e) => {
      if (!e?.position || !bot.entity?.position) return false;
      const isItem = e.name === 'item' || e.objectType === 'Item' || e.displayName === 'Item';
      return isItem && bot.entity.position.distanceTo(e.position) < 3.5;
    });
    for (const drop of drops.slice(0, 2)) {
      try {
        await bot.pathfinder?.goto?.(new GoalNear(drop.position.x, drop.position.y, drop.position.z, 0));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return { dug: true };
}

function preferDryPath(options = {}) {
  return options.preferDry !== false;
}

function pluginMissingReason(packageName) {
  return `${packageName} is not loaded`;
}

export function pluginWrapperStatus(bot) {
  const status = getPluginRuntimeStatus(bot);
  const missingCritical = Object.values(status).filter((entry) => entry.critical && !entry.runtimeAvailable);
  return {
    ok: missingCritical.length === 0,
    message: missingCritical.length
      ? `Mineflayer plugin wrappers missing critical runtime support: ${missingCritical.map((entry) => entry.packageName).join(', ')}.`
      : 'Mineflayer plugin wrappers are ready for critical movement, collection, and tool selection.',
    reason: missingCritical.length ? 'critical plugin runtime unavailable' : '',
    evidence: ['plugin_status_reported'],
    data: { status, missingCritical }
  };
}

export async function collectBlockSafely(bot, blockNameOrBlock, options = {}) {
  return safely('collectBlockSafely', bot, options, async () => {
    if (!bot?.pathfinder?.goto) return fail(pluginMissingReason('mineflayer-pathfinder'), { usedPlugin: false });
    if (options.requireToolPlugin && !bot?.tool?.equipForBlock) return fail(pluginMissingReason('mineflayer-tool'), { usedPlugin: false });
    const names = namesFromInput(blockNameOrBlock, options);
    if (!names.length) return fail('No block name was provided to collectBlockSafely.');
    const count = Math.max(1, Math.min(64, Number.parseInt(String(options.count || options.targetCount || 1), 10) || 1));
    const resourceName = String(options.resourceName || options.kind || options.resource || names[0]);
    const shovelSurface = ['dirt', 'sand', 'gravel', 'clay'].includes(resourceName);
    const isWood = resourceName === 'wood' || names.some((n) => String(n).includes('log'));
    const isOre = ['coal', 'iron'].includes(resourceName) || names.some((n) => String(n).includes('_ore'));
    // Strict dry only for shovel surface blocks (drown risk). Stone/wood/ore use soft dry.
    const preferDry = options.preferDry !== false;
    const strictDry = shovelSurface || options.strictDry === true;

    // Never let collectblock try chest deposit — inventory full + empty chest list throws.
    if (bot.collectBlock) {
      bot.collectBlock.chestLocations = [];
    }

    const slots = await ensureInventorySlotsForCollect(bot, 3, {
      actions: options.actions || bot?.mcaiActions,
      allowStore: true
    });
    if (!slots.ok) {
      return fail(slots.reason || 'Inventory full.', { usedPlugin: true, reason: 'inventory full' });
    }

    // Already in water before starting — get out first (surface digs).
    if (preferDry && botIsInFluid(bot)) {
      await emergencySurface(bot);
      if (botIsInFluid(bot) && strictDry) {
        return fail(
          'I am in water and cannot safely dig surface blocks. Move me to dry land first.',
          { blockNames: names, usedPlugin: true, reason: 'already underwater' }
        );
      }
    }

    let targets = blockNameOrBlock?.position
      ? [blockNameOrBlock]
      : blockTargets(bot, names, {
        ...options,
        count,
        preferDry,
        strictDry,
        resourceName,
        maxDistance: options.maxDistance || 32
      });

    if (targets.length && strictDry) {
      targets = targets.filter((block) => isSafeDrySurfaceTarget(bot, block));
    } else if (targets.length && preferDry) {
      targets = targets.filter((block) => !isWetTarget(bot, block));
    }

    if (!targets.length && strictDry) {
      return fail(
        `No safe dry ${names.join('/')} nearby (I will not path into water and drown). Try inland sand/gravel/clay banks.`,
        { blockNames: names, usedPlugin: true, reason: 'no dry targets' }
      );
    }
    if (!targets.length) {
      return fail(`No nearby ${names.join('/')} block found.`, { blockNames: names, usedPlugin: true, reason: 'none nearby' });
    }

    // Wood/ore: expand first seed into a connected vein so we finish the tree/cluster.
    if ((isWood || isOre) && targets[0]) {
      const vein = expandVeinTargets(bot, targets[0], names, isWood ? 40 : 16);
      const seen = new Set(vein.map((b) => `${b.position.x},${b.position.y},${b.position.z}`));
      const rest = targets.filter((b) => !seen.has(`${b.position.x},${b.position.y},${b.position.z}`));
      targets = [...vein, ...rest];
    }

    if (bot?.tool?.equipForBlock) {
      const toolResult = await equipBestToolSafely(bot, targets[0], { ...options, allowFallbackWithoutPlugin: false });
      if (toolResult.ok === false && options.requireToolPlugin) return toolResult;
    }
    throwIfCancelled(bot, options);

    const minO2 = Number(options.minOxygenToDig ?? bot?.mcaiConfig?.minOxygenToDig ?? 12);
    let drownAbort = false;
    let surfacePromise = null;
    const oxygenWatch = setInterval(() => {
      const o2 = Number(bot?.oxygenLevel ?? 20);
      const inFluid = botIsInFluid(bot);
      if (inFluid || (Number.isFinite(o2) && o2 < minO2)) {
        drownAbort = true;
        cancelCollection(bot);
        if (!surfacePromise) surfacePromise = emergencySurface(bot).catch(() => {});
      }
    }, 300);

    const unregister = registerCancelableTask(bot, options, 'pluginWrappers:collectBlock', () => cancelCollection(bot));
    let collectedApprox = 0;
    let lastError = null;
    const prevMovements = preferDry ? applyDryPathMovements(bot) : null;
    // Always one-by-one for crystallize: vein order + no chest deposit surprises.
    try {
      for (const target of targets.slice(0, Math.max(count * 4, count))) {
        throwIfCancelled(bot, options);
        if (drownAbort) break;
        if (collectedApprox >= count) break;
        if (strictDry && !isSafeDrySurfaceTarget(bot, target)) continue;
        if (preferDry && isWetTarget(bot, target)) continue;
        if (preferDry && botIsInFluid(bot)) {
          drownAbort = true;
          if (!surfacePromise) surfacePromise = emergencySurface(bot).catch(() => {});
          break;
        }
        const live = bot.blockAt?.(target.position);
        if (!live || !names.includes(live.name)) continue;
        if (strictDry && !isSafeDrySurfaceTarget(bot, live)) continue;
        if (preferDry && isWetTarget(bot, live)) continue;

        // Keep at least 1 empty slot so collectblock never hits NoChests mid-vein.
        const slotCheck = await ensureInventorySlotsForCollect(bot, 1);
        if (!slotCheck.ok) {
          lastError = new Error(slotCheck.reason || 'inventory full');
          break;
        }

        try {
          clearPathfinderGoal(bot);
          if (preferDry) applyDryPathMovements(bot);
          if (bot?.tool?.equipForBlock) {
            await equipBestToolSafely(bot, live, { ...options, allowFallbackWithoutPlugin: false });
          }
          // Prefer direct dig (no chest deposit path). Fall back to collectblock.
          try {
            await digOneBlockDirect(bot, live, options);
            collectedApprox += 1;
          } catch (directErr) {
            if (bot?.collectBlock?.collect) {
              try {
                await bot.collectBlock.collect(live, { chestLocations: [], ignoreNoPath: true });
                collectedApprox += 1;
              } catch (collectErr) {
                const msg = String(collectErr?.message || collectErr || '');
                if (/chest/i.test(msg)) {
                  // Inventory-full chest error: free slots and retry direct dig once.
                  await ensureInventorySlotsForCollect(bot, 2);
                  await digOneBlockDirect(bot, live, options);
                  collectedApprox += 1;
                } else {
                  throw collectErr;
                }
              }
            } else {
              throw directErr;
            }
          }
        } catch (error) {
          lastError = error;
          clearPathfinderGoal(bot);
          cancelCollection(bot);
          if (preferDry && botIsInFluid(bot)) {
            drownAbort = true;
            if (!surfacePromise) surfacePromise = emergencySurface(bot).catch(() => {});
            break;
          }
          // Sticky path on one block — continue vein / next target.
          continue;
        }
      }
    } finally {
      clearInterval(oxygenWatch);
      unregister();
      if (surfacePromise) {
        try { await surfacePromise; } catch { /* ignore */ }
      }
      restorePathMovements(bot, prevMovements);
    }

    if (drownAbort) {
      return fail('Stopped collecting and headed for dry land — air was too low / water path.', {
        blockNames: names,
        collectedApprox,
        usedPlugin: 'direct-dig',
        reason: 'low oxygen abort'
      });
    }
    if (collectedApprox <= 0 && lastError) {
      const msg = String(lastError.message || lastError);
      if (/chest/i.test(msg)) {
        return fail('Inventory is full (I will not dump into chests mid-job). Free space or store items, then try again.', {
          blockNames: names,
          usedPlugin: true,
          reason: 'inventory full / no chests'
        });
      }
      return fail(`Collection path failed: ${msg}`, {
        blockNames: names,
        usedPlugin: true,
        reason: msg
      });
    }
    return ok(`Collected ${names.join('/')} (${collectedApprox}).`, {
      blockNames: names,
      requestedCount: count,
      targetCount: targets.length,
      collectedApprox,
      usedPlugin: 'direct-dig+vein'
    }, ['block_collected']);
  });
}

export async function equipBestToolSafely(bot, block, options = {}) {
  return safely('equipBestToolSafely', bot, options, async () => {
    if (bot?.tool?.equipForBlock) {
      await bot.tool.equipForBlock(block);
      return ok('Equipped best tool using mineflayer-tool.', { blockName: block?.name || null, usedPlugin: 'mineflayer-tool' }, ['tool_equipped']);
    }
    if (allowFallback(bot, options) && bot?.mcaiActions?.equipBestTool) {
      const result = await bot.mcaiActions.equipBestTool(block?.name || '');
      return result?.ok === false ? result : ok(result?.message || 'Equipped tool via configured fallback.', { ...(result?.data || {}), usedFallback: true }, result?.evidence || []);
    }
    return fail(pluginMissingReason('mineflayer-tool'), { usedPlugin: false });
  });
}

export async function pathToOwnerSafely(bot, options = {}) {
  return safely('pathToOwnerSafely', bot, options, async () => {
    const ownerName = options.ownerUsername || bot?.mcaiConfig?.ownerUsername || 'ModVinny';
    const owner = bot?.players?.[ownerName]?.entity;
    if (!owner) return fail('Owner is not visible.');
    if (!bot?.pathfinder?.goto) return fail(pluginMissingReason('mineflayer-pathfinder'), { usedPlugin: false });
    const distance = options.distance || bot?.mcaiConfig?.followDistance || 3;
    // Prefer dry land paths so come/follow do not walk into water/lava to reach you.
    const prevMovements = applyDryPathMovements(bot);
    const unregister = registerCancelableTask(bot, options, 'pluginWrappers:pathToOwner', () => clearPathfinderGoal(bot));
    try {
      if (botIsInFluid(bot)) {
        await emergencySurface(bot);
      }
      await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, distance));
      if (botIsInFluid(bot)) {
        await emergencySurface(bot);
      }
    } finally {
      unregister();
      restorePathMovements(bot, prevMovements);
    }
    return ok('Reached owner using mineflayer-pathfinder.', { owner: ownerName, usedPlugin: 'mineflayer-pathfinder' }, ['returned_safely']);
  });
}

export async function followOwnerSafely(bot, options = {}) {
  return safely('followOwnerSafely', bot, options, async () => {
    const ownerName = options.ownerUsername || bot?.mcaiConfig?.ownerUsername || 'ModVinny';
    const owner = bot?.players?.[ownerName]?.entity;
    if (!owner) return fail('Owner is not visible.');
    if (!bot?.pathfinder?.setGoal) return fail(pluginMissingReason('mineflayer-pathfinder'), { usedPlugin: false });
    const distance = options.distance || bot?.mcaiConfig?.followDistance || 3;
    // Dry-preferring movements while following (expensive water/lava).
    applyDryPathMovements(bot);
    bot.pathfinder.setGoal(new GoalFollow(owner, distance), true);
    registerCancelableTask(bot, options, 'pluginWrappers:followOwner', () => clearPathfinderGoal(bot));
    return ok('Following owner using mineflayer-pathfinder.', { owner: ownerName, distance, usedPlugin: 'mineflayer-pathfinder' }, ['follow_goal_set']);
  });
}

export async function pathToPositionSafely(bot, position, options = {}) {
  return safely('pathToPositionSafely', bot, options, async () => {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      return fail('Invalid target position.');
    }
    if (!bot?.pathfinder?.goto) return fail(pluginMissingReason('mineflayer-pathfinder'), { usedPlugin: false });
    const preferDry = options.preferDry !== false;
    const prevMovements = preferDry ? applyDryPathMovements(bot) : null;
    const unregister = registerCancelableTask(bot, options, 'pluginWrappers:pathToPosition', () => clearPathfinderGoal(bot));
    try {
      if (preferDry && botIsInFluid(bot)) {
        await emergencySurface(bot);
      }
      await bot.pathfinder.goto(new GoalNear(position.x, position.y, position.z, options.distance || 2));
    } finally {
      unregister();
      if (preferDry) restorePathMovements(bot, prevMovements);
    }
    return ok('Reached position using mineflayer-pathfinder.', { position, usedPlugin: 'mineflayer-pathfinder' }, ['returned_safely']);
  });
}

export async function eatSafely(bot, options = {}) {
  return safely('eatSafely', bot, options, async () => {
    if (bot?.autoEat?.eat) {
      await bot.autoEat.eat();
      return ok('Ate food using mineflayer-auto-eat.', { usedPlugin: 'mineflayer-auto-eat' }, ['food_eaten']);
    }
    if (allowFallback(bot, options) && bot?.mcaiActions?.executeAction) {
      return bot.mcaiActions.executeAction('eat_if_hungry', {}, { ...options, bot, source: options.source || 'pluginWrappers' });
    }
    return fail(pluginMissingReason('mineflayer-auto-eat'), { usedPlugin: false });
  });
}

export async function equipArmorSafely(bot, options = {}) {
  return safely('equipArmorSafely', bot, options, async () => {
    if (bot?.armorManager?.equipAll) {
      await bot.armorManager.equipAll();
      return ok('Equipped armor using mineflayer-armor-manager.', { usedPlugin: 'mineflayer-armor-manager' }, ['armor_equipped']);
    }
    if (allowFallback(bot, options) && bot?.mcaiActions?.executeAction) {
      return bot.mcaiActions.executeAction('equip_best_armor', {}, { ...options, bot, source: options.source || 'pluginWrappers' });
    }
    return fail(pluginMissingReason('mineflayer-armor-manager'), { usedPlugin: false });
  });
}
