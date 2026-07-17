import { getGearSummary, getGearUpgradeNeeds } from './gearScore.js';
import { enchantingStatus } from './enchanting.js';
import { anvilStatus } from './anvilSystem.js';
import { potionStatus, carryPotionLoadout } from './potionSystem.js';
import { brewingStatus } from './brewing.js';
import { recordGearStatus, recordUpgradeSuggestion } from './gearMemory.js';

function inventoryItems(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function hasGoldArmorPiece(bot) {
  return inventoryItems(bot).some((item) => item.name.startsWith('golden_') && /_(helmet|chestplate|leggings|boots)$/.test(item.name));
}

function prioritySuggestion(id, title, reason, riskLevel = 'low', command = null) {
  return { id, title, reason, riskLevel, requiresConfirmation: riskLevel !== 'low', suggestedCommand: command };
}

export function gearUpgradeStatus(bot, memory) {
  const summary = getGearSummary(bot);
  const needs = getGearUpgradeNeeds(bot);
  const enchanting = enchantingStatus(bot, memory);
  const anvil = anvilStatus(bot, memory);
  const potions = potionStatus(bot, memory);
  const brewing = brewingStatus(bot, memory);
  const status = {
    ...summary,
    needs,
    enchanting: enchanting.data,
    anvil: anvil.data,
    potions: potions.data,
    brewing: brewing.data
  };
  recordGearStatus(status);
  return {
    ok: true,
    message: `Gear: armor score ${summary.armorScore}, needs ${needs.length ? needs.slice(0, 4).join(', ') : 'no obvious basics'}. XP ${summary.xpLevel}.`,
    evidence: ['gear_status_reported', 'gear_upgrade_status_reported'],
    data: status
  };
}

export function checkGearUpgradeReadiness(bot, memory, target = 'general') {
  const status = gearUpgradeStatus(bot, memory);
  const suggestions = suggestGearUpgrades(bot, memory, { target });
  return {
    ok: true,
    message: `${target} readiness: ${suggestions.data.suggestions[0]?.reason || status.message}`,
    evidence: ['gear_upgrade_status_reported'],
    data: { status: status.data, suggestions: suggestions.data.suggestions }
  };
}

export function reportGearUpgradeNeeds(bot, memory) {
  return gearUpgradeStatus(bot, memory);
}

export function suggestGearUpgrades(bot, memory, context = {}) {
  const status = gearUpgradeStatus(bot, memory);
  const needs = status.data.needs || [];
  const suggestions = [];
  if (needs.includes('weapon')) suggestions.push(prioritySuggestion('get_weapon', 'Get a weapon', 'A real weapon improves survival before mining or Nether prep.', 'low', 'tj craft sword'));
  if (needs.some((need) => ['head', 'torso', 'legs', 'feet'].includes(need))) suggestions.push(prioritySuggestion('armor_basics', 'Improve armor', 'Missing armor slots make combat and mining riskier.', 'low', 'tj armour'));
  if (needs.includes('pickaxe/tool')) suggestions.push(prioritySuggestion('tool_basics', 'Improve tools', 'A better pickaxe makes mining readiness safer.', 'low', 'tj tool status'));
  if ((status.data.enchanting?.lapis || 0) > 0 && (status.data.enchanting?.xpLevel || 0) >= 1 && status.data.enchanting?.tableNearby) {
    suggestions.push(prioritySuggestion('basic_enchant', 'Consider a basic enchant', 'Enchanting is available, but spending XP and lapis needs confirmation.', 'medium', 'tj enchant options'));
  }
  if (status.data.anvil?.anvilNearby && status.data.anvil?.repair?.length) {
    suggestions.push(prioritySuggestion('repair_damaged_gear', 'Repair damaged gear', 'Some useful gear is damaged; anvil work needs confirmation.', 'medium', 'tj anvil status'));
  }
  if (context.target === 'nether' || context.nether) {
    suggestions.unshift(prioritySuggestion('nether_gear_readiness', 'Check Nether gear', 'Nether prep values gold armor, food, blocks, and fire resistance if available.', 'low', 'tj nether gear readiness'));
  }
  if (!suggestions.length) suggestions.push(prioritySuggestion('gear_status', 'Review gear status', 'No urgent upgrade stood out; status checks are still safe.', 'low', 'tj gear status'));
  recordUpgradeSuggestion(suggestions[0]);
  return {
    ok: true,
    message: `Gear upgrade suggestion: ${suggestions[0].title}. ${suggestions[0].reason}`,
    evidence: ['gear_upgrade_status_reported'],
    data: { suggestions: suggestions.slice(0, 5), status: status.data }
  };
}

export function suggestNextGearUpgrade(bot, memory, context = {}) {
  const result = suggestGearUpgrades(bot, memory, context);
  return { ...result, data: { suggestion: result.data.suggestions[0], status: result.data.status } };
}

export function createGearUpgradePlan(bot, memory, target = 'general', options = {}) {
  const suggestions = suggestGearUpgrades(bot, memory, { ...options, target }).data.suggestions;
  const steps = suggestions.slice(0, 4).map((suggestion, index) => ({
    id: `gear_step_${index + 1}`,
    type: suggestion.riskLevel === 'low' ? 'status' : 'manual_confirmed_action',
    name: suggestion.id,
    description: suggestion.title,
    riskLevel: suggestion.riskLevel,
    requiresApproval: true,
    suggestedCommand: suggestion.suggestedCommand
  }));
  return {
    ok: true,
    message: `Drafted a ${target} gear upgrade plan with ${steps.length} step(s).`,
    evidence: ['gear_upgrade_plan_created'],
    data: {
      plan: {
        id: `gear_plan_${Date.now()}`,
        target,
        status: 'draft',
        steps,
        blockers: []
      }
    }
  };
}

export async function executeApprovedGearUpgradeStep(bot, memory, step, context = {}) {
  return {
    ok: false,
    message: 'Gear upgrade execution is only available through specific confirmed enchant/anvil/potion commands in this phase.',
    evidence: ['gear_upgrade_status_reported'],
    data: { step, context: { source: context.source || 'gear_upgrade' } }
  };
}

export function explainGearUpgradePlan(plan) {
  if (!plan) return 'No gear upgrade plan.';
  return `${plan.target || 'gear'} plan: ${(plan.steps || []).map((step) => step.description || step.name).join(', ') || 'no steps'}.`;
}

export function validateGearUpgradePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') errors.push('missing plan');
  if (!Array.isArray(plan?.steps)) errors.push('plan needs steps');
  for (const step of plan?.steps || []) {
    if (step.riskLevel !== 'low' && !step.requiresApproval) errors.push(`${step.id || step.name} needs approval`);
  }
  return { ok: errors.length === 0, errors };
}

export function netherGearReadiness(bot, memory) {
  const status = gearUpgradeStatus(bot, memory);
  const potionLoadout = carryPotionLoadout(bot, { nether: true });
  const armor = status.data.best || {};
  const hasGold = Object.values(armor).some((entry) => entry?.name?.startsWith('golden_')) || hasGoldArmorPiece(bot);
  const ready = Boolean(hasGold && status.data.armorScore >= 8);
  return {
    ok: true,
    message: ready
      ? `Nether gear readiness: decent armor and a gold piece are available. ${potionLoadout.message}`
      : `Nether gear readiness: missing ${hasGold ? 'more armor score' : 'a gold armor piece'}. ${potionLoadout.message}`,
    evidence: ready ? ['nether_gear_ready', 'gear_status_reported'] : ['gear_status_reported'],
    data: { ready, hasGold, status: status.data, potionLoadout: potionLoadout.data }
  };
}
