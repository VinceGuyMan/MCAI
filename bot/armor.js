import { countItem, craftCraftingTable, findNearbyCraftingTable, placeCraftingTable } from './crafting.js';

const armorSlots = {
  head: {
    destination: 'head',
    equipmentSlot: 5,
    label: 'Helmet',
    items: [
      'leather_helmet',
      'chainmail_helmet',
      'golden_helmet',
      'iron_helmet',
      'diamond_helmet',
      'netherite_helmet',
      'turtle_helmet'
    ]
  },
  torso: {
    destination: 'torso',
    equipmentSlot: 6,
    label: 'Chestplate',
    items: [
      'leather_chestplate',
      'chainmail_chestplate',
      'golden_chestplate',
      'iron_chestplate',
      'diamond_chestplate',
      'netherite_chestplate'
    ]
  },
  legs: {
    destination: 'legs',
    equipmentSlot: 7,
    label: 'Leggings',
    items: [
      'leather_leggings',
      'chainmail_leggings',
      'golden_leggings',
      'iron_leggings',
      'diamond_leggings',
      'netherite_leggings'
    ]
  },
  feet: {
    destination: 'feet',
    equipmentSlot: 8,
    label: 'Boots',
    items: [
      'leather_boots',
      'chainmail_boots',
      'golden_boots',
      'iron_boots',
      'diamond_boots',
      'netherite_boots'
    ]
  }
};

const armorNameToSlot = new Map(
  Object.entries(armorSlots).flatMap(([slot, data]) => data.items.map((name) => [name, slot]))
);

const craftableArmor = new Set([
  'leather_helmet',
  'leather_chestplate',
  'leather_leggings',
  'leather_boots',
  'iron_helmet',
  'iron_chestplate',
  'iron_leggings',
  'iron_boots',
  'golden_helmet',
  'golden_chestplate',
  'golden_leggings',
  'golden_boots',
  'diamond_helmet',
  'diamond_chestplate',
  'diamond_leggings',
  'diamond_boots'
]);

const priorities = ['torso', 'legs', 'head', 'feet'];
const materialItems = {
  leather: 'leather',
  iron: 'iron_ingot',
  golden: 'gold_ingot',
  diamond: 'diamond'
};

function result(ok, message, extra = {}) {
  return { ok, success: ok, ...extra, message };
}

function displayArmorName(name) {
  return String(name || 'none').replace(/_/g, ' ');
}

function slotForArmorName(name) {
  return armorNameToSlot.get(name) || null;
}

function equippedItem(bot, slot) {
  return bot.inventory?.slots?.[armorSlots[slot].equipmentSlot] || null;
}

function inventoryArmorItems(bot) {
  return (bot.inventory?.items?.() || []).filter((item) => armorNameToSlot.has(item.name));
}

function bestArmorForSlot(items, slot) {
  return [...items]
    .filter((item) => slotForArmorName(item.name) === slot)
    .sort((a, b) => getArmorScore(b.name) - getArmorScore(a.name))[0] || null;
}

function materialPrefix(material) {
  if (material === 'gold') return 'golden';
  return material;
}

function armorNameFor(material, slot) {
  const prefix = materialPrefix(material);
  if (slot === 'head') return `${prefix}_helmet`;
  if (slot === 'torso') return `${prefix}_chestplate`;
  if (slot === 'legs') return `${prefix}_leggings`;
  if (slot === 'feet') return `${prefix}_boots`;
  return null;
}

function hasBetterArmorForSlot(bot, slot) {
  const equipped = equippedItem(bot, slot);
  const currentScore = getArmorScore(equipped?.name);
  const best = bestArmorForSlot(inventoryArmorItems(bot), slot);
  return Boolean(best && getArmorScore(best.name) > currentScore);
}

export function isArmorItemName(itemName) {
  return armorNameToSlot.has(itemName);
}

export function getArmorSlot(itemName) {
  return slotForArmorName(itemName);
}

export function getArmorScore(itemName) {
  if (!itemName) return 0;
  if (itemName === 'turtle_helmet') return 2;
  if (itemName.startsWith('netherite_')) return 6;
  if (itemName.startsWith('diamond_')) return 5;
  if (itemName.startsWith('iron_')) return 4;
  if (itemName.startsWith('chainmail_')) return 3;
  if (itemName.startsWith('golden_')) return 2;
  if (itemName.startsWith('leather_')) return 1;
  return 0;
}

export function getArmorStatus(bot) {
  const equipped = {
    head: equippedItem(bot, 'head')?.name || null,
    torso: equippedItem(bot, 'torso')?.name || null,
    legs: equippedItem(bot, 'legs')?.name || null,
    feet: equippedItem(bot, 'feet')?.name || null
  };

  const missing = Object.entries(equipped)
    .filter(([, name]) => !name)
    .map(([slot]) => slot);

  const armorScore = Object.values(equipped)
    .reduce((sum, name) => sum + getArmorScore(name), 0);

  return { ...equipped, armorScore, missing };
}

export function findArmorInInventory(bot) {
  const grouped = { head: [], torso: [], legs: [], feet: [] };
  for (const item of inventoryArmorItems(bot)) {
    const slot = slotForArmorName(item.name);
    grouped[slot].push(item);
  }

  for (const slot of Object.keys(grouped)) {
    grouped[slot].sort((a, b) => getArmorScore(b.name) - getArmorScore(a.name));
  }

  return grouped;
}

export function hasBetterArmorInInventory(bot) {
  return Object.keys(armorSlots).some((slot) => hasBetterArmorForSlot(bot, slot));
}

export function armorStatusText(status) {
  return `Helmet: ${status.head || 'none'}. Chestplate: ${status.torso || 'none'}. Leggings: ${status.legs || 'none'}. Boots: ${status.feet || 'none'}. Missing: ${status.missing.join(', ') || 'none'}.`;
}

export async function equipBestArmor(bot) {
  console.log('[armor] equipBestArmor attempt');
  const inventoryArmor = findArmorInInventory(bot);
  const equipped = [];
  const failures = [];

  for (const [slot, data] of Object.entries(armorSlots)) {
    const current = equippedItem(bot, slot);
    const currentScore = getArmorScore(current?.name);
    const candidate = inventoryArmor[slot].find((item) => getArmorScore(item.name) > currentScore);

    if (!candidate) continue;

    try {
      console.log(`[armor] equipping ${candidate.name} to ${data.destination}`);
      await bot.equip(candidate, data.destination);
      equipped.push(`${displayArmorName(candidate.name)} to ${data.destination}`);
    } catch (error) {
      console.warn(`[armor] failed to equip ${candidate.name}: ${error.message}`);
      failures.push(`Failed to equip ${data.destination}: ${error.message}`);
    }
  }

  if (equipped.length > 0) return result(true, `Equipped ${equipped.join(', ')}.`);
  if (failures.length > 0) return result(false, failures.join(' '));
  return result(false, 'No better armour found.');
}

export async function craftArmorPiece(bot, armorName) {
  const itemName = String(armorName || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/armour/g, 'armor');
  console.log(`[armor] craftArmorPiece attempt item=${itemName}`);

  if (!craftableArmor.has(itemName)) {
    return result(false, `I cannot craft ${displayArmorName(itemName)} in this version.`);
  }

  const item = bot.registry?.itemsByName?.[itemName];
  if (!item) return result(false, `I do not know the item ${itemName}.`);

  let table = findNearbyCraftingTable(bot);
  if (!table) {
    if (countItem(bot, 'crafting_table') < 1) {
      const craftedTable = await craftCraftingTable(bot);
      if (craftedTable.ok) console.log('[armor] crafted crafting table for armour work');
    }

    const placed = await placeCraftingTable(bot);
    if (!placed.ok) return result(false, `I need a crafting table nearby to craft ${displayArmorName(itemName)}.`);
    table = placed.block;
  }

  const recipe = bot.recipesFor(item.id, null, 1, table)[0];
  if (!recipe) {
    return result(false, `I do not have the materials to craft ${displayArmorName(itemName)}.`);
  }

  try {
    await bot.craft(recipe, 1, table);
    return result(true, `Crafted ${itemName}.`, { itemName });
  } catch (error) {
    console.warn(`[armor] craftArmorPiece failed item=${itemName}: ${error.message}`);
    return result(false, `Failed to craft ${displayArmorName(itemName)}: ${error.message}`);
  }
}

export async function craftArmorSet(bot, material, { allowValuable = false } = {}) {
  const normalized = String(material || '').toLowerCase().replace('gold', 'golden');
  if ((normalized === 'diamond' || normalized === 'golden') && !allowValuable) {
    return result(false, `I need direct confirmation before using ${normalized === 'golden' ? 'gold' : normalized} for armour.`);
  }

  const notes = [];
  let craftedCount = 0;

  for (const slot of priorities) {
    const itemName = armorNameFor(normalized, slot);
    if (!itemName) continue;
    const currentScore = getArmorScore(equippedItem(bot, slot)?.name);
    if (currentScore >= getArmorScore(itemName)) {
      notes.push(`${armorSlots[slot].label} is already equal or better.`);
      continue;
    }

    const crafted = await craftArmorPiece(bot, itemName);
    notes.push(crafted.message);
    if (crafted.ok) craftedCount += 1;
  }

  if (craftedCount === 0) return result(false, notes.join(' ') || `No ${normalized} armour crafted.`);
  return result(true, `Crafted ${craftedCount} ${normalized} armour piece(s). ${notes.join(' ')}`, { craftedCount });
}

export async function craftBestAffordableArmor(bot) {
  console.log('[armor] craftBestAffordableArmor attempt');
  const ironPieces = priorities.some((slot) => getArmorScore(equippedItem(bot, slot)?.name) < getArmorScore(armorNameFor('iron', slot)));
  if (ironPieces && countItem(bot, materialItems.iron) >= 4) {
    const crafted = await craftArmorSet(bot, 'iron');
    if (crafted.ok) return crafted;
  }

  const leatherPieces = priorities.some((slot) => getArmorScore(equippedItem(bot, slot)?.name) < getArmorScore(armorNameFor('leather', slot)));
  if (leatherPieces && countItem(bot, materialItems.leather) >= 4) {
    const crafted = await craftArmorSet(bot, 'leather');
    if (crafted.ok) return crafted;
  }

  return result(false, 'I do not have enough iron ingots or leather to craft useful armour.');
}

export async function ensureArmoredForSurvival(bot, state = {}, options = {}) {
  console.log('[armor] ensureArmoredForSurvival check');
  const equipResult = await equipBestArmor(bot);
  const status = getArmorStatus(bot);

  if (status.armorScore > 0 || equipResult.ok) {
    return result(true, equipResult.ok ? equipResult.message : 'Armour already equipped.', { status });
  }

  const danger = Boolean(state.dangerFlags?.lowHealth || state.dangerFlags?.nightTime || state.dangerFlags?.hostileNearby);
  if (!danger) return result(false, 'No armour available.');

  if (options.allowCraft && (countItem(bot, materialItems.iron) >= 4 || countItem(bot, materialItems.leather) >= 4)) {
    const crafted = await craftBestAffordableArmor(bot);
    if (crafted.ok) {
      await equipBestArmor(bot);
      return result(true, crafted.message, { status: getArmorStatus(bot) });
    }
  }

  return result(false, 'I do not have armour available right now.');
}

export function hasIronForArmor(bot) {
  return countItem(bot, materialItems.iron) >= 4;
}

export function hasLeatherForArmor(bot) {
  return countItem(bot, materialItems.leather) >= 4;
}

export function hasDiamondsForArmor(bot) {
  return countItem(bot, materialItems.diamond) >= 4;
}

export { armorSlots, priorities as armorCraftingPriority };
