import { equipBestArmor, getArmorScore, getArmorStatus } from '../../armor.js';
import { countItem, findBestTool, findBestWeapon, inventorySummary } from '../../inventory.js';

const goldArmorDestinations = {
  golden_boots: 'feet',
  golden_helmet: 'head',
  golden_leggings: 'legs',
  golden_chestplate: 'torso'
};

const goldPreference = ['golden_boots', 'golden_helmet', 'golden_leggings', 'golden_chestplate'];
const bowNames = ['bow', 'crossbow'];

function result(ok, message, extra = {}) {
  return { ok, success: ok, message, ...extra };
}

function items(bot) {
  return bot.inventory?.items?.() || [];
}

function equipped(bot, slot) {
  const slots = { head: 5, torso: 6, legs: 7, feet: 8 };
  return bot.inventory?.slots?.[slots[slot]] || null;
}

export function getGoldArmorPiece(bot) {
  const available = items(bot).filter((item) => goldPreference.includes(item.name));
  return available.sort((a, b) => goldPreference.indexOf(a.name) - goldPreference.indexOf(b.name))[0] || null;
}

export function hasGoldArmorEquipped(bot) {
  return ['head', 'torso', 'legs', 'feet'].some((slot) => equipped(bot, slot)?.name?.startsWith('golden_'));
}

export function hasShieldEquipped(bot) {
  return bot.inventory?.slots?.[45]?.name === 'shield' || bot.heldItem?.name === 'shield';
}

export function getBestNetherWeapon(bot) {
  return findBestWeapon(bot);
}

export function getBestNetherPickaxe(bot) {
  return findBestTool(bot, 'stone');
}

export function getBestBow(bot) {
  return items(bot).find((item) => bowNames.includes(item.name)) || null;
}

export function netherCombatReadiness(bot) {
  const weapon = getBestNetherWeapon(bot);
  const bow = getBestBow(bot);
  const arrows = countItem(bot, 'arrow');
  const armor = getArmorStatus(bot);
  return {
    weapon: weapon?.name || null,
    pickaxe: getBestNetherPickaxe(bot)?.name || null,
    bow: bow?.name || null,
    arrows,
    shield: countItem(bot, 'shield') > 0 || hasShieldEquipped(bot),
    armorScore: armor.armorScore,
    goldArmorEquipped: hasGoldArmorEquipped(bot)
  };
}

export function getNetherGearStatus(bot) {
  const armor = getArmorStatus(bot);
  const gold = getGoldArmorPiece(bot);
  return {
    armor,
    armorScore: armor.armorScore,
    goldArmorAvailable: gold?.name || null,
    goldArmorEquipped: hasGoldArmorEquipped(bot),
    shieldAvailable: countItem(bot, 'shield') > 0,
    shieldEquipped: hasShieldEquipped(bot),
    weapon: getBestNetherWeapon(bot)?.name || null,
    pickaxe: getBestNetherPickaxe(bot)?.name || null,
    bow: getBestBow(bot)?.name || null,
    arrows: countItem(bot, 'arrow'),
    inventory: inventorySummary(bot)
  };
}

export async function equipGoldArmorPiece(bot, options = {}) {
  if (hasGoldArmorEquipped(bot)) return result(true, 'Gold armour is already equipped.');
  const piece = getGoldArmorPiece(bot);
  if (!piece) return result(false, 'I do not have a gold armour piece. Golden boots are preferred for the Nether.');
  const destination = goldArmorDestinations[piece.name];
  const current = equipped(bot, destination);
  const currentScore = getArmorScore(current?.name);
  if (currentScore >= 5 && !options.forceGold) {
    return result(false, `I have ${current.name} equipped; replacing it with ${piece.name} needs confirmation.`, { requiresConfirmation: true });
  }
  try {
    console.log(`[netherGear] equipping ${piece.name} to ${destination}`);
    await bot.equip(piece, destination);
    return result(true, `Equipped ${piece.name} for piglin safety.`);
  } catch (error) {
    return result(false, `I could not equip ${piece.name}: ${error.message}`);
  }
}

export async function equipShieldIfAvailable(bot) {
  const shield = items(bot).find((item) => item.name === 'shield');
  if (!shield) return result(false, 'No shield available.');
  try {
    await bot.equip(shield, 'off-hand');
    return result(true, 'Equipped shield.');
  } catch (error) {
    return result(false, `I could not equip shield: ${error.message}`);
  }
}

export async function prepareBowIfAvailable(bot) {
  const bow = getBestBow(bot);
  if (!bow) return result(false, 'No bow or crossbow available.');
  if (countItem(bot, 'arrow') < 1) return result(false, 'I have a bow, but no arrows.');
  return result(true, `Bow ready: ${bow.name} with ${countItem(bot, 'arrow')} arrows.`);
}

export async function equipNetherGear(bot, options = {}) {
  const messages = [];
  await equipBestArmor(bot).then((r) => messages.push(r.message)).catch((error) => messages.push(error.message));
  const gold = await equipGoldArmorPiece(bot, options);
  messages.push(gold.message);
  const shield = await equipShieldIfAvailable(bot);
  messages.push(shield.message);
  const weapon = getBestNetherWeapon(bot);
  if (weapon) {
    try {
      await bot.equip(weapon, 'hand');
      messages.push(`Equipped ${weapon.name}.`);
    } catch (error) {
      messages.push(`Could not equip weapon: ${error.message}`);
    }
  } else {
    messages.push('No weapon available.');
  }
  return result(!gold.requiresConfirmation, messages.filter(Boolean).join(' '), getNetherGearStatus(bot));
}
