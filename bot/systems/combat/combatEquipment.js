import * as armor from '../../armor.js';
import * as food from '../../food.js';
import { countItem, findBestWeapon, lowDurabilityTools } from '../../inventory.js';

const meleePriority = [
  'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
  'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'
];

function itemList(bot) {
  return bot.inventory?.items?.() || [];
}

function durabilityLeft(item) {
  if (!item) return null;
  if (typeof item.durabilityUsed !== 'number' || typeof item.maxDurability !== 'number') return null;
  return item.maxDurability - item.durabilityUsed;
}

export function getBestMeleeWeapon(bot) {
  const items = itemList(bot);
  return meleePriority.map((name) => items.find((item) => item.name === name)).find(Boolean) || null;
}

export function getBestBow(bot) {
  return itemList(bot).find((item) => item.name === 'bow') || null;
}

export function getBestRangedWeapon(bot) {
  return itemList(bot).find((item) => item.name === 'crossbow') || getBestBow(bot);
}

export function hasArrows(bot) {
  return countItem(bot, 'arrow') > 0 || countItem(bot, 'spectral_arrow') > 0;
}

export function getBestWeapon(bot) {
  return getBestMeleeWeapon(bot) || findBestWeapon(bot) || null;
}

export async function equipBestWeapon(bot, options = {}) {
  const weapon = options.ranged && bot.mcaiConfig?.allowRangedCombat && hasArrows(bot)
    ? getBestRangedWeapon(bot) || getBestWeapon(bot)
    : getBestWeapon(bot);
  if (!weapon) return { ok: false, message: 'I do not have a weapon.' };
  const left = durabilityLeft(weapon);
  if (left !== null && left <= (bot.mcaiConfig?.returnHomeWhenToolDurabilityBelow || 20) && !options.emergency) {
    return { ok: false, message: `${weapon.name} durability is too low for safe combat.` };
  }
  await bot.equip(weapon, 'hand');
  return { ok: true, message: `Equipped ${weapon.name}.`, item: weapon };
}

export async function equipShieldIfAvailable(bot) {
  if (!bot.mcaiConfig?.allowShieldUse) return { ok: false, message: 'Shield use is disabled.' };
  const shield = itemList(bot).find((item) => item.name === 'shield');
  if (!shield) return { ok: false, message: 'No shield available.' };
  try {
    await bot.equip(shield, 'off-hand');
    return { ok: true, message: 'Equipped shield.', item: shield };
  } catch (error) {
    return { ok: false, message: `Could not equip shield: ${error.message}` };
  }
}

export async function equipArmorForCombat(bot) {
  return armor.equipBestArmor(bot);
}

export async function prepareForCombat(bot, options = {}) {
  console.log('[combat] prepareForCombat');
  const notes = [];
  const armorResult = await equipArmorForCombat(bot);
  notes.push(armorResult.message || 'armour checked');
  const shieldResult = await equipShieldIfAvailable(bot);
  if (shieldResult.ok) notes.push(shieldResult.message);
  if ((bot.food ?? 20) < (bot.mcaiConfig?.minFoodToFight || 10)) {
    const ate = await food.eatIfHungry(bot, { config: bot.mcaiConfig || {}, direct: false });
    notes.push(ate.message || 'food checked');
  }
  const weaponResult = await equipBestWeapon(bot, options);
  notes.push(weaponResult.message);
  return { ok: weaponResult.ok, message: notes.filter(Boolean).join(' '), weapon: weaponResult.item || null };
}

export function combatEquipmentStatus(bot) {
  const armorStatus = armor.getArmorStatus(bot);
  const weapon = getBestWeapon(bot);
  const ranged = getBestRangedWeapon(bot);
  const damaged = lowDurabilityTools(bot, bot.mcaiConfig?.returnHomeWhenToolDurabilityBelow || 20);
  return {
    bestWeapon: weapon?.name || null,
    bestMeleeWeapon: getBestMeleeWeapon(bot)?.name || null,
    bestRangedWeapon: ranged?.name || null,
    hasBow: Boolean(getBestBow(bot)),
    hasArrows: hasArrows(bot),
    hasShield: countItem(bot, 'shield') > 0,
    armorScore: armorStatus.armorScore,
    missingArmor: armorStatus.missing,
    lowDurabilityCombatItems: damaged.filter((item) => item.name.includes('sword') || item.name.includes('axe') || item.name === 'bow' || item.name === 'crossbow')
  };
}

export function hasMinimumCombatGear(bot, options = {}) {
  const status = combatEquipmentStatus(bot);
  if (!status.bestWeapon && !options.emergency) return { ok: false, reason: 'no usable weapon' };
  if ((bot.health ?? 20) < (bot.mcaiConfig?.minHealthToFight || 14) && !options.emergency) return { ok: false, reason: 'health too low' };
  if ((bot.food ?? 20) < (bot.mcaiConfig?.minFoodToFight || 10) && !options.emergency) return { ok: false, reason: 'food too low' };
  return { ok: true, reason: 'combat ready' };
}
