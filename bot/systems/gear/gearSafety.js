import { getItemMaterialTier, getEnchantments } from './gearScore.js';

const RARE_BOOK_ENCHANTS = new Set(['mending', 'fortune', 'silk_touch', 'looting', 'infinity', 'protection', 'sharpness']);
const NEGATIVE_POTION_HINTS = /poison|harming|weakness|slowness|turtle_master|decay/i;

function readConfig(bot, context = {}) {
  return { ...(bot?.mcaiConfig || {}), ...(context.config || {}) };
}

function isOwner(context = {}, config = {}) {
  const owner = context.ownerUsername || config.ownerUsername || 'ModVinny';
  if (context.isOwner === true || context.confirmedBy === owner) return true;
  if (!context.sender && !context.username) return true;
  return context.sender === owner || context.username === owner;
}

function confirmed(context = {}) {
  return Boolean(context.confirmed || context.forceConfirmed || context.approved);
}

function blocked(reason, extra = {}) {
  return { ok: false, reason, requiresConfirmation: /confirmation|confirm/i.test(reason), ...extra };
}

function itemName(item) {
  return String(item?.name || item || '').toLowerCase();
}

function isDiamondOrNetherite(item) {
  const name = itemName(item);
  return name.startsWith('diamond_') || name.startsWith('netherite_');
}

function isRareBook(book) {
  if (!book) return false;
  const text = `${book.name || ''} ${book.displayName || ''} ${JSON.stringify(book.nbt || {})}`.toLowerCase();
  return itemName(book).includes('enchanted_book') || [...RARE_BOOK_ENCHANTS].some((name) => text.includes(name));
}

function baseGearGuard(bot, context = {}) {
  const config = readConfig(bot, context);
  if (!isOwner(context, config)) return blocked('Only ModVinny can approve gear upgrades.');
  if (bot?.mcaiCancellation?.isCancelled?.()) return blocked('Gear upgrade blocked during cancellation.');
  if (context.danger && !context.emergencyPotion) return blocked('Gear upgrades are blocked while danger is active.');
  return { ok: true };
}

export function canEnchantItem(bot, item, context = {}) {
  const config = readConfig(bot, context);
  const base = baseGearGuard(bot, context);
  if (!base.ok) return base;
  if (!item) return blocked('No enchant target selected.');
  if (config.requireConfirmationForEnchanting !== false && !confirmed(context)) return blocked('Enchanting requires owner confirmation.');
  if (isDiamondOrNetherite(item) && !context.confirmDiamondGear && config.requireConfirmationForDiamondGearEnchanting !== false) return blocked('Diamond/netherite gear enchanting needs explicit confirmation.');
  if (itemName(item).startsWith('netherite_') && !context.confirmNetherite && config.requireConfirmationForNetheriteGear !== false) return blocked('Netherite gear is protected.');
  return { ok: true };
}

export function canUseAnvil(bot, operation, context = {}) {
  const config = readConfig(bot, context);
  const base = baseGearGuard(bot, context);
  if (!base.ok) return base;
  if (config.requireConfirmationForAnvilUse !== false && !confirmed(context)) return blocked('Anvil use requires owner confirmation.');
  if (operation?.usesBestGear && config.protectBestGear !== false && !context.confirmBestGear) return blocked('Best gear anvil operations need confirmation.');
  return { ok: true };
}

export function canUseBook(bot, book, item, context = {}) {
  const config = readConfig(bot, context);
  const base = canUseAnvil(bot, { type: 'book', item }, context);
  if (!base.ok) return base;
  if (!book) return blocked('No enchanted book selected.');
  if (config.requireConfirmationForBookUse !== false && !confirmed(context)) return blocked('Using enchanted books requires owner confirmation.');
  if (isRareBook(book) && config.protectValuableBooks !== false && !context.confirmRareBook) return blocked('Rare enchanted books need explicit confirmation.');
  if (isDiamondOrNetherite(item) && !context.confirmDiamondGear) return blocked('Using books on diamond/netherite gear needs confirmation.');
  return { ok: true };
}

export function canUsePotion(bot, potion, context = {}) {
  const config = readConfig(bot, context);
  const base = baseGearGuard(bot, context);
  if (!base.ok) return base;
  if (!potion) return blocked('No potion selected.');
  const text = `${potion.name || ''} ${potion.displayName || ''} ${JSON.stringify(potion.nbt || {})}`;
  if (NEGATIVE_POTION_HINTS.test(text) && !context.confirmDangerousPotion) return blocked('Negative or unknown-risk potion use is blocked.');
  if (config.requireConfirmationForPotionUse !== false && !confirmed(context)) return blocked('Potion use requires owner confirmation.');
  if (context.splashNearPlayers && !context.confirmSplashNearPlayers) return blocked('Splash potions near players need confirmation.');
  return { ok: true };
}

export function canBrewPotion(bot, potionType, context = {}) {
  const config = readConfig(bot, context);
  const base = baseGearGuard(bot, context);
  if (!base.ok) return base;
  if (!config.brewingEnabled) return blocked('Brewing is disabled because reliable brewing support is not confirmed.');
  if (config.requireConfirmationForBrewing !== false && !confirmed(context)) return blocked('Brewing requires owner confirmation.');
  return { ok: true };
}

export function canSpendXp(bot, levels, context = {}) {
  const config = readConfig(bot, context);
  const available = Number(bot?.experience?.level ?? 0) || 0;
  const count = Number(levels) || 0;
  if (available < count) return blocked(`Need ${count} XP levels; I have ${available}.`);
  if (count > (config.maxEnchantLevelWithoutConfirmation || 1) && !confirmed(context)) return blocked('Spending higher XP levels needs confirmation.');
  return { ok: true };
}

export function canSpendLapis(bot, count, context = {}) {
  const config = readConfig(bot, context);
  const reserve = Number(config.keepLapisReserve ?? 3) || 0;
  const available = context.lapisCount ?? 0;
  if (available < count) return blocked(`Need ${count} lapis; I have ${available}.`);
  if (available - count < reserve && !confirmed(context)) return blocked(`Keep ${reserve} lapis in reserve unless confirmed.`);
  return { ok: true };
}

export function canSpendDiamonds(bot, count, context = {}) {
  const config = readConfig(bot, context);
  const reserve = Number(config.keepDiamondReserve ?? 2) || 0;
  if (!confirmed(context)) return blocked('Spending diamonds requires confirmation.');
  if ((context.diamondCount ?? 0) - (Number(count) || 0) < reserve && !context.confirmDiamondReserve) return blocked(`Keep ${reserve} diamonds in reserve.`);
  return { ok: true };
}

export function canSpendNetherite(bot, context = {}) {
  if (!context.confirmNetherite) return blocked('Netherite use is disabled unless explicitly confirmed in a future phase.');
  return { ok: true };
}

export function explainGearSafetyBlockers(bot, operation, context = {}) {
  const checks = [
    baseGearGuard(bot, context),
    operation?.type === 'enchant' ? canEnchantItem(bot, operation.item, context) : { ok: true },
    operation?.type === 'anvil' ? canUseAnvil(bot, operation, context) : { ok: true },
    operation?.type === 'book' ? canUseBook(bot, operation.book, operation.item, context) : { ok: true },
    operation?.type === 'potion' ? canUsePotion(bot, operation.potion, context) : { ok: true },
    operation?.type === 'brewing' ? canBrewPotion(bot, operation.potionType, context) : { ok: true }
  ];
  return checks.filter((check) => !check.ok).map((check) => check.reason);
}

export function hasValuableTier(item) {
  return getItemMaterialTier(itemName(item)) >= 4 || getEnchantments(item).some((enchant) => RARE_BOOK_ENCHANTS.has(enchant.name));
}

