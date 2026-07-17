import { Vec3 } from 'vec3';

export const woodVariants = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'bamboo'
];

export const logNames = [
  'oak_log',
  'spruce_log',
  'birch_log',
  'jungle_log',
  'acacia_log',
  'dark_oak_log',
  'mangrove_log',
  'cherry_log',
  'bamboo_block'
];

export const plankNames = woodVariants.map((variant) => `${variant}_planks`);

export const woolColors = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black'
];

const replaceablePlacementBlocks = new Set(['air', 'cave_air', 'void_air']);
const unsafePlacementBlocks = new Set(['lava', 'water', 'fire', 'soul_fire']);
const simpleAliases = new Map([
  ['table', 'crafting_table'],
  ['crafting_table', 'crafting_table'],
  ['craftingtable', 'crafting_table'],
  ['chests', 'chest'],
  ['box', 'chest'],
  ['boxes', 'chest'],
  ['torch', 'torch'],
  ['torches', 'torch'],
  ['oven', 'furnace'],
  ['furnaces', 'furnace'],
  ['buckets', 'bucket'],
  ['campfires', 'campfire'],
  ['ladders', 'ladder'],
  ['signs', 'sign'],
  ['doors', 'door'],
  ['fences', 'fence'],
  ['gate', 'fence_gate'],
  ['gates', 'fence_gate'],
  ['fence_gate', 'fence_gate'],
  ['fence_gates', 'fence_gate'],
  ['trapdoors', 'trapdoor'],
  ['boats', 'boat'],
  ['raft', 'boat'],
  ['rafts', 'boat'],
  ['beds', 'bed'],
  ['slabs', 'slab'],
  ['stair', 'stairs'],
  ['bowls', 'bowl'],
  ['books', 'book']
]);

const valuableCrafts = new Set([
  'enchanting_table',
  'jukebox'
]);

const dangerousCrafts = new Set([
  'tnt',
  'fire_charge',
  'flint_and_steel',
  'golden_apple',
  'enchanted_golden_apple'
]);

const technicalCrafts = new Set([
  'dispenser',
  'observer',
  'piston',
  'sticky_piston',
  'hopper',
  'dropper'
]);

const woodBasedGenericItems = new Set([
  'boat',
  'door',
  'trapdoor',
  'fence',
  'fence_gate',
  'sign',
  'slab',
  'stairs'
]);

const craftableToolMaterials = ['wooden', 'stone', 'iron', 'golden', 'diamond'];
const craftableToolTypes = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];
const toolTypeAliases = new Map([
  ['pick', 'pickaxe'],
  ['pick_axe', 'pickaxe'],
  ['pickaxe', 'pickaxe'],
  ['axe', 'axe'],
  ['ax', 'axe'],
  ['shovel', 'shovel'],
  ['spade', 'shovel'],
  ['hoe', 'hoe'],
  ['sword', 'sword']
]);
const toolMaterialAliases = new Map([
  ['wood', 'wooden'],
  ['wooden', 'wooden'],
  ['stone', 'stone'],
  ['iron', 'iron'],
  ['gold', 'golden'],
  ['golden', 'golden'],
  ['diamond', 'diamond']
]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settleInventory(bot, ms = 900) {
  if (typeof bot.waitForTicks === 'function') {
    try {
      await bot.waitForTicks(4);
    } catch {
      await wait(ms);
    }
  }
  await wait(ms);
}

function result(ok, message, extra = {}) {
  return { ok, success: ok, ...extra, message };
}

function throwIfStopped(options = {}) {
  if (options.shouldStop?.()) {
    const error = new Error('Stopped.');
    error.cancelled = true;
    throw error;
  }
}

export function normalizeItemName(itemName) {
  return String(itemName || '')
    .trim()
    .toLowerCase()
    .replace(/^craft\s+/, '')
    .replace(/\b(an?|some)\b/g, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

function itemDisplay(itemName) {
  return String(itemName || '').replace(/_/g, ' ');
}

function safeCount(count) {
  return Math.max(1, Number(count) || 1);
}

function asBlockPos(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function recipeOutputCount(recipe) {
  return Math.max(1, recipe?.result?.count || recipe?.out?.count || 1);
}

function logNameForVariant(variant) {
  return variant === 'bamboo' ? 'bamboo_block' : `${variant}_log`;
}

function boatNameForVariant(variant) {
  return variant === 'bamboo' ? 'bamboo_raft' : `${variant}_boat`;
}

function variantFromWoodItem(itemName) {
  return woodVariants
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((variant) => itemName === `${variant}_planks` || itemName.startsWith(`${variant}_`)) || null;
}

function resolveRegistryItem(bot, itemName) {
  const normalized = normalizeItemName(itemName);
  if (!normalized) return null;
  const direct = bot.registry?.itemsByName?.[normalized];
  if (direct) return direct;
  if (normalized.endsWith('s')) return bot.registry?.itemsByName?.[normalized.slice(0, -1)] || null;
  return null;
}

function countAnyInternal(bot, names) {
  const wanted = new Set(names);
  return (bot.inventory?.items?.() || [])
    .filter((item) => wanted.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

function countByPrefix(bot, suffixes) {
  return (bot.inventory?.items?.() || [])
    .filter((item) => suffixes.some((suffix) => item.name.endsWith(suffix)))
    .reduce((sum, item) => sum + item.count, 0);
}

function hasEnoughAny(bot, names, count) {
  return countAnyInternal(bot, names) >= count;
}

function itemNameExists(bot, itemName) {
  return Boolean(bot.registry?.itemsByName?.[itemName]);
}

function blockNameExists(bot, blockName) {
  return Boolean(bot.registry?.blocksByName?.[blockName]);
}

function isUnderground(bot) {
  return (bot.entity?.position?.y ?? 100) < 50;
}

function isBedItem(itemName) {
  return woolColors.some((color) => itemName === `${color}_bed`);
}

function isBoatItem(itemName) {
  return woodVariants.some((variant) => itemName === boatNameForVariant(variant));
}

function safePlacementTarget(bot, destBlock, referenceBlock) {
  if (!destBlock || !referenceBlock) return false;
  if (!replaceablePlacementBlocks.has(destBlock.name)) return false;
  if (unsafePlacementBlocks.has(destBlock.name) || unsafePlacementBlocks.has(referenceBlock.name)) return false;
  if (referenceBlock.boundingBox !== 'block') return false;
  if (!bot.entity) return false;
  const botFeet = bot.entity.position.floored();
  if (destBlock.position.equals(botFeet) || destBlock.position.equals(botFeet.offset(0, 1, 0))) return false;
  for (const entity of Object.values(bot.entities || {})) {
    if (!entity?.position) continue;
    const center = destBlock.position.offset(0.5, 0.5, 0.5);
    const closeX = Math.abs(entity.position.x - center.x) < 0.9;
    const closeY = entity.position.y > destBlock.position.y - 0.1 && entity.position.y < destBlock.position.y + 1.9;
    const closeZ = Math.abs(entity.position.z - center.z) < 0.9;
    if (closeX && closeY && closeZ) return false;
  }
  return true;
}

export function countItem(bot, itemName) {
  const item = resolveRegistryItem(bot, itemName);
  if (!item) return 0;
  return (bot.inventory?.items?.() || [])
    .filter((candidate) => candidate.name === item.name)
    .reduce((sum, candidate) => sum + candidate.count, 0);
}

export function countAny(bot, itemNames) {
  return countAnyInternal(bot, itemNames.map((name) => resolveCraftItemName(bot, name)).filter(Boolean));
}

export function hasItem(bot, itemName, count = 1) {
  return countItem(bot, itemName) >= count;
}

export function findInventoryItem(bot, itemName) {
  const item = resolveRegistryItem(bot, itemName);
  if (!item) return null;
  return (bot.inventory?.items?.() || []).find((candidate) => candidate.name === item.name) || null;
}

export function inventorySummary(bot) {
  return (bot.inventory?.items?.() || []).map((item) => ({ name: item.name, count: item.count }));
}

export function getAvailablePlankTypes(bot) {
  return woodVariants.filter((variant) => countItem(bot, `${variant}_planks`) > 0);
}

export function getAvailableLogTypes(bot) {
  return woodVariants.filter((variant) => countItem(bot, logNameForVariant(variant)) > 0);
}

export function getPreferredWoodVariant(bot, options = {}) {
  const preferred = normalizeItemName(options.preferredWoodType || options.woodType || '');
  if (woodVariants.includes(preferred)) return preferred;
  const plankTypes = getAvailablePlankTypes(bot);
  if (plankTypes.length > 0) return plankTypes[0];
  const logTypes = getAvailableLogTypes(bot);
  if (logTypes.length > 0) return logTypes[0];
  return 'oak';
}

export function getAvailableWoolColors(bot) {
  return woolColors.filter((color) => countItem(bot, `${color}_wool`) > 0);
}

function getBedFromAvailableWool(bot) {
  if (countItem(bot, 'white_wool') >= 3) return 'white_bed';
  const color = woolColors.find((candidate) => countItem(bot, `${candidate}_wool`) >= 3);
  return color ? `${color}_bed` : 'white_bed';
}

export function normalizeToolType(toolName) {
  const normalized = normalizeItemName(toolName);
  return toolTypeAliases.get(normalized) || '';
}

function normalizeToolMaterial(materialName) {
  const normalized = normalizeItemName(materialName);
  return toolMaterialAliases.get(normalized) || '';
}

function resolveMaterialToolName(normalized) {
  const match = normalized.match(/^(wood|wooden|stone|iron|gold|golden|diamond)_(pickaxe|pick|pick_axe|axe|ax|shovel|spade|hoe|sword)$/);
  if (!match) return null;
  const material = normalizeToolMaterial(match[1]);
  const toolType = normalizeToolType(match[2]);
  return material && toolType ? `${material}_${toolType}` : null;
}

function toolMaterialRequirement(material) {
  if (material === 'wooden') return { names: plankNames, label: 'planks' };
  if (material === 'stone') return { names: ['cobblestone'], label: 'cobblestone' };
  if (material === 'iron') return { names: ['iron_ingot'], label: 'iron ingots' };
  if (material === 'golden') return { names: ['gold_ingot'], label: 'gold ingots' };
  if (material === 'diamond') return { names: ['diamond'], label: 'diamonds' };
  return { names: [], label: material };
}

function toolHeadCount(toolType) {
  if (toolType === 'shovel') return 1;
  if (toolType === 'hoe' || toolType === 'sword') return 2;
  return 3;
}

function toolStickCount(toolType) {
  return toolType === 'sword' ? 1 : 2;
}

export function getToolCraftOptions(bot, toolName, count = 1) {
  const toolType = normalizeToolType(toolName);
  if (!toolType || !craftableToolTypes.includes(toolType)) return [];
  return craftableToolMaterials
    .map((material) => `${material}_${toolType}`)
    .filter((itemName) => itemNameExists(bot, itemName))
    .map((itemName) => {
      const safety = craftRestriction(bot, itemName, count, {});
      return {
        itemName,
        toolType,
        material: itemName.replace(`_${toolType}`, ''),
        displayName: itemDisplay(itemName),
        canCraft: canCraft(bot, itemName, count),
        missing: missingIngredients(bot, itemName, count),
        requiresConfirmation: Boolean(safety.requiresConfirmation),
        blockedReason: safety.ok ? '' : safety.message || safety.reason || ''
      };
    });
}

export function suggestScavengeCommandForMissing(missing = []) {
  const labels = missing.map((entry) => String(entry.item || '').toLowerCase());
  if (labels.some((label) => label.includes('plank') || label.includes('stick'))) return 'tj gather wood';
  if (labels.some((label) => label.includes('cobblestone'))) return 'tj mine stone';
  if (labels.some((label) => label.includes('iron'))) return 'tj mine iron';
  return null;
}

function chooseStoneOrWoodShape(bot, shape) {
  const variant = getPreferredWoodVariant(bot);
  if (countItem(bot, `${variant}_planks`) > 0 || countAnyInternal(bot, logNames) > 2) return `${variant}_${shape}`;
  if (countItem(bot, 'cobblestone') > 0 && itemNameExists(bot, `cobblestone_${shape}`)) return `cobblestone_${shape}`;
  if (countItem(bot, 'stone') > 0 && itemNameExists(bot, `stone_${shape}`)) return `stone_${shape}`;
  return `${variant}_${shape}`;
}

export function resolveCraftItemName(bot, itemName, options = {}) {
  let normalized = normalizeItemName(itemName);
  if (!normalized) return '';
  normalized = simpleAliases.get(normalized) || normalized;
  normalized = resolveMaterialToolName(normalized) || normalized;

  if (normalized === 'bed') return getBedFromAvailableWool(bot);
  if (woolColors.some((color) => normalized === `${color}_bed` || normalized === `${color}_wool_bed`)) {
    return normalized.replace('_wool_bed', '_bed');
  }

  if (normalized === 'boat') return boatNameForVariant(getPreferredWoodVariant(bot, options));
  if (normalized === 'slab' || normalized === 'stairs') return chooseStoneOrWoodShape(bot, normalized);

  if (woodBasedGenericItems.has(normalized)) {
    const variant = getPreferredWoodVariant(bot, options);
    if (normalized === 'fence_gate') return `${variant}_fence_gate`;
    return `${variant}_${normalized}`;
  }

  if (resolveRegistryItem(bot, normalized)) return normalized;
  if (normalized.endsWith('s') && resolveRegistryItem(bot, normalized.slice(0, -1))) return normalized.slice(0, -1);
  return normalized;
}

export function findNearbyCraftingTable(bot, maxDistance = 6) {
  const tableId = bot.registry?.blocksByName?.crafting_table?.id;
  if (!tableId || !bot.entity || typeof bot.findBlock !== 'function') return null;
  return bot.findBlock({ matching: tableId, maxDistance }) || null;
}

export function findNearbyFurnace(bot, maxDistance = 6) {
  const furnaceId = bot.registry?.blocksByName?.furnace?.id;
  if (!furnaceId || !bot.entity || typeof bot.findBlock !== 'function') return null;
  return bot.findBlock({ matching: furnaceId, maxDistance }) || null;
}

function estimateRequirements(bot, itemName, count = 1) {
  const resolved = resolveCraftItemName(bot, itemName);
  const variant = variantFromWoodItem(resolved) || getPreferredWoodVariant(bot);
  const batchesByOutput = (outputCount) => Math.ceil(safeCount(count) / outputCount);
  const req = [];
  const add = (names, label, amount) => req.push({ names: Array.isArray(names) ? names : [names], label, count: amount });

  if (resolved === 'crafting_table') add(plankNames, 'planks', 4 * batchesByOutput(1));
  else if (resolved === 'stick') add(plankNames, 'planks', 2 * batchesByOutput(4));
  else if (resolved === 'chest') add(plankNames, 'planks', 8 * batchesByOutput(1));
  else if (resolved === 'barrel') {
    add(plankNames, 'planks', 6 * batchesByOutput(1));
    add(woodVariants.map((wood) => `${wood}_slab`).concat(['stone_slab']), 'slabs', 2 * batchesByOutput(1));
  } else if (resolved === 'furnace') add('cobblestone', 'cobblestone', 8 * batchesByOutput(1));
  else if (resolved === 'torch') {
    add(['coal', 'charcoal'], 'coal or charcoal', 1 * batchesByOutput(4));
    add('stick', 'sticks', 1 * batchesByOutput(4));
  } else if (resolved === 'campfire') {
    add(['coal', 'charcoal'], 'coal or charcoal', 1 * batchesByOutput(1));
    add('stick', 'sticks', 3 * batchesByOutput(1));
    add(logNames, 'logs', 3 * batchesByOutput(1));
  } else if (resolved === 'ladder') add('stick', 'sticks', 7 * batchesByOutput(3));
  else if (resolved.endsWith('_door')) add(`${variant}_planks`, `${variant} planks`, 6 * batchesByOutput(3));
  else if (resolved.endsWith('_trapdoor')) add(`${variant}_planks`, `${variant} planks`, 6 * batchesByOutput(2));
  else if (resolved.endsWith('_sign')) {
    add(`${variant}_planks`, `${variant} planks`, 6 * batchesByOutput(3));
    add('stick', 'sticks', 1 * batchesByOutput(3));
  } else if (resolved.endsWith('_fence') && !resolved.endsWith('_fence_gate')) {
    add(`${variant}_planks`, `${variant} planks`, 4 * batchesByOutput(3));
    add('stick', 'sticks', 2 * batchesByOutput(3));
  } else if (resolved.endsWith('_fence_gate')) {
    add(`${variant}_planks`, `${variant} planks`, 2 * batchesByOutput(1));
    add('stick', 'sticks', 4 * batchesByOutput(1));
  } else if (resolved.endsWith('_slab')) {
    const material = resolved.replace(/_slab$/, '');
    add(material === variant ? `${variant}_planks` : material, `${itemDisplay(material)} material`, 3 * batchesByOutput(6));
  } else if (resolved.endsWith('_stairs')) {
    const material = resolved.replace(/_stairs$/, '');
    add(material === variant ? `${variant}_planks` : material, `${itemDisplay(material)} material`, 6 * batchesByOutput(4));
  } else if (isBoatItem(resolved)) add(`${variant}_planks`, `${variant} planks`, 5 * batchesByOutput(1));
  else if (isBedItem(resolved)) {
    const color = resolved.replace(/_bed$/, '');
    add(`${color}_wool`, `${itemDisplay(color)} wool`, 3 * batchesByOutput(1));
    add(plankNames, 'planks', 3 * batchesByOutput(1));
  } else if (resolved === 'shield') {
    add(plankNames, 'planks', 6 * batchesByOutput(1));
    add('iron_ingot', 'iron ingot', 1 * batchesByOutput(1));
  } else if (resolved === 'bucket') add('iron_ingot', 'iron ingots', 3 * batchesByOutput(1));
  else if (resolved === 'bowl') add(plankNames, 'planks', 3 * batchesByOutput(4));
  else if (resolved === 'bread') add('wheat', 'wheat', 3 * batchesByOutput(1));
  else if (resolved === 'paper') add('sugar_cane', 'sugar cane', 3 * batchesByOutput(3));
  else if (resolved === 'book') {
    add('paper', 'paper', 3 * batchesByOutput(1));
    add('leather', 'leather', 1 * batchesByOutput(1));
  } else {
    const toolMatch = resolved.match(/^(wooden|stone|iron|golden|diamond)_(pickaxe|axe|shovel|hoe|sword)$/);
    if (toolMatch) {
      const material = toolMaterialRequirement(toolMatch[1]);
      add(material.names, material.label, toolHeadCount(toolMatch[2]) * batchesByOutput(1));
      add('stick', 'sticks', toolStickCount(toolMatch[2]) * batchesByOutput(1));
    }
  }

  return req;
}

function missingFromRequirements(bot, requirements) {
  return requirements
    .map((requirement) => {
      const have = countAnyInternal(bot, requirement.names);
      return { ...requirement, have, missing: Math.max(0, requirement.count - have) };
    })
    .filter((requirement) => requirement.missing > 0);
}

function missingText(bot, itemName, count = 1) {
  const requirements = estimateRequirements(bot, itemName, count);
  const missing = missingFromRequirements(bot, requirements);
  if (missing.length === 0) return `I do not have the right materials to craft ${itemDisplay(resolveCraftItemName(bot, itemName))}.`;
  return `I need ${missing.map((entry) => `${entry.missing} more ${entry.label}`).join(', ')} to craft ${itemDisplay(resolveCraftItemName(bot, itemName))}.`;
}

export function missingIngredients(bot, itemName, count = 1) {
  const resolved = resolveCraftItemName(bot, itemName);
  return missingFromRequirements(bot, estimateRequirements(bot, resolved, count)).map((entry) => ({
    item: entry.label,
    missing: entry.missing,
    required: entry.count,
    have: entry.have
  }));
}

export function canCraft(bot, itemName, count = 1) {
  const resolved = resolveCraftItemName(bot, itemName);
  const item = resolveRegistryItem(bot, resolved);
  if (!item) return false;
  const table = findNearbyCraftingTable(bot);
  try {
    return bot.recipesFor(item.id, null, safeCount(count), table || null).length > 0 ||
      bot.recipesFor(item.id, null, safeCount(count), null).length > 0;
  } catch {
    return false;
  }
}

export function craftRestriction(bot, itemName, count = 1, options = {}) {
  const resolved = resolveCraftItemName(bot, itemName, options);
  const valuableAllowed = Boolean(options.confirmed || options.allowValuable);
  const riskyAllowed = Boolean(options.confirmed || options.allowRisky);
  const technicalAllowed = Boolean(options.confirmed || options.allowTechnical);

  if (safeCount(count) > 64 && !options.confirmed) {
    return result(false, `Crafting more than 64 ${itemDisplay(resolved)} needs confirmation. Say "tj confirm craft ${resolved}" to continue.`, {
      requiresConfirmation: true,
      itemName: resolved
    });
  }

  if ((valuableCrafts.has(resolved) || resolved.startsWith('diamond_')) && !valuableAllowed) {
    return result(false, `That uses valuable materials. Say "tj confirm craft ${resolved}" to continue.`, {
      requiresConfirmation: true,
      itemName: resolved
    });
  }

  if (dangerousCrafts.has(resolved) && !riskyAllowed) {
    return result(false, `That uses risky materials. Say "tj confirm craft ${resolved}" to continue.`, {
      requiresConfirmation: true,
      itemName: resolved
    });
  }

  if (technicalCrafts.has(resolved) && !technicalAllowed) {
    return result(false, `That is a technical redstone item. Say "tj confirm craft ${resolved}" to continue.`, {
      requiresConfirmation: true,
      itemName: resolved
    });
  }

  if (isBoatItem(resolved) && isUnderground(bot) && !options.direct && !options.confirmed) {
    return result(false, 'I should not craft a boat underground unless you directly ask me to.');
  }

  if (isBedItem(resolved) && /nether|end/.test(String(bot.game?.dimension || '')) && !options.direct && !options.confirmed) {
    return result(false, 'I should not craft beds in this dimension unless you directly ask me to.');
  }

  return result(true, 'safe');
}

async function craftPlanksUntil(bot, desiredPlanks, options = {}) {
  const keepLogs = options.keepLogs ?? 2;
  let currentPlanks = countAnyInternal(bot, plankNames);
  let totalLogs = countAnyInternal(bot, logNames);
  let crafted = 0;

  while (currentPlanks < desiredPlanks && totalLogs > keepLogs) {
    throwIfStopped(options);
    const variant = getPreferredWoodVariant(bot, options);
    const candidates = [variant, ...getAvailableLogTypes(bot).filter((entry) => entry !== variant)];
    let craftedOne = false;

    for (const candidate of candidates) {
      const plankName = `${candidate}_planks`;
      const item = bot.registry?.itemsByName?.[plankName];
      if (!item) continue;
      const recipe = bot.recipesFor(item.id, null, 4, null)[0];
      if (!recipe) continue;
      console.log(`[crafting] crafting planks target=${plankName}`);
      await bot.craft(recipe, 1, null);
      await settleInventory(bot, 900);
      crafted += recipeOutputCount(recipe);
      craftedOne = true;
      break;
    }

    if (!craftedOne) break;
    currentPlanks = countAnyInternal(bot, plankNames);
    totalLogs = countAnyInternal(bot, logNames);
    await wait(250);
  }

  return crafted;
}

async function ensurePlanks(bot, count, options = {}) {
  if (countAnyInternal(bot, plankNames) >= count) return result(true, 'Enough planks.');
  const crafted = await craftPlanksUntil(bot, count, options);
  if (countAnyInternal(bot, plankNames) >= count) return result(true, `Crafted ${crafted} planks.`);
  return result(false, `I need more planks, and I should keep at least ${options.keepLogs ?? 2} logs if possible.`);
}

async function ensureSticks(bot, count, options = {}) {
  if (countItem(bot, 'stick') >= count) return result(true, 'Enough sticks.');
  await ensurePlanks(bot, 2, options);
  while (countItem(bot, 'stick') < count && countAnyInternal(bot, plankNames) >= 2) {
    throwIfStopped(options);
    const stickItem = bot.registry?.itemsByName?.stick;
    const recipe = bot.recipesFor(stickItem.id, null, 4, null)[0];
    if (!recipe) break;
    console.log('[crafting] crafting sticks');
    await bot.craft(recipe, 1, null);
    await settleInventory(bot, 900);
  }
  if (countItem(bot, 'stick') >= count) return result(true, 'Crafted sticks.');
  return result(false, 'I need more planks to craft sticks.');
}

async function prepareCommonMaterials(bot, itemName, count, options = {}) {
  const requirements = estimateRequirements(bot, itemName, count);
  const planksNeeded = requirements
    .filter((entry) => entry.label.includes('planks'))
    .reduce((sum, entry) => sum + Math.max(0, entry.count - countAnyInternal(bot, entry.names)), 0);
  if (planksNeeded > 0) await ensurePlanks(bot, countAnyInternal(bot, plankNames) + planksNeeded, options);

  const sticksNeeded = requirements
    .filter((entry) => entry.names.includes('stick'))
    .reduce((sum, entry) => sum + Math.max(0, entry.count - countItem(bot, 'stick')), 0);
  if (sticksNeeded > 0) await ensureSticks(bot, countItem(bot, 'stick') + sticksNeeded, options);
  await settleInventory(bot, 500);
}

function recipesAllSafe(bot, itemId, table) {
  try {
    return bot.recipesAll(itemId, null, table) || [];
  } catch {
    return [];
  }
}

function recipesForSafe(bot, itemId, count, table) {
  try {
    return bot.recipesFor(itemId, null, count, table) || [];
  } catch {
    return [];
  }
}

async function ensureCraftingTable(bot, options = {}) {
  const nearby = findNearbyCraftingTable(bot);
  if (nearby) return result(true, 'I found a crafting table nearby.', { block: nearby, placed: false });
  if (options.allowPlaceTable === false) return result(false, 'I need a crafting table nearby.');
  if (countItem(bot, 'crafting_table') < 1) {
    const crafted = await craftCraftingTable(bot, { ...options, allowPlaceTable: false, direct: true });
    if (!crafted.ok && countItem(bot, 'crafting_table') < 1) return crafted;
  }
  return placeCraftingTable(bot);
}

export async function craftItem(bot, itemName, count = 1, options = {}) {
  throwIfStopped(options);
  const targetCount = safeCount(count);
  const resolved = resolveCraftItemName(bot, itemName, options);
  const item = resolveRegistryItem(bot, resolved);
  console.log(`[crafting] craftItem attempt item=${resolved} count=${targetCount}`);

  if (!item) return result(false, `I do not know the item "${itemName}".`);

  const restricted = craftRestriction(bot, resolved, targetCount, options);
  if (!restricted.ok) return restricted;

  await prepareCommonMaterials(bot, resolved, targetCount, options);
  throwIfStopped(options);

  let craftingTable = findNearbyCraftingTable(bot);
  let recipe = recipesForSafe(bot, item.id, targetCount, craftingTable)[0] || null;

  if (!recipe) {
    recipe = recipesForSafe(bot, item.id, targetCount, null)[0] || null;
    if (recipe) craftingTable = null;
  }

  const possibleWithTable = recipesAllSafe(bot, item.id, true).length > 0 || recipesForSafe(bot, item.id, targetCount, true).length > 0;
  if (!recipe && possibleWithTable && resolved !== 'crafting_table' && options.allowPlaceTable !== false) {
    const table = await ensureCraftingTable(bot, options);
    if (!table.ok) return result(false, table.message);
    craftingTable = table.block || findNearbyCraftingTable(bot);
    await prepareCommonMaterials(bot, resolved, targetCount, options);
    await settleInventory(bot, 700);
    throwIfStopped(options);
    recipe = recipesForSafe(bot, item.id, targetCount, craftingTable)[0] || null;
  }

  if (!recipe) {
    const knownRecipes = recipesAllSafe(bot, item.id, null).length + recipesAllSafe(bot, item.id, true).length;
    if (possibleWithTable && !craftingTable) return result(false, `I need a crafting table nearby to craft ${itemDisplay(resolved)}.`);
    if (knownRecipes === 0) return result(false, `I do not know a recipe for ${itemDisplay(resolved)}.`);
    return result(false, missingText(bot, resolved, targetCount), { missing: missingIngredients(bot, resolved, targetCount) });
  }

  const craftCount = Math.ceil(targetCount / recipeOutputCount(recipe));
  console.log(`[crafting] using recipe for ${item.name}, craftCount=${craftCount}, table=${Boolean(craftingTable)}`);

  try {
    throwIfStopped(options);
    await settleInventory(bot, 500);
    await bot.craft(recipe, craftCount, craftingTable || null);
    await settleInventory(bot, 700);
    const produced = craftCount * recipeOutputCount(recipe);
    return result(true, `Crafted ${produced} ${itemDisplay(item.name)}.`, {
      itemName: item.name,
      count: produced,
      craftCount,
      craftingTable
    });
  } catch (error) {
    console.warn(`[crafting] craftItem failed item=${item.name}: ${error.message}`);
    return result(false, `I could not craft ${itemDisplay(item.name)}: ${error.message}`);
  }
}

export async function craftPlanks(bot, options = {}) {
  const totalLogs = countAnyInternal(bot, logNames);
  console.log(`[crafting] craftPlanks attempt logs=${totalLogs}`);
  if (totalLogs <= 0) return result(false, 'I need logs to craft planks.');
  if (totalLogs <= (options.keepLogs ?? 2)) {
    return result(false, `I only have ${totalLogs} logs, and I should keep at least ${options.keepLogs ?? 2} logs if possible.`);
  }
  const desired = options.desiredPlanks || countAnyInternal(bot, plankNames) + ((totalLogs - (options.keepLogs ?? 2)) * 4);
  const crafted = await craftPlanksUntil(bot, desired, options);
  if (crafted <= 0) return result(false, 'I found logs, but no plank recipe is craftable right now.');
  return result(true, `Crafted ${crafted} planks and kept at least ${options.keepLogs ?? 2} logs when possible.`, { count: crafted });
}

export async function craftSticks(bot, count = 4, options = {}) {
  console.log('[crafting] craftSticks attempt');
  const sticks = await ensureSticks(bot, count, options);
  if (!sticks.ok) return result(false, 'I need more planks to craft sticks.');
  return result(true, 'Crafted sticks.', sticks);
}

export async function craftCraftingTable(bot, options = {}) {
  console.log('[crafting] craftCraftingTable attempt');
  if (countItem(bot, 'crafting_table') > 0) return result(true, 'I already have a crafting table.', { count: countItem(bot, 'crafting_table') });
  await ensurePlanks(bot, 4, options);
  if (countAnyInternal(bot, plankNames) < 4) return result(false, 'I need more planks to craft a crafting table.');
  return craftItem(bot, 'crafting_table', 1, { ...options, allowPlaceTable: false });
}

export async function placeCraftingTable(bot) {
  console.log('[crafting] placeCraftingTable attempt');
  const nearby = findNearbyCraftingTable(bot);
  if (nearby) return result(true, 'I found a crafting table nearby.', { block: nearby, placed: false });

  const tableItem = findInventoryItem(bot, 'crafting_table');
  if (!tableItem) return result(false, 'I need a crafting table nearby or one in my inventory.');
  if (!bot.entity) return result(false, 'I cannot place a crafting table before I spawn.');

  const base = bot.entity.position.floored();
  const offsets = [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  await bot.equip(tableItem, 'hand');
  await wait(250);

  for (const [dx, dz] of offsets) {
    const dest = base.offset(dx, 0, dz);
    const destBlock = bot.blockAt(dest);
    const referenceBlock = bot.blockAt(dest.offset(0, -1, 0));
    if (!safePlacementTarget(bot, destBlock, referenceBlock)) continue;

    try {
      console.log(`[crafting] placing crafting table at ${dest.x},${dest.y},${dest.z}`);
      await bot.lookAt(dest.offset(0.5, 0.5, 0.5), true);
      if (bot._placeBlockWithOptions) {
        await bot._placeBlockWithOptions(referenceBlock, new Vec3(0, 1, 0), { swingArm: 'right', forceLook: true });
      } else {
        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      }
      await wait(900);
      const placed = bot.blockAt(dest);
      if (placed?.name === 'crafting_table') {
        return result(true, 'Placed a crafting table nearby.', { block: placed, placed: true });
      }
    } catch (error) {
      console.warn(`[crafting] placement failed at ${dest.x},${dest.y},${dest.z}: ${error.message}`);
    }
  }

  return result(false, 'I could not find a safe nearby block to place a crafting table.');
}

export async function craftWoodenPickaxe(bot, options = {}) {
  console.log('[crafting] craftWoodenPickaxe attempt');
  await ensurePlanks(bot, 3, options);
  await ensureSticks(bot, 2, options);
  return craftItem(bot, 'wooden_pickaxe', 1, { ...options, direct: true });
}

export async function craftStonePickaxe(bot, options = {}) {
  console.log('[crafting] craftStonePickaxe attempt');
  await ensureSticks(bot, 2, options);
  return craftItem(bot, 'stone_pickaxe', 1, { ...options, direct: true });
}

export async function craftWoodenAxe(bot, options = {}) {
  console.log('[crafting] craftWoodenAxe attempt');
  await ensurePlanks(bot, 3, options);
  await ensureSticks(bot, 2, options);
  return craftItem(bot, 'wooden_axe', 1, { ...options, direct: true });
}

export async function craftStoneAxe(bot, options = {}) {
  console.log('[crafting] craftStoneAxe attempt');
  await ensureSticks(bot, 2, options);
  return craftItem(bot, 'stone_axe', 1, { ...options, direct: true });
}

export async function craftTorches(bot, options = {}) {
  console.log('[crafting] craftTorches attempt');
  if (countItem(bot, 'coal') + countItem(bot, 'charcoal') < 1) return result(false, 'I need coal or charcoal to craft torches.');
  await ensureSticks(bot, 1, options);
  if (countItem(bot, 'stick') < 1) return result(false, 'I need sticks to craft torches.');
  return craftItem(bot, 'torch', options.count || 4, { ...options, direct: true });
}

/** Material costs for one of each tool type. */
const TOOL_MATERIAL_COST = {
  pickaxe: 3,
  axe: 3,
  shovel: 1,
  hoe: 2,
  sword: 2
};
const TOOL_STICK_COST = {
  pickaxe: 2,
  axe: 2,
  shovel: 2,
  hoe: 2,
  sword: 1
};

const DEFAULT_TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];

function materialItemName(material) {
  if (material === 'wooden' || material === 'wood') return 'planks';
  if (material === 'stone') return 'cobblestone';
  if (material === 'iron') return 'iron_ingot';
  return null;
}

function countMaterial(bot, material) {
  if (material === 'wooden' || material === 'wood') return countAnyInternal(bot, plankNames);
  if (material === 'stone') return countItem(bot, 'cobblestone') + countItem(bot, 'cobbled_deepslate');
  if (material === 'iron') return countItem(bot, 'iron_ingot');
  return 0;
}

/**
 * Craft a full set of tools for wooden | stone | iron.
 * @param {string} material - wooden|stone|iron
 * @param {object} options - toolTypes?, requirePickaxeFirst?
 */
export async function craftFullToolSet(bot, material = 'wooden', options = {}) {
  const mat = String(material || 'wooden').toLowerCase().replace(/^wood$/, 'wooden');
  if (!['wooden', 'stone', 'iron'].includes(mat)) {
    return result(false, `I can craft wooden, stone, or iron tool sets — not "${material}".`);
  }
  console.log(`[crafting] craftFullToolSet ${mat}`);
  const notes = [];
  const toolTypes = Array.isArray(options.toolTypes) && options.toolTypes.length
    ? options.toolTypes
    : DEFAULT_TOOL_TYPES;

  if (mat === 'wooden') {
    if (countAnyInternal(bot, logNames) > 2 && countAnyInternal(bot, plankNames) < 8) {
      throwIfStopped(options);
      const planks = await craftPlanks(bot, options);
      notes.push(planks.message);
    }
  }

  // Sticks for full set: pick+axe+shovel+hoe+sword ≈ 9 sticks
  const stickNeed = toolTypes.reduce((sum, t) => sum + (TOOL_STICK_COST[t] || 2), 0);
  if (countItem(bot, 'stick') < stickNeed) {
    throwIfStopped(options);
    const sticks = await craftSticks(bot, Math.max(4, stickNeed), options);
    notes.push(sticks.message);
    if (!sticks.ok && countItem(bot, 'stick') < 2) return sticks;
  }

  throwIfStopped(options);
  const table = await ensureCraftingTable(bot, { ...options, direct: true });
  notes.push(table.message);
  if (!table.ok) return table;

  // Prefer pickaxe first so later mining works.
  const ordered = [...toolTypes].sort((a, b) => (a === 'pickaxe' ? -1 : b === 'pickaxe' ? 1 : 0));
  let successes = 0;
  const crafted = [];
  for (const toolType of ordered) {
    throwIfStopped(options);
    const itemName = `${mat}_${toolType}`;
    if (countItem(bot, itemName) > 0 && options.skipIfOwned !== false) {
      notes.push(`Already have ${itemName}.`);
      successes += 1;
      crafted.push(itemName);
      continue;
    }
    const needMat = TOOL_MATERIAL_COST[toolType] || 2;
    const needStick = TOOL_STICK_COST[toolType] || 2;
    if (countMaterial(bot, mat) < needMat) {
      notes.push(`Not enough ${materialItemName(mat)} for ${itemName}.`);
      continue;
    }
    if (countItem(bot, 'stick') < needStick) {
      const more = await craftSticks(bot, needStick, options);
      notes.push(more.message);
      if (countItem(bot, 'stick') < needStick) {
        notes.push(`Not enough sticks for ${itemName}.`);
        continue;
      }
    }
    if (mat === 'wooden') {
      await ensurePlanks(bot, needMat, options);
    }
    const made = await craftItem(bot, itemName, 1, { ...options, direct: true });
    notes.push(made.message);
    if (made.ok) {
      successes += 1;
      crafted.push(itemName);
    }
  }

  if (successes <= 0) {
    return result(false, `${mat} tools failed. ${notes.join(' ')}`, { crafted, notes });
  }
  return result(true, `${mat} tools done (${crafted.join(', ') || successes}). ${notes.slice(-4).join(' ')}`, {
    crafted,
    successes,
    notes
  });
}

export async function craftBasicTools(bot, options = {}) {
  console.log('[crafting] craftBasicTools attempt');
  return craftFullToolSet(bot, 'wooden', options);
}

export async function craftStoneTools(bot, options = {}) {
  console.log('[crafting] craftStoneTools attempt');
  return craftFullToolSet(bot, 'stone', options);
}

export async function craftIronTools(bot, options = {}) {
  console.log('[crafting] craftIronTools attempt');
  return craftFullToolSet(bot, 'iron', options);
}

async function attemptGroup(label, attempts, options = {}) {
  const notes = [];
  let successes = 0;
  for (const attempt of attempts) {
    throwIfStopped(options);
    const outcome = await attempt();
    notes.push(outcome.message);
    if (outcome.ok) successes += 1;
  }
  return result(successes > 0, `${label}: ${notes.join(' ')}`, { successes, notes });
}

export async function craftLighting(bot, options = {}) {
  console.log('[crafting] craftLighting attempt');
  return attemptGroup('Lighting supplies', [
    () => craftTorches(bot, options),
    async () => {
      if (countItem(bot, 'coal') + countItem(bot, 'charcoal') <= 1 && !options.direct) {
        return result(false, 'Skipping campfire so I keep at least 1 coal or charcoal.');
      }
      return craftItem(bot, 'campfire', 1, options);
    }
  ], options);
}

export async function craftStorage(bot, options = {}) {
  console.log('[crafting] craftStorage attempt');
  return attemptGroup('Storage supplies', [
    () => craftItem(bot, 'chest', 1, options),
    () => craftItem(bot, 'barrel', 1, options)
  ], options);
}

export async function craftShelterSupplies(bot, options = {}) {
  console.log('[crafting] craftShelterSupplies attempt');
  return attemptGroup('Shelter supplies', [
    () => craftTorches(bot, options),
    () => craftItem(bot, 'chest', 1, options),
    () => craftItem(bot, 'door', 1, options),
    () => craftItem(bot, 'bed', 1, options),
    () => craftItem(bot, 'furnace', 1, options),
    () => craftItem(bot, 'ladder', 1, options)
  ], options);
}

export async function craftUtilityItems(bot, options = {}) {
  console.log('[crafting] craftUtilityItems attempt');
  return attemptGroup('Utility items', [
    () => craftItem(bot, 'furnace', 1, options),
    () => craftCraftingTable(bot, options),
    () => craftItem(bot, 'chest', 1, options),
    () => craftTorches(bot, options),
    async () => {
      if (countItem(bot, 'coal') + countItem(bot, 'charcoal') <= 1 && !options.direct) {
        return result(false, 'Skipping campfire so I keep at least 1 coal or charcoal.');
      }
      return craftItem(bot, 'campfire', 1, options);
    },
    () => craftItem(bot, 'shield', 1, options),
    () => craftItem(bot, 'bucket', 1, options)
  ], options);
}

export async function craftTravelItems(bot, options = {}) {
  console.log('[crafting] craftTravelItems attempt');
  return attemptGroup('Travel items', [
    () => craftItem(bot, 'boat', 1, { ...options, direct: true }),
    () => craftItem(bot, 'ladder', 1, options),
    () => craftItem(bot, 'door', 1, options)
  ], options);
}

export async function craftBuildingBlocks(bot, material = '', options = {}) {
  console.log(`[crafting] craftBuildingBlocks attempt material=${material || 'auto'}`);
  const resolvedMaterial = normalizeItemName(material);
  const shapeOptions = { ...options };
  if (woodVariants.includes(resolvedMaterial)) shapeOptions.preferredWoodType = resolvedMaterial;

  return attemptGroup('Building blocks', [
    () => craftItem(bot, 'slabs', 1, shapeOptions),
    () => craftItem(bot, 'stairs', 1, shapeOptions),
    () => craftItem(bot, 'fences', 1, shapeOptions),
    () => craftItem(bot, 'gate', 1, shapeOptions),
    () => craftItem(bot, 'doors', 1, shapeOptions),
    () => craftItem(bot, 'trapdoor', 1, shapeOptions),
    () => craftItem(bot, 'signs', 1, shapeOptions)
  ], shapeOptions);
}

export async function craftSurvivalKit(bot, options = {}) {
  console.log('[crafting] craftSurvivalKit attempt');
  return attemptGroup('Survival kit', [
    () => craftCraftingTable(bot, options),
    () => craftItem(bot, 'furnace', 1, options),
    () => craftTorches(bot, options),
    () => craftItem(bot, 'chest', 1, options),
    () => craftItem(bot, 'shield', 1, options),
    () => craftItem(bot, 'bed', 1, options),
    () => craftItem(bot, 'boat', 1, options)
  ], options);
}

export function craftingStatus(bot) {
  const logCount = countAnyInternal(bot, logNames);
  const plankCount = countAnyInternal(bot, plankNames);
  const plankPotential = plankCount + Math.max(0, logCount - 2) * 4;
  const coalLike = countItem(bot, 'coal') + countItem(bot, 'charcoal');
  const status = {
    availableLogs: getAvailableLogTypes(bot),
    availablePlanks: getAvailablePlankTypes(bot),
    availableWoolColors: getAvailableWoolColors(bot),
    coal: countItem(bot, 'coal'),
    charcoal: countItem(bot, 'charcoal'),
    cobblestone: countItem(bot, 'cobblestone'),
    ironIngot: countItem(bot, 'iron_ingot'),
    sticks: countItem(bot, 'stick'),
    canCraftTorches: canCraft(bot, 'torch', 4) || (coalLike > 0 && (countItem(bot, 'stick') > 0 || plankPotential >= 2)),
    canCraftChest: canCraft(bot, 'chest', 1) || plankPotential >= 8,
    canCraftFurnace: canCraft(bot, 'furnace', 1) || countItem(bot, 'cobblestone') >= 8,
    canCraftBed: woolColors.some((color) => countItem(bot, `${color}_wool`) >= 3) && plankPotential >= 3,
    canCraftBoat: plankPotential >= 5,
    canCraftShield: plankPotential >= 6 && countItem(bot, 'iron_ingot') >= 1,
    canCraftSurvivalKit: plankPotential >= 8 || logCount > 2
  };
  return status;
}

export function craftingStatusText(bot) {
  const status = craftingStatus(bot);
  const can = [];
  if (status.canCraftTorches) can.push('torches');
  if (status.canCraftChest) can.push('chest');
  if (status.canCraftFurnace) can.push('furnace');
  if (status.canCraftBed) can.push('bed');
  if (status.canCraftBoat) can.push('boat');
  if (status.canCraftShield) can.push('shield');
  return `Crafting: logs ${status.availableLogs.join(', ') || 'none'}, planks ${status.availablePlanks.join(', ') || 'none'}, wool ${status.availableWoolColors.join(', ') || 'none'}, coal ${status.coal + status.charcoal}, cobblestone ${status.cobblestone}, iron ${status.ironIngot}, sticks ${status.sticks}. Can craft: ${can.join(', ') || 'nothing obvious'}.`;
}
