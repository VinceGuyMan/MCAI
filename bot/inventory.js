import pathfinderPkg from 'mineflayer-pathfinder';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

const categorySets = {
  logs: new Set(['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'bamboo_block', 'pale_oak_log']),
  planks: new Set(['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks', 'pale_oak_planks']),
  sticks: new Set(['stick']),
  stone: new Set(['cobblestone', 'stone', 'cobbled_deepslate', 'deepslate']),
  ores: new Set(['coal_ore', 'deepslate_coal_ore', 'iron_ore', 'deepslate_iron_ore', 'raw_iron', 'raw_copper', 'raw_gold', 'copper_ore', 'gold_ore']),
  coal: new Set(['coal', 'charcoal']),
  food: new Set([
    'apple', 'bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton', 'cooked_rabbit',
    'cooked_cod', 'cooked_salmon', 'beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'cod', 'salmon',
    'potato', 'baked_potato', 'carrot', 'beetroot', 'sweet_berries', 'glow_berries', 'melon_slice',
    'cookie', 'pumpkin_pie', 'mushroom_stew', 'beetroot_soup', 'rabbit_stew', 'dried_kelp', 'honey_bottle',
    'golden_carrot', 'golden_apple'
  ]),
  seeds: new Set(['wheat_seeds', 'beetroot_seeds', 'melon_seeds', 'pumpkin_seeds']),
  crops: new Set(['wheat', 'carrot', 'potato', 'beetroot', 'melon_slice', 'pumpkin', 'sugar_cane', 'sweet_berries']),
  animal_food: new Set(['wheat', 'carrot', 'potato', 'beetroot', 'wheat_seeds', 'beetroot_seeds', 'melon_seeds', 'pumpkin_seeds', 'golden_carrot', 'dandelion']),
  animal_products: new Set(['egg', 'feather', 'leather', 'milk_bucket']),
  farm_tools: new Set(['wooden_hoe', 'stone_hoe', 'iron_hoe', 'golden_hoe', 'diamond_hoe', 'netherite_hoe', 'shears', 'bucket', 'water_bucket']),
  farming_blocks: new Set(['farmland', 'dirt', 'grass_block', 'oak_fence', 'spruce_fence', 'birch_fence', 'jungle_fence', 'acacia_fence', 'dark_oak_fence', 'mangrove_fence', 'cherry_fence', 'oak_fence_gate', 'spruce_fence_gate', 'birch_fence_gate', 'jungle_fence_gate', 'acacia_fence_gate', 'dark_oak_fence_gate', 'mangrove_fence_gate', 'cherry_fence_gate']),
  tools: new Set([
    'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'golden_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe',
    'wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe', 'netherite_axe',
    'wooden_shovel', 'stone_shovel', 'iron_shovel', 'golden_shovel', 'diamond_shovel', 'netherite_shovel',
    'wooden_hoe', 'stone_hoe', 'iron_hoe', 'golden_hoe', 'diamond_hoe', 'netherite_hoe'
  ]),
  weapons: new Set([
    'wooden_sword', 'stone_sword', 'iron_sword', 'golden_sword', 'diamond_sword', 'netherite_sword',
    'bow', 'crossbow', 'trident', 'shield'
  ]),
  armour: new Set(['leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots', 'chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots', 'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots', 'netherite_helmet', 'netherite_chestplate', 'netherite_leggings', 'netherite_boots', 'turtle_helmet']),
  utility: new Set(['crafting_table', 'furnace', 'chest', 'barrel', 'torch', 'ladder', 'bucket', 'shield', 'shears', 'bed', 'white_bed', 'oak_boat', 'spruce_boat', 'birch_boat', 'jungle_boat', 'acacia_boat', 'dark_oak_boat', 'mangrove_boat', 'cherry_boat']),
  valuables: new Set(['diamond', 'emerald', 'gold_ingot', 'iron_ingot', 'copper_ingot', 'netherite_ingot', 'ancient_debris', 'enchanted_golden_apple'])
};

const miningLootNames = new Set([
  'cobblestone',
  'stone',
  'cobbled_deepslate',
  'deepslate',
  'coal',
  'raw_iron',
  'raw_copper',
  'raw_gold',
  'redstone',
  'lapis_lazuli',
  'diamond',
  'emerald',
  'flint',
  'gravel',
  'dirt',
  'iron_ore',
  'deepslate_iron_ore',
  'coal_ore',
  'deepslate_coal_ore',
  'copper_ore',
  'deepslate_copper_ore',
  'gold_ore',
  'deepslate_gold_ore',
  'redstone_ore',
  'deepslate_redstone_ore',
  'lapis_ore',
  'deepslate_lapis_ore',
  'diamond_ore',
  'deepslate_diamond_ore'
]);

const miningValuables = new Set(['diamond', 'emerald', 'raw_gold', 'gold_ingot', 'lapis_lazuli', 'redstone']);
const netherBlockNames = new Set(['cobblestone', 'cobbled_deepslate', 'stone', 'deepslate', 'dirt', 'netherrack', 'blackstone', 'basalt']);
const netherFoodNames = new Set(['cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton', 'cooked_cod', 'cooked_salmon', 'bread', 'baked_potato', 'golden_carrot', 'apple', 'carrot']);
const goldArmorNames = new Set(['golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots']);

const toolRanks = {
  wooden: 1,
  stone: 2,
  golden: 2,
  iron: 3,
  diamond: 4,
  netherite: 5
};

const weaponRanks = {
  wooden_sword: 1,
  stone_sword: 2,
  iron_sword: 3,
  diamond_sword: 4,
  netherite_sword: 5,
  axe: 2,
  bow: 2,
  crossbow: 2,
  trident: 4
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExpectedPathInterrupt(error) {
  const message = String(error?.message || error || '');
  return message.includes('GoalChanged') ||
    message.includes('goal was changed') ||
    message.includes('Path was stopped') ||
    message.includes('cancelled') ||
    message.includes('Canceled');
}

function normalizeItemName(itemName) {
  let normalized = String(itemName || '').trim().toLowerCase().replace(/\s+/g, '_');
  normalized = normalized
    .replace(/_logs$/, '_log')
    .replace(/_ingots$/, '_ingot')
    .replace(/^sticks$/, 'stick')
    .replace(/^torches$/, 'torch')
    .replace(/^chests$/, 'chest')
    .replace(/^furnaces$/, 'furnace')
    .replace(/^breads$/, 'bread');
  return normalized;
}

const categoryAliases = new Map([
  ['log', 'logs'],
  ['logs', 'logs'],
  ['wood', 'logs'],
  ['woods', 'logs'],
  ['plank', 'planks'],
  ['planks', 'planks'],
  ['stick', 'sticks'],
  ['sticks', 'sticks'],
  ['food', 'food'],
  ['foods', 'food'],
  ['meat', 'food'],
  ['coal', 'coal'],
  ['charcoal', 'coal'],
  ['stone', 'stone'],
  ['cobble', 'stone'],
  ['cobblestone', 'stone'],
  ['tool', 'tools'],
  ['tools', 'tools'],
  ['weapon', 'weapons'],
  ['weapons', 'weapons'],
  ['armor', 'armour'],
  ['armour', 'armour']
]);

function resolveInventoryRequest(bot, itemName) {
  const name = normalizeItemName(itemName);
  const items = itemList(bot);
  const exact = items.filter((item) => item.name === name);
  if (exact.length > 0) {
    return {
      name,
      label: name,
      matching: exact,
      total: exact.reduce((sum, item) => sum + item.count, 0),
      category: null
    };
  }

  const category = categoryAliases.get(name);
  const names = category ? categorySets[category] : null;
  if (!names) return { name, label: name, matching: [], total: 0, category: null };

  const matching = items.filter((item) => names.has(item.name));
  return {
    name,
    label: category,
    matching,
    total: matching.reduce((sum, item) => sum + item.count, 0),
    category
  };
}

function itemList(bot) {
  // Standalone dashboard has no live bot — never crash on null.
  return bot?.inventory?.items?.() || [];
}

function durabilityLeft(item) {
  if (!item) return null;
  if (typeof item.durabilityUsed !== 'number' || typeof item.maxDurability !== 'number') return null;
  return item.maxDurability - item.durabilityUsed;
}

function toolKindForBlock(blockName) {
  const name = normalizeItemName(blockName);
  if (name.includes('log') || name.includes('wood') || name.includes('planks')) return 'axe';
  if (name.includes('stone') || name.includes('ore') || name.includes('deepslate') || name.includes('cobblestone')) return 'pickaxe';
  if (name.includes('dirt') || name.includes('sand') || name.includes('gravel') || name.includes('clay')) return 'shovel';
  return null;
}

function materialRank(itemName) {
  const material = Object.keys(toolRanks).find((prefix) => itemName.startsWith(`${prefix}_`));
  return material ? toolRanks[material] : 0;
}

function stackText(items, limit = 8) {
  if (items.length === 0) return 'none';
  return items.slice(0, limit).map((item) => `${item.name} x${item.count}`).join(', ');
}

export function inventorySummary(bot) {
  return itemList(bot).map((item) => ({ name: item.name, count: item.count, durabilityLeft: durabilityLeft(item) }));
}

export function countItem(bot, itemName) {
  const name = normalizeItemName(itemName);
  return itemList(bot)
    .filter((item) => item.name === name)
    .reduce((sum, item) => sum + item.count, 0);
}

export function hasItem(bot, itemName, count = 1) {
  return countItem(bot, itemName) >= count;
}

export function countItemsByCategory(bot) {
  const counts = {
    logs: 0,
    planks: 0,
    sticks: 0,
    stone: 0,
    ores: 0,
    coal: 0,
    food: 0,
    seeds: 0,
    crops: 0,
    animal_food: 0,
    animal_products: 0,
    farm_tools: 0,
    farming_blocks: 0,
    tools: 0,
    weapons: 0,
    armour: 0,
    blocks: 0,
    utility: 0,
    valuables: 0,
    junk: 0
  };

  for (const item of itemList(bot)) {
    let matched = false;
    for (const [category, names] of Object.entries(categorySets)) {
      if (names.has(item.name) || (category === 'armour' && /_(helmet|chestplate|leggings|boots)$/.test(item.name))) {
        counts[category] += item.count;
        matched = true;
      }
    }
    if (!matched && bot.registry?.blocksByName?.[item.name]) counts.blocks += item.count;
    else if (!matched) counts.junk += item.count;
  }

  return counts;
}

export function findBestTool(bot, blockName) {
  const kind = toolKindForBlock(blockName);
  if (!kind) return null;
  return itemList(bot)
    .filter((item) => item.name.endsWith(`_${kind}`))
    .sort((a, b) => {
      const rankDelta = materialRank(b.name) - materialRank(a.name);
      if (rankDelta !== 0) return rankDelta;
      return (durabilityLeft(b) ?? 9999) - (durabilityLeft(a) ?? 9999);
    })[0] || null;
}

export async function equipBestToolForBlock(bot, blockName) {
  const tool = findBestTool(bot, blockName);
  if (!tool) return { ok: false, message: `I do not have the right tool for ${blockName}.` };
  const left = durabilityLeft(tool);
  if (left !== null && left <= 3) return { ok: false, message: `${tool.name} is too damaged to use safely.` };
  await bot.equip(tool, 'hand');
  return { ok: true, message: `Equipped ${tool.name}.`, item: tool };
}

export function findBestWeapon(bot) {
  return itemList(bot)
    .filter((item) => categorySets.weapons.has(item.name) || item.name.endsWith('_axe'))
    .sort((a, b) => {
      const ar = weaponRanks[a.name] || (a.name.endsWith('_axe') ? materialRank(a.name) : 0);
      const br = weaponRanks[b.name] || (b.name.endsWith('_axe') ? materialRank(b.name) : 0);
      return br - ar;
    })[0] || null;
}

export function lowDurabilityTools(bot, threshold = 8) {
  return itemList(bot)
    .filter((item) => categorySets.tools.has(item.name) || categorySets.weapons.has(item.name))
    .filter((item) => {
      const left = durabilityLeft(item);
      return left !== null && left <= threshold;
    })
    .map((item) => ({ name: item.name, durabilityLeft: durabilityLeft(item) }));
}

export function listUsefulInventory(bot) {
  const counts = countItemsByCategory(bot);
  const useful = itemList(bot).filter((item) => {
    return ['logs', 'planks', 'sticks', 'stone', 'coal', 'food', 'tools', 'weapons', 'armour', 'utility', 'valuables']
      .some((category) => categorySets[category]?.has(item.name) || (category === 'armour' && /_(helmet|chestplate|leggings|boots)$/.test(item.name)));
  });
  return {
    counts,
    summary: `Inventory: logs ${counts.logs}, planks ${counts.planks}, sticks ${counts.sticks}, stone ${counts.stone}, coal ${counts.coal}, food ${counts.food}, tools ${counts.tools}, armour ${counts.armour}, valuables ${counts.valuables}. Useful: ${stackText(useful)}.`
  };
}

export async function collectNearbyDrops(bot, radius = 8, options = {}) {
  const max = options.maxItems || 12;
  let collected = 0;
  for (let i = 0; i < max; i += 1) {
    if (options.shouldStop?.()) return { ok: false, message: 'Stopped collecting drops.', collected };
    const item = bot.nearestEntity((entity) => ['item', 'Item', 'item_stack'].includes(entity.name) && bot.entity?.position.distanceTo(entity.position) <= radius);
    if (!item) break;
    try {
      await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 1));
    } catch (error) {
      if (isExpectedPathInterrupt(error)) return { ok: false, message: 'Drop collection was interrupted.', collected, interrupted: true };
      throw error;
    }
    await wait(400);
    collected += 1;
  }
  return { ok: true, message: collected > 0 ? `Collected ${collected} nearby drop(s).` : 'No nearby drops.', collected };
}

export async function collectSpecificDrop(bot, itemName, radius = 16, options = {}) {
  const wanted = normalizeItemName(itemName);
  let collected = 0;
  for (let i = 0; i < 8; i += 1) {
    if (options.shouldStop?.()) return { ok: false, message: `Stopped collecting ${wanted}.`, collected };
    const item = bot.nearestEntity((entity) => {
      if (!['item', 'Item', 'item_stack'].includes(entity.name) || !entity.metadata) return false;
      if (bot.entity?.position.distanceTo(entity.position) > radius) return false;
      const dropped = entity.getDroppedItem?.();
      if (!dropped?.name) return wanted === 'drop' || wanted === 'items';
      if (wanted === 'wood') return dropped.name.includes('log') || dropped.name.includes('planks');
      if (wanted === 'food') return categorySets.food.has(dropped.name);
      return dropped.name === wanted;
    });
    if (!item) break;
    try {
      await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 1));
    } catch (error) {
      if (isExpectedPathInterrupt(error)) return { ok: false, message: `Collecting ${wanted} was interrupted.`, collected, interrupted: true };
      throw error;
    }
    await wait(500);
    collected += 1;
  }
  return { ok: true, message: collected > 0 ? `Collected nearby ${wanted} drops.` : `I did not see ${wanted} drops nearby.`, collected };
}

export async function returnToOwnerAfterCollect(bot, config) {
  const owner = bot.players?.[config.ownerUsername]?.entity;
  if (!owner) return { ok: false, message: 'I cannot see ModVinny to return.' };
  try {
    await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, config.followDistance || 3));
  } catch (error) {
    if (isExpectedPathInterrupt(error)) return { ok: false, message: 'Return to ModVinny was interrupted.', interrupted: true };
    throw error;
  }
  return { ok: true, message: 'Returned to ModVinny.' };
}

export async function dropItem(bot, itemName, count = 1, options = {}) {
  const resolved = resolveInventoryRequest(bot, itemName);
  const matching = resolved.matching;
  if (resolved.total <= 0) return { ok: false, message: `I do not have ${resolved.label}.` };
  const wantsAll = String(count).toLowerCase() === 'all' || count === Infinity || Number(count) > 9999;
  const amount = wantsAll ? resolved.total : Math.max(1, Number(count) || 1);

  if (!options.direct) return { ok: false, message: 'Dropping items requires a direct command.' };

  let remaining = amount;
  for (const item of matching) {
    const toDrop = Math.min(remaining, item.count);
    await bot.toss(item.type, null, toDrop);
    remaining -= toDrop;
    if (remaining <= 0) break;
  }
  return { ok: true, message: `Dropped ${amount - remaining} ${resolved.label}.` };
}

export function toolStatusText(bot) {
  const bestPickaxe = findBestTool(bot, 'stone')?.name || 'none';
  const bestAxe = findBestTool(bot, 'oak_log')?.name || 'none';
  const bestWeapon = findBestWeapon(bot)?.name || 'none';
  const low = lowDurabilityTools(bot);
  return `Tools: pickaxe ${bestPickaxe}, axe ${bestAxe}, weapon ${bestWeapon}. Damaged: ${low.length ? low.map((item) => `${item.name}(${item.durabilityLeft})`).join(', ') : 'none'}.`;
}

export function countFreeInventorySlots(bot) {
  const slots = bot.inventory?.slots || [];
  const inventorySlots = slots.slice(9, 45);
  return inventorySlots.filter((slot) => !slot).length;
}

export function countMiningLoot(bot) {
  return itemList(bot)
    .filter((item) => miningLootNames.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

export function getMiningLootSummary(bot) {
  const summary = {};
  for (const item of itemList(bot)) {
    if (!miningLootNames.has(item.name)) continue;
    summary[item.name] = (summary[item.name] || 0) + item.count;
  }
  return summary;
}

export function isMiningValuable(itemName) {
  return miningValuables.has(String(itemName || '').toLowerCase());
}

export function shouldDepositMiningLoot(bot) {
  return countMiningLoot(bot) > 0 || countFreeInventorySlots(bot) <= 5;
}

export function keepMiningEssentials(bot) {
  const items = itemList(bot);
  return {
    food: items.filter((item) => categorySets.food.has(item.name)).reduce((sum, item) => sum + item.count, 0),
    torches: countItem(bot, 'torch'),
    pickaxe: findBestTool(bot, 'stone')?.name || null,
    weapon: findBestWeapon(bot)?.name || null,
    emergencyBlocks: countItem(bot, 'cobblestone') + countItem(bot, 'dirt'),
    craftingTable: countItem(bot, 'crafting_table'),
    furnace: countItem(bot, 'furnace'),
    coal: countItem(bot, 'coal') + countItem(bot, 'charcoal')
  };
}

export function countSeeds(bot) {
  return itemList(bot).filter((item) => categorySets.seeds.has(item.name)).reduce((sum, item) => sum + item.count, 0);
}

export function countCrops(bot) {
  return itemList(bot).filter((item) => categorySets.crops.has(item.name)).reduce((sum, item) => sum + item.count, 0);
}

export function countAnimalFood(bot) {
  return itemList(bot).filter((item) => categorySets.animal_food.has(item.name)).reduce((sum, item) => sum + item.count, 0);
}

export function countFarmProducts(bot) {
  return itemList(bot).filter((item) => categorySets.animal_products.has(item.name) || item.name.endsWith('_wool')).reduce((sum, item) => sum + item.count, 0);
}

export function hasEnoughSeedsForFarm(bot, cropType = 'wheat') {
  const needed = cropType === 'beetroots' ? 'beetroot_seeds' : cropType === 'carrots' ? 'carrot' : cropType === 'potatoes' ? 'potato' : 'wheat_seeds';
  return countItem(bot, needed) > 0;
}

export function hasEnoughAnimalFood(bot, animalType = 'cow') {
  const food = {
    cow: ['wheat'],
    sheep: ['wheat'],
    pig: ['carrot', 'potato', 'beetroot'],
    chicken: ['wheat_seeds', 'beetroot_seeds', 'melon_seeds', 'pumpkin_seeds'],
    rabbit: ['carrot', 'golden_carrot', 'dandelion']
  }[animalType] || ['wheat'];
  return food.some((name) => countItem(bot, name) > 0);
}

export function getFarmSupplySummary(bot) {
  return {
    seeds: countSeeds(bot),
    crops: countCrops(bot),
    animalFood: countAnimalFood(bot),
    animalProducts: countFarmProducts(bot),
    wheatSeeds: countItem(bot, 'wheat_seeds'),
    wheat: countItem(bot, 'wheat'),
    carrots: countItem(bot, 'carrot'),
    potatoes: countItem(bot, 'potato'),
    beetrootSeeds: countItem(bot, 'beetroot_seeds'),
    fences: itemList(bot).filter((item) => item.name.endsWith('_fence')).reduce((sum, item) => sum + item.count, 0),
    fenceGates: itemList(bot).filter((item) => item.name.endsWith('_fence_gate')).reduce((sum, item) => sum + item.count, 0)
  };
}

export function countNetherBlocks(bot) {
  return itemList(bot)
    .filter((item) => netherBlockNames.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

export function countFireResPotions(bot) {
  return itemList(bot)
    .filter((item) => item.name === 'potion' && /fire[_\s-]?resistance/i.test(JSON.stringify(item.nbt || item.components || {})))
    .reduce((sum, item) => sum + item.count, 0);
}

export const countObsidian = (bot) => countItem(bot, 'obsidian');
export const countFlintAndSteel = (bot) => countItem(bot, 'flint_and_steel');

export function countGoldArmor(bot) {
  return itemList(bot)
    .filter((item) => goldArmorNames.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

export function countNetherFood(bot) {
  return itemList(bot)
    .filter((item) => netherFoodNames.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

export function hasNetherFood(bot, minimum = 16) {
  return countNetherFood(bot) >= minimum;
}

export function hasNetherBlocks(bot, minimum = 64) {
  return countNetherBlocks(bot) >= minimum;
}

export function hasPortalSupplies(bot) {
  return countObsidian(bot) >= 10 && countFlintAndSteel(bot) > 0;
}

export function hasNetherReadyTools(bot) {
  return Boolean(findBestTool(bot, 'stone') && findBestWeapon(bot));
}

export function hasFreeSlotsForNether(bot) {
  return countFreeInventorySlots(bot) >= 4;
}

export function getNetherSupplySummary(bot) {
  return {
    food: countNetherFood(bot),
    blocks: countNetherBlocks(bot),
    torches: countItem(bot, 'torch'),
    arrows: countItem(bot, 'arrow'),
    obsidian: countObsidian(bot),
    flintAndSteel: countFlintAndSteel(bot),
    goldArmor: countGoldArmor(bot),
    fireResistancePotions: countFireResPotions(bot),
    freeSlots: countFreeInventorySlots(bot),
    pickaxe: findBestTool(bot, 'stone')?.name || null,
    weapon: findBestWeapon(bot)?.name || null,
    shield: countItem(bot, 'shield'),
    bow: countItem(bot, 'bow') + countItem(bot, 'crossbow'),
    craftingTable: countItem(bot, 'crafting_table'),
    furnace: countItem(bot, 'furnace')
  };
}

export function getXpStatus(bot) {
  const experience = bot?.experience || {};
  return {
    level: Number(experience.level ?? experience.lvl ?? 0) || 0,
    points: Number(experience.points ?? experience.progress ?? 0) || 0
  };
}

export function getLapisCount(bot) {
  return countItem(bot, 'lapis_lazuli');
}

export function getBookCount(bot) {
  return countItem(bot, 'book') + countItem(bot, 'enchanted_book');
}

export function getEnchantedBooks(bot) {
  return itemList(bot)
    .filter((item) => item.name === 'enchanted_book')
    .map((item) => ({
      name: item.name,
      displayName: item.displayName || item.name,
      count: item.count || 1,
      nbt: item.nbt || null
    }));
}

export function getGearInventory(bot) {
  return itemList(bot)
    .filter((item) => categorySets.tools.has(item.name) || categorySets.weapons.has(item.name) || categorySets.armour.has(item.name) || /_(helmet|chestplate|leggings|boots)$/.test(item.name))
    .map((item) => ({
      name: item.name,
      count: item.count || 1,
      durabilityLeft: durabilityLeft(item),
      maxDurability: item.maxDurability ?? null
    }));
}

export function getPotionInventory(bot) {
  return itemList(bot)
    .filter((item) => item.name === 'potion' || item.name === 'splash_potion' || item.name === 'lingering_potion' || item.name.includes('potion'))
    .map((item) => ({
      name: item.name,
      displayName: item.displayName || item.name,
      count: item.count || 1
    }));
}

export function getBrewingIngredientSummary(bot) {
  return {
    brewingStand: countItem(bot, 'brewing_stand'),
    blazePowder: countItem(bot, 'blaze_powder'),
    waterBottles: itemList(bot).filter((item) => item.name === 'potion' && /water/i.test(`${item.displayName || ''} ${JSON.stringify(item.nbt || {})}`)).reduce((sum, item) => sum + item.count, 0),
    netherWart: countItem(bot, 'nether_wart'),
    magmaCream: countItem(bot, 'magma_cream'),
    glisteringMelonSlice: countItem(bot, 'glistering_melon_slice'),
    goldenCarrot: countItem(bot, 'golden_carrot'),
    phantomMembrane: countItem(bot, 'phantom_membrane'),
    redstone: countItem(bot, 'redstone'),
    potions: getPotionInventory(bot).length
  };
}

export function countIngredient(bot, itemName) {
  return countItem(bot, itemName);
}

export function hasEnchantingSetup(bot) {
  const hasTable = countItem(bot, 'enchanting_table') > 0 || Boolean(bot?.findBlock && bot?.registry?.blocksByName?.enchanting_table && bot.findBlock({ matching: bot.registry.blocksByName.enchanting_table.id, maxDistance: 12 }));
  return {
    ok: hasTable && getLapisCount(bot) > 0 && getXpStatus(bot).level > 0,
    hasTable,
    lapis: getLapisCount(bot),
    xpLevel: getXpStatus(bot).level
  };
}

export function hasAnvilSetup(bot) {
  const ids = ['anvil', 'chipped_anvil', 'damaged_anvil'].map((name) => bot?.registry?.blocksByName?.[name]?.id).filter(Boolean);
  const nearby = Boolean(ids.length && bot?.findBlock && bot.findBlock({ matching: ids, maxDistance: 12 }));
  return {
    ok: nearby || countItem(bot, 'anvil') > 0,
    nearby,
    inventoryAnvils: countItem(bot, 'anvil')
  };
}

export function hasBrewingSetup(bot) {
  const id = bot?.registry?.blocksByName?.brewing_stand?.id;
  const nearby = Boolean(id && bot?.findBlock && bot.findBlock({ matching: id, maxDistance: 12 }));
  return {
    ok: false,
    nearby,
    inventoryBrewingStands: countItem(bot, 'brewing_stand'),
    reason: 'Brewing automation is scaffolded but not implemented.'
  };
}

export function getUpgradeSupplySummary(bot) {
  return {
    xp: getXpStatus(bot),
    lapis: getLapisCount(bot),
    books: getBookCount(bot),
    enchantedBooks: getEnchantedBooks(bot).length,
    diamonds: countItem(bot, 'diamond'),
    ironIngots: countItem(bot, 'iron_ingot'),
    netheriteIngots: countItem(bot, 'netherite_ingot'),
    gear: getGearInventory(bot),
    potions: getPotionInventory(bot),
    brewing: getBrewingIngredientSummary(bot)
  };
}

export function getEmeraldCount(bot) {
  return countItem(bot, 'emerald');
}

export function getPaperCount(bot) {
  return countItem(bot, 'paper');
}

export function getWheatCount(bot) {
  return countItem(bot, 'wheat');
}

export function getCarrotCount(bot) {
  return countItem(bot, 'carrot');
}

export function getPotatoCount(bot) {
  return countItem(bot, 'potato');
}

export function getStickCount(bot) {
  return countItem(bot, 'stick');
}

export function getCoalCount(bot) {
  return countItem(bot, 'coal') + countItem(bot, 'charcoal');
}

export function getStringCount(bot) {
  return countItem(bot, 'string');
}

export function getFeatherCount(bot) {
  return countItem(bot, 'feather');
}

export function getLeatherCount(bot) {
  return countItem(bot, 'leather');
}

export function getBooksSummary(bot) {
  return {
    books: countItem(bot, 'book'),
    enchantedBooks: countItem(bot, 'enchanted_book'),
    writableBooks: countItem(bot, 'writable_book'),
    writtenBooks: countItem(bot, 'written_book')
  };
}

export function getTradeItemsSummary(bot) {
  return {
    emeralds: getEmeraldCount(bot),
    paper: getPaperCount(bot),
    wheat: getWheatCount(bot),
    carrots: getCarrotCount(bot),
    potatoes: getPotatoCount(bot),
    sticks: getStickCount(bot),
    coal: getCoalCount(bot),
    string: getStringCount(bot),
    feathers: getFeatherCount(bot),
    leather: getLeatherCount(bot),
    books: getBooksSummary(bot)
  };
}

function normalizeTradeInput(input) {
  if (!input) return null;
  if (typeof input === 'string') return { name: normalizeItemName(input), count: 1 };
  return {
    name: normalizeItemName(input.name || input.displayName || input.type),
    count: Number(input.count ?? input.amount ?? 1)
  };
}

export function hasTradeInputs(bot, trade, times = 1) {
  const inputs = Array.isArray(trade?.inputs)
    ? trade.inputs
    : [trade?.inputItem1, trade?.inputItem2, ...(Array.isArray(trade?.wanted) ? trade.wanted : [])];
  const required = {};
  for (const rawInput of inputs) {
    const input = normalizeTradeInput(rawInput);
    if (!input || !input.name || input.name === 'unknown') continue;
    required[input.name] = (required[input.name] || 0) + input.count * Number(times || 1);
  }
  const missing = Object.entries(required)
    .map(([name, needed]) => ({ name, needed, available: countItem(bot, name) }))
    .filter((entry) => entry.available < entry.needed);
  return {
    ok: missing.length === 0,
    required,
    missing
  };
}

export { categorySets, durabilityLeft, miningLootNames, normalizeItemName, resolveInventoryRequest };
