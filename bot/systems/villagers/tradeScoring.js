const HIGH_VALUE_BOOK_TERMS = [
  'mending',
  'unbreaking',
  'efficiency',
  'fortune',
  'protection',
  'sharpness',
  'feather_falling',
  'feather falling',
  'silk_touch',
  'silk touch'
];

const GEAR_TERMS = [
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'bow',
  'crossbow',
  'trident'
];

const FOOD_TERMS = ['bread', 'apple', 'carrot', 'potato', 'beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'cookie', 'stew'];
const EMERALD_EARNING_INPUTS = ['wheat', 'carrot', 'potato', 'stick', 'paper', 'coal', 'string', 'feather', 'leather', 'fish', 'cod', 'salmon'];
const DECORATIVE_TERMS = ['banner', 'map', 'painting', 'flower_pot', 'terracotta', 'glazed', 'dye', 'carpet'];
const RARE_INPUT_TERMS = ['diamond', 'netherite', 'ancient_debris', 'enchanted_book', 'elytra', 'totem'];

function normalizeName(value) {
  if (!value) return 'unknown';
  if (typeof value === 'string') return value.toLowerCase().replace(/^minecraft:/, '');
  return String(value.name || value.displayName || value.type || 'unknown').toLowerCase().replace(/^minecraft:/, '');
}

function itemCount(item) {
  if (!item) return 0;
  return Number(item.count ?? item.amount ?? 1);
}

function itemText(item) {
  if (!item) return '';
  const nbt = item.nbt ? JSON.stringify(item.nbt).toLowerCase() : '';
  return `${normalizeName(item)} ${item.displayName || ''} ${nbt}`.toLowerCase();
}

function rawInputs(trade) {
  if (!trade) return [];
  if (Array.isArray(trade.inputs)) return trade.inputs.filter(Boolean);
  const inputs = [trade.inputItem1, trade.inputItem2].filter(Boolean);
  if (Array.isArray(trade.wanted)) {
    trade.wanted.forEach((name) => inputs.push({ name, count: 1 }));
  }
  return inputs;
}

function rawOutputs(trade) {
  if (!trade) return [];
  if (Array.isArray(trade.outputs)) return trade.outputs.filter(Boolean);
  if (trade.outputItem) return [trade.outputItem];
  if (trade.offered) return [{ name: trade.offered, count: 1 }];
  return [];
}

export function getTradeCost(trade) {
  return rawInputs(trade).map((item) => ({
    name: normalizeName(item),
    count: itemCount(item)
  }));
}

export function getTradeOutput(trade) {
  const output = rawOutputs(trade)[0];
  if (!output) return { name: 'unknown', count: 0 };
  return {
    name: normalizeName(output),
    displayName: output.displayName || normalizeName(output),
    count: itemCount(output),
    raw: output
  };
}

export function isBookTrade(trade) {
  const output = getTradeOutput(trade);
  return output.name.includes('enchanted_book') || output.name === 'book' || itemText(output.raw).includes('enchanted book');
}

export function isGearTrade(trade) {
  const output = getTradeOutput(trade);
  return GEAR_TERMS.some((term) => output.name.includes(term));
}

export function isFoodTrade(trade) {
  const output = getTradeOutput(trade);
  return FOOD_TERMS.some((term) => output.name.includes(term));
}

export function isEmeraldEarningTrade(trade) {
  const output = getTradeOutput(trade);
  if (!output.name.includes('emerald')) return false;
  const inputs = getTradeCost(trade);
  return inputs.some((item) => EMERALD_EARNING_INPUTS.some((term) => item.name.includes(term)));
}

export function classifyTrade(trade) {
  const output = getTradeOutput(trade);
  const text = `${output.name} ${itemText(output.raw)} ${trade?.category || ''}`.toLowerCase();
  if (isBookTrade(trade)) {
    if (HIGH_VALUE_BOOK_TERMS.some((term) => text.includes(term))) return 'valuable_enchanted_book';
    return 'unknown_enchanted_book';
  }
  if (isEmeraldEarningTrade(trade)) return 'emerald_earning';
  if (isGearTrade(trade)) return 'gear';
  if (isFoodTrade(trade)) return 'food';
  if (text.includes('ender_pearl')) return 'progression';
  if (DECORATIVE_TERMS.some((term) => text.includes(term))) return 'decorative';
  return output.name === 'unknown' ? 'unknown' : 'general';
}

export function isValuableTrade(trade) {
  return ['valuable_enchanted_book', 'gear', 'emerald_earning', 'progression'].includes(classifyTrade(trade));
}

export function isBadTrade(trade) {
  const cost = getTradeCost(trade);
  const emeraldCost = cost.filter((item) => item.name.includes('emerald')).reduce((sum, item) => sum + item.count, 0);
  const category = classifyTrade(trade);
  const rareInput = cost.some((item) => RARE_INPUT_TERMS.some((term) => item.name.includes(term)));
  return rareInput || emeraldCost > 64 || category === 'decorative';
}

export function scoreTrade(trade, context = {}) {
  const output = getTradeOutput(trade);
  const cost = getTradeCost(trade);
  const category = classifyTrade(trade);
  const emeraldCost = cost.filter((item) => item.name.includes('emerald')).reduce((sum, item) => sum + item.count, 0);
  const outputText = `${output.name} ${itemText(output.raw)}`.toLowerCase();
  let score = 35;

  if (category === 'valuable_enchanted_book') score += 45;
  if (category === 'unknown_enchanted_book') score += 20;
  if (category === 'gear') score += 25;
  if (category === 'emerald_earning') score += 30;
  if (category === 'food') score += context.needsFood ? 25 : 8;
  if (category === 'progression') score += 20;
  if (category === 'decorative') score -= 20;

  for (const term of HIGH_VALUE_BOOK_TERMS) {
    if (outputText.includes(term)) score += term === 'mending' ? 25 : 10;
  }

  if (output.name.includes('diamond')) score += 12;
  if (output.name.includes('iron')) score += 6;
  if (trade?.tradeDisabled || trade?.disabled) score -= 50;
  if (emeraldCost > 0) score -= Math.min(30, Math.floor(emeraldCost / 3));
  if (emeraldCost > Number(context.emeraldBudget ?? 999)) score -= 35;
  if (cost.some((item) => RARE_INPUT_TERMS.some((term) => item.name.includes(term)))) score -= 80;
  if (context.preferBooks && isBookTrade(trade)) score += 10;
  if (context.preferEmeralds && isEmeraldEarningTrade(trade)) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function compareTrades(a, b, context = {}) {
  return scoreTrade(b, context) - scoreTrade(a, context);
}

export function rankTrades(trades, context = {}) {
  return (Array.isArray(trades) ? trades : [])
    .map((trade, index) => ({
      ...trade,
      tradeIndex: trade.tradeIndex ?? trade.index ?? index,
      score: Number(trade.score ?? scoreTrade(trade, context)),
      category: trade.category || classifyTrade(trade),
      valuable: trade.valuable ?? isValuableTrade(trade)
    }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

export function explainTradeScore(trade) {
  const category = classifyTrade(trade);
  const score = scoreTrade(trade);
  const output = getTradeOutput(trade);
  const cost = getTradeCost(trade);
  const price = cost.map((item) => `${item.count} ${item.name}`).join(' + ') || 'unknown cost';
  if (category === 'valuable_enchanted_book') return `${output.displayName || output.name} is high-value, score ${score}, cost ${price}.`;
  if (category === 'unknown_enchanted_book') return `This enchanted book may be useful, but the exact enchantment is unclear. Score ${score}, cost ${price}.`;
  if (category === 'emerald_earning') return `This can earn emeralds from common supplies. Score ${score}, input ${price}.`;
  if (category === 'gear') return `This gear trade may support progression. Score ${score}, cost ${price}.`;
  if (isBadTrade(trade)) return `This trade looks risky or low-value. Score ${score}, cost ${price}.`;
  return `${output.displayName || output.name} trade score ${score}, cost ${price}.`;
}

export default {
  scoreTrade,
  classifyTrade,
  getTradeCost,
  getTradeOutput,
  isValuableTrade,
  isBadTrade,
  isBookTrade,
  isGearTrade,
  isFoodTrade,
  isEmeraldEarningTrade,
  compareTrades,
  rankTrades,
  explainTradeScore
};
