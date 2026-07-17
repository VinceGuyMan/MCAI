import * as gearSafety from './gearSafety.js';

const POSITIVE_HINTS = [
  'fire_resistance',
  'healing',
  'regeneration',
  'strength',
  'swiftness',
  'night_vision',
  'water_breathing',
  'slow_falling'
];

const DANGEROUS_HINTS = ['harming', 'poison', 'weakness', 'slowness'];

function items(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function textFor(item) {
  try {
    return `${item?.name || ''} ${item?.displayName || ''} ${JSON.stringify(item?.nbt || {})}`.toLowerCase();
  } catch {
    return `${item?.name || ''} ${item?.displayName || ''}`.toLowerCase();
  }
}

function isPotion(item) {
  const name = item?.name || '';
  return name === 'potion' || name === 'splash_potion' || name === 'lingering_potion' || name.includes('potion');
}

export function classifyPotion(item) {
  const text = textFor(item);
  const type = POSITIVE_HINTS.find((hint) => text.includes(hint) || text.includes(hint.replace(/_/g, ' '))) ||
    DANGEROUS_HINTS.find((hint) => text.includes(hint)) ||
    'unknown';
  const delivery = item?.name?.includes('splash') ? 'splash' : item?.name?.includes('lingering') ? 'lingering' : 'drink';
  const safeDefault = POSITIVE_HINTS.includes(type);
  return {
    item,
    name: item?.name || 'unknown',
    displayName: item?.displayName || item?.name || 'unknown potion',
    count: item?.count || 1,
    type,
    delivery,
    safeDefault,
    dangerous: DANGEROUS_HINTS.includes(type) || type === 'unknown'
  };
}

export function getPotionEffects(item) {
  const classified = classifyPotion(item);
  return classified.type === 'unknown' ? [] : [classified.type];
}

export function getPotions(bot) {
  return items(bot).filter(isPotion).map(classifyPotion);
}

export function countPotionsByType(bot) {
  const counts = {};
  for (const potion of getPotions(bot)) counts[potion.type] = (counts[potion.type] || 0) + potion.count;
  return counts;
}

export function getUsefulPotionInventory(bot) {
  return getPotions(bot).filter((potion) => potion.safeDefault);
}

export function recommendPotionForContext(bot, context = {}) {
  const counts = countPotionsByType(bot);
  if (context.nether || context.lava || context.fire) {
    if (counts.fire_resistance) return { type: 'fire_resistance', reason: 'Fire resistance is best for Nether or lava risk.' };
  }
  if ((bot?.health ?? 20) <= 10 && counts.healing) return { type: 'healing', reason: 'Healing potion is useful at low health.' };
  if (context.combat && counts.strength) return { type: 'strength', reason: 'Strength can help in a planned fight.' };
  if (context.exploration && counts.night_vision) return { type: 'night_vision', reason: 'Night vision helps scouting dark areas.' };
  return { type: null, reason: 'No clear potion recommendation from current inventory.' };
}

export function potionStatus(bot) {
  const potions = getPotions(bot);
  const counts = countPotionsByType(bot);
  const useful = getUsefulPotionInventory(bot);
  return {
    ok: true,
    message: potions.length
      ? `Potions: ${Object.entries(counts).map(([name, count]) => `${name} x${count}`).join(', ')}.`
      : 'I do not have any potions that I can identify.',
    evidence: ['potion_status_reported'],
    data: { potions: potions.map(({ item, ...rest }) => rest), counts, usefulCount: useful.length }
  };
}

function findPotion(bot, potionName) {
  const key = String(potionName || '').toLowerCase().replace(/\s+/g, '_');
  return getPotions(bot).find((potion) => potion.type === key || potion.displayName.toLowerCase().includes(key.replace(/_/g, ' '))) || null;
}

export async function drinkPotion(bot, potionName, options = {}) {
  const potion = findPotion(bot, potionName);
  const safe = gearSafety.canUsePotion(bot, potion?.item, options);
  if (!safe.ok) return { ok: false, message: safe.reason, reason: safe.reason, requiresConfirmation: safe.requiresConfirmation, evidence: ['potion_status_reported'] };
  if (!potion) return { ok: false, message: `I do not have ${potionName}.`, evidence: ['potion_status_reported'] };
  if (potion.delivery !== 'drink') return { ok: false, message: `${potion.displayName} is not a drinkable potion.`, evidence: ['potion_status_reported'] };
  if (typeof bot.equip !== 'function' || typeof bot.activateItem !== 'function') {
    return { ok: false, message: 'Potion use is not available from this Mineflayer bot instance.', evidence: ['potion_status_reported'] };
  }
  await bot.equip(potion.item, 'hand');
  await bot.activateItem();
  return { ok: true, message: `Used ${potion.displayName}.`, evidence: ['potion_used'], data: { type: potion.type } };
}

export async function throwSplashPotion(bot, potionName, target, options = {}) {
  const potion = findPotion(bot, potionName);
  const safe = gearSafety.canUsePotion(bot, potion?.item, { ...options, splashNearPlayers: Boolean(target?.username) });
  if (!safe.ok) return { ok: false, message: safe.reason, reason: safe.reason, requiresConfirmation: safe.requiresConfirmation, evidence: ['potion_status_reported'] };
  return { ok: false, message: 'Splash potion throwing is not enabled yet; I will not risk hitting ModVinny.', evidence: ['potion_status_reported'] };
}

export async function usePotion(bot, potionName, options = {}) {
  const potion = findPotion(bot, potionName);
  if (!potion) return { ok: false, message: `I do not have ${potionName}.`, evidence: ['potion_status_reported'] };
  if (potion.delivery === 'drink') return drinkPotion(bot, potionName, options);
  return throwSplashPotion(bot, potionName, options.target, options);
}

export function carryPotionLoadout(bot, context = {}) {
  const useful = getUsefulPotionInventory(bot);
  const recommendation = recommendPotionForContext(bot, context);
  return {
    ok: true,
    message: recommendation.type
      ? `Potion loadout: keep ${recommendation.type}. ${recommendation.reason}`
      : 'Potion loadout: no must-carry potion detected, but fire resistance is ideal before Nether trips.',
    evidence: ['potion_status_reported'],
    data: { useful: useful.map(({ item, ...rest }) => rest), recommendation }
  };
}

export function explainPotionReadiness(bot) {
  return potionStatus(bot).message;
}

