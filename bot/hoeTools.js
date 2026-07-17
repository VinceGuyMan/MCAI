import * as crafting from './crafting.js';

const hoePreference = ['stone_hoe', 'wooden_hoe', 'golden_hoe', 'iron_hoe', 'diamond_hoe', 'netherite_hoe'];

function itemList(bot) {
  return bot.inventory?.items?.() || [];
}

export function getBestHoe(bot, options = {}) {
  const allowed = options.allowExpensive
    ? hoePreference
    : ['stone_hoe', 'wooden_hoe', 'golden_hoe'];
  return allowed.map((name) => itemList(bot).find((item) => item.name === name)).find(Boolean) || null;
}

export function hasHoe(bot) {
  return Boolean(getBestHoe(bot, { allowExpensive: true }));
}

export async function craftHoeIfNeeded(bot, options = {}) {
  if (getBestHoe(bot, options)) return { ok: true, message: 'I already have a hoe.' };
  if (crafting.countItem(bot, 'cobblestone') >= 2) {
    const result = await crafting.craftItem(bot, 'stone_hoe', 1, { ...options, direct: true });
    if (result.ok) return result;
  }
  const hasWood = crafting.countAny(bot, crafting.plankNames) >= 2 || crafting.countAny(bot, crafting.logNames) > 2;
  if (hasWood) return crafting.craftItem(bot, 'wooden_hoe', 1, { ...options, direct: true });
  return { ok: false, message: 'I need a hoe, or wood/cobblestone to craft one.' };
}

export async function equipHoe(bot, options = {}) {
  let hoe = getBestHoe(bot, options);
  if (!hoe) {
    const crafted = await craftHoeIfNeeded(bot, options);
    if (!crafted.ok) return crafted;
    hoe = getBestHoe(bot, options);
  }
  if (!hoe) return { ok: false, message: 'I still do not have a hoe.' };
  await bot.equip(hoe, 'hand');
  return { ok: true, message: `Equipped ${hoe.name}.`, item: hoe };
}

export function canTillBlock(block) {
  if (!block) return false;
  return ['dirt', 'grass_block'].includes(block.name);
}

export async function tillBlock(bot, block, options = {}) {
  if (options.throwIfCancelled) options.throwIfCancelled();
  if (!canTillBlock(block)) return { ok: false, message: `${block?.name || 'that'} cannot be tilled.` };
  const above = bot.blockAt(block.position.offset(0, 1, 0));
  if (!['air', 'cave_air', 'void_air'].includes(above?.name)) return { ok: false, message: 'The block above the soil is blocked.' };
  const hoe = await equipHoe(bot, options);
  if (!hoe.ok) return hoe;
  console.log(`[farm] tilling ${block.name} at ${block.position.x},${block.position.y},${block.position.z}`);
  await bot.activateBlock(block);
  return { ok: true, message: 'Tilled soil.' };
}
