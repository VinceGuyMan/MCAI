import * as inventory from '../../inventory.js';
import * as gearSafety from './gearSafety.js';

const BREWING_RECIPES = {
  fire_resistance: ['brewing_stand', 'blaze_powder', 'potion', 'nether_wart', 'magma_cream'],
  healing: ['brewing_stand', 'blaze_powder', 'potion', 'nether_wart', 'glistering_melon_slice'],
  strength: ['brewing_stand', 'blaze_powder', 'potion', 'nether_wart', 'blaze_powder'],
  night_vision: ['brewing_stand', 'blaze_powder', 'potion', 'nether_wart', 'golden_carrot'],
  slow_falling: ['brewing_stand', 'blaze_powder', 'potion', 'nether_wart', 'phantom_membrane']
};

function items(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function hasItem(bot, name) {
  return items(bot).some((item) => item.name === name || (name === 'potion' && item.name === 'potion'));
}

export function brewingApiAvailable(bot) {
  return typeof bot?.openBrewingStand === 'function' || false;
}

export function findNearbyBrewingStand(bot, radius = 12) {
  const id = bot?.registry?.blocksByName?.brewing_stand?.id;
  if (!id || !bot?.findBlock) return null;
  return bot.findBlock({ matching: id, maxDistance: radius }) || null;
}

export function getBrewingSupplies(bot) {
  const summary = inventory.getBrewingIngredientSummary?.(bot) || {};
  return {
    ...summary,
    brewingStandNearby: Boolean(findNearbyBrewingStand(bot)),
    apiAvailable: brewingApiAvailable(bot),
    implemented: false
  };
}

export function canBrewPotion(bot, potionType) {
  const key = String(potionType || '').toLowerCase().replace(/\s+/g, '_');
  const recipe = BREWING_RECIPES[key];
  if (!recipe) return { ok: false, possibleIngredients: false, message: `No known safe recipe for ${potionType}.` };
  const possibleIngredients = recipe.every((name) => hasItem(bot, name));
  return {
    ok: false,
    possibleIngredients,
    message: 'Brewing automation is scaffolded only; Mineflayer brewing stand interaction is not marked reliable yet.'
  };
}

export function brewingStatus(bot, memory) {
  const supplies = getBrewingSupplies(bot);
  const fireResistance = items(bot)
    .filter((item) => item.name.includes('potion') && `${item.displayName || ''} ${JSON.stringify(item.nbt || {})}`.toLowerCase().includes('fire'))
    .reduce((sum, item) => sum + (item.count || 1), 0);
  return {
    ok: true,
    hasBrewingStand: Boolean(supplies.brewingStand || supplies.brewingStandNearby),
    fireResistance,
    implemented: false,
    evidence: ['brewing_status_reported'],
    data: supplies,
    message: fireResistance > 0
      ? `I have ${fireResistance} possible fire resistance potion(s), but brewing automation is not implemented yet.`
      : 'Brewing automation is not implemented yet. I can track ingredients and carried potions, but I will not claim brewed potions.'
  };
}

export function explainBrewingReadiness(bot) {
  return brewingStatus(bot).message;
}

async function unsupportedBrew(bot, potionType, options = {}) {
  const safety = gearSafety.canBrewPotion(bot, potionType, options);
  if (!safety.ok && safety.reason !== 'Brewing is disabled because reliable brewing support is not confirmed.') {
    return { ok: false, message: safety.reason, reason: safety.reason, requiresConfirmation: safety.requiresConfirmation, evidence: ['brewing_status_reported'] };
  }
  const possible = canBrewPotion(bot, potionType);
  return {
    ok: false,
    message: possible.possibleIngredients
      ? `I appear to have ingredients for ${potionType}, but brewing automation is not reliable yet.`
      : `I cannot brew ${potionType}; brewing automation is not reliable yet and ingredients may be missing.`,
    reason: 'brewing unsupported',
    evidence: ['brewing_status_reported'],
    data: possible
  };
}

export async function brewPotion(bot, potionType, options = {}) {
  return unsupportedBrew(bot, potionType, options);
}

export async function brewFireResistance(bot, options = {}) {
  return unsupportedBrew(bot, 'fire_resistance', options);
}

export async function brewHealing(bot, options = {}) {
  return unsupportedBrew(bot, 'healing', options);
}

export async function brewStrength(bot, options = {}) {
  return unsupportedBrew(bot, 'strength', options);
}

export async function brewNightVision(bot, options = {}) {
  return unsupportedBrew(bot, 'night_vision', options);
}

export async function brewSlowFalling(bot, options = {}) {
  return unsupportedBrew(bot, 'slow_falling', options);
}

export function canBrewFireResistance(bot) {
  return canBrewPotion(bot, 'fire_resistance');
}
