const MATERIAL_TIERS = {
  wooden: 1,
  wood: 1,
  leather: 1,
  golden: 1.5,
  gold: 1.5,
  stone: 2,
  chainmail: 2.5,
  iron: 3,
  diamond: 4,
  netherite: 5
};

const ARMOR_SLOTS = {
  helmet: 'head',
  chestplate: 'torso',
  leggings: 'legs',
  boots: 'feet',
  turtle_helmet: 'head'
};

const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'hoe', 'shears', 'fishing_rod'];
const WEAPON_TYPES = ['sword', 'axe', 'bow', 'crossbow', 'trident'];

const ENCHANT_WEIGHTS = {
  sharpness: 5,
  smite: 3,
  bane_of_arthropods: 2,
  fire_aspect: 3,
  looting: 4,
  sweeping_edge: 2,
  efficiency: 5,
  fortune: 6,
  silk_touch: 5,
  unbreaking: 4,
  mending: 8,
  protection: 6,
  projectile_protection: 3,
  blast_protection: 3,
  fire_protection: 4,
  feather_falling: 5,
  respiration: 3,
  aqua_affinity: 2,
  depth_strider: 3,
  thorns: 2,
  power: 5,
  punch: 2,
  flame: 3,
  infinity: 5,
  quick_charge: 4,
  piercing: 3,
  multishot: 3
};

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/^minecraft:/, '').replace(/\s+/g, '_');
}

function inventoryItems(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function slotItems(bot) {
  return Array.isArray(bot?.inventory?.slots) ? bot.inventory.slots.filter(Boolean) : [];
}

function stringifyNbt(item) {
  try {
    return JSON.stringify(item?.nbt || {});
  } catch {
    return '';
  }
}

function extractEnchantList(item) {
  if (!item) return [];
  if (Array.isArray(item.enchants)) return item.enchants;
  if (Array.isArray(item.enchantments)) return item.enchantments;
  const nbt = stringifyNbt(item).toLowerCase();
  const found = [];
  for (const name of Object.keys(ENCHANT_WEIGHTS)) {
    if (nbt.includes(name)) found.push({ name, lvl: 1 });
  }
  return found;
}

function enchantName(enchant) {
  return normalizeName(enchant?.name || enchant?.id || enchant?.type || enchant?.key || '');
}

function enchantLevel(enchant) {
  return Number(enchant?.lvl ?? enchant?.level ?? enchant?.value ?? 1) || 1;
}

function materialFromName(itemName) {
  const name = normalizeName(itemName);
  if (name === 'turtle_helmet') return 'turtle';
  if (name.startsWith('wooden_')) return 'wooden';
  if (name.startsWith('golden_')) return 'golden';
  return name.split('_')[0] || '';
}

function durabilityScore(item) {
  const info = getDurabilityInfo(item);
  if (!info.hasDurability) return 1;
  if (info.remaining <= 0) return -15;
  if (info.percentRemaining < 0.1) return -8;
  if (info.percentRemaining < 0.25) return -3;
  return Math.round(info.percentRemaining * 5);
}

function enchantScore(item, wanted = null) {
  return getEnchantments(item).reduce((sum, enchant) => {
    const name = normalizeName(enchant.name);
    const base = ENCHANT_WEIGHTS[name] || 1;
    const relevant = !wanted || wanted.has(name);
    return sum + (relevant ? base : Math.max(1, Math.floor(base / 2))) * enchant.level;
  }, 0);
}

export function getItemMaterialTier(itemName) {
  const material = materialFromName(itemName);
  if (material === 'turtle') return 2;
  return MATERIAL_TIERS[material] || 0;
}

export function getToolType(itemName) {
  const name = normalizeName(itemName);
  return TOOL_TYPES.find((type) => name === type || name.endsWith(`_${type}`)) || null;
}

export function getArmorSlot(itemName) {
  const name = normalizeName(itemName);
  if (name === 'turtle_helmet') return 'head';
  const suffix = Object.keys(ARMOR_SLOTS).find((part) => name.endsWith(`_${part}`));
  return suffix ? ARMOR_SLOTS[suffix] : null;
}

export function getWeaponType(itemName) {
  const name = normalizeName(itemName);
  if (['bow', 'crossbow', 'trident'].includes(name)) return name;
  if (name.endsWith('_sword')) return 'sword';
  if (name.endsWith('_axe')) return 'axe';
  return null;
}

export function getEnchantments(item) {
  return extractEnchantList(item)
    .map((enchant) => ({ name: enchantName(enchant), level: enchantLevel(enchant) }))
    .filter((enchant) => enchant.name);
}

export function getDurabilityInfo(item) {
  const max = Number(item?.maxDurability ?? item?.maxDurabilityUsed ?? 0) || 0;
  const used = Number(item?.durabilityUsed ?? 0) || 0;
  if (!max) return { hasDurability: false, max: 0, used: 0, remaining: null, percentRemaining: 1 };
  const remaining = Math.max(0, max - used);
  return { hasDurability: true, max, used, remaining, percentRemaining: remaining / max };
}

export function scoreTool(item, context = {}) {
  if (!item) return 0;
  const type = getToolType(item.name);
  if (!type) return 0;
  const tier = getItemMaterialTier(item.name) * 20;
  const wanted = new Set(['efficiency', 'fortune', 'silk_touch', 'unbreaking', 'mending']);
  let score = tier + enchantScore(item, wanted) + durabilityScore(item);
  if (context.purpose && item.name.endsWith(`_${context.purpose}`)) score += 8;
  if (context.purpose === 'nether' && getEnchantments(item).some((e) => e.name === 'mending')) score += 4;
  if (item.name.startsWith('golden_')) score -= 10;
  return Math.round(score);
}

export function scoreWeapon(item, context = {}) {
  if (!item) return 0;
  const type = getWeaponType(item.name);
  if (!type) return 0;
  const base = type === 'bow' || type === 'crossbow' ? 45 : getItemMaterialTier(item.name) * 22;
  const wanted = new Set(['sharpness', 'smite', 'fire_aspect', 'looting', 'unbreaking', 'mending', 'power', 'punch', 'flame', 'infinity', 'quick_charge', 'piercing', 'multishot']);
  let score = base + enchantScore(item, wanted) + durabilityScore(item);
  if (type === 'axe') score -= 5;
  if (context.nether && getEnchantments(item).some((e) => e.name === 'fire_aspect')) score += 2;
  return Math.round(score);
}

export function scoreArmorPiece(item, context = {}) {
  if (!item) return 0;
  const slot = getArmorSlot(item.name);
  if (!slot) return 0;
  const tier = getItemMaterialTier(item.name);
  const wanted = new Set(['protection', 'projectile_protection', 'blast_protection', 'fire_protection', 'feather_falling', 'respiration', 'aqua_affinity', 'depth_strider', 'thorns', 'unbreaking', 'mending']);
  let score = tier * 20 + enchantScore(item, wanted) + durabilityScore(item);
  if (context.nether && item.name.startsWith('golden_')) score += 25;
  if (!context.nether && item.name.startsWith('golden_')) score -= 12;
  if (context.nether && getEnchantments(item).some((e) => e.name === 'fire_protection')) score += 6;
  return Math.round(score);
}

export function scoreGearItem(item, context = {}) {
  return Math.max(scoreTool(item, context), scoreWeapon(item, context), scoreArmorPiece(item, context));
}

export function compareGearItems(a, b, context = {}) {
  return scoreGearItem(b, context) - scoreGearItem(a, context);
}

export function getBestGearBySlot(bot) {
  const result = { hand: null, weapon: null, head: null, torso: null, legs: null, feet: null };
  for (const item of [...inventoryItems(bot), ...slotItems(bot)]) {
    const armorSlot = getArmorSlot(item.name);
    if (armorSlot && (!result[armorSlot] || scoreArmorPiece(item) > scoreArmorPiece(result[armorSlot]))) result[armorSlot] = item;
    if (getWeaponType(item.name) && (!result.weapon || scoreWeapon(item) > scoreWeapon(result.weapon))) result.weapon = item;
    if (getToolType(item.name) && (!result.hand || scoreTool(item) > scoreTool(result.hand))) result.hand = item;
  }
  return result;
}

export function getBestToolByPurpose(bot, purpose) {
  const wanted = purpose === 'wood' ? 'axe' : purpose === 'digging' ? 'shovel' : 'pickaxe';
  return inventoryItems(bot)
    .filter((item) => getToolType(item.name) === wanted)
    .sort((a, b) => compareGearItems(a, b, { purpose: wanted }))[0] || null;
}

export function getGearSummary(bot) {
  const items = inventoryItems(bot);
  const best = getBestGearBySlot(bot);
  const armorScore = ['head', 'torso', 'legs', 'feet'].reduce((sum, slot) => sum + scoreArmorPiece(best[slot]), 0);
  return {
    xpLevel: Number(bot?.experience?.level ?? bot?.experience?.lvl ?? 0) || 0,
    best: Object.fromEntries(Object.entries(best).map(([slot, item]) => [slot, item ? { name: item.name, score: scoreGearItem(item) } : null])),
    armorScore,
    enchantedItems: items.filter((item) => getEnchantments(item).length > 0).map((item) => ({ name: item.name, enchantments: getEnchantments(item) })),
    damagedGear: items
      .filter((item) => getDurabilityInfo(item).hasDurability && getDurabilityInfo(item).percentRemaining < 0.35)
      .map((item) => ({ name: item.name, durability: getDurabilityInfo(item) }))
  };
}

export function getGearUpgradeNeeds(bot) {
  const summary = getGearSummary(bot);
  const needs = [];
  if (!summary.best.weapon) needs.push('weapon');
  if (!summary.best.hand) needs.push('pickaxe/tool');
  for (const slot of ['head', 'torso', 'legs', 'feet']) {
    if (!summary.best[slot]) needs.push(slot);
  }
  if (summary.damagedGear.length) needs.push('repair damaged gear');
  if (summary.enchantedItems.length === 0) needs.push('basic enchantments');
  return needs;
}

export function explainGearScore(item) {
  if (!item) return 'No item.';
  const type = getArmorSlot(item.name) ? 'armor' : getWeaponType(item.name) ? 'weapon' : getToolType(item.name) ? 'tool' : 'gear';
  const enchants = getEnchantments(item);
  const durability = getDurabilityInfo(item);
  const parts = [`${item.name} is ${type}, score ${scoreGearItem(item)}.`];
  if (enchants.length) parts.push(`Enchantments: ${enchants.map((e) => `${e.name} ${e.level}`).join(', ')}.`);
  if (durability.hasDurability) parts.push(`Durability left: ${durability.remaining}/${durability.max}.`);
  return parts.join(' ');
}

