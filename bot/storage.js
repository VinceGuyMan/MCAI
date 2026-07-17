import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as crafting from './crafting.js';
import * as inventory from './inventory.js';
import * as placement from './placement.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function normalize(itemName) {
  return String(itemName || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function samePoint(a, b) {
  return Boolean(a && b && Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y) && Math.floor(a.z) === Math.floor(b.z));
}

function itemList(bot) {
  return bot.inventory?.items?.() || [];
}

function chestEntries(memory) {
  return memory.get().knownStorageChests || [];
}

function updateChestEntries(memory, entries) {
  memory.update({ knownStorageChests: entries.slice(0, 12) });
}

function chestBlockAt(bot, pos) {
  if (!pos) return null;
  const block = bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
  if (block && ['chest', 'trapped_chest', 'barrel'].includes(block.name)) return block;
  return null;
}

function registeredPosition(memory, pos) {
  return chestEntries(memory).some((entry) => samePoint(entry, pos));
}

function chestItems(chest) {
  if (typeof chest.containerItems === 'function') return chest.containerItems();
  if (typeof chest.items === 'function') return chest.items();
  return (chest.slots || []).filter(Boolean);
}

function categoryContains(category, itemName) {
  const set = inventory.categorySets?.[category];
  return Boolean(set?.has(itemName));
}

function totalFood(bot) {
  return itemList(bot)
    .filter((item) => categoryContains('food', item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

function totalTools(bot) {
  return itemList(bot)
    .filter((item) => categoryContains('tools', item.name) || categoryContains('weapons', item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

export function findNearbyChests(bot, radius = 12) {
  if (!bot.entity || typeof bot.findBlocks !== 'function') return [];
  const blockNames = ['chest', 'trapped_chest', 'barrel'];
  const ids = blockNames.map((name) => bot.registry?.blocksByName?.[name]?.id).filter(Boolean);
  if (!ids.length) return [];
  return bot.findBlocks({ matching: ids, maxDistance: radius, count: 16 })
    .map((pos) => bot.blockAt(pos))
    .filter(Boolean)
    .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
}

export function findOwnedStorageChest(bot, memory) {
  const registered = chestEntries(memory);
  for (const entry of registered) {
    const block = chestBlockAt(bot, entry);
    if (block) return block;
  }

  const nearby = findNearbyChests(bot, 12).find((block) => registeredPosition(memory, point(block.position)));
  return nearby || null;
}

export function registerStorageChest(bot, memory, chestBlock) {
  if (!chestBlock || !['chest', 'trapped_chest', 'barrel'].includes(chestBlock.name)) {
    return { ok: false, message: 'I need to be looking at or standing near a chest to register storage.' };
  }
  const pos = point(chestBlock.position);
  const entries = chestEntries(memory).filter((entry) => !samePoint(entry, pos));
  entries.unshift({ ...pos, dimension: bot.game?.dimension || 'unknown', registeredAt: Date.now() });
  updateChestEntries(memory, entries);
  return { ok: true, message: `Registered storage chest at ${pos.x}, ${pos.y}, ${pos.z}.`, block: chestBlock, position: pos };
}

export async function placeStorageChest(bot, memory, options = {}) {
  const existing = findOwnedStorageChest(bot, memory);
  if (existing) return { ok: true, message: 'I already have a registered storage chest nearby.', block: existing };

  if (crafting.countItem(bot, 'chest') < 1) {
    const crafted = await crafting.craftItem(bot, 'chest', 1, { ...options, direct: true, shouldStop: options.shouldStop });
    if (!crafted.ok && crafting.countItem(bot, 'chest') < 1) return crafted;
  }

  const placed = await placement.placeBlockSafely(bot, 'chest', { ownerUsername: options.ownerUsername, maxRadius: 4 });
  if (!placed.ok) return placed;
  return registerStorageChest(bot, memory, placed.block);
}

export function shouldKeepItem(itemName) {
  const name = normalize(itemName);
  if (categoryContains('food', name)) return true;
  if (categoryContains('tools', name) || categoryContains('weapons', name)) return true;
  if (name === 'torch' || name === 'crafting_table' || name === 'furnace') return true;
  return false;
}

export function shouldStoreItem(itemName) {
  const name = normalize(itemName);
  if (categoryContains('valuables', name)) return true;
  if (categoryContains('ores', name) || categoryContains('stone', name)) return true;
  if (categoryContains('logs', name) || categoryContains('planks', name)) return true;
  if (categoryContains('blocks', name) || botBlockLikeName(name)) return true;
  if (categoryContains('armour', name)) return true;
  if (categoryContains('tools', name) || categoryContains('weapons', name)) return true;
  return ['dirt', 'sand', 'gravel', 'cobblestone', 'raw_iron', 'raw_gold', 'raw_copper', 'wheat', 'leather', 'string', 'bone'].includes(name);
}

function botBlockLikeName(name) {
  return /(_log|_planks|_wool|_ore|stone|dirt|sand|gravel|cobblestone)$/.test(name);
}

function depositCountFor(bot, item, remainingByName, options = {}) {
  const config = options.config || {};
  const name = item.name;
  const remaining = remainingByName.get(name) || 0;
  if (remaining <= 0) return 0;

  if (categoryContains('food', name)) {
    const keep = config.minimumFoodCount || 6;
    const total = totalFood(bot);
    if (total <= keep) return 0;
    return Math.min(item.count, Math.max(0, total - keep));
  }

  if (name === 'torch') {
    const keep = config.minimumTorchCount || 8;
    return Math.min(item.count, Math.max(0, remaining - keep));
  }

  if (categoryContains('tools', name) || categoryContains('weapons', name)) {
    if (totalTools(bot) <= 2) return 0;
    return Math.max(0, item.count - 1);
  }

  if (categoryContains('logs', name)) {
    const keep = 4;
    return Math.min(item.count, Math.max(0, remaining - keep));
  }

  if (shouldStoreItem(name)) return item.count;
  return 0;
}

export async function depositItems(bot, memory, options = {}) {
  const chestBlock = findOwnedStorageChest(bot, memory);
  if (!chestBlock) return { ok: false, message: 'I do not have a registered storage chest. Say "tj place chest" or "tj register chest".' };
  if (options.shouldStop?.()) return { ok: false, message: 'Stopped storing items.' };

  await bot.pathfinder.goto(new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2));
  const chest = await bot.openChest(chestBlock);
  const remainingByName = new Map();
  for (const item of itemList(bot)) remainingByName.set(item.name, (remainingByName.get(item.name) || 0) + item.count);

  const deposited = [];
  try {
    for (const item of itemList(bot)) {
      if (options.shouldStop?.()) break;
      const amount = depositCountFor(bot, item, remainingByName, options);
      if (amount <= 0) continue;
      console.log(`[storage] depositing ${amount} ${item.name}`);
      await chest.deposit(item.type, null, amount);
      remainingByName.set(item.name, Math.max(0, (remainingByName.get(item.name) || 0) - amount));
      deposited.push(`${item.name} x${amount}`);
    }
  } finally {
    chest.close();
  }

  memory.update({
    storageInventorySnapshot: crafting.inventorySummary(bot),
    lastAction: 'store items',
    lastActionAt: Date.now()
  });

  return {
    ok: true,
    message: deposited.length ? `Stored ${deposited.slice(0, 6).join(', ')}.` : 'I kept my survival essentials and had no excess items to store.',
    deposited
  };
}

export async function withdrawItem(bot, memory, itemName, count = 1, options = {}) {
  const chestBlock = findOwnedStorageChest(bot, memory);
  const name = normalize(itemName);
  const wanted = Math.max(1, Number(count) || 1);
  if (!chestBlock) return { ok: false, message: 'I do not have a registered storage chest.' };
  if (!name) return { ok: false, message: 'Tell me what item to get from storage.' };

  await bot.pathfinder.goto(new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2));
  const chest = await bot.openChest(chestBlock);
  let withdrawn = 0;
  try {
    for (const item of chestItems(chest).filter((entry) => entry.name === name)) {
      if (options.shouldStop?.()) break;
      const amount = Math.min(wanted - withdrawn, item.count);
      if (amount <= 0) break;
      console.log(`[storage] withdrawing ${amount} ${name}`);
      await chest.withdraw(item.type, null, amount);
      withdrawn += amount;
      if (withdrawn >= wanted) break;
    }
  } finally {
    chest.close();
  }

  if (withdrawn <= 0) return { ok: false, message: `I did not find ${name} in storage.` };
  return { ok: true, message: `Got ${withdrawn} ${name} from storage.`, itemName: name, count: withdrawn };
}

export function storageStatus(bot, memory) {
  const owned = findOwnedStorageChest(bot, memory);
  const nearby = findNearbyChests(bot, 12);
  const registered = chestEntries(memory);
  return {
    hasStorage: Boolean(owned),
    registeredCount: registered.length,
    nearbyChestCount: nearby.length,
    ownedPosition: owned ? point(owned.position) : null
  };
}

export function storageStatusText(bot, memory) {
  const status = storageStatus(bot, memory);
  if (!status.hasStorage) return `Storage: no registered chest. Nearby chests ${status.nearbyChestCount}. Say "tj place chest" or "tj register chest".`;
  return `Storage: registered chest at ${status.ownedPosition.x}, ${status.ownedPosition.y}, ${status.ownedPosition.z}. Nearby chests ${status.nearbyChestCount}.`;
}

export function sortInventoryForStorage(bot) {
  return inventory.listUsefulInventory(bot);
}
