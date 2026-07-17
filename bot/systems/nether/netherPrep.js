import * as crafting from '../../crafting.js';
import * as food from '../../food.js';
import * as homeBase from '../../homeBase.js';
import * as inventory from '../../inventory.js';
import * as netherGear from './netherGear.js';

function result(ok, message, extra = {}) {
  return { ok, success: ok, message, ...extra };
}

function hasHome(memory) {
  return Boolean(memory.get().homeBasePosition);
}

function boolStatus(ok, label, detail = '') {
  return { ok: Boolean(ok), label, detail };
}

export function getNetherChecklist(bot, memory) {
  const config = bot.mcaiConfig || {};
  const supplies = inventory.getNetherSupplySummary(bot);
  const gear = netherGear.getNetherGearStatus(bot);
  const overworldPortalKnown = Boolean(memory.get().overworldPortalPosition);
  const buildablePortal = supplies.obsidian >= 10 && supplies.flintAndSteel > 0;
  const checks = [
    boolStatus(supplies.food >= (config.minimumFoodForNether || 16), 'food', `${supplies.food}/${config.minimumFoodForNether || 16}`),
    boolStatus((bot.health ?? 20) >= (config.minimumHealthForNether || 18), 'health', `${bot.health ?? 20}/${config.minimumHealthForNether || 18}`),
    boolStatus(Boolean(gear.weapon), 'weapon', gear.weapon || 'none'),
    boolStatus(Boolean(gear.pickaxe), 'pickaxe', gear.pickaxe || 'none'),
    boolStatus(gear.armorScore >= (config.minimumArmorScoreForNether || 8), 'armour score', `${gear.armorScore}/${config.minimumArmorScoreForNether || 8}`),
    boolStatus(gear.goldArmorEquipped || gear.goldArmorAvailable, 'gold armour', gear.goldArmorEquipped ? 'equipped' : gear.goldArmorAvailable || 'none'),
    boolStatus(supplies.blocks >= (config.minimumBlockCountForNether || 64), 'solid blocks', `${supplies.blocks}/${config.minimumBlockCountForNether || 64}`),
    boolStatus(supplies.torches >= (config.minimumTorchCountForNether || 16), 'torches', `${supplies.torches}/${config.minimumTorchCountForNether || 16}`),
    boolStatus(supplies.flintAndSteel > 0, 'flint and steel', `${supplies.flintAndSteel}`),
    boolStatus(supplies.obsidian >= 10 || overworldPortalKnown, 'portal', overworldPortalKnown ? 'known' : `${supplies.obsidian}/10 obsidian`),
    boolStatus(hasHome(memory), 'home base', hasHome(memory) ? 'set' : 'missing'),
    boolStatus(supplies.freeSlots >= 4, 'free inventory slots', `${supplies.freeSlots}/4`)
  ];
  const recommended = [
    boolStatus(supplies.shield > 0 || gear.shieldEquipped, 'shield', gear.shieldEquipped ? 'equipped' : `${supplies.shield}`),
    boolStatus(Boolean(gear.bow) && supplies.arrows >= (config.minimumArrowCountForNether || 16), 'bow and arrows', `${gear.bow || 'none'}, arrows ${supplies.arrows}`),
    boolStatus(supplies.craftingTable > 0, 'crafting table', `${supplies.craftingTable}`),
    boolStatus(supplies.fireResistancePotions > 0, 'fire resistance', `${supplies.fireResistancePotions}`)
  ];
  const missing = checks.filter((check) => !check.ok).map((check) => check.label);
  return { checks, recommended, missing, supplies, gear, ready: missing.length === 0, overworldPortalKnown, buildablePortal };
}

export function getMissingNetherSupplies(bot, memory) {
  return getNetherChecklist(bot, memory).missing;
}

export function isNetherReady(bot, memory) {
  return getNetherChecklist(bot, memory).ready;
}

export function explainNetherReadiness(bot, memory) {
  const checklist = getNetherChecklist(bot, memory);
  if (checklist.ready) return 'Nether checklist passes. Entry still needs ModVinny confirmation.';
  return `Missing for Nether: ${checklist.missing.join(', ')}.`;
}

export function netherStatus(bot, memory, mapMemory = null) {
  const checklist = getNetherChecklist(bot, memory);
  const netherPortals = mapMemory?.netherPortalWaypoints?.length || 0;
  const overworldPortals = mapMemory?.overworldPortalWaypoints?.length || (memory.get().overworldPortalPosition ? 1 : 0);
  return {
    ready: checklist.ready,
    missing: checklist.missing,
    checklist,
    overworldPortals,
    netherPortals,
    inNether: /nether/i.test(String(bot.game?.dimension || '')),
    lastEntryAt: memory.get().lastNetherEntryAt || 0,
    entryCount: memory.get().netherEntryCount || 0
  };
}

export function reportNetherPrep(bot, memory) {
  const status = netherStatus(bot, memory);
  return status.ready
    ? 'Nether prep: ready. Portal lighting and entry still need confirmation.'
    : `Nether prep: not ready. Missing: ${status.missing.join(', ')}.`;
}

export async function prepareNetherGear(bot, memory, options = {}) {
  const messages = [];
  if (!inventory.countItem(bot, 'shield')) {
    const crafted = await crafting.craftItem(bot, 'shield', 1, { direct: true, shouldStop: options.shouldStop }).catch((error) => result(false, error.message));
    messages.push(crafted.message);
  }
  const goldIngots = inventory.countItem(bot, 'gold_ingot');
  if (inventory.countGoldArmor(bot) < 1 && (goldIngots >= 12 || options.confirmedGoldUse)) {
    const crafted = await crafting.craftItem(bot, 'golden_boots', 1, { direct: true, shouldStop: options.shouldStop }).catch((error) => result(false, error.message));
    messages.push(crafted.message);
  } else if (inventory.countGoldArmor(bot) < 1 && goldIngots >= 4) {
    messages.push('I can craft golden boots, but I will not spend scarce gold without confirmation.');
  }
  const equipped = await netherGear.equipNetherGear(bot, { forceGold: options.confirmedGoldSwap });
  messages.push(equipped.message);
  memory.update({ netherGearSnapshot: netherGear.getNetherGearStatus(bot) });
  return result(true, messages.filter(Boolean).join(' '));
}

export async function prepareNetherFood(bot, memory, options = {}) {
  const config = bot.mcaiConfig || {};
  if (inventory.countNetherFood(bot) >= (config.minimumFoodForNether || 16)) return result(true, 'Nether food is ready.');
  const cooked = await food.cookFood(bot, options).catch((error) => result(false, error.message));
  if (inventory.countNetherFood(bot) >= (config.minimumFoodForNether || 16)) return result(true, 'Cooked enough food for Nether prep.');
  const found = await food.findFood(bot, options).catch((error) => result(false, error.message));
  memory.update({ netherSupplySnapshot: inventory.getNetherSupplySummary(bot) });
  return inventory.countNetherFood(bot) >= (config.minimumFoodForNether || 16)
    ? result(true, 'Food is ready for Nether prep.')
    : result(false, `I still need more cooked food. ${cooked.message || ''} ${found.message || ''}`.trim());
}

export async function prepareNetherBlocks(bot, memory, options = {}) {
  const config = bot.mcaiConfig || {};
  const needed = config.minimumBlockCountForNether || 64;
  if (inventory.countNetherBlocks(bot) >= needed) return result(true, 'Nether blocks are ready.');
  if (options.actions?.resourceRunStone) {
    const gathered = await options.actions.resourceRunStone(Math.min(needed, 64)).catch((error) => result(false, error.message));
    memory.update({ netherSupplySnapshot: inventory.getNetherSupplySummary(bot) });
    return inventory.countNetherBlocks(bot) >= needed
      ? result(true, 'Gathered enough solid blocks for Nether prep.')
      : result(false, `I still need more solid blocks. ${gathered.message || ''}`);
  }
  return result(false, `I need ${needed} solid blocks for Nether prep.`);
}

export async function prepareNetherTools(bot, memory, options = {}) {
  const messages = [];
  if (!inventory.findBestTool(bot, 'stone')) {
    const stoneTools = await crafting.craftStoneTools(bot, options).catch((error) => result(false, error.message));
    messages.push(stoneTools.message);
    if (!inventory.findBestTool(bot, 'stone')) {
      const basicTools = await crafting.craftBasicTools(bot, options).catch((error) => result(false, error.message));
      messages.push(basicTools.message);
    }
  }
  if (!inventory.findBestWeapon(bot)) {
    const sword = await crafting.craftItem(bot, 'iron_sword', 1, { direct: true, shouldStop: options.shouldStop }).catch(() => null);
    if (sword?.message) messages.push(sword.message);
  }
  return result(Boolean(inventory.findBestTool(bot, 'stone')), messages.filter(Boolean).join(' ') || 'Nether tools checked.');
}

export async function prepareNetherLighting(bot, memory, options = {}) {
  const config = bot.mcaiConfig || {};
  if (inventory.countItem(bot, 'torch') >= (config.minimumTorchCountForNether || 16)) return result(true, 'Nether lighting is ready.');
  const crafted = await crafting.craftTorches(bot, options).catch((error) => result(false, error.message));
  return inventory.countItem(bot, 'torch') >= (config.minimumTorchCountForNether || 16)
    ? result(true, 'Crafted torches for Nether prep.')
    : result(false, crafted.message || 'I need more torches for Nether prep.');
}

export async function prepareNetherPortalSupplies(bot, memory, options = {}) {
  const messages = [];
  if (inventory.countFlintAndSteel(bot) < 1) {
    const crafted = await crafting.craftItem(bot, 'flint_and_steel', 1, { direct: true, allowRisky: true, shouldStop: options.shouldStop }).catch((error) => result(false, error.message));
    messages.push(crafted.message);
  }
  if (inventory.countObsidian(bot) < 10 && !memory.get().overworldPortalPosition) {
    messages.push(`I need ${10 - inventory.countObsidian(bot)} more obsidian or a known portal.`);
  }
  return inventory.hasPortalSupplies(bot) || memory.get().overworldPortalPosition
    ? result(true, messages.filter(Boolean).join(' ') || 'Portal supplies are ready.')
    : result(false, messages.filter(Boolean).join(' ') || 'I need obsidian and flint and steel.');
}

export async function prepareNetherKit(bot, memory, options = {}) {
  memory.update({ netherPrepStarted: true });
  const steps = [
    await prepareNetherFood(bot, memory, options),
    await prepareNetherBlocks(bot, memory, options),
    await prepareNetherTools(bot, memory, options),
    await prepareNetherLighting(bot, memory, options),
    await prepareNetherPortalSupplies(bot, memory, options),
    await prepareNetherGear(bot, memory, options)
  ];
  const checklist = getNetherChecklist(bot, memory);
  memory.update({
    netherReadyLastCheckedAt: Date.now(),
    netherChecklistLastResult: checklist,
    netherPrepCompleted: checklist.ready,
    netherSupplySnapshot: inventory.getNetherSupplySummary(bot)
  });
  const messages = steps.map((step) => step.message).filter(Boolean).join(' ');
  return checklist.ready
    ? result(true, `Nether kit ready. ${messages}`.slice(0, 300), { checklist })
    : result(false, `Nether kit still missing: ${checklist.missing.join(', ')}.`, { checklist, messages });
}
