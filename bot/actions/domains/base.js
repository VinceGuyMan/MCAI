/**
 * Base camp: items, home, storage, building, resource runs, sleep/light.
 */
import { Vec3 } from 'vec3';
import * as inventory from '../../inventory.js';
import * as placement from '../../placement.js';
import * as lighting from '../../lighting.js';
import * as homeBase from '../../homeBase.js';
import * as storage from '../../storage.js';
import * as builder from '../../builder.js';
import * as resourceRuns from '../../resourceRuns.js';
import * as baseMaintenance from '../../baseMaintenance.js';
import { normalizeActionCount, wait, posText } from '../shared.js';

export function createBaseHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    taskQueue,
    safety,
    perception,
    cancellation,
    state,
    setupMovements,
    say,
    ownerEntity,
    throwIfCancelled,
    isCancelled,
    stopMotion,
    resourceOptions,
    syncWaypoint,
    thinRememberHomeAction,
    thinReturnHomeAction,
    thinCollectResourceAction,
    thinStoreItemsAction,
    GoalNear
  } = ctx;

  async function collectDropsAction(itemName = null) {
    throwIfCancelled();
    setupMovements();
    const collected = itemName
      ? await inventory.collectSpecificDrop(bot, itemName, 16, { shouldStop: isCancelled })
      : await inventory.collectNearbyDrops(bot, 8, { shouldStop: isCancelled });
    if (config.returnToOwnerAfterFoodTask) await inventory.returnToOwnerAfterCollect(bot, config).catch(() => null);
    say(collected.message, true);
    return collected;
  }

  async function dropItemAction(itemName, count = 1, options = {}) {
    const dropped = await inventory.dropItem(bot, itemName, count, { ...options, direct: true });
    say(dropped.message, true);
    return dropped;
  }

  async function giveOwnerItem(itemName, count = 1) {
    throwIfCancelled();
    if (!String(itemName || '').trim() || /^items?$/.test(String(itemName || '').trim().toLowerCase())) {
      const message = 'Tell me what item to give, like "tj give 3 oak logs to me" or "tj give me bread".';
      say(message, true);
      return { ok: false, message };
    }
    const owner = ownerEntity();
    if (!owner) {
      say('I cannot see ModVinny to give that item.', true);
      return { ok: false, message: 'owner not visible' };
    }
    await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, 2));
    throwIfCancelled();
    return dropItemAction(itemName, count, { giveToOwner: true });
  }

  async function stuckStatus() {
    const state = perception();
    const stuck = state.dangerFlags.stuckLikely || (memory.get().stuckCounter || 0) >= 3;
    say(`Stuck: ${stuck ? 'probably' : 'no'}, counter ${(memory.get().stuckCounter || 0)}, pos ${posText(state.position)}.`, true);
    return { ok: true, stuck };
  }

  async function unstuck() {
    throwIfCancelled();
    setupMovements();
    stopMotion();
    const start = bot.entity?.position?.clone();
    if (!start) return { ok: false, message: 'I am not spawned.' };

    console.log('[movement] unstuck recovery');
    bot.setControlState('jump', true);
    await wait(450);
    bot.setControlState('jump', false);
    bot.setControlState('back', true);
    await wait(700);
    bot.setControlState('back', false);
    bot.setControlState('jump', true);
    await wait(350);
    bot.setControlState('jump', false);

    const offsets = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2]];
    for (const [dx, dz] of offsets) {
      throwIfCancelled();
      const target = start.offset(dx, 0, dz);
      try {
        await bot.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 1));
        memory.update({ stuckCounter: 0, lastUnstuckAt: Date.now() });
        say('I tried an unstuck move and recalculated my path.', true);
        return { ok: true };
      } catch {
        // Try the next nearby point.
      }
    }

    memory.update({ stuckCounter: (memory.get().stuckCounter || 0) + 1, lastUnstuckAt: Date.now() });
    say('I tried to get unstuck, but I am still blocked.', true);
    return { ok: false };
  }

  async function deathStatus() {
    const mem = memory.get();
    say(`Deaths: ${mem.deathCount || 0}. Last death: ${posText(mem.lastDeathPosition)}${mem.lastDeathReason ? ` (${mem.lastDeathReason})` : ''}.`, true);
    return mem.lastDeathPosition;
  }

  async function goToDeathSpot() {
    throwIfCancelled();
    const pos = memory.get().lastDeathPosition;
    if (!pos) {
      say('I do not have a saved death spot.', true);
      return { ok: false };
    }
    const state = perception();
    if (state.dangerFlags.hostileNearby || state.dangerFlags.lavaNearby || state.dangerFlags.fireNearby) {
      say('I see danger nearby, so I am not going to the death spot yet.', true);
      return { ok: false };
    }
    await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 3));
    say('I moved near the saved death spot.', true);
    return { ok: true };
  }

  async function placeBlockAction(blockName) {
    throwIfCancelled();
    const placed = await placement.placeBlockSafely(bot, blockName, { ownerUsername: config.ownerUsername });
    if (placed.ok && blockName.includes('furnace')) memory.rememberLocation('knownFurnaceLocation', placed.position);
    if (placed.ok && blockName.includes('crafting_table')) memory.rememberLocation('knownCraftingTableLocation', placed.position);
    say(placed.message, true);
    return placed;
  }

  async function placeTorch() {
    throwIfCancelled();
    const placed = await lighting.placeTorchNear(bot, { ownerUsername: config.ownerUsername, survivalMode: config.autonomyEnabled });
    if (placed.ok) memory.update({ lastTorchPlacedAt: Date.now(), lastLightingStatus: lighting.lightingStatus(bot) });
    say(placed.message, true);
    return placed;
  }

  async function lightingStatusAction() {
    const text = lighting.lightingStatusText(bot);
    memory.update({ lastLightingStatus: lighting.lightingStatus(bot) });
    say(text, true);
    return text;
  }

  function findNearbyBed() {
    const ids = Object.values(bot.registry?.blocksByName || {})
      .filter((block) => block.name.endsWith('_bed'))
      .map((block) => block.id);
    if (!ids.length || !bot.entity) return null;
    return bot.findBlock({ matching: ids, maxDistance: 8 }) || null;
  }

  async function bedStatus() {
    const nearby = findNearbyBed();
    const bedItem = bot.inventory.items().find((item) => item.name.endsWith('_bed'));
    say(`Bed: nearby ${nearby ? nearby.name : 'none'}, inventory ${bedItem?.name || 'none'}.`, true);
  }

  async function nightStatus() {
    const state = perception();
    say(`Night: ${state.dangerFlags.nightTime ? 'yes' : 'no'}, time ${state.timeOfDay}, night exploration ${config.allowNightExploration ? 'allowed' : 'off'}.`, true);
  }

  async function sleepAction() {
    throwIfCancelled();
    if (/nether|end/.test(String(bot.game?.dimension || ''))) {
      say('I will not place or sleep in a bed in this dimension.', true);
      return { ok: false };
    }
    let bed = findNearbyBed();
    if (!bed) {
      const bedItem = bot.inventory.items().find((item) => item.name.endsWith('_bed'));
      if (!bedItem) {
        say('I need a nearby bed or a bed in my inventory.', true);
        return { ok: false };
      }
      const placed = await placement.placeBlockSafely(bot, bedItem.name, { ownerUsername: config.ownerUsername });
      if (!placed.ok) {
        say(placed.message, true);
        return placed;
      }
      bed = placed.block;
    }
    try {
      await bot.sleep(bed);
      say('Sleeping.', true);
      return { ok: true };
    } catch (error) {
      say(`I could not sleep: ${error.message}`, true);
      return { ok: false, message: error.message };
    }
  }

  async function setHomeAction() {
    throwIfCancelled();
    if (config.thinCoreEnabled) {
      const result = await thinRememberHomeAction({}, { source: 'actions.setHomeAction' });
      if (result.ok && memory.get().homeBasePosition) {
        syncWaypoint('home', 'home', memory.get().homeBasePosition, 'Home base set by ModVinny.', ['safe', 'base']);
      }
      return result;
    }
    const result = homeBase.setHome(bot, memory);
    if (result.ok && memory.get().homeBasePosition) {
      syncWaypoint('home', 'home', memory.get().homeBasePosition, 'Home base set by ModVinny.', ['safe', 'base']);
    }
    say(result.message, true);
    return result;
  }

  async function clearHomeAction() {
    const result = homeBase.clearHome(memory);
    say(result.message, true);
    return result;
  }

  async function homeStatusAction() {
    const text = homeBase.homeStatusText(bot, memory);
    say(text, true);
    return homeBase.homeStatus(bot, memory);
  }

  async function returnHomeAction() {
    throwIfCancelled();
    if (config.thinCoreEnabled) return thinReturnHomeAction({}, { source: 'actions.returnHomeAction' });
    setupMovements();
    const safe = homeBase.hasHome(memory) ? safety.safeToBuildNear(homeBase.getHome(memory), { confirmed: true }) : { ok: false, reason: 'no home' };
    if (!safe.ok) {
      say(safe.reason, true);
      return safe;
    }
    const result = await homeBase.returnHome(bot, memory, { throwIfCancelled, range: 2 });
    say(result.message, true);
    return result;
  }

  async function baseStatusAction() {
    const home = homeBase.homeStatusText(bot, memory);
    const store = storage.storageStatusText(bot, memory);
    const needs = baseMaintenance.baseMaintenanceStatusText(bot, memory, config);
    say(`${home} ${store} ${needs}`, true);
    return { home: homeBase.homeStatus(bot, memory), storage: storage.storageStatus(bot, memory) };
  }

  async function ensureHomeNearOwnerForCamp() {
    if (homeBase.hasHome(memory)) return { ok: true };
    const owner = ownerEntity();
    const spot = homeBase.chooseNearbyCampSpot(bot, owner?.position || bot.entity?.position);
    if (!spot) return { ok: false, message: 'I need a visible position to make camp.' };
    const result = homeBase.setHome(bot, memory, spot, { name: 'camp' });
    if (result.ok && memory.get().homeBasePosition) syncWaypoint('home', 'home', memory.get().homeBasePosition, 'Camp home set by tj.', ['safe', 'base']);
    return result;
  }

  async function buildCampAction() {
    throwIfCancelled();
    setupMovements();
    const home = await ensureHomeNearOwnerForCamp();
    if (!home.ok) {
      say(home.message, true);
      return home;
    }
    const result = await builder.buildCamp(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function buildWorkstationAction() {
    throwIfCancelled();
    setupMovements();
    if (!homeBase.hasHome(memory)) {
      say('Set a home first, or say "tj make camp".', true);
      return { ok: false, message: 'no home' };
    }
    const result = await builder.buildWorkstationArea(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function buildShelterAction() {
    throwIfCancelled();
    setupMovements();
    if (!homeBase.hasHome(memory)) {
      say('Set a home first before building a shelter.', true);
      return { ok: false, message: 'no home' };
    }
    const result = await builder.buildBasicShelter(bot, memory, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function lightHomeAction() {
    throwIfCancelled();
    setupMovements();
    const result = await builder.buildTorchRing(bot, memory, resourceOptions());
    if (result.ok) memory.update({ lastTorchPlacedAt: Date.now() });
    say(result.message, true);
    return result;
  }

  async function storageStatusAction() {
    const text = storage.storageStatusText(bot, memory);
    say(text, true);
    return storage.storageStatus(bot, memory);
  }

  async function placeStorageChestAction() {
    throwIfCancelled();
    setupMovements();
    const result = await storage.placeStorageChest(bot, memory, resourceOptions());
    if (result.ok && (result.position || result.block?.position)) syncWaypoint('base storage', 'storage', result.position || result.block.position, 'Storage placed or registered by tj.', ['base', 'storage']);
    say(result.message, true);
    return result;
  }

  async function registerStorageChestAction() {
    throwIfCancelled();
    const target = bot.blockAtCursor?.(6);
    const nearby = storage.findNearbyChests(bot, 6)[0];
    const chest = target && ['chest', 'trapped_chest', 'barrel'].includes(target.name) ? target : nearby;
    const result = storage.registerStorageChest(bot, memory, chest);
    if (result.ok && chest?.position) syncWaypoint('base storage', 'storage', chest.position, 'Storage registered by ModVinny.', ['base', 'storage']);
    say(result.message, true);
    return result;
  }

  async function storeItemsAction(args = {}, context = {}) {
    throwIfCancelled();
    setupMovements();
    const result = await storage.depositItems(bot, memory, resourceOptions());
    // Avoid double/triple chat when thin-core or competent-core already announces the result.
    const silent = args?.silent === true
      || context?.silent === true
      || context?.source === 'thinCore'
      || context?.source === 'competentCore'
      || args?.source === 'thinCore';
    if (!silent && result?.message) say(result.message, true);
    return result;
  }

  async function withdrawItemAction(itemName, count = 1) {
    throwIfCancelled();
    setupMovements();
    const result = await storage.withdrawItem(bot, memory, itemName, count, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function bringItemToOwner(itemName, count = 1) {
    throwIfCancelled();
    const got = await storage.withdrawItem(bot, memory, itemName, count, resourceOptions());
    if (!got.ok) {
      say(got.message, true);
      return got;
    }
    const owner = ownerEntity();
    if (!owner) {
      say('I got it from storage, but I cannot see ModVinny to bring it over.', true);
      return got;
    }
    await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, 2));
    throwIfCancelled();
    const dropped = await dropItemAction(got.itemName, got.count, { giveToOwner: true });
    return { ok: dropped.ok, message: dropped.message };
  }

  async function resourceStatusAction() {
    const text = resourceRuns.resourceStatusText(bot, memory, config);
    say(text, true);
    return resourceRuns.resourceStatus(bot, memory, config);
  }

  async function resourceRunAction(resourceType, targetCount = null) {
    throwIfCancelled();
    setupMovements();
    const type = String(resourceType || '').toLowerCase();
    const defaultTarget = type === 'wood' ? 16 : type === 'stone' ? 32 : type === 'coal' ? 8 : type === 'iron' ? 8 : 6;
    const target = normalizeActionCount(targetCount, defaultTarget);
    if (config.thinCoreEnabled && ['wood', 'stone', 'coal', 'iron'].includes(type)) {
      return thinCollectResourceAction({
        resource: type,
        count: target,
        maxDistance: type === 'iron' || type === 'coal' ? (config.thinCoreIronMaxDistance || 48) : undefined,
        surfaceScout: type === 'iron' || type === 'coal'
      }, { source: 'actions.resourceRunAction' });
    }
    const safe = safety.safeResourceRun(type, target, { direct: true });
    if (!safe.ok) {
      say(safe.reason, true);
      return safe;
    }
    if (type === 'wood') {
      state.lastTaskUpdateAt = Date.now();
      taskQueue.setTask('resourceRunWood', [
        'findNearestTree',
        'digNearestSafeBlock',
        'collectNearbyDrops',
        'checkWoodGoal',
        'returnHomeAndDeposit'
      ], { targetCount: target, resourceType: 'wood' });
      memory.update({
        activeResourceRun: { resourceType: 'wood', targetCount: target, startedAt: Date.now() },
        lastResourceRunAt: Date.now(),
        lastAction: 'resource run wood',
        lastActionAt: Date.now()
      });
      say(`Wood run started. I will gather up to ${target} logs, then return and store extras if storage exists.`, true);
      return { ok: true, message: 'wood resource run started' };
    }
    const result = await resourceRuns.resourceRun(bot, memory, type, target, resourceOptions({ direct: true }));
    say(result.message, true);
    return result;
  }

  async function baseMaintenanceAction(options = {}) {
    throwIfCancelled();
    setupMovements();
    const safe = safety.safeBaseMaintenance(perception());
    if (!safe.ok) {
      say(safe.reason, true);
      return safe;
    }
    const result = await baseMaintenance.baseMaintenanceTick(bot, memory, resourceOptions({ force: Boolean(options.force), state: perception() }));
    if (!options.silent || result.ok) say(result.message, true);
    return result;
  }

  async function whatHomeNeeds() {
    const text = baseMaintenance.baseMaintenanceStatusText(bot, memory, config);
    say(text, true);
    return baseMaintenance.needsBaseMaintenance(bot, memory, config);
  }


  return {
    collectDropsAction,
    dropItemAction,
    giveOwnerItem,
    stuckStatus,
    unstuck,
    deathStatus,
    goToDeathSpot,
    placeBlockAction,
    placeTorch,
    lightingStatusAction,
    findNearbyBed,
    bedStatus,
    nightStatus,
    sleepAction,
    setHomeAction,
    clearHomeAction,
    homeStatusAction,
    returnHomeAction,
    baseStatusAction,
    ensureHomeNearOwnerForCamp,
    buildCampAction,
    buildWorkstationAction,
    buildShelterAction,
    lightHomeAction,
    storageStatusAction,
    placeStorageChestAction,
    registerStorageChestAction,
    storeItemsAction,
    withdrawItemAction,
    bringItemToOwner,
    resourceStatusAction,
    resourceRunAction,
    baseMaintenanceAction,
    whatHomeNeeds
  };
}
