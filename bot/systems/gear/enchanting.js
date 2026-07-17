import * as inventory from '../../inventory.js';
import { getEnchantments, scoreGearItem } from './gearScore.js';
import * as gearSafety from './gearSafety.js';

function items(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function isEnchantable(item) {
  if (!item?.name) return false;
  if (getEnchantments(item).length > 0) return false;
  return /(_pickaxe|_axe|_shovel|_hoe|_sword|bow|crossbow|trident|_helmet|_chestplate|_leggings|_boots|fishing_rod)$/.test(item.name);
}

function findItem(bot, name) {
  const key = String(name || '').toLowerCase().replace(/\s+/g, '_');
  return items(bot).find((item) => item.name === key || item.name.includes(key)) || null;
}

export function findNearbyEnchantmentTable(bot, radius = 12) {
  const id = bot?.registry?.blocksByName?.enchanting_table?.id || bot?.registry?.blocksByName?.enchantment_table?.id;
  if (!id || !bot?.findBlock) return null;
  return bot.findBlock({ matching: id, maxDistance: radius }) || null;
}

export function getEnchantingSupplies(bot) {
  return {
    xpLevel: Number(bot?.experience?.level ?? bot?.experience?.lvl ?? 0) || 0,
    lapis: inventory.countItem(bot, 'lapis_lazuli'),
    books: inventory.countItem(bot, 'book'),
    tableNearby: Boolean(findNearbyEnchantmentTable(bot)),
    apiAvailable: typeof bot?.openEnchantmentTable === 'function'
  };
}

export function hasEnchantingSupplies(bot) {
  const supplies = getEnchantingSupplies(bot);
  return supplies.apiAvailable && supplies.tableNearby && supplies.xpLevel >= 1 && supplies.lapis >= 1;
}

export function getEnchantableItems(bot) {
  return items(bot)
    .filter(isEnchantable)
    .map((item) => ({ item, name: item.name, score: scoreGearItem(item), count: item.count || 1 }));
}

export function chooseEnchantTarget(bot, options = {}) {
  if (options.itemName) return findItem(bot, options.itemName);
  return getEnchantableItems(bot).sort((a, b) => b.score - a.score)[0]?.item || null;
}

export async function openEnchantingTable(bot, tableBlock) {
  if (typeof bot?.openEnchantmentTable !== 'function') throw new Error('Mineflayer enchantment table API is unavailable.');
  if (!tableBlock) throw new Error('No nearby enchantment table found.');
  return bot.openEnchantmentTable(tableBlock);
}

async function closeWindow(window) {
  try {
    await window?.close?.();
  } catch {
    // Ignore close errors.
  }
}

export async function inspectEnchantments(bot, tableBlock, targetItem, lapisItem) {
  if (!targetItem) return { ok: false, message: 'No enchantable target selected.', evidence: ['enchant_status_reported'] };
  if (!lapisItem) return { ok: false, message: 'No lapis available.', evidence: ['lapis_count_reported'] };
  let table = null;
  try {
    table = await openEnchantingTable(bot, tableBlock);
    await table.putTargetItem(targetItem);
    await table.putLapis(lapisItem);
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1200);
      table.once?.('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    const choices = table.enchantments || table.options || [];
    await table.takeTargetItem().catch(() => null);
    return {
      ok: true,
      message: choices.length ? `Enchant options found for ${targetItem.name}.` : `No enchant options populated for ${targetItem.name}.`,
      evidence: ['enchant_options_reported'],
      data: { target: targetItem.name, choices }
    };
  } catch (error) {
    return { ok: false, message: `Could not inspect enchantments: ${error.message}`, reason: error.message, evidence: ['enchant_status_reported'] };
  } finally {
    await closeWindow(table);
  }
}

export function enchantingStatus(bot, memory) {
  const supplies = getEnchantingSupplies(bot);
  const candidates = getEnchantableItems(bot);
  return {
    ok: true,
    message: supplies.apiAvailable
      ? `Enchanting: table ${supplies.tableNearby ? 'nearby' : 'missing'}, XP ${supplies.xpLevel}, lapis ${supplies.lapis}, candidates ${candidates.length}.`
      : 'Enchanting table API is not available in this Mineflayer instance.',
    evidence: ['enchant_status_reported', 'xp_level_reported', 'lapis_count_reported'],
    data: { supplies, candidates: candidates.map(({ item, ...rest }) => rest) }
  };
}

export async function reportEnchantingOptions(bot, options = {}) {
  const table = findNearbyEnchantmentTable(bot, options.radius || 12);
  const target = chooseEnchantTarget(bot, options);
  const lapis = findItem(bot, 'lapis_lazuli');
  return inspectEnchantments(bot, table, target, lapis);
}

export async function enchantItem(bot, targetItemName, options = {}) {
  const supplies = getEnchantingSupplies(bot);
  const target = chooseEnchantTarget(bot, { ...options, itemName: targetItemName });
  const safety = gearSafety.canEnchantItem(bot, target, { ...options, lapisCount: supplies.lapis });
  if (!safety.ok) return { ok: false, message: safety.reason, reason: safety.reason, requiresConfirmation: safety.requiresConfirmation, evidence: ['enchant_status_reported'] };
  if (!supplies.apiAvailable) return { ok: false, message: 'Mineflayer enchantment table API is unavailable.', evidence: ['enchant_status_reported'] };
  if (!supplies.tableNearby) return { ok: false, message: 'I need a nearby enchantment table.', evidence: ['enchant_status_reported'] };
  const xpCheck = gearSafety.canSpendXp(bot, options.levelCost || 1, options);
  if (!xpCheck.ok) return { ok: false, message: xpCheck.reason, evidence: ['xp_level_reported'] };
  const lapisCheck = gearSafety.canSpendLapis(bot, options.lapisCost || 1, { ...options, lapisCount: supplies.lapis });
  if (!lapisCheck.ok) return { ok: false, message: lapisCheck.reason, evidence: ['lapis_count_reported'] };

  const tableBlock = findNearbyEnchantmentTable(bot, options.radius || 12);
  const lapis = findItem(bot, 'lapis_lazuli');
  let table = null;
  try {
    table = await openEnchantingTable(bot, tableBlock);
    await table.putTargetItem(target);
    await table.putLapis(lapis);
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1200);
      table.once?.('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    const choice = Math.max(0, Math.min(Number(options.choice ?? 0) || 0, 2));
    await table.enchant(choice);
    await table.takeTargetItem().catch(() => null);
    return { ok: true, message: `Enchanted ${target.name}.`, evidence: ['item_enchanted'], data: { target: target.name, choice } };
  } catch (error) {
    return { ok: false, message: `Enchanting failed: ${error.message}`, reason: error.message, evidence: ['enchant_status_reported'] };
  } finally {
    await closeWindow(table);
  }
}

export async function enchantHeldItem(bot, options = {}) {
  const held = bot?.heldItem || null;
  if (!held) return { ok: false, message: 'I am not holding an item to enchant.', evidence: ['enchant_status_reported'] };
  return enchantItem(bot, held.name, { ...options, itemName: held.name });
}

export async function enchantBestCandidate(bot, options = {}) {
  const target = chooseEnchantTarget(bot, options);
  if (!target) return { ok: false, message: 'I do not have a good enchantment candidate.', evidence: ['enchant_status_reported'] };
  return enchantItem(bot, target.name, options);
}

export async function takeEnchantedItem(bot, enchantmentTable) {
  if (!enchantmentTable?.takeTargetItem) return { ok: false, message: 'No open enchantment table target slot.', evidence: ['enchant_status_reported'] };
  await enchantmentTable.takeTargetItem();
  return { ok: true, message: 'Took enchanted item.', evidence: ['item_enchanted'] };
}

export function explainEnchantingReadiness(bot) {
  return enchantingStatus(bot).message;
}

