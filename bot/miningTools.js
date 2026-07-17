import * as crafting from './crafting.js';

const pickaxeRanks = {
  wooden_pickaxe: 1,
  golden_pickaxe: 1,
  stone_pickaxe: 2,
  iron_pickaxe: 3,
  diamond_pickaxe: 4,
  netherite_pickaxe: 5
};

const shovelRanks = {
  wooden_shovel: 1,
  golden_shovel: 1,
  stone_shovel: 2,
  iron_shovel: 3,
  diamond_shovel: 4,
  netherite_shovel: 5
};

const oreRankRequirements = {
  iron_ore: 2,
  deepslate_iron_ore: 2,
  copper_ore: 2,
  deepslate_copper_ore: 2,
  gold_ore: 3,
  deepslate_gold_ore: 3,
  redstone_ore: 3,
  deepslate_redstone_ore: 3,
  lapis_ore: 3,
  deepslate_lapis_ore: 3,
  diamond_ore: 3,
  deepslate_diamond_ore: 3
};

function items(bot) {
  return bot.inventory?.items?.() || [];
}

function durabilityLeft(item) {
  if (!item) return null;
  if (typeof item.durabilityUsed !== 'number' || typeof item.maxDurability !== 'number') return null;
  return item.maxDurability - item.durabilityUsed;
}

function rankByName(name, ranks) {
  return ranks[name] || 0;
}

function sortTools(a, b, ranks) {
  const rankDelta = rankByName(b.name, ranks) - rankByName(a.name, ranks);
  if (rankDelta !== 0) return rankDelta;
  return (durabilityLeft(b) ?? 9999) - (durabilityLeft(a) ?? 9999);
}

function requiredPickaxeRank(blockName) {
  return oreRankRequirements[blockName] || 1;
}

export function getToolDurabilityStatus(_bot, item) {
  if (!item) return { item: null, durabilityLeft: null, maxDurability: null, low: true };
  const left = durabilityLeft(item);
  return {
    item: item.name,
    durabilityLeft: left,
    maxDurability: item.maxDurability ?? null,
    low: typeof left === 'number' ? left <= 20 : false
  };
}

export function getBestPickaxe(bot, options = {}) {
  const minRank = options.minRank || 1;
  const minDurability = options.minDurability ?? 1;
  return items(bot)
    .filter((item) => item.name.endsWith('_pickaxe'))
    .filter((item) => rankByName(item.name, pickaxeRanks) >= minRank)
    .filter((item) => (durabilityLeft(item) ?? 9999) >= minDurability)
    .sort((a, b) => sortTools(a, b, pickaxeRanks))[0] || null;
}

export function getBestShovel(bot, options = {}) {
  const minDurability = options.minDurability ?? 1;
  return items(bot)
    .filter((item) => item.name.endsWith('_shovel'))
    .filter((item) => (durabilityLeft(item) ?? 9999) >= minDurability)
    .sort((a, b) => sortTools(a, b, shovelRanks))[0] || null;
}

export function getBestToolForBlock(bot, block) {
  const name = block?.name || String(block || '');
  if (/dirt|gravel|sand|clay/.test(name)) return getBestShovel(bot);
  return getBestPickaxe(bot, { minRank: requiredPickaxeRank(name) });
}

export async function equipBestMiningTool(bot, block, options = {}) {
  const name = block?.name || String(block || '');
  const tool = getBestToolForBlock(bot, block);
  if (!tool) {
    return { ok: false, message: `I need a better tool to mine ${name}.` };
  }
  const left = durabilityLeft(tool);
  if (typeof left === 'number' && left <= (options.minDurability || 3)) {
    return { ok: false, message: `${tool.name} is too damaged to use safely.` };
  }
  await bot.equip(tool, 'hand');
  return { ok: true, message: `Equipped ${tool.name}.`, item: tool };
}

export function hasUsablePickaxe(bot, options = {}) {
  // minDurability 1 so a slightly worn wooden/stone pick still counts as usable.
  return Boolean(getBestPickaxe(bot, {
    minRank: options.minRank || 1,
    minDurability: options.minDurability ?? 1
  }));
}

export function shouldCraftPickaxeBeforeMining(bot, options = {}) {
  return !hasUsablePickaxe(bot, {
    minRank: options.minRank || 1,
    minDurability: options.minDurability ?? 1
  });
}

export async function craftPickaxeIfNeeded(bot, options = {}) {
  const minRank = options.minRank || 1;
  if (!shouldCraftPickaxeBeforeMining(bot, options)) return { ok: true, message: 'I already have a usable pickaxe.' };

  // Iron+ ores need stone pick or better (rank ≥2).
  const needStone = minRank >= 2;
  const canStone = crafting.countItem(bot, 'cobblestone') >= 3;
  if (needStone || canStone) {
    if (!canStone) {
      return {
        ok: false,
        message: minRank >= 2
          ? 'I need a stone pickaxe (or better) for iron. Mine cobblestone and craft stone tools first.'
          : 'I need cobblestone to craft a better pickaxe.'
      };
    }
    if (crafting.countItem(bot, 'stick') < 2) {
      await crafting.craftSticks(bot, 2, { ...options, direct: true });
    }
    const stone = await crafting.craftStonePickaxe(bot, { ...options, direct: true });
    if (stone.ok) return stone;
    if (needStone) return stone;
  }

  if (minRank <= 1) {
    const hasWood = crafting.countAny(bot, crafting.logNames) > 2 || crafting.countAny(bot, crafting.plankNames) >= 3;
    if (hasWood) return crafting.craftWoodenPickaxe(bot, { ...options, direct: true });
  }
  return {
    ok: false,
    message: needStone
      ? 'I need a stone pickaxe for that ore, but I do not have cobblestone/sticks to craft one.'
      : 'I need a pickaxe before mining, but I do not have materials to craft one.'
  };
}

export function miningToolStatus(bot, options = {}) {
  const pickaxe = getBestPickaxe(bot, {
    minDurability: options.minDurability || 1
  });
  const shovel = getBestShovel(bot);
  const diamondPickaxe = getBestPickaxe(bot, { minRank: 3, minDurability: options.minDurability || 1 });
  return {
    bestPickaxe: pickaxe?.name || null,
    bestPickaxeDurability: getToolDurabilityStatus(bot, pickaxe),
    bestShovel: shovel?.name || null,
    canMineStone: Boolean(getBestPickaxe(bot)),
    canMineIron: Boolean(getBestPickaxe(bot, { minRank: 2 })),
    canMineDiamond: Boolean(diamondPickaxe)
  };
}

export function miningToolStatusText(bot) {
  const status = miningToolStatus(bot);
  const pick = status.bestPickaxe
    ? `${status.bestPickaxe}${status.bestPickaxeDurability.durabilityLeft !== null ? ` (${status.bestPickaxeDurability.durabilityLeft} uses left)` : ''}`
    : 'none';
  return `Mining tools: pickaxe ${pick}, shovel ${status.bestShovel || 'none'}, iron+ ores ${status.canMineIron ? 'yes' : 'no'}, diamond-tier ores ${status.canMineDiamond ? 'yes' : 'no'}.`;
}

export { pickaxeRanks, requiredPickaxeRank };
