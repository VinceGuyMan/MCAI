/**
 * Survival domain: wood/stone gather basics, crafting, armor, food, inventory tools.
 */
import { Vec3 } from 'vec3';
import * as crafting from '../../crafting.js';
import * as armor from '../../armor.js';
import * as food from '../../food.js';
import * as inventory from '../../inventory.js';
import * as pluginWrappers from '../../pluginWrappers.js';
import { isCancelledError } from '../../cancellation.js';
import {
  normalizeActionCount,
  logNames,
  toolPreference,
  normalizeToolRequest,
  itemDurabilityLeft,
  toolCandidates,
  wait,
  distance
} from '../shared.js';

/**
 * @param {object} ctx
 */
export function createSurvivalHandlers(ctx) {
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
    logCount,
    safeToDigBlock,
    findNearestBlockByNames,
    isCancelled,
    throwIfCancelled,
    comeToOwner,
    thinCollectResourceAction,
    thinEquipArmorAction,
    GoalNear,
    getResourceRunAction
  } = ctx;

  async function findNearestTree(task = null) {
    throwIfCancelled();
    setupMovements();
    const state = perception();
    const usefulBlocks = Array.isArray(state?.raw?.usefulBlocks) ? state.raw.usefulBlocks : [];
    let tree = usefulBlocks
      .filter((entry) => logNames.includes(entry.name))
      .find((entry) => safeToDigBlock(entry.block, state).ok);
    if (!tree) {
      const block = findNearestBlockByNames(logNames, 32, 24);
      if (safeToDigBlock(block, state).ok) tree = { name: block.name, position: block.position, block };
    }

    if (!tree) {
      memory.pushFailure?.('no safe tree nearby');
      return { ok: false, done: false, failed: true, reason: 'no safe tree nearby' };
    }

    if (task) task.meta.targetBlock = tree.position;
    memory.rememberLocation?.('knownWoodLocations', tree.position);
    return { ok: true, done: true, message: `Found ${tree.name}.`, evidence: ['resource_found'], data: { blockName: tree.name, position: tree.position } };
  }

  async function equipBestTool(kind = 'logs') {
    if (!config.allowToolUse) return false;
    const preferred = toolPreference[kind] || toolPreference.logs;
    const items = bot.inventory.items();

    for (const name of preferred) {
      const item = items.find((candidate) => candidate.name === name);
      const left = itemDurabilityLeft(item);
      if (item && (left === null || left > 1)) {
        await bot.equip(item, 'hand');
        return true;
      }
    }

    return false;
  }

  async function equipToolAction(request = '') {
    if (!config.allowToolUse) {
      const message = 'Tool use is disabled in config.';
      say(message, true);
      return { ok: false, reason: message, message, evidence: [], data: {} };
    }
    const raw = typeof request === 'object'
      ? request.toolType || request.tool || request.itemName || request.item || request.name || request.query || request.text || ''
      : request;
    const parsed = normalizeToolRequest(raw);
    if (!parsed.type) {
      const message = 'Tell me which tool to equip: axe, pickaxe, shovel, hoe, or sword.';
      say(message, true);
      return { ok: false, reason: message, message, evidence: [], data: { request: raw } };
    }
    const candidates = toolCandidates(bot, parsed.type, parsed.material);
    const item = candidates.find((candidate) => {
      const left = itemDurabilityLeft(candidate);
      return left === null || left > 1;
    }) || null;
    if (!item) {
      if (candidates.length) {
        const message = `${candidates[0].name} is too damaged to equip safely.`;
        say(message, true);
        return { ok: false, reason: message, message, evidence: [], data: { itemName: candidates[0].name, durabilityLeft: itemDurabilityLeft(candidates[0]) } };
      }
      const wanted = parsed.exactName || parsed.type;
      const message = `I do not have ${wanted} to equip. Say "tj make ${parsed.type}" if you want me to craft one.`;
      say(message, true);
      return { ok: false, reason: message, message, evidence: [], data: { request: raw, wanted } };
    }
    const left = itemDurabilityLeft(item);
    await bot.equip(item, 'hand');
    const message = `Equipped ${item.name}.`;
    say(message, true);
    memory.update({ lastAction: `equip ${item.name}`, lastActionAt: Date.now() });
    return { ok: true, message, evidence: ['tool_equipped'], data: { itemName: item.name, toolType: parsed.type, durabilityLeft: left } };
  }

  async function digNearestSafeBlock(task = null, blockName = 'logs') {
    throwIfCancelled();
    setupMovements();
    const state = perception();
    let block = null;

    if (task?.meta?.targetBlock) {
      const pos = task.meta.targetBlock;
      block = bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
    }

    if (!block || block.name === 'air') {
      const oreAliases = {
        coal_ore: ['coal_ore', 'deepslate_coal_ore'],
        iron_ore: ['iron_ore', 'deepslate_iron_ore'],
        copper_ore: ['copper_ore', 'deepslate_copper_ore'],
        redstone_ore: ['redstone_ore', 'deepslate_redstone_ore'],
        lapis_ore: ['lapis_ore', 'deepslate_lapis_ore'],
        gold_ore: ['gold_ore', 'deepslate_gold_ore'],
        diamond_ore: ['diamond_ore', 'deepslate_diamond_ore']
      };
      const blockAliases = {
        logs: logNames,
        stone: ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate']
      };
      const wanted = blockName === 'logs' ? logNames : (oreAliases[blockName] || blockAliases[blockName] || [blockName]);
      const usefulBlocks = Array.isArray(state?.raw?.usefulBlocks) ? state.raw.usefulBlocks : [];
      const found = usefulBlocks.find((entry) => wanted.includes(entry.name) && safeToDigBlock(entry.block, state).ok);
      block = found?.block || null;
      if (!block) block = findNearestBlockByNames(wanted, 32, 24);
    }

    const safe = safeToDigBlock(block, state);
    if (!safe.ok) return { ok: false, done: false, failed: true, reason: safe.reason };

    const toolResult = await inventory.equipBestToolForBlock(bot, block.name);
    if (!toolResult.ok) await equipBestTool(block.name.endsWith('_log') ? 'logs' : 'stone');
    throwIfCancelled();
    try {
      await bot.pathfinder.goto(new GoalNear(block.position.x, block.position.y, block.position.z, 1));
      throwIfCancelled();
      await bot.dig(block);
      memory.update({ lastAction: `dig ${block.name}`, lastActionAt: Date.now() });
      await wait(400);
      return { ok: true, done: true, message: `Dug ${block.name}.`, evidence: ['block_dug'], data: { blockName: block.name, position: block.position } };
    } catch (error) {
      if (isCancelledError(error) || isCancelled() || /digging aborted/i.test(String(error?.message || ''))) {
        if (isCancelled()) return { ok: false, done: false, failed: true, cancelled: true, clearTask: true, reason: 'digging was stopped or interrupted' };
        if (task) {
          if (!task.meta) task.meta = {};
          task.meta.digAbortRetries = Number(task.meta.digAbortRetries || 0) + 1;
          const maxRetries = Math.max(0, Number(config.maxDigAbortRetries ?? 2));
          if (task.meta.digAbortRetries <= maxRetries) {
            return {
              ok: false,
              done: false,
              failed: true,
              clearTask: false,
              retry: true,
              repeatFrom: Math.max(0, Number(task.stepIndex || 0) - 1),
              reason: `digging was stopped or interrupted; retrying (${task.meta.digAbortRetries}/${maxRetries})`
            };
          }
        }
        return { ok: false, done: false, failed: true, cancelled: false, clearTask: true, reason: 'digging was stopped or interrupted too many times' };
      }
      return { ok: false, done: false, failed: true, clearTask: true, reason: `could not dig ${block.name}: ${error.message || error}` };
    }
  }

  async function collectNearbyDrops() {
    throwIfCancelled();
    setupMovements();
    const item = bot.nearestEntity((entity) => entity.name === 'item' && distance(bot, entity) < 8);
    if (!item) return { ok: true, done: true, message: 'No nearby drops to collect.', evidence: [], data: {} };
    await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 1));
    throwIfCancelled();
    await wait(600);
    return { ok: true, done: true, message: 'Collected nearby drops.', evidence: ['drops_collected'], data: { itemId: item.id || null } };
  }

  async function checkWoodGoal(task) {
    throwIfCancelled();
    const target = normalizeActionCount(task?.meta?.targetCount, 8);
    if (task?.meta && task.meta.targetCount !== target) task.meta.targetCount = target;
    const count = logCount();
    if (count >= target) return { done: true };
    const now = Date.now();
    if (now - state.lastTaskUpdateAt >= 60000) {
      const state = perception();
      const stuck = state.dangerFlags.stuckLikely ? ' I might be stuck, so I am going to re-check the route.' : '';
      const owner = state.ownerDistance === null ? 'ModVinny is not visible' : `ModVinny is ${state.ownerDistance} blocks away`;
      say(`Still gathering wood: ${count}/${target} logs. ${owner}.${stuck}`, true);
      state.lastTaskUpdateAt = now;
    }
    return { repeatFrom: 0, reason: `logs ${count}/${target}` };
  }

  async function gatherWood(count = 8) {
    throwIfCancelled();
    const target = normalizeActionCount(count, 8);
    if (config.thinCoreEnabled) return thinCollectResourceAction({ resource: 'wood', count: target }, { source: 'actions.gatherWood' });
    state.lastTaskUpdateAt = Date.now();
    taskQueue.setTask('gatherWood', [
      'findNearestTree',
      'digNearestSafeBlock',
      'collectNearbyDrops',
      'checkWoodGoal',
      'returnNearOwner'
    ], { targetCount: target });
    memory.update({ lastAction: 'gatherWood', lastActionAt: Date.now() });
    say(`Gathering wood until I have ${target} logs.`, true);
    return { ok: true, message: `gathering wood until ${target} logs`, data: { targetCount: target } };
  }

  async function reportCraftResult(actionName, work) {
    throwIfCancelled();
    taskQueue.clearTask();
    memory.update({ lastAction: actionName, lastActionAt: Date.now() });
    let result;
    try {
      result = await work();
      throwIfCancelled();
    } catch (error) {
      if (isCancelledError(error)) return { ok: false, message: 'Stopped.', cancelled: true };
      throw error;
    }
    if (actionName.startsWith('craft') && result.ok) {
      memory.update({
        lastCraftedItem: result.itemName || actionName.replace(/^craft\s+/, ''),
        lastCraftedAt: Date.now(),
        preferredWoodType: crafting.getPreferredWoodVariant(bot)
      });
      if (result.craftingTable?.position) memory.rememberLocation('knownCraftingTableLocation', result.craftingTable.position);
    }
    if (actionName.startsWith('craft') && !result.ok) {
      const failures = memory.get().failedCraftAttempts || [];
      failures.unshift({ item: actionName, reason: result.message, at: Date.now() });
      memory.update({ failedCraftAttempts: failures.slice(0, 10) });
    }
    if (result.requiresConfirmation && result.itemName) {
      memory.update({
        pendingCraftConfirmation: {
          itemName: result.itemName,
          count: result.count || 1,
          expiresAt: Date.now() + 60000
        }
      });
    }
    say(result.message || (result.ok ? 'Crafting done.' : 'Crafting failed.'), true);
    return result;
  }

  async function craftItemAction(itemName, count = 1, options = {}) {
    const resolved = crafting.resolveCraftItemName(bot, itemName, options);
    const craftSafety = safety.safeToCraftItem(resolved, { ...options, count });
    if (!craftSafety.ok) {
      const message = craftSafety.requiresConfirmation
        ? `That uses valuable or risky materials. Say "tj confirm craft ${resolved}" to continue.`
        : craftSafety.reason;
      if (craftSafety.requiresConfirmation) {
        memory.update({
          pendingCraftConfirmation: {
            itemName: resolved,
            count,
            expiresAt: Date.now() + 60000
          }
        });
      }
      say(message, true);
      return { ok: false, message, requiresConfirmation: craftSafety.requiresConfirmation, itemName: resolved };
    }
    return reportCraftResult(`craft ${resolved}`, () => crafting.craftItem(bot, resolved, count, { ...options, shouldStop: isCancelled }));
  }

  async function craftGenericToolAction(toolType) {
    const normalizedTool = crafting.normalizeToolType(toolType);
    if (!normalizedTool) {
      const message = 'Tell me which tool type: pickaxe, axe, shovel, hoe, or sword.';
      say(message, true);
      return { ok: false, message };
    }

    const options = crafting.getToolCraftOptions(bot, normalizedTool);
    const safeCraftable = options.filter((option) => option.canCraft && safety.safeToCraftItem(option.itemName, { count: 1 }).ok);

    if (safeCraftable.length === 1) {
      return craftItemAction(safeCraftable[0].itemName, 1, { direct: true });
    }

    if (safeCraftable.length > 1) {
      const choices = safeCraftable.map((option) => option.displayName).join(', ');
      const message = `I can make more than one ${normalizedTool}: ${choices}. Which one? Say "tj make stone ${normalizedTool}" or another material.`;
      say(message, true);
      return { ok: false, mode: 'clarify', message, options: safeCraftable };
    }

    const restrictedCraftable = options.filter((option) => option.canCraft && !safety.safeToCraftItem(option.itemName, { count: 1 }).ok);
    if (restrictedCraftable.length === 1) {
      return craftItemAction(restrictedCraftable[0].itemName, 1, { direct: true });
    }
    if (restrictedCraftable.length > 1) {
      const choices = restrictedCraftable.map((option) => option.displayName).join(', ');
      const message = `I only see risky or valuable ${normalizedTool} options right now: ${choices}. Which one do you want me to request confirmation for?`;
      say(message, true);
      return { ok: false, mode: 'clarify', message, options: restrictedCraftable };
    }

    const closest = options
      .map((option) => ({ ...option, missingTotal: option.missing.reduce((sum, entry) => sum + entry.missing, 0) }))
      .filter((option) => option.missing.length > 0)
      .sort((a, b) => a.missingTotal - b.missingTotal)[0];

    if (!closest) {
      const message = `I do not know a craftable ${normalizedTool} recipe in this Minecraft registry.`;
      say(message, true);
      return { ok: false, message };
    }

    const missingText = closest.missing.map((entry) => `${entry.missing} more ${entry.item}`).join(', ');
    const scavengeCommand = crafting.suggestScavengeCommandForMissing(closest.missing);
    if (scavengeCommand) {
      memory.update({
        pendingCraftScavengeConfirmation: {
          toolType: normalizedTool,
          itemName: closest.itemName,
          canonicalCommand: scavengeCommand,
          expiresAt: Date.now() + 30000
        }
      });
    }
    const ask = scavengeCommand ? ` Want me to scavenge materials first? Say "tj yes" to run "${scavengeCommand}", or "tj no".` : '';
    const message = `I cannot make a ${normalizedTool} yet. Closest option: ${closest.displayName}; I need ${missingText}.${ask}`;
    say(message, true);
    return { ok: false, message, missing: closest.missing, suggestedCommand: scavengeCommand };
  }

  async function craftPlanks() {
    return reportCraftResult('craft planks', () => crafting.craftPlanks(bot, { shouldStop: isCancelled }));
  }

  async function craftSticks() {
    return reportCraftResult('craft sticks', () => crafting.craftSticks(bot, 4, { shouldStop: isCancelled }));
  }

  async function craftCraftingTable() {
    return reportCraftResult('craft crafting table', () => crafting.craftCraftingTable(bot, { shouldStop: isCancelled }));
  }

  async function placeCraftingTable() {
    return reportCraftResult('place crafting table', () => crafting.placeCraftingTable(bot));
  }

  async function craftWoodenPickaxe() {
    return reportCraftResult('craft wooden pickaxe', () => crafting.craftWoodenPickaxe(bot, { shouldStop: isCancelled }));
  }

  async function craftStonePickaxe() {
    return reportCraftResult('craft stone pickaxe', () => crafting.craftStonePickaxe(bot, { shouldStop: isCancelled }));
  }

  async function craftWoodenAxe() {
    return reportCraftResult('craft wooden axe', () => crafting.craftWoodenAxe(bot, { shouldStop: isCancelled }));
  }

  async function craftTorches() {
    return reportCraftResult('craft torches', () => crafting.craftTorches(bot, { shouldStop: isCancelled }));
  }

  async function craftLighting(options = { direct: true }) {
    return reportCraftResult('craft lighting', () => crafting.craftLighting(bot, { direct: Boolean(options.direct), shouldStop: isCancelled }));
  }

  async function craftStorage(options = { direct: true }) {
    return reportCraftResult('craft storage', () => crafting.craftStorage(bot, { direct: Boolean(options.direct), shouldStop: isCancelled }));
  }

  async function craftShelterSupplies(options = { direct: true }) {
    return reportCraftResult('craft shelter supplies', () => crafting.craftShelterSupplies(bot, { direct: Boolean(options.direct), shouldStop: isCancelled }));
  }

  async function craftUtilityItems(options = { direct: true }) {
    return reportCraftResult('craft utility items', () => crafting.craftUtilityItems(bot, { direct: Boolean(options.direct), shouldStop: isCancelled }));
  }

  async function craftTravelItems(options = { direct: true }) {
    return reportCraftResult('craft travel items', () => crafting.craftTravelItems(bot, { direct: Boolean(options.direct), shouldStop: isCancelled }));
  }

  async function craftBuildingBlocks(material = '', options = { direct: true }) {
    return reportCraftResult('craft building blocks', () => crafting.craftBuildingBlocks(bot, material, { direct: Boolean(options.direct), shouldStop: isCancelled }));
  }

  async function craftSurvivalKit(options = {}) {
    return reportCraftResult('craft survival kit', () => crafting.craftSurvivalKit(bot, { direct: Boolean(options.direct), shouldStop: isCancelled }));
  }

  async function craftingStatusAction() {
    const statusText = crafting.craftingStatusText(bot);
    say(statusText, true);
    return crafting.craftingStatus(bot);
  }

  async function canCraftItemAction(itemName, count = 1) {
    const resolved = crafting.resolveCraftItemName(bot, itemName);
    const can = crafting.canCraft(bot, resolved, count);
    if (can) {
      say(`Yes, I can craft ${resolved.replace(/_/g, ' ')} right now.`, true);
      return { ok: true, itemName: resolved };
    }

    const missing = crafting.missingIngredients(bot, resolved, count);
    const message = missing.length > 0
      ? `Not yet. I need ${missing.map((entry) => `${entry.missing} more ${entry.item}`).join(', ')}.`
      : `Not yet. I do not have a usable recipe or materials for ${resolved.replace(/_/g, ' ')}.`;
    say(message, true);
    return { ok: false, itemName: resolved, missing, message };
  }

  async function confirmCraftItem(itemName = null) {
    const pending = memory.get().pendingCraftConfirmation;
    if (!pending || Date.now() >= (pending.expiresAt || 0)) {
      memory.update({ pendingCraftConfirmation: null });
      say('No active craft confirmation. Ask me to craft it first.', true);
      return { ok: false, message: 'No active craft confirmation.' };
    }

    const requested = itemName ? crafting.resolveCraftItemName(bot, itemName) : pending.itemName;
    if (requested !== pending.itemName) {
      say(`The pending confirmation is for ${pending.itemName.replace(/_/g, ' ')}, not ${requested.replace(/_/g, ' ')}.`, true);
      return { ok: false, message: 'Confirmation item mismatch.' };
    }

    memory.update({ pendingCraftConfirmation: null });
    return craftItemAction(pending.itemName, pending.count || 1, { confirmed: true, direct: true, allowValuable: true, allowRisky: true, allowTechnical: true });
  }

  async function craftBasicTools() {
    return reportCraftResult('craft basic tools', () => crafting.craftBasicTools(bot, { shouldStop: isCancelled }));
  }

  async function craftStoneTools() {
    return reportCraftResult('craft stone tools', () => crafting.craftStoneTools(bot, { shouldStop: isCancelled }));
  }

  async function craftIronTools() {
    return reportCraftResult('craft iron tools', () => crafting.craftIronTools(bot, { shouldStop: isCancelled }));
  }

  async function armorStatus() {
    const status = armor.getArmorStatus(bot);
    memory.update({ lastArmorStatus: status, lastAction: 'armor status', lastActionAt: Date.now() });
    say(armor.armorStatusText(status), true);
    return status;
  }

  async function equipBestArmor() {
    if (config.thinCoreEnabled) return thinEquipArmorAction({}, { source: 'actions.equipBestArmor' });
    return reportCraftResult('equip best armour', () => armor.equipBestArmor(bot));
  }

  async function craftBestAffordableArmor() {
    return reportCraftResult('craft affordable armour', () => armor.craftBestAffordableArmor(bot));
  }

  async function craftIronArmor() {
    return reportCraftResult('craft iron armour', () => armor.craftArmorSet(bot, 'iron'));
  }

  async function craftLeatherArmor() {
    return reportCraftResult('craft leather armour', () => armor.craftArmorSet(bot, 'leather'));
  }

  async function craftDiamondArmorConfirmed() {
    const allowed = safety.canUseDiamondsForArmor(false);
    if (!allowed.ok) {
      say('Diamond armour needs confirmation first.', true);
      return { ok: false, message: allowed.reason };
    }

    memory.update({ pendingConfirmation: null, pendingConfirmationExpiresAt: 0 });
    return reportCraftResult('craft diamond armour', () => armor.craftArmorSet(bot, 'diamond', { allowValuable: true }));
  }

  async function ensureArmoredForSurvival(state = perception()) {
    const danger = state.dangerFlags.lowHealth || state.dangerFlags.nightTime || state.dangerFlags.hostileNearby;
    const allowCraft = config.autonomyEnabled && config.autonomyMode === 'semi' && danger;
    const statusBefore = armor.getArmorStatus(bot);
    const ensured = await armor.ensureArmoredForSurvival(bot, state, { allowCraft });
    const statusAfter = armor.getArmorStatus(bot);
    memory.update({ lastArmorStatus: statusAfter });

    const now = Date.now();
    const canSpeak = now - (memory.get().lastArmorSuggestionAt || 0) >= 60000;
    if (danger && statusAfter.armorScore === 0 && canSpeak) {
      say('I have no armour on right now. I am vulnerable.', false);
      memory.update({ lastArmorSuggestionAt: now });
    } else if (!danger && statusBefore.missing.length > 0 && state.hasIronForArmor && canSpeak) {
      say('I have iron ingots and missing armour. Say "tj craft iron armour" if you want me to make some.', false);
      memory.update({ lastArmorSuggestionAt: now });
    }

    return ensured;
  }

  async function mineStone(count = 1) {
    throwIfCancelled();
    const target = normalizeActionCount(count, 1);
    if (config.thinCoreEnabled) return thinCollectResourceAction({ resource: 'stone', count: target }, { source: 'actions.mineStone' });
    if (target > 1) return getResourceRunAction()('stone', target);
    say('Mining one safe stone block.', true);
    const before = inventory.countItem(bot, 'cobblestone') + inventory.countItem(bot, 'stone');
    const state = perception();
    const collected = await pluginWrappers.collectBlockSafely(bot, 'stone', {
      config,
      cancellation,
      safety,
      state,
      count: 1,
      targetCount: 1,
      requireToolPlugin: true,
      maxDistance: 16,
      source: 'actions'
    });
    if (collected.ok) {
      await collectNearbyDrops();
      const after = inventory.countItem(bot, 'cobblestone') + inventory.countItem(bot, 'stone');
      const message = after > before
        ? 'Mined a stone block and collected it.'
        : 'Mined a stone block; I did not verify the drop in inventory yet.';
      say(message, true);
      return { ok: true, message, evidence: ['block_collected', after > before ? 'stone_count_increased_or_reason_reported' : 'stone_drop_unverified'], data: { before, after, usedPlugin: true } };
    }

    const directTask = { meta: {}, stepIndex: 1 };
    let dug = null;
    const maxRetries = Math.max(0, Number(config.maxDigAbortRetries ?? 2));
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      dug = await digNearestSafeBlock(directTask, 'stone');
      if (!dug?.failed || dug.cancelled) break;
      if (!dug.retry) break;
    }
    if (dug?.failed) {
      const reason = dug.reason || 'no safe stone nearby';
      say(`I could not mine stone: ${reason}.`, true);
      return { ok: false, message: reason, reason, evidence: ['block_collection_failed'], data: { ...dug, usedPlugin: false } };
    }
    await collectNearbyDrops();
    const after = inventory.countItem(bot, 'cobblestone') + inventory.countItem(bot, 'stone');
    const message = after > before
      ? 'Mined a stone block and collected it.'
      : 'Mined a stone block; I did not verify the drop in inventory yet.';
    say(message, true);
    return { ok: true, message, evidence: ['block_collected', after > before ? 'stone_count_increased_or_reason_reported' : 'stone_drop_unverified'], data: { before, after, usedPlugin: false } };
  }

  async function fleeDanger(state = perception()) {
    setupMovements();
    const owner = ownerEntity();
    const nearestHostile = state.raw.hostileMobs?.[0]?.entity;

    if (owner) {
      bot.pathfinder.setGoal(new GoalNear(owner.position.x, owner.position.y, owner.position.z, config.followDistance));
      say('Danger nearby. Returning to ModVinny.');
      return true;
    }

    if (nearestHostile && bot.entity) {
      const away = bot.entity.position.minus(nearestHostile.position);
      const len = Math.max(1, Math.sqrt((away.x * away.x) + (away.z * away.z)));
      const x = bot.entity.position.x + (away.x / len) * 10;
      const z = bot.entity.position.z + (away.z / len) * 10;
      bot.pathfinder.setGoal(new GoalNear(x, bot.entity.position.y, z, 2));
      say('Danger nearby. Backing up.');
      return true;
    }

    return false;
  }

  async function foodStatus() {
    const status = food.foodStatus(bot, config);
    memory.update({ lastFoodStatus: status });
    say(food.foodStatusText(bot, config), true);
    return status;
  }

  async function eatIfHungry(options = {}) {
    const eaten = await food.eatIfHungry(bot, { config, direct: Boolean(options.direct) });
    if (eaten.ok) {
      memory.update({ lastMealAt: Date.now(), lastFoodStatus: food.foodStatus(bot, config) });
      say(eaten.message, true);
      return true;
    }
    if (options.direct) say(eaten.message, true);
    return false;
  }

  async function findFood() {
    throwIfCancelled();
    memory.update({ foodTaskActive: true, lastFoodSearchAt: Date.now(), lastAction: 'find food', lastActionAt: Date.now() });
    const found = await food.findFood(bot, { config, shouldStop: isCancelled });
    memory.update({ foodTaskActive: false, lastFoodStatus: food.foodStatus(bot, config) });
    say(found.message, true);
    return found;
  }

  async function getFood(options = {}) {
    throwIfCancelled();
    const target = normalizeActionCount(options, config.minimumFoodCount || 6, { max: 32 });
    const started = Date.now();
    const maxDuration = Number(config.maxResourceRunDurationMs || 180000);
    const maxAttempts = Math.max(1, Math.min(12, Number(config.maxFoodRunAttempts || target)));
    memory.update({ foodTaskActive: true, lastFoodSearchAt: Date.now(), lastAction: 'get food', lastActionAt: Date.now() });

    const startCount = food.countFoodInventory(bot);
    let attempts = 0;
    let stagnantAttempts = 0;
    let lastCount = startCount;
    let lastResult = { ok: true, message: 'Food check started.' };
    while (food.countFoodInventory(bot) < target && attempts < maxAttempts && Date.now() - started < maxDuration) {
      throwIfCancelled();
      lastResult = await food.findFood(bot, { config, shouldStop: isCancelled, targetCount: target });
      attempts += 1;
      const currentCount = food.countFoodInventory(bot);
      if (currentCount <= lastCount) {
        stagnantAttempts += 1;
        if (lastResult?.ok === false || stagnantAttempts >= 2) break;
      } else {
        stagnantAttempts = 0;
      }
      lastCount = currentCount;
    }

    const count = food.countFoodInventory(bot);
    const status = food.foodStatus(bot, config);
    const ok = count >= target || count > startCount || lastResult?.ok === true;
    const message = count >= target
      ? `Food run done: ${count}/${target}.`
      : count > startCount
        ? `I found some food, but only ${count}/${target}.`
        : `I could not gather food: ${lastResult?.message || lastResult?.reason || 'no safe food found nearby'}.`;
    memory.update({ foodTaskActive: false, lastFoodStatus: status });
    say(message, true);
    return {
      ok,
      message,
      evidence: ['food_count_increased_or_reason_reported'],
      data: { count, target, attempts, startCount, lastResult: lastResult?.message || lastResult?.reason || '' },
      count,
      target,
      attempts
    };
  }

  async function makeFood() {
    throwIfCancelled();
    const made = await food.makeFood(bot, { config, shouldStop: isCancelled });
    if (made.ok) {
      memory.update({ lastFoodStatus: food.foodStatus(bot, config) });
    }
    say(made.message, true);
    return made;
  }

  async function cookFood() {
    throwIfCancelled();
    const cooked = await food.cookFood(bot, { config, shouldStop: isCancelled });
    if (cooked.ok) memory.update({ lastCookAt: Date.now(), lastFoodStatus: food.foodStatus(bot, config) });
    say(cooked.message, true);
    return cooked;
  }

  async function craftFood(foodName = 'bread') {
    throwIfCancelled();
    const crafted = await food.craftFood(bot, foodName);
    if (crafted.ok) memory.update({ lastFoodStatus: food.foodStatus(bot, config) });
    say(crafted.message, true);
    return crafted;
  }

  async function huntPassiveFood(animalType = null) {
    throwIfCancelled();
    const animalTypes = animalType ? [animalType] : null;
    const hunted = await food.huntPassiveFoodAnimal(bot, { config, shouldStop: isCancelled, maxKills: 3, animalTypes });
    if (hunted.ok) memory.update({ lastHuntAt: Date.now(), lastFoodStatus: food.foodStatus(bot, config) });
    say(hunted.message, true);
    return hunted;
  }

  async function fishForFood() {
    throwIfCancelled();
    const fished = await food.fishForFood(bot, { config, shouldStop: isCancelled });
    if (fished.ok) memory.update({ lastFoodSearchAt: Date.now(), lastFoodStatus: food.foodStatus(bot, config) });
    say(fished.message, true);
    return fished;
  }

  async function gatherPlantFood() {
    throwIfCancelled();
    const gathered = await food.gatherPlantFood(bot, { config });
    if (gathered.ok) memory.update({ lastFoodSearchAt: Date.now(), lastFoodStatus: food.foodStatus(bot, config) });
    say(gathered.message, true);
    return gathered;
  }

  async function handleFoodSurvival(state = perception()) {
    if (!config.foodEnabled) return false;
    const status = food.foodStatus(bot, config);
    memory.update({ lastFoodStatus: status });

    const thinCoreMutationLocked = config.thinCoreEnabled && config.competentCoreDisableAdvancedAutonomy !== false;
    if (thinCoreMutationLocked) {
      if ((status.criticalFood || (bot.food ?? 20) < 14) && status.hasFood) return eatIfHungry();
      return false;
    }

    const currentTask = taskQueue.getCurrentTask();
    if (status.criticalFood && currentTask && !['getFood', 'cookFood'].includes(currentTask.name)) {
      taskQueue.clearTask();
    }

    if (status.criticalFood || (bot.food ?? 20) < 14) {
      if (status.hasFood) return eatIfHungry();
    }

    const now = Date.now();
    const ownerFar = state.ownerDistance !== null && state.ownerDistance > config.maxFoodDistanceFromOwner;
    const nightBlocked = state.dangerFlags.nightTime && !config.allowNightExploration;
    const safeToSearch = status.criticalFood || (!ownerFar && !nightBlocked);

    if ((bot.food ?? 20) < 12 && !status.hasFood && safeToSearch && now - (memory.get().lastFoodSearchAt || 0) >= config.foodSearchCooldownMs) {
      memory.update({ lastFoodSearchAt: now });
      const found = await food.findFood(bot, { config, shouldStop: isCancelled });
      if (found.ok) {
        say(found.message, false);
        return true;
      }
    }

    if (status.rawFoodCount > 0 && status.safeFoodCount === 0 && safeToSearch && now - (memory.get().lastCookAt || 0) >= config.cookFoodCooldownMs) {
      memory.update({ lastCookAt: now });
      const cooked = await food.cookFood(bot, { config });
      if (cooked.ok) {
        say(cooked.message, false);
        return true;
      }
    }

    return false;
  }

  async function stayNearFriendlyPlayers() {
    const owner = ownerEntity();
    if (!owner || !bot.entity) return false;
    if (bot.entity.position.distanceTo(owner.position) <= config.maxAutonomyDistanceFromOwner) return false;
    await comeToOwner();
    return true;
  }

  async function surviveTick(state = perception()) {
    if (isCancelled()) return false;
    await eatIfHungry();
    await handleFoodSurvival(state);
    if (state.dangerFlags.lowHealth || state.dangerFlags.lavaNearby || state.dangerFlags.fireNearby || (!config.allowCombat && state.dangerFlags.hostileNearby)) {
      return fleeDanger(state);
    }
    if (state.dangerFlags.tooFarFromOwner) return stayNearFriendlyPlayers();
    return false;
  }

  function taskStatusText() {
    const task = taskQueue.getCurrentTask();
    if (!task) return 'Task: none.';
    return `Task: ${task.name}, step ${task.stepIndex + 1}/${task.steps.length} (${task.steps[task.stepIndex]}), failures ${task.failures?.length || 0}.`;
  }

  async function inventoryStatus() {
    const info = inventory.listUsefulInventory(bot);
    say(info.summary, true);
    return info;
  }

  async function countInventory(categoryOrItem) {
    const key = String(categoryOrItem || '').trim().toLowerCase().replace(/\s+/g, '_');
    const counts = inventory.countItemsByCategory(bot);
    const aliases = { iron: 'iron_ingot', logs: 'logs', food: 'food', coal: 'coal' };
    if (counts[key] !== undefined) {
      say(`${key}: ${counts[key]}.`, true);
      return { ok: true, count: counts[key] };
    }
    const itemName = aliases[key] || key;
    const count = inventory.countItem(bot, itemName);
    say(`${itemName}: ${count}.`, true);
    return { ok: true, count };
  }

  async function toolStatus() {
    const text = inventory.toolStatusText(bot);
    say(text, true);
    return text;
  }

  return {
    findNearestTree,
    equipBestTool,
    equipToolAction,
    digNearestSafeBlock,
    collectNearbyDrops,
    checkWoodGoal,
    gatherWood,
    reportCraftResult,
    craftItemAction,
    craftGenericToolAction,
    craftPlanks,
    craftSticks,
    craftCraftingTable,
    placeCraftingTable,
    craftWoodenPickaxe,
    craftStonePickaxe,
    craftWoodenAxe,
    craftTorches,
    craftLighting,
    craftStorage,
    craftShelterSupplies,
    craftUtilityItems,
    craftTravelItems,
    craftBuildingBlocks,
    craftSurvivalKit,
    craftingStatusAction,
    canCraftItemAction,
    confirmCraftItem,
    craftBasicTools,
    craftStoneTools,
    craftIronTools,
    armorStatus,
    equipBestArmor,
    craftBestAffordableArmor,
    craftIronArmor,
    craftLeatherArmor,
    craftDiamondArmorConfirmed,
    ensureArmoredForSurvival,
    mineStone,
    fleeDanger,
    foodStatus,
    eatIfHungry,
    findFood,
    getFood,
    makeFood,
    cookFood,
    craftFood,
    huntPassiveFood,
    fishForFood,
    gatherPlantFood,
    handleFoodSurvival,
    stayNearFriendlyPlayers,
    surviveTick,
    taskStatusText,
    inventoryStatus,
    countInventory,
    toolStatus
  };
}
