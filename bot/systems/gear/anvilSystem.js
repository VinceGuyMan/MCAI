import { getEnchantments, getDurabilityInfo, getItemMaterialTier, scoreGearItem } from './gearScore.js';
import * as gearSafety from './gearSafety.js';

function items(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function findItem(bot, itemName) {
  const key = String(itemName || '').toLowerCase().replace(/\s+/g, '_');
  return items(bot).find((item) => item.name === key || item.name.includes(key)) || null;
}

export function findNearbyAnvil(bot, radius = 12) {
  if (!bot?.registry || !bot?.findBlock) return null;
  const ids = ['anvil', 'chipped_anvil', 'damaged_anvil']
    .map((name) => bot.registry.blocksByName?.[name]?.id)
    .filter(Boolean);
  if (!ids.length) return null;
  return bot.findBlock({ matching: ids, maxDistance: radius }) || null;
}

export function getEnchantedBooks(bot) {
  return items(bot)
    .filter((item) => item.name === 'enchanted_book' || getEnchantments(item).length > 0 && item.name.includes('book'))
    .map((item) => ({ item, name: item.name, count: item.count || 1, enchantments: getEnchantments(item) }));
}

export function getRepairCandidates(bot) {
  return items(bot)
    .filter((item) => getDurabilityInfo(item).hasDurability && getDurabilityInfo(item).percentRemaining < 0.65)
    .map((item) => ({ item, name: item.name, score: scoreGearItem(item), durability: getDurabilityInfo(item) }))
    .sort((a, b) => b.score - a.score);
}

export function getCombinableGear(bot) {
  const groups = new Map();
  for (const item of items(bot)) {
    if (!getDurabilityInfo(item).hasDurability && getEnchantments(item).length === 0) continue;
    if (!groups.has(item.name)) groups.set(item.name, []);
    groups.get(item.name).push(item);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([name, group]) => ({ name, count: group.length, items: group, bestScore: Math.max(...group.map((item) => scoreGearItem(item))) }));
}

export function getAnvilCandidates(bot) {
  return {
    repair: getRepairCandidates(bot),
    combine: getCombinableGear(bot),
    books: getEnchantedBooks(bot)
  };
}

function bookApplicable(book, item) {
  if (!book || !item) return false;
  const enchants = getEnchantments(book);
  if (!enchants.length) return true;
  const name = item.name || '';
  return enchants.some((enchant) => {
    if (['efficiency', 'fortune', 'silk_touch'].includes(enchant.name)) return /_(pickaxe|axe|shovel|hoe)$/.test(name);
    if (['sharpness', 'smite', 'looting', 'fire_aspect'].includes(enchant.name)) return /_(sword|axe)$/.test(name);
    if (['protection', 'fire_protection', 'blast_protection', 'projectile_protection', 'unbreaking', 'mending'].includes(enchant.name)) return true;
    return true;
  });
}

export function getApplicableBooks(bot, item) {
  return getEnchantedBooks(bot).filter((book) => bookApplicable(book.item, item));
}

export function chooseBestBookForItem(bot, item, options = {}) {
  const books = getApplicableBooks(bot, item);
  return books.sort((a, b) => {
    const score = (book) => book.enchantments.reduce((sum, enchant) => sum + (enchant.level || 1) * (enchant.name === 'mending' ? 10 : 4), 0);
    return score(b) - score(a);
  })[0]?.item || null;
}

export async function openAnvil(bot, anvilBlock) {
  if (typeof bot?.openAnvil !== 'function') throw new Error('Mineflayer anvil API is unavailable.');
  if (!anvilBlock) throw new Error('No nearby anvil found.');
  return bot.openAnvil(anvilBlock);
}

async function closeWindow(window) {
  try {
    await window?.close?.();
  } catch {
    // Ignore close errors.
  }
}

export function anvilStatus(bot, memory) {
  const anvilNearby = Boolean(findNearbyAnvil(bot));
  const candidates = getAnvilCandidates(bot);
  return {
    ok: true,
    message: `Anvil: ${typeof bot?.openAnvil === 'function' ? 'API available' : 'API missing'}, ${anvilNearby ? 'nearby' : 'no nearby anvil'}, repairs ${candidates.repair.length}, books ${candidates.books.length}.`,
    evidence: ['anvil_status_reported', 'enchanted_book_inventory_reported'],
    data: {
      apiAvailable: typeof bot?.openAnvil === 'function',
      anvilNearby,
      repair: candidates.repair.map(({ item, ...rest }) => rest),
      combine: candidates.combine.map(({ items: group, ...rest }) => rest),
      books: candidates.books.map(({ item, ...rest }) => rest)
    }
  };
}

export function reportAnvilOptions(bot) {
  return anvilStatus(bot);
}

export async function repairItem(bot, itemName, options = {}) {
  const item = findItem(bot, itemName);
  const safety = gearSafety.canUseAnvil(bot, { type: 'repair', item, usesBestGear: getItemMaterialTier(item?.name) >= 4 }, options);
  if (!safety.ok) return { ok: false, message: safety.reason, reason: safety.reason, requiresConfirmation: safety.requiresConfirmation, evidence: ['anvil_status_reported'] };
  const matching = items(bot).filter((candidate) => candidate.name === item?.name);
  if (!item || matching.length < 2) return { ok: false, message: `I need two matching ${itemName} items to repair through an anvil.`, evidence: ['anvil_status_reported'] };
  let anvil = null;
  try {
    anvil = await openAnvil(bot, findNearbyAnvil(bot, options.radius || 12));
    await anvil.combine(matching[0], matching[1]);
    return { ok: true, message: `Repaired/combined ${item.name}.`, evidence: ['item_repaired', 'items_combined'], data: { item: item.name } };
  } catch (error) {
    return { ok: false, message: `Anvil repair failed: ${error.message}`, reason: error.message, evidence: ['anvil_status_reported'] };
  } finally {
    await closeWindow(anvil);
  }
}

export async function combineItems(bot, itemOneName, itemTwoName, options = {}) {
  const one = findItem(bot, itemOneName);
  const two = findItem(bot, itemTwoName || itemOneName);
  const safety = gearSafety.canUseAnvil(bot, { type: 'combine', item: one, usesBestGear: getItemMaterialTier(one?.name) >= 4 }, options);
  if (!safety.ok) return { ok: false, message: safety.reason, reason: safety.reason, requiresConfirmation: safety.requiresConfirmation, evidence: ['anvil_status_reported'] };
  if (!one || !two || (one === two && items(bot).filter((item) => item.name === one.name).length < 2)) {
    return { ok: false, message: 'I do not have two compatible items to combine.', evidence: ['anvil_status_reported'] };
  }
  let anvil = null;
  try {
    anvil = await openAnvil(bot, findNearbyAnvil(bot, options.radius || 12));
    await anvil.combine(one, two, options.name);
    return { ok: true, message: `Combined ${one.name} and ${two.name}.`, evidence: ['items_combined'], data: { itemOne: one.name, itemTwo: two.name } };
  } catch (error) {
    return { ok: false, message: `Anvil combine failed: ${error.message}`, reason: error.message, evidence: ['anvil_status_reported'] };
  } finally {
    await closeWindow(anvil);
  }
}

export async function applyBookToItem(bot, bookSelector, itemName, options = {}) {
  const item = findItem(bot, itemName);
  const book = bookSelector ? findItem(bot, bookSelector) : chooseBestBookForItem(bot, item, options);
  const safety = gearSafety.canUseBook(bot, book, item, options);
  if (!safety.ok) return { ok: false, message: safety.reason, reason: safety.reason, requiresConfirmation: safety.requiresConfirmation, evidence: ['anvil_status_reported'] };
  if (!item || !book) return { ok: false, message: 'I need both a target item and an enchanted book.', evidence: ['anvil_status_reported'] };
  if (!bookApplicable(book, item)) return { ok: false, message: `That book does not look applicable to ${item.name}.`, evidence: ['anvil_status_reported'] };
  let anvil = null;
  try {
    anvil = await openAnvil(bot, findNearbyAnvil(bot, options.radius || 12));
    await anvil.combine(item, book, options.name);
    return { ok: true, message: `Applied book to ${item.name}.`, evidence: ['book_applied'], data: { item: item.name, book: book.name } };
  } catch (error) {
    return { ok: false, message: `Book application failed: ${error.message}`, reason: error.message, evidence: ['anvil_status_reported'] };
  } finally {
    await closeWindow(anvil);
  }
}

export async function renameItem(bot, itemName, newName, options = {}) {
  const item = findItem(bot, itemName);
  const safeName = String(newName || '').replace(/[^\w\s'-]/g, '').trim().slice(0, 32);
  if (!safeName) return { ok: false, message: 'Give me a short safe name for the item.', evidence: ['anvil_status_reported'] };
  const safety = gearSafety.canUseAnvil(bot, { type: 'rename', item }, options);
  if (!safety.ok) return { ok: false, message: safety.reason, reason: safety.reason, requiresConfirmation: safety.requiresConfirmation, evidence: ['anvil_status_reported'] };
  if (!item) return { ok: false, message: `I do not have ${itemName}.`, evidence: ['anvil_status_reported'] };
  let anvil = null;
  try {
    anvil = await openAnvil(bot, findNearbyAnvil(bot, options.radius || 12));
    if (typeof anvil.rename === 'function') await anvil.rename(item, safeName);
    else await anvil.combine(item, safeName);
    return { ok: true, message: `Renamed ${item.name} to ${safeName}.`, evidence: ['item_renamed'], data: { item: item.name, name: safeName } };
  } catch (error) {
    return { ok: false, message: `Rename failed: ${error.message}`, reason: error.message, evidence: ['anvil_status_reported'] };
  } finally {
    await closeWindow(anvil);
  }
}

export function explainAnvilReadiness(bot) {
  return anvilStatus(bot).message;
}

