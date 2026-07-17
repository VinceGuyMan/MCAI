import * as homeBase from './homeBase.js';
import * as inventory from './inventory.js';
import * as pluginWrappers from './pluginWrappers.js';
import * as food from './food.js';
import * as miningTools from './miningTools.js';
import { scoutSurfaceForOre, walkSurfaceLegs } from './surfaceOreScout.js';
import { isCancelledError } from './cancellation.js';
import { recordSessionEvent } from './sessionRecorder.js';
import {
  startTaskNarration,
  progressTaskNarration,
  tryStuckRecovery,
  companionFeatureEnabled
} from './companionMode.js';

// Iron-tier-and-below surface/building resources + food TJ understands and can collect.
const DEFAULT_COUNTS = {
  wood: 16,
  stone: 24,
  coal: 8,
  iron: 8,
  dirt: 16,
  sand: 16,
  gravel: 16,
  clay: 8,
  food: 6
};

const RESOURCE_ALIASES = {
  log: 'wood',
  logs: 'wood',
  wood: 'wood',
  oak: 'wood',
  birch: 'wood',
  spruce: 'wood',
  tree: 'wood',
  trees: 'wood',
  planks: 'wood',
  cobble: 'stone',
  cobblestone: 'stone',
  stone: 'stone',
  rock: 'stone',
  rocks: 'stone',
  deepslate: 'stone',
  andesite: 'stone',
  diorite: 'stone',
  granite: 'stone',
  coal: 'coal',
  // charcoal is NOT aliased to coal — use smelt charcoal instead of mining coal
  iron: 'iron',
  'raw iron': 'iron',
  iron_ore: 'iron',
  dirt: 'dirt',
  grass: 'dirt',
  'grass block': 'dirt',
  soil: 'dirt',
  mud: 'dirt',
  sand: 'sand',
  redsand: 'sand',
  'red sand': 'sand',
  gravel: 'gravel',
  clay: 'clay',
  'clay ball': 'clay',
  food: 'food',
  foods: 'food',
  fud: 'food',
  meal: 'food',
  snack: 'food',
  snacks: 'food',
  meat: 'food',
  meats: 'food'
};

const SHOVEL_RESOURCES = new Set(['dirt', 'sand', 'gravel', 'clay']);
const PICKAXE_RESOURCES = new Set(['stone', 'coal', 'iron']);

const THIN_ACTIONS = [
  'status',
  'stop',
  'come_to_owner',
  'follow_owner',
  'stay',
  'collect_resource',
  'resume_last_collect',
  'eat_if_hungry',
  'equip_tool_for',
  'equip_armor',
  'craft_item',
  'store_items',
  'return_home',
  'remember_home',
  'report_missing_requirements'
];

function now() {
  return Date.now();
}

function asError(error) {
  if (!error) return undefined;
  return error.stack || error.message || String(error);
}

function ok(message, evidence = {}, data = {}) {
  return { ok: true, message, evidence, data };
}

function fail(message, reason = message, evidence = {}, data = {}, error = undefined) {
  return { ok: false, message, reason, evidence, data, error };
}

export function listThinActions() {
  return [...THIN_ACTIONS];
}

export function listThinResources() {
  return Object.keys(DEFAULT_COUNTS);
}

export function listKnownBuildingBlocks() {
  return [
    'dirt', 'grass', 'sand', 'red sand', 'gravel', 'clay',
    'wood/logs/planks', 'cobblestone', 'stone', 'andesite', 'diorite', 'granite', 'deepslate',
    'coal', 'iron (raw/ore/ingot)', 'charcoal (smelt logs)',
    'torches', 'crafting table', 'furnace', 'chest',
    'wooden/stone/iron tools (pick, axe, shovel, hoe, sword)'
  ];
}

export function listKnownFoods() {
  return food.listKnownFoods();
}

export function listKnownFoodItems() {
  return food.listKnownFoodItems();
}

/**
 * Normalize a resource name for thin-core collection.
 * Returns a DEFAULT_COUNTS key (wood/stone/.../food), or null.
 * For specific food items (bread, steak), returns 'food' and callers may keep preferredFood via normalizeThinFoodRequest.
 */
export function normalizeThinResource(resource) {
  const normalized = String(resource || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (RESOURCE_ALIASES[normalized]) return RESOURCE_ALIASES[normalized];
  // Allow exact known keys
  if (DEFAULT_COUNTS[normalized]) return normalized;
  // Any known food item name → food collection
  const foodName = food.normalizeFoodName(normalized);
  if (foodName) return 'food';
  return null;
}

/** { resource: 'food', preferredFood: 'bread'|null } or null */
export function normalizeThinFoodRequest(resource) {
  const foodName = food.normalizeFoodName(resource);
  if (!foodName) return null;
  if (foodName === 'food') return { resource: 'food', preferredFood: null };
  return { resource: 'food', preferredFood: foodName };
}

export function parseThinCount(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(1, Math.min(64, safe));
}

export function createTaskContract({ type, target, count, timeoutMs, requiredItems = [], missingItems = [], blockedActions = [] }) {
  return {
    id: `thin-${type || 'task'}-${now()}`,
    type,
    target,
    count,
    timeoutMs,
    requiredItems,
    missingItems,
    blockedActions,
    startedAt: now(),
    status: 'started'
  };
}

function countByPredicate(bot, predicate) {
  return (bot?.inventory?.items?.() || [])
    .filter((item) => predicate(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

export function countResourceInventory(bot, resource) {
  const normalized = normalizeThinResource(resource);
  if (normalized === 'wood') {
    return countByPredicate(bot, (name) => /_(log|stem|wood|hyphae)$/.test(name) || /_planks$/.test(name));
  }
  if (normalized === 'stone') {
    return inventory.countItem(bot, 'cobblestone')
      + inventory.countItem(bot, 'stone')
      + inventory.countItem(bot, 'cobbled_deepslate')
      + inventory.countItem(bot, 'andesite')
      + inventory.countItem(bot, 'diorite')
      + inventory.countItem(bot, 'granite');
  }
  if (normalized === 'coal') {
    return inventory.countItem(bot, 'coal') + inventory.countItem(bot, 'charcoal');
  }
  if (normalized === 'iron') {
    return inventory.countItem(bot, 'raw_iron') + inventory.countItem(bot, 'iron_ore') + inventory.countItem(bot, 'iron_ingot');
  }
  if (normalized === 'dirt') {
    return inventory.countItem(bot, 'dirt')
      + inventory.countItem(bot, 'grass_block')
      + inventory.countItem(bot, 'coarse_dirt')
      + inventory.countItem(bot, 'rooted_dirt')
      + inventory.countItem(bot, 'mud');
  }
  if (normalized === 'sand') {
    return inventory.countItem(bot, 'sand') + inventory.countItem(bot, 'red_sand');
  }
  if (normalized === 'gravel') {
    return inventory.countItem(bot, 'gravel');
  }
  if (normalized === 'clay') {
    return inventory.countItem(bot, 'clay') + inventory.countItem(bot, 'clay_ball');
  }
  if (normalized === 'food') {
    return food.countFoodInventory(bot);
  }
  return 0;
}

function requiredToolsForResource(resource) {
  if (resource === 'wood' || resource === 'food') return [];
  if (SHOVEL_RESOURCES.has(resource)) return ['shovel'];
  if (PICKAXE_RESOURCES.has(resource)) return ['pickaxe'];
  return [];
}

function ownerDistance(bot, ownerName) {
  const owner = bot?.players?.[ownerName]?.entity;
  if (!owner || !bot?.entity?.position) return null;
  return bot.entity.position.distanceTo(owner.position);
}

function pos(bot) {
  const p = bot?.entity?.position;
  if (!p) return null;
  return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
}

function logThinAction(action, args, context, result, extra = {}) {
  const payload = {
    timestamp: now(),
    requestedCommand: context.rawText || context.command || '',
    mappedAction: action,
    arguments: args || {},
    safetyDecision: result.ok ? 'allowed' : 'rejected_or_failed',
    pluginWrapperUsed: extra.pluginWrapperUsed || result.data?.usedPlugin || result.evidence?.pluginWrapperUsed || null,
    result: result.ok ? 'ok' : 'failed',
    evidence: result.evidence || {},
    error: result.error || null
  };
  console.log(`[thin-core] ${action} ${payload.result}: ${result.message || result.reason}`);
  recordSessionEvent('thin_core_action', payload, context.config || {});
}

async function withThinLogging(action, args, context, fn) {
  try {
    const result = await fn();
    logThinAction(action, args, context, result);
    return result;
  } catch (error) {
    if (isCancelledError(error)) {
      const result = fail('Cancelled.', 'cancelled', { taskStatus: 'cancelled' }, {}, asError(error));
      logThinAction(action, args, context, result);
      return result;
    }
    const result = fail(`${action} failed: ${error.message || String(error)}`, error.message || String(error), {}, {}, asError(error));
    logThinAction(action, args, context, result);
    return result;
  }
}

function clearMovement(bot) {
  try {
    bot?.collectBlock?.cancelTask?.();
  } catch {
    // Best effort.
  }
  try {
    bot?.pathfinder?.setGoal?.(null);
  } catch {
    try {
      bot?.pathfinder?.stop?.();
    } catch {
      // Best effort.
    }
  }
  try {
    bot?.clearControlStates?.();
  } catch {
    // Best effort.
  }
  try {
    bot?.stopDigging?.();
  } catch {
    // Best effort.
  }
}

function markThinTaskActive(memory, actionName, task = null, extra = {}) {
  memory?.update?.({
    ...(task ? { currentTask: task } : {}),
    thinCoreTaskActive: true,
    activeThinCoreAction: actionName,
    thinCoreTaskStartedAt: now(),
    movementMode: extra.movementMode || `thin_${actionName}`,
    followOwnerActive: false,
    ...extra
  });
}

function clearThinTaskActive(memory, actionName, extra = {}) {
  const active = memory?.get?.().activeThinCoreAction;
  if (active && active !== actionName) {
    memory?.update?.(extra);
    return;
  }
  memory?.update?.({
    thinCoreTaskActive: false,
    activeThinCoreAction: null,
    thinCoreTaskStartedAt: 0,
    movementMode: null,
    currentTask: null,
    ...extra
  });
}

async function withTimeout(promise, timeoutMs, onTimeout = null) {
  const ms = Math.max(1, Number(timeoutMs || 0));
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          try {
            onTimeout?.();
          } catch {
            // Best effort cleanup.
          }
          resolve(fail(`Timed out after ${Math.round(ms / 1000)} seconds.`, 'timeout'));
        }, ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function makeContext(context = {}) {
  return {
    ...context,
    config: context.config || context.bot?.mcaiConfig || {}
  };
}

export function thinCoreStatus(bot, memory, context = {}) {
  const cfg = makeContext({ ...context, bot }).config;
  const ownerName = cfg.ownerUsername || 'ModVinny';
  const status = {
    enabled: cfg.thinCoreEnabled !== false,
    position: pos(bot),
    health: bot?.health ?? null,
    food: bot?.food ?? null,
    ownerDistance: ownerDistance(bot, ownerName),
    home: memory?.get?.().homeBasePosition || null,
    actions: listThinActions()
  };
  return ok(
    `Thin core ${status.enabled ? 'on' : 'off'}: hp ${status.health ?? '?'}, food ${status.food ?? '?'}, owner ${status.ownerDistance === null ? 'not visible' : `${Math.round(status.ownerDistance)} blocks`}.`,
    { thinCoreStatus: status },
    status
  );
}

export async function status(bot, memory, args = {}, context = {}) {
  return withThinLogging('status', args, makeContext({ ...context, bot }), async () => thinCoreStatus(bot, memory, context));
}

export async function stop(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('stop', args, ctx, async () => {
    context.skillRunner?.cancelActiveSkill?.('thin core stop');
    context.curriculumExecutor?.pauseCurriculum?.(bot, memory, 'thin core stop');
    context.blueprintSystem?.cancelBlueprintBuild?.(bot, memory, 'thin core stop');
    context.cancellation?.cancelAll?.('thin core stop');
    context.taskQueue?.clearTask?.();
    clearMovement(bot);
    memory?.update?.({
      currentTask: null,
      thinCoreTaskActive: false,
      activeThinCoreAction: null,
      thinCoreTaskStartedAt: 0,
      activeResourceRun: null,
      activeMiningExpedition: null,
      activeExploration: null,
      followOwnerActive: false,
      movementMode: null,
      lastAction: 'thin core stop',
      lastActionAt: now()
    });
    return ok('Stopped.', { stopped: true }, {});
  });
}

export async function come_to_owner(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('come_to_owner', args, ctx, async () => {
    const ownerName = ctx.config.ownerUsername || 'ModVinny';
    const targetDistance = args.distance || ctx.config.followDistance || 3;
    const timeoutMs = Number(ctx.config.thinCoreMoveTimeoutMs || ctx.config.ownerPathTimeoutMs || 45000);
    // Natural router already says "Coming to you" when starting; avoid double chat.
    markThinTaskActive(memory, 'come_to_owner', null, { movementMode: 'thin_come_to_owner' });
    let result;
    try {
      result = await withTimeout(pluginWrappers.pathToOwnerSafely(bot, {
        ...args,
        config: ctx.config,
        ownerUsername: ownerName,
        cancellation: context.cancellation || bot?.mcaiCancellation,
        distance: targetDistance,
        memory,
        moveOwner: 'come_to_owner',
        timeoutMs,
        source: 'thinCore'
      }), timeoutMs, () => clearMovement(bot));

      // One stuck-recovery retry when pathing times out or fails while owner is still visible.
      let distanceAfter = ownerDistance(bot, ownerName);
      const closeEnoughEarly = distanceAfter !== null && distanceAfter <= targetDistance + 4;
      if (
        !result.ok &&
        !closeEnoughEarly &&
        distanceAfter !== null &&
        companionFeatureEnabled('companionStuckRecovery', ctx.config, memory)
      ) {
        await tryStuckRecovery(bot);
        memory?.update?.({ lastUnstuckAt: now(), stuckCounter: 0 });
        result = await withTimeout(pluginWrappers.pathToOwnerSafely(bot, {
          ...args,
          config: ctx.config,
          ownerUsername: ownerName,
          cancellation: context.cancellation || bot?.mcaiCancellation,
          distance: targetDistance,
          source: 'thinCore'
        }), Math.min(timeoutMs, 20000), () => clearMovement(bot));
      }
    } finally {
      clearThinTaskActive(memory, 'come_to_owner', { followOwnerActive: false, lastAction: 'thin core come_to_owner', lastActionAt: now() });
    }
    const distance = ownerDistance(bot, ownerName);
    const closeEnough = distance !== null && distance <= targetDistance + 4;
    if (result.ok || (result.reason === 'timeout' && closeEnough)) {
      const rounded = distance === null ? '?' : Math.round(distance);
      return ok(
        `I am close to ${ownerName} (about ${rounded} blocks).`,
        { ownerDistance: distance, pluginWrapperUsed: result.data?.usedPlugin || 'mineflayer-pathfinder', softSuccess: !result.ok },
        { ownerDistance: distance, wrapper: result }
      );
    }
    const distText = distance === null ? 'I cannot see you' : `I am about ${Math.round(distance)} blocks away`;
    const reason = result.reason || result.message || 'path failed';
    const hint = reason === 'timeout'
      ? `${distText}. Pathing timed out — say "come here" again or "follow me".`
      : `${distText}: ${reason}`;
    return fail(hint, reason, { ownerDistance: distance, pluginWrapperUsed: result.data?.usedPlugin || null }, { wrapper: result });
  });
}

export async function follow_owner(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('follow_owner', args, ctx, async () => {
    const ownerName = ctx.config.ownerUsername || 'ModVinny';
    const followRange = args.distance || ctx.config.followDistance || 3;
    const result = await pluginWrappers.followOwnerSafely(bot, {
      ...args,
      config: ctx.config,
      ownerUsername: ownerName,
      cancellation: context.cancellation || bot?.mcaiCancellation,
      distance: followRange,
      memory,
      moveOwner: 'follow_owner',
      source: 'thinCore'
    });
    const distance = ownerDistance(bot, ownerName);
    if (result.ok) memory?.update?.({ followOwnerActive: true, movementMode: 'follow_owner', lastAction: 'thin core follow_owner', lastActionAt: now() });
    return result.ok
      ? ok(`Following ${ownerName} within ${followRange} blocks.`, { ownerDistance: distance, pluginWrapperUsed: result.data?.usedPlugin }, { ownerDistance: distance, wrapper: result })
      : fail(result.reason || result.message, result.reason || result.message, { ownerDistance: distance, pluginWrapperUsed: result.data?.usedPlugin || null }, { wrapper: result });
  });
}

export async function stay(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('stay', args, ctx, async () => {
    clearMovement(bot);
    memory?.update?.({ followOwnerActive: false, movementMode: null, lastAction: 'thin core stay', lastActionAt: now() });
    return ok('Staying here.', { movementCleared: true }, {});
  });
}

export async function collect_resource(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('collect_resource', args, ctx, async () => {
    const rawTarget = args.resource || args.resourceName || args.blockOrResource || args.target;
    const foodHit = food.normalizeFoodName(rawTarget);
    const preferredFood = args.preferredFood || args.foodItem || null
      || (foodHit && foodHit !== 'food' ? foodHit : null);
    const resource = normalizeThinResource(rawTarget) || (args.resource === 'food' ? 'food' : null);
    // Allow resource: 'food' even when preferredFood is already set.
    const resolved = resource || (preferredFood ? 'food' : null) || (args.resource === 'food' ? 'food' : null);
    if (!resolved || !DEFAULT_COUNTS[resolved]) {
      return fail(
        `I know iron-down blocks (dirt, sand, gravel, clay, wood, stone, coal, iron) and foods (bread, steak, apples, meat…) — not "${rawTarget || 'that'}".`,
        'unsupported resource',
        {
          requestedResource: rawTarget || null,
          knownResources: listThinResources(),
          knownFoods: listKnownFoodItems().slice(0, 24)
        }
      );
    }
    const resourceKey = resolved;
    const target = parseThinCount(args.count ?? args.targetCount, DEFAULT_COUNTS[resourceKey]);
    const label = preferredFood && resourceKey === 'food' ? preferredFood.replace(/_/g, ' ') : resourceKey;
    const task = createTaskContract({
      type: 'collect_resource',
      target: preferredFood && resourceKey === 'food' ? preferredFood : resourceKey,
      count: target,
      timeoutMs: Number(ctx.config.thinCoreCollectTimeoutMs || ctx.config.competentCoreMaxActiveTaskMs || 180000),
      requiredItems: requiredToolsForResource(resourceKey),
      blockedActions: ['dig_straight_down', 'enter_cave_without_confirmation']
    });

    // Food success is measured on total edible count; preferred name is for messaging/resume.
    const before = countResourceInventory(bot, resourceKey);
    startTaskNarration(bot, memory, 'collect_resource', {
      resource: label,
      count: target,
      quietMacro: context.quietMacro || context.silent || context.source === 'competentCore'
    });
    markThinTaskActive(memory, 'collect_resource', task, {
      activeResourceRun: { resource: resourceKey, preferredFood, targetCount: target, startedAt: now(), source: 'thinCore' },
      movementMode: 'thin_collect_resource',
      lastAction: `thin core collect ${label}`,
      lastActionAt: now()
    });

    let wrapper;
    let progressTimer = null;
    const maxDistance = args.maxDistance || ctx.config.thinCoreCollectMaxDistance || 32;

    const runCollect = async (countNeed) => {
      if (resourceKey === 'food') {
        // Absolute floor = current inventory + how many more we want (net gain).
        const startFood = countResourceInventory(bot, 'food');
        const absoluteTarget = startFood + countNeed;
        if (context.actions?.executeAction) {
          const out = await withTimeout(context.actions.executeAction('get_food', {
            targetCount: absoluteTarget,
            count: countNeed,
            preferredFood: preferredFood || undefined
          }, { ...ctx, source: 'thinCore', silent: true }), task.timeoutMs, () => clearMovement(bot));
          const gained = Math.max(0, countResourceInventory(bot, 'food') - startFood);
          if (out?.ok === false) {
            return fail(out.message || out.reason || 'Food search failed', out.reason || out.message, { gained }, out);
          }
          return ok(out?.message || `Food search finished for ${label}.`, {
            usedPlugin: 'food',
            preferredFood,
            gained,
            count: countResourceInventory(bot, 'food')
          }, { ...out, usedPlugin: 'food', gained });
        }
        const found = await withTimeout(food.findFood(bot, {
          config: ctx.config,
          shouldStop: () => Boolean(context.cancellation?.isCancelled?.()),
          targetCount: absoluteTarget,
          preferredFood: preferredFood || undefined
        }), task.timeoutMs, () => clearMovement(bot));
        const gained = Math.max(0, countResourceInventory(bot, 'food') - startFood);
        if (found?.ok === false) {
          return fail(found.message || found.reason || 'Food search failed', found.reason || found.message, { gained }, found);
        }
        return ok(found?.message || `Food search finished for ${label}.`, {
          usedPlugin: 'food',
          preferredFood,
          gained,
          count: countResourceInventory(bot, 'food')
        }, { ...found, usedPlugin: 'food', gained });
      }

      // Bootstrap a pickaxe before stone/coal/iron so collect is not dead on arrival.
      // Check inventory (any usable pick), not only equipped hand.
      if (['stone', 'coal', 'iron'].includes(resourceKey)) {
        const minRank = resourceKey === 'iron' ? 2 : 1;
        const hasPick = miningTools.hasUsablePickaxe(bot, { minRank, minDurability: 1 });
        if (!hasPick) {
          try {
            const boot = await miningTools.craftPickaxeIfNeeded(bot, {
              minRank,
              config: ctx.config,
              shouldStop: () => Boolean(context.cancellation?.isCancelled?.())
            });
            if (boot?.ok === false && !miningTools.hasUsablePickaxe(bot, { minRank, minDurability: 1 })) {
              const tip = resourceKey === 'iron'
                ? 'Iron needs a stone pickaxe or better. Say "mine stone" then "craft stone tools".'
                : 'Say "get wood" then "craft basic tools", or "craft stone tools" if you have cobble.';
              return fail(
                boot.message || `I need a pickaxe (rank ${minRank}+) before mining ${resourceKey}. ${tip}`,
                'missing pickaxe',
                { resource: resourceKey, minRank }
              );
            }
          } catch (error) {
            if (!miningTools.hasUsablePickaxe(bot, { minRank, minDurability: 1 })) {
              return fail(`Could not craft a pickaxe: ${error.message || error}`, 'pickaxe craft failed');
            }
          }
        } else {
          // Equip best pick so tool plugin / dig uses it immediately.
          try {
            await miningTools.equipBestMiningTool(bot, resourceKey === 'iron' ? { name: 'iron_ore' } : { name: 'stone' }, {
              minRank
            });
          } catch {
            // best effort
          }
        }
      }

      const stoneSearchDistance = Number(args.maxDistance || ctx.config.thinCoreCollectMaxDistance || 48);
      const oreSearchDistance = ['iron', 'coal'].includes(resourceKey)
        ? Number(args.maxDistance || ctx.config.thinCoreOreScoutMaxDistance || ctx.config.thinCoreIronMaxDistance || 96)
        : resourceKey === 'stone'
          ? Math.max(stoneSearchDistance, 48)
          : resourceKey === 'wood'
            ? Math.max(stoneSearchDistance, 40)
            : maxDistance;
      // Scout surface when ore empty; also walk a little for stone if none nearby.
      const wantScout = args.surfaceScout === true
        || (['iron', 'coal'].includes(resourceKey) && ctx.config.surfaceOreScoutEnabled !== false)
        || (resourceKey === 'stone' && ctx.config.surfaceOreScoutEnabled !== false);

      // Stone/ore: soft dry (hill faces OK). Shovel surface: strict dry.
      const strictDry = ['dirt', 'sand', 'gravel', 'clay'].includes(resourceKey);
      const collectOpts = {
        config: ctx.config,
        cancellation: context.cancellation || bot?.mcaiCancellation,
        safety: context.safety || bot?.mcaiSafety,
        state: context.state,
        actions: context.actions || bot?.mcaiActions,
        resourceName: resourceKey,
        count: countNeed,
        targetCount: countNeed,
        requireToolPlugin: resourceKey !== 'wood',
        maxDistance: oreSearchDistance,
        preferDry: true,
        strictDry,
        collectOneByOne: true,
        source: 'thinCore'
      };
      let attempt = await withTimeout(
        pluginWrappers.collectBlockSafely(bot, resourceKey, collectOpts),
        task.timeoutMs,
        () => clearMovement(bot)
      );

      // Surface scout / walk when nothing nearby (not when inventory is full).
      const failText = String(attempt.reason || attempt.message || '');
      const noneNearby = !attempt.ok && /no nearby|no safe|not found|could not collect|none nearby/i.test(failText);
      const invFull = /inventory full/i.test(failText);
      if (wantScout && noneNearby && !invFull && countResourceInventory(bot, resourceKey) < before + countNeed) {
        if (['iron', 'coal'].includes(resourceKey)) {
          const scout = await scoutSurfaceForOre(bot, resourceKey, {
            radius: oreSearchDistance,
            maxLegs: Number(ctx.config.surfaceOreScoutLegs || 8),
            legDistance: Number(ctx.config.surfaceOreScoutLegBlocks || 32),
            shouldStop: () => Boolean(context.cancellation?.isCancelled?.())
          });
          if (scout.found) {
            attempt = await withTimeout(
              pluginWrappers.collectBlockSafely(bot, resourceKey, collectOpts),
              Math.min(task.timeoutMs, 120000),
              () => clearMovement(bot)
            );
          } else if (!attempt.ok) {
            attempt = fail(
              scout.message
                || `No ${resourceKey} in loaded surface chunks after scouting ~${oreSearchDistance}m. Explore with me to a new area.`,
              'ore scout empty',
              { scout: scout.message, searchDistance: oreSearchDistance }
            );
          }
        } else if (resourceKey === 'stone') {
          // Walk a few legs then re-scan for stone (no ore plugin needed).
          await walkSurfaceLegs(bot, {
            maxLegs: 4,
            legDistance: 24,
            shouldStop: () => Boolean(context.cancellation?.isCancelled?.())
          });
          attempt = await withTimeout(
            pluginWrappers.collectBlockSafely(bot, resourceKey, { ...collectOpts, maxDistance: Math.max(oreSearchDistance, 48) }),
            Math.min(task.timeoutMs, 90000),
            () => clearMovement(bot)
          );
          if (!attempt.ok) {
            attempt = fail(
              attempt.message || 'No stone nearby after a short walk. Lead me to a hillside or stone outcrop.',
              attempt.reason || 'stone scout empty'
            );
          }
        }
      }
      return attempt;
    };

    try {
      progressTimer = setInterval(() => {
        try {
          const current = countResourceInventory(bot, resourceKey);
          progressTaskNarration(bot, memory, {
            resource: label,
            collected: Math.max(0, current - before),
            target
          });
        } catch {
          // best effort narration
        }
      }, 12000);
      wrapper = await runCollect(target);
      let mid = countResourceInventory(bot, resourceKey);
      let got = Math.max(0, mid - before);
      const failText = String(wrapper.reason || wrapper.message || '');
      const pathStuck = !wrapper.ok && /took to long|path|goal was changed|timeout|sticky|no path|couldn't find|could not find/i.test(failText);
      const drownedOut = !wrapper.ok && /drown|low (air|oxygen)|underwater/i.test(failText);
      // Pathing recovery: unstuck + wider search, up to 2 retries for surface blocks.
      if (pathStuck && got < target && resourceKey !== 'food' && !drownedOut) {
        const maxRetries = ['dirt', 'sand', 'gravel', 'clay'].includes(resourceKey) ? 2 : 1;
        for (let attempt = 0; attempt < maxRetries && got < target; attempt += 1) {
          clearMovement(bot);
          if (companionFeatureEnabled('companionStuckRecovery', ctx.config, memory)) {
            try {
              await tryStuckRecovery(bot);
              memory?.update?.({ lastUnstuckAt: now(), stuckCounter: 0 });
            } catch {
              // best effort
            }
          }
          await new Promise((r) => setTimeout(r, 400));
          const remaining = Math.max(1, target - got);
          const wider = Math.min(48, maxDistance + 8 * (attempt + 1));
          const retry = await withTimeout(pluginWrappers.collectBlockSafely(bot, resourceKey, {
            config: ctx.config,
            cancellation: context.cancellation || bot?.mcaiCancellation,
            safety: context.safety,
            state: context.state,
            resourceName: resourceKey,
            count: remaining,
            targetCount: remaining,
            requireToolPlugin: true,
            maxDistance: wider,
            preferDry: true,
            collectOneByOne: true,
            source: 'thinCore'
          }), Math.min(task.timeoutMs, 60000), () => clearMovement(bot));
          mid = countResourceInventory(bot, resourceKey);
          got = Math.max(0, mid - before);
          if (retry.ok || got > Math.max(0, mid - remaining)) wrapper = retry;
          if (got >= target || retry.ok) break;
          if (/drown|low (air|oxygen)|underwater|no safe dry/i.test(String(retry.reason || retry.message || ''))) {
            wrapper = retry;
            break;
          }
        }
      }
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      clearThinTaskActive(memory, 'collect_resource', { activeResourceRun: null });
    }

    const after = countResourceInventory(bot, resourceKey);
    const collected = Math.max(0, after - before);
    // Success = net gain toward target (not "already had enough in inventory").
    const reached = collected >= target
      || (resourceKey === 'food' && Number(wrapper.data?.gained) >= target);
    const evidence = {
      task: { ...task, status: wrapper.ok && reached ? 'complete' : 'incomplete' },
      startingInventoryCount: before,
      endingInventoryCount: after,
      targetCount: target,
      collectedCount: collected,
      preferredFood: preferredFood || null,
      blocksAttempted: wrapper.data?.targetCount || 0,
      pluginWrapperUsed: wrapper.data?.usedPlugin || (resourceKey === 'food' ? 'food' : null),
      failureReason: wrapper.ok ? (reached ? '' : 'inventory count did not reach target') : (wrapper.reason || wrapper.message)
    };

    if (reached) {
      memory?.update?.({ lastIncompleteCollect: null });
      if (!wrapper.ok) {
        return ok(`Collected ${collected}/${target} ${label}; the wrapper ended with ${wrapper.reason || wrapper.message}.`, evidence, { wrapper });
      }
      return ok(`Collected ${collected}/${target} ${label}.`, evidence, { wrapper });
    }

    const remaining = Math.max(1, target - collected);
    memory?.update?.({
      lastIncompleteCollect: {
        resource: resourceKey,
        preferredFood: preferredFood || null,
        targetCount: target,
        collectedCount: collected,
        remaining,
        at: now(),
        reason: wrapper.reason || wrapper.message || 'target not reached'
      }
    });
    const failText = String(wrapper.reason || wrapper.message || '');
    const pathHint = /took to long|path|goal was changed|timeout|sticky/i.test(failText)
      ? ' Pathing got sticky.'
      : '';
    const waterHint = /drown|underwater|low (air|oxygen)|no safe dry/i.test(failText)
      ? ' I skipped underwater spots so I do not drown — try dry land.'
      : '';
    const resumeHint = ' Say "tj finish last job" to continue.';
    if (!wrapper.ok) {
      const prefix = collected > 0 ? `I only got ${collected}/${target} ${label}` : `I could not collect ${label}`;
      return fail(`${prefix}.${waterHint || pathHint}${resumeHint}`, wrapper.reason || wrapper.message, evidence, { wrapper });
    }
    return fail(`I only got ${collected}/${target} ${label}.${waterHint || pathHint}${resumeHint}`, 'target not reached', evidence, { wrapper });
  });
}

export async function resume_last_collect(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('resume_last_collect', args, ctx, async () => {
    const job = memory?.get?.().lastIncompleteCollect;
    if (!job?.resource || !job.remaining) {
      return fail('I do not have an incomplete gather job to finish. Ask me to dig dirt/sand/gravel/clay, get food, or mine wood/stone/coal/iron first.', 'no incomplete collect');
    }
    const ageMs = now() - Number(job.at || 0);
    if (ageMs > Number(ctx.config.lastIncompleteCollectMaxAgeMs || 20 * 60 * 1000)) {
      memory?.update?.({ lastIncompleteCollect: null });
      return fail('That last gather job is too old. Give me a fresh mine/get command.', 'incomplete collect expired');
    }
    return collect_resource(bot, memory, {
      resource: job.resource,
      preferredFood: job.preferredFood || undefined,
      count: job.remaining
    }, context);
  });
}

export async function eat_if_hungry(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('eat_if_hungry', args, ctx, async () => {
    const before = bot?.food ?? null;
    const minFood = Number(args.minFood ?? ctx.config.minFoodBeforeEating ?? 18);
    if (before !== null && before >= minFood) {
      return ok('Food is already high enough.', { foodBefore: before, foodAfter: before, ate: false }, { food: before });
    }
    const result = await pluginWrappers.eatSafely(bot, {
      ...args,
      config: ctx.config,
      cancellation: context.cancellation || bot?.mcaiCancellation,
      source: 'thinCore'
    });
    const after = bot?.food ?? null;
    return result.ok
      ? ok('Ate if hungry.', { foodBefore: before, foodAfter: after, ate: true, pluginWrapperUsed: result.data?.usedPlugin }, { wrapper: result })
      : fail(result.reason || result.message, result.reason || result.message, { foodBefore: before, foodAfter: after, ate: false, pluginWrapperUsed: result.data?.usedPlugin || null }, { wrapper: result });
  });
}

export async function equip_tool_for(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('equip_tool_for', args, ctx, async () => {
    const resource = normalizeThinResource(args.blockOrResource || args.resource || args.target);
    const namesByResource = {
      wood: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log'],
      stone: ['stone', 'cobblestone', 'deepslate', 'andesite', 'diorite', 'granite'],
      coal: ['coal_ore', 'deepslate_coal_ore'],
      iron: ['iron_ore', 'deepslate_iron_ore'],
      dirt: ['dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'mud'],
      sand: ['sand', 'red_sand'],
      gravel: ['gravel'],
      clay: ['clay']
    };
    const names = resource ? namesByResource[resource] : [String(args.blockOrResource || args.blockName || '').trim()].filter(Boolean);
    if (!names.length) return fail('Tell me what block or resource to equip a tool for.', 'missing target');
    const positions = bot?.findBlocks?.({
      matching: (block) => names.includes(block?.name),
      maxDistance: args.maxDistance || 16,
      count: 8
    }) || [];
    const block = positions.map((position) => bot.blockAt?.(position)).filter(Boolean)[0] || { name: names[0] };
    const result = await pluginWrappers.equipBestToolSafely(bot, block, {
      config: ctx.config,
      cancellation: context.cancellation || bot?.mcaiCancellation,
      source: 'thinCore'
    });
    return result.ok
      ? ok('Equipped the best tool I can for that target.', { target: block.name, pluginWrapperUsed: result.data?.usedPlugin }, { wrapper: result })
      : fail(result.reason || result.message, result.reason || result.message, { target: block.name, pluginWrapperUsed: result.data?.usedPlugin || null }, { wrapper: result });
  });
}

export async function equip_armor(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('equip_armor', args, ctx, async () => {
    const result = await pluginWrappers.equipArmorSafely(bot, {
      ...args,
      config: ctx.config,
      cancellation: context.cancellation || bot?.mcaiCancellation,
      source: 'thinCore'
    });
    return result.ok
      ? ok('Equipped safe armor if available.', { pluginWrapperUsed: result.data?.usedPlugin }, { wrapper: result })
      : fail(result.reason || result.message, result.reason || result.message, { pluginWrapperUsed: result.data?.usedPlugin || null }, { wrapper: result });
  });
}

export async function craft_item(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('craft_item', args, ctx, async () => {
    const item = String(args.item || args.itemName || '').trim();
    const count = parseThinCount(args.count, 1);
    if (!item) return fail('Tell me what item to craft.', 'missing item');
    if (context.actions?.executeAction) {
      const result = await context.actions.executeAction('craft_item', { itemName: item, count }, { ...ctx, source: 'thinCore' });
      return result.ok ? ok(result.message || `Crafted ${item}.`, { item, count, legacyAction: 'craft_item' }, { result }) : fail(result.reason || result.message, result.reason || result.message, { item, count, legacyAction: 'craft_item' }, { result });
    }
    return fail('Crafting is not wired into thin core in this runtime.', 'craft action unavailable', { item, count });
  });
}

export async function store_items(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('store_items', args, ctx, async () => {
    if (context.actions?.executeAction) {
      const result = await context.actions.executeAction(
        'store_items',
        { mode: args.mode || 'safe_excess', silent: true },
        { ...ctx, source: 'thinCore', silent: true }
      );
      return result.ok
        ? ok(result.message || 'Stored safe excess items.', { mode: args.mode || 'safe_excess', legacyAction: 'store_items' }, { result })
        : fail(result.reason || result.message, result.reason || result.message, { mode: args.mode || 'safe_excess', legacyAction: 'store_items' }, { result });
    }
    return fail('Storage is not wired into thin core in this runtime.', 'storage action unavailable');
  });
}

export async function return_home(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('return_home', args, ctx, async () => {
    const home = homeBase.getHome(memory);
    if (!home) return fail('No home is set yet.', 'home not set');
    const result = await withTimeout(pluginWrappers.pathToPositionSafely(bot, home, {
      ...args,
      config: ctx.config,
      cancellation: context.cancellation || bot?.mcaiCancellation,
      distance: args.distance || 2,
      source: 'thinCore'
    }), Number(ctx.config.thinCoreMoveTimeoutMs || ctx.config.ownerPathTimeoutMs || 20000), () => clearMovement(bot));
    return result.ok
      ? ok('Returned home.', { home, pluginWrapperUsed: result.data?.usedPlugin }, { wrapper: result })
      : fail(result.reason || result.message, result.reason || result.message, { home, pluginWrapperUsed: result.data?.usedPlugin || null }, { wrapper: result });
  });
}

export async function remember_home(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  return withThinLogging('remember_home', args, ctx, async () => {
    const result = homeBase.setHome(bot, memory, bot?.entity?.position, { name: args.name || 'home' });
    return result?.ok === false
      ? fail(result.reason || result.message, result.reason || result.message)
      : ok(result.message || 'Home remembered.', { home: memory?.get?.().homeBasePosition || null }, { result });
  });
}

function friendlyUnsupportedMessage(task) {
  const text = String(task || '').toLowerCase();
  if (/\b(diamond|diamonds|netherite|ancient debris)\b/.test(text)) {
    return 'Diamond and netherite mining is not auto-enabled yet — too easy to lose gear deep underground. I can mine coal or iron, prep tools, or come to you. Say "tj help" for ideas.';
  }
  if (/\b(base|camp|shelter|house|build|biuld|castle|tower)\b/.test(text)) {
    return 'I can make camp, build shelter, light home, or place a chest — not giant custom bases yet. Try "tj make camp" or "tj build shelter".';
  }
  if (/\b(chest|storage|barrel)\b/.test(text)) {
    return 'Try "tj place chest" or "tj store items" for storage. I need planks nearby to place a chest.';
  }
  if (/\b(help|commands?|what can you)\b/.test(text)) {
    return 'Try: come here, follow me, dig dirt/sand/gravel/clay, get food/bread/steak, get wood/stone/coal/iron, status, set home, place chest, make camp, light home. Say "tj help" for more.';
  }
  return `I am not sure how to do "${task || 'that'}" yet. Try: come here, dig dirt, get food, get wood/coal/iron, status, place chest, make camp — or say "tj help".`;
}

export async function report_missing_requirements(bot, memory, args = {}, context = {}) {
  const ctx = makeContext({ ...context, bot });
  const task = args.task || args.rawText || context.rawText || 'that';
  return withThinLogging('report_missing_requirements', args, ctx, async () => fail(
    friendlyUnsupportedMessage(task),
    'unsupported thin-core request',
    { task, availableActions: listThinActions(), friendly: true }
  ));
}

const dispatch = {
  status,
  stop,
  come_to_owner,
  follow_owner,
  stay,
  collect_resource,
  resume_last_collect,
  eat_if_hungry,
  equip_tool_for,
  equip_armor,
  craft_item,
  store_items,
  return_home,
  remember_home,
  report_missing_requirements
};

export async function runThinAction(bot, memory, actionName, args = {}, context = {}) {
  const handler = dispatch[actionName];
  if (!handler) return fail(`Unknown thin-core action: ${actionName}`, 'unknown thin-core action');
  return handler(bot, memory, args, context);
}

function stripBot(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[']/g, '')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/^@?tj\b\s*/i, '')
    .replace(/^!tj\b\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countFromText(text) {
  const match = stripBot(text).match(/\b(\d{1,2})\b/);
  return match ? parseThinCount(match[1], 1) : null;
}

function thinRefuse(intent, speak, reason, alternatives = []) {
  return {
    ok: false,
    mode: 'refuse',
    confidence: 0.92,
    intent,
    canonicalCommand: null,
    action: null,
    thinAction: null,
    args: {},
    riskLevel: 'low',
    requiresConfirmation: false,
    alternatives,
    speak,
    reason,
    source: 'thin_core'
  };
}

function thinAnswer(intent, speak, reason = 'Informational question — answer only, no job started.') {
  return {
    ok: true,
    mode: 'answer',
    confidence: 0.97,
    intent,
    canonicalCommand: null,
    action: null,
    thinAction: null,
    args: {},
    riskLevel: 'low',
    requiresConfirmation: false,
    alternatives: [],
    speak,
    reason,
    source: 'thin_core'
  };
}

/**
 * True when the owner is asking a question / for knowledge, not issuing an imperative job.
 * Polite requests without "?" like "can you get wood" still count as commands.
 */
export function isInformationalOwnerQuery(text) {
  const raw = String(text || '').trim();
  const normalized = stripBot(raw);
  if (!normalized) return false;

  // Explicit how/what/why/where knowledge questions
  if (/^(how|what|why|who|when|where|which)\b/.test(normalized)) return true;
  if (/\b(how do (we|i|you)|how can (we|i|you)|how does|how to|what is|what are)\b/.test(normalized)) return true;

  // Past-tense status questions (must not re-run collect)
  if (/\b(did you|have you|were you|what did you|where did you)\b/.test(normalized)) return true;

  // Capability / knowledge probes
  if (/\b(do you know|are you able|are you good at|what can you)\b/.test(normalized)) return true;

  // "can you X?" with a question mark → explain, don't execute
  if (/\?/.test(raw) && /\b(can you|could you|would you|will you)\b/.test(normalized)) return true;

  // "can you smelt charcoal" without ? is often capability — still treat as question when only can/could + verb + object (no "me"/"us"/"please get")
  if (
    /\b(can you|could you)\b/.test(normalized)
    && /\b(smelt|craft|mine|dig|cook|hunt|know)\b/.test(normalized)
    && !/\b(get me|get us|please get|please mine|please craft|please make|for me|for us)\b/.test(normalized)
    && (/\?/.test(raw) || /^(can you|could you)\b/.test(normalized))
  ) {
    return true;
  }

  return false;
}

function answerInformationalQuery(normalized) {
  // Iron progression knowledge
  if (/\biron\b/.test(normalized) && /\b(tool|tools|gear|age|path|progress|ingot)\b/.test(normalized)) {
    return thinAnswer(
      'knowledge_iron_path',
      'Path to iron tools: get wood → craft wooden tools → mine stone → craft stone tools → smelt charcoal (or mine coal) → craft torches → mine iron (stone pick+) → smelt iron → craft iron tools. Say "progress to iron" to run that path, or step through each command.'
    );
  }
  if (/\bcharcoal\b/.test(normalized) || (/\bsmelt\b/.test(normalized) && /\b(can you|do you|how)\b/.test(normalized))) {
    return thinAnswer(
      'knowledge_smelt',
      'Yes — I can smelt charcoal from logs in a furnace, and smelt raw iron into ingots. Say "smelt charcoal" or "smelt iron" when you want me to do it (needs furnace + fuel).'
    );
  }
  if (/\bfood\b/.test(normalized) || /\b(eat|hungry|berries|steak|bread)\b/.test(normalized)) {
    return thinAnswer(
      'knowledge_food',
      `I know these foods: ${listKnownFoods().slice(0, 20).join(', ')}. Say "get food", "eat", or "food status" for a live inventory check — I will not re-hunt just because you asked a question.`
    );
  }
  if (/\b(block|dirt|sand|gravel|clay|dig|mine|resource)\b/.test(normalized)) {
    return thinAnswer(
      'knowledge_blocks',
      'I know iron-down blocks: dirt, sand, gravel, clay, wood, stone, coal, iron. Dig commands skip underwater spots so I do not drown. Say "dig dirt" or "mine iron" when you want a job.'
    );
  }
  if (/\b(tool|pickaxe|craft)\b/.test(normalized)) {
    return thinAnswer(
      'knowledge_tools',
      'I can craft full wooden, stone, and iron tool sets when materials exist. Iron ore needs a stone pickaxe or better. Say "craft basic tools", "craft stone tools", or "craft iron tools".'
    );
  }
  // Generic capability question
  return thinAnswer(
    'knowledge_generic',
    'Ask me to do a job with a clear command (get wood, mine stone, smelt charcoal, progress to iron, come here). Questions like "how do we…" or "did you…" get answers only — I will not start a collect run from a question.'
  );
}

export function routeThinCoreIntent(text, context = {}) {
  const normalized = stripBot(text);
  if (!normalized) return null;
  const base = {
    ok: true,
    mode: 'execute',
    confidence: 0.96,
    riskLevel: 'low',
    requiresConfirmation: false,
    alternatives: [],
    source: 'thin_core'
  };

  // Knowledge / Q&A first — never treat "how do we get iron tools?" as collect iron.
  if (isInformationalOwnerQuery(text)) {
    return answerInformationalQuery(normalized);
  }

  if (/^(status|stat|check status|how are you|how you doing|you good)$/.test(normalized)) {
    return { ...base, intent: 'status', canonicalCommand: 'tj thin status', action: 'thin_status', thinAction: 'status', args: {}, reason: 'Matched thin-core status.' };
  }
  if (/^(come here|come to me|come back|return to me|come|come over|get over here|come closer)$/.test(normalized)) {
    return { ...base, intent: 'come_to_owner', canonicalCommand: 'tj thin come', action: 'thin_come_to_owner', thinAction: 'come_to_owner', args: {}, reason: 'Matched thin-core movement.' };
  }
  if (/^(follow me|stay with me|follow owner|follow|keep following)$/.test(normalized)) {
    return { ...base, intent: 'follow_owner', canonicalCommand: 'tj thin follow', action: 'thin_follow_owner', thinAction: 'follow_owner', args: {}, reason: 'Matched thin-core follow.' };
  }
  if (/^(stay|stay here|hold position|stop following|wait here)$/.test(normalized)) {
    return { ...base, intent: 'stay', canonicalCommand: 'tj thin stay', action: 'thin_stay', thinAction: 'stay', args: {}, reason: 'Matched thin-core stay.' };
  }
  // Only explicit eat — "get/need food" falls through to competent-core get_food.
  if (/^(eat|eat food|eat if hungry|have a snack)$/.test(normalized)) {
    return { ...base, intent: 'eat_if_hungry', canonicalCommand: 'tj thin eat', action: 'thin_eat_if_hungry', thinAction: 'eat_if_hungry', args: {}, reason: 'Matched thin-core eating.' };
  }
  if (/\b(remember|set|mark).{0,12}\bhome\b/.test(normalized) || /^(set home|this is home|make this home)$/.test(normalized)) {
    return { ...base, intent: 'remember_home', canonicalCommand: 'tj thin remember home', action: 'thin_remember_home', thinAction: 'remember_home', args: {}, reason: 'Matched thin-core remember home.' };
  }
  // Only return/go home — not "make a base" (building is handled by natural map).
  if (/^(go home|return home|head home|back home|return to base|go to base|head to base|back to base|back to home)$/.test(normalized)
    || /\b(go|return|head)\s+(home|to base|to home)\b/.test(normalized)
    || /\bback to (home|base)\b/.test(normalized)) {
    return { ...base, intent: 'return_home', canonicalCommand: 'tj thin return home', action: 'thin_return_home', thinAction: 'return_home', args: {}, reason: 'Matched thin-core return home.' };
  }
  if (/\b(get|collect|gather|mine|find|need|grab|dig).{0,20}\b(wood|logs?|oak|trees?|planks?|stone|cobble|cobblestone|andesite|diorite|granite|deepslate|coal|iron|raw iron|dirt|grass|soil|sand|red sand|gravel|clay)\b/.test(normalized)) {
    const resourceWord = normalized.match(/\b(wood|logs?|oak|trees?|planks?|stone|cobble|cobblestone|andesite|diorite|granite|deepslate|coal|iron|raw iron|dirt|grass|soil|sand|red sand|gravel|clay)\b/)?.[1];
    const resource = normalizeThinResource(resourceWord === 'red sand' ? 'red sand' : resourceWord);
    if (!resource) return null;
    return {
      ...base,
      intent: 'collect_resource',
      canonicalCommand: `tj thin collect ${resource}`,
      action: 'collect_resource',
      thinAction: 'collect_resource',
      args: { resource, count: countFromText(normalized) || DEFAULT_COUNTS[resource] || 1 },
      reason: `Matched thin-core collection for ${resource}.`
    };
  }
  // Food: generic ("get food") and specific items ("get bread", "need 8 steak", "grab apples").
  if (/\b(get|collect|gather|find|need|grab|hunt|make).{0,24}\b/.test(normalized)) {
    const foodMatch = normalized.match(
      /\b(get|collect|gather|find|need|grab|hunt)\s+(?:\d{1,2}\s+)?(?:some\s+|more\s+|a\s+|an\s+)?(.+)$/
    );
    if (foodMatch) {
      let foodPhrase = foodMatch[2]
        .replace(/\b(for us|for me|please)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // Strip trailing filler
      foodPhrase = foodPhrase.replace(/\b(please|now|asap)\b/g, '').trim();
      const foodReq = normalizeThinFoodRequest(foodPhrase);
      if (foodReq) {
        const count = countFromText(normalized) || DEFAULT_COUNTS.food;
        const label = foodReq.preferredFood || 'food';
        return {
          ...base,
          intent: 'collect_resource',
          canonicalCommand: foodReq.preferredFood
            ? `tj thin collect food ${foodReq.preferredFood}`
            : 'tj thin collect food',
          action: 'collect_resource',
          thinAction: 'collect_resource',
          args: {
            resource: 'food',
            preferredFood: foodReq.preferredFood || undefined,
            count
          },
          reason: `Matched thin-core food collection for ${label}.`
        };
      }
    }
  }
  // Bare food-item shorthand: "tj bread", "tj steak" (less common)
  {
    const bareFood = normalizeThinFoodRequest(normalized);
    if (bareFood && bareFood.preferredFood && !/\b(status|home|follow|come|stop|stay)\b/.test(normalized)) {
      // Only if the whole message is essentially the food name (1–4 words)
      if (normalized.split(/\s+/).length <= 4) {
        return {
          ...base,
          confidence: 0.9,
          intent: 'collect_resource',
          canonicalCommand: `tj thin collect food ${bareFood.preferredFood}`,
          action: 'collect_resource',
          thinAction: 'collect_resource',
          args: {
            resource: 'food',
            preferredFood: bareFood.preferredFood,
            count: countFromText(normalized) || DEFAULT_COUNTS.food
          },
          reason: `Matched bare food item ${bareFood.preferredFood}.`
        };
      }
    }
  }
  if (normalized === 'stop' || normalized === 'cancel' || normalized === 'halt') {
    return { ...base, intent: 'stop', canonicalCommand: 'tj stop', action: 'thin_stop', thinAction: 'stop', args: {}, reason: 'Matched thin-core stop.' };
  }
  if (/\b(finish|resume|continue).{0,16}\b(last|current|that|the)?\s*(job|task|collect|mining|gather)\b/.test(normalized)
    || /^(finish last job|finish current job|continue mining|resume collection|finish job)$/.test(normalized)) {
    return {
      ...base,
      intent: 'resume_last_collect',
      canonicalCommand: 'tj finish last job',
      action: 'resume_last_collect',
      thinAction: 'resume_last_collect',
      args: {},
      reason: 'Matched resume incomplete collect.'
    };
  }
  if (/\bwhat (blocks|materials|resources) (do you|can you)\b/.test(normalized)
    || /^(known blocks|block list|what can you mine|what can you dig)$/.test(normalized)) {
    return {
      ...base,
      intent: 'status',
      canonicalCommand: 'tj thin status',
      action: 'thin_status',
      thinAction: 'status',
      args: { reportResources: true },
      speak: `I know iron-down blocks: dirt, sand, gravel, clay, wood, stone, coal, iron. Also food: bread, steak, apples, meat, berries, and more.`,
      reason: 'Resource knowledge question.'
    };
  }
  if (/\bwhat (food|foods|meals?) (do you|can you)\b/.test(normalized)
    || /^(known foods?|food list|what can you (eat|hunt|cook)|what food do you know)$/.test(normalized)) {
    return {
      ...base,
      intent: 'status',
      canonicalCommand: 'tj food status',
      action: 'thin_status',
      thinAction: 'status',
      args: { reportFoods: true },
      speak: `I know these foods: ${listKnownFoods().join(' | ')}. Say "get food", "get bread", or "need steak".`,
      reason: 'Food knowledge question.'
    };
  }

  // Honest, useful refusals for known-not-ready capabilities (do not block other natural routing).
  if (/\b(get|mine|find|collect|need|grab|dig).{0,20}\b(diamonds?|netherite|ancient debris)\b/.test(normalized)
    || /\b(diamonds?|netherite)\b/.test(normalized) && /\b(mine|get|find|collect)\b/.test(normalized)) {
    return thinRefuse(
      'unsupported_valuable_mining',
      'I will not auto-mine diamonds or netherite yet — too easy to die deep. I can mine coal or iron, get tools ready, or come to you instead.',
      'Valuable deep mining is intentionally not auto-enabled.',
      [
        { canonicalCommand: 'tj mine coal', label: 'mine coal', reason: 'Safe early fuel resource.' },
        { canonicalCommand: 'tj mine iron', label: 'mine iron', reason: 'Next practical ore step.' },
        { canonicalCommand: 'tj run core prepare for mining', label: 'prepare for mining', reason: 'Check food, tools, and readiness.' }
      ]
    );
  }
  if (/\b(giant|huge|massive|castle|mansion|city)\b/.test(normalized) && /\b(build|make|create)\b/.test(normalized)) {
    return thinRefuse(
      'unsupported_large_build',
      'Large builds are outside my safe limits. I can make camp, build shelter, light home, or place a chest.',
      'Large custom builds are outside current blueprint limits.',
      [
        { canonicalCommand: 'tj make camp', label: 'make camp', reason: 'Small deterministic camp.' },
        { canonicalCommand: 'tj build shelter', label: 'build shelter', reason: 'Small deterministic shelter.' }
      ]
    );
  }

  // Unknown → fall through to natural command map / competent core / dialogue.
  return null;
}
