import * as inventory from '../../inventory.js';
import { getBlueprintMaterialList } from './blueprintRegistry.js';

const PLANKS = ['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks'];
const STONE_LIKE = ['cobblestone', 'stone', 'cobbled_deepslate', 'deepslate'];
const DANGEROUS = new Set(['tnt', 'lava', 'lava_bucket', 'fire', 'soul_fire', 'magma_block']);
const VALUABLE = new Set(['diamond_block', 'emerald_block', 'gold_block', 'iron_block', 'netherite_block', 'ancient_debris']);

function normalize(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function count(bot, name) {
  return inventory.countItem(bot, normalize(name));
}

function materialEntries(materials = {}) {
  return Object.entries(materials).map(([name, needed]) => ({ name, needed: Number(needed || 0) }));
}

export function normalizeMaterialName(name) {
  return normalize(name);
}

export function estimateMaterials(blueprint) {
  return countRequiredMaterials(blueprint);
}

export function countRequiredMaterials(blueprint) {
  return getBlueprintMaterialList(blueprint);
}

export function getAvailableMaterials(bot, materialList) {
  const required = Array.isArray(materialList) ? Object.fromEntries(materialList.map((item) => [item.name, item.needed ?? item.count ?? 0])) : materialList;
  const available = {};
  for (const name of Object.keys(required || {})) {
    available[name] = count(bot, name);
  }
  return available;
}

export function compareMaterials(required, available) {
  const missingItems = [];
  const satisfied = [];
  const missing = {};
  for (const { name, needed } of materialEntries(required)) {
    const have = Number(available?.[name] || 0);
    if (have >= needed) satisfied.push({ name, needed, available: have });
    else {
      const missingCount = needed - have;
      missing[name] = missingCount;
      missingItems.push({ name, needed, available: have, missing: missingCount });
    }
  }
  return { ok: missingItems.length === 0, missing, missingItems, available, satisfied };
}

export function hasEnoughMaterials(bot, blueprint) {
  const required = countRequiredMaterials(blueprint);
  const available = getAvailableMaterials(bot, required);
  return { ...compareMaterials(required, available), required, inventory: available };
}

export function explainMissingMaterials(required, available) {
  const comparison = compareMaterials(required, available);
  if (comparison.ok) return 'Materials are ready.';
  return `Missing: ${comparison.missingItems.slice(0, 6).map((item) => `${item.missing} ${item.name}`).join(', ')}.`;
}

export function canUseSubstitution(requiredBlock, availableBlock) {
  const required = normalize(requiredBlock);
  const available = normalize(availableBlock);
  if (DANGEROUS.has(required) || DANGEROUS.has(available) || VALUABLE.has(available)) return false;
  if (PLANKS.includes(required) && PLANKS.includes(available)) return true;
  if (STONE_LIKE.includes(required) && STONE_LIKE.includes(available)) return true;
  return false;
}

export function suggestSubstitutions(bot, blueprint, options = {}) {
  const materialStatus = hasEnoughMaterials(bot, blueprint);
  const substitutions = [];
  for (const item of materialStatus.missingItems || []) {
    const pool = PLANKS.includes(item.name) ? PLANKS : STONE_LIKE.includes(item.name) ? STONE_LIKE : [];
    for (const candidate of pool) {
      if (candidate === item.name) continue;
      const available = count(bot, candidate);
      if (available >= item.missing && canUseSubstitution(item.name, candidate)) {
        substitutions.push({ requiredBlock: item.name, availableBlock: candidate, count: item.missing, requiresApproval: true });
        break;
      }
    }
  }
  return {
    ok: substitutions.length > 0,
    substitutions,
    message: substitutions.length
      ? `Possible substitutions: ${substitutions.map((item) => `${item.availableBlock} for ${item.requiredBlock}`).join(', ')}.`
      : 'No safe substitutions found.'
  };
}

export default {
  estimateMaterials,
  countRequiredMaterials,
  getAvailableMaterials,
  compareMaterials,
  hasEnoughMaterials,
  explainMissingMaterials,
  suggestSubstitutions,
  normalizeMaterialName,
  canUseSubstitution
};
