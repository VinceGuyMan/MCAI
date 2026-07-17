import { countItem } from './inventory.js';
import { getGoalProgress, getNextGoalStep } from './goals.js';

function hasAny(bot, names) {
  return names.some((name) => countItem(bot, name) > 0);
}

export function collectStepEvidence(bot, memory, step, perception = {}) {
  const action = step?.action || '';
  const mem = memory.get();
  const evidence = {
    action,
    at: Date.now(),
    inventory: perception.inventory || null,
    position: perception.position || null
  };

  if (action === 'food_status' || action === 'get_food' || action === 'eat_if_hungry' || action === 'cook_food') {
    evidence.food = bot.food ?? perception.food;
    evidence.hasFood = perception.hasFood || hasAny(bot, ['cooked_beef', 'cooked_porkchop', 'bread', 'apple', 'carrot']);
  }
  if (action === 'craft_lighting' || action === 'light_home') evidence.torches = countItem(bot, 'torch');
  if (action === 'mining_status' || action.startsWith('mine_')) evidence.bestPickaxe = perception.bestPickaxe || null;
  if (action === 'home_status' || action === 'return_home') evidence.nearHome = perception.nearHome || false;
  if (action === 'storage_status' || action === 'store_items') evidence.storageChests = mem.knownStorageChests?.length || 0;
  if (action === 'farming_status' || action === 'create_farm' || action === 'maintain_farm') evidence.farms = mem.knownFarms?.length || 0;
  if (action === 'combat_status' || action === 'equip_combat_gear') evidence.bestWeapon = perception.bestWeapon || null;
  return evidence;
}

export function checkStepCompletion(bot, memory, _goal, step, perception = {}) {
  if (!step) return { complete: false, reason: 'no step' };
  const action = step.action;
  const evidence = collectStepEvidence(bot, memory, step, perception);

  if (step.status === 'completed') return { complete: true, evidence };
  if (action === 'return_home') return { complete: Boolean(perception.nearHome), evidence, reason: perception.nearHome ? 'near home' : 'not near home yet' };
  if (action === 'create_farm') return { complete: (memory.get().knownFarms?.length || 0) > 0, evidence };
  if (action === 'create_animal_pen') return { complete: (memory.get().knownAnimalPens?.length || 0) > 0, evidence };
  if (action === 'light_home' || action === 'craft_lighting') return { complete: countItem(bot, 'torch') > 0 || (memory.get().knownTorchPositions?.length || 0) > 0, evidence };
  if (action === 'craft_basic_tools' || action === 'craft_stone_tools') return { complete: Boolean(perception.bestPickaxe || perception.bestAxe), evidence };
  if (action === 'equip_best_armor' || action === 'equip_combat_gear') return { complete: (perception.armorScore || 0) > 0 || Boolean(perception.bestWeapon), evidence };
  if (action === 'mine_iron') return { complete: hasAny(bot, ['raw_iron', 'iron_ingot', 'iron_ore']), evidence };
  if (action === 'mine_coal' || action === 'resource_run_coal') return { complete: countItem(bot, 'coal') > 0, evidence };
  if (action === 'mine_stone' || action === 'resource_run_stone') return { complete: hasAny(bot, ['cobblestone', 'stone', 'deepslate']), evidence };
  if (action === 'resource_run_wood') return { complete: (perception.logCount || 0) > 0 || hasAny(bot, ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log']), evidence };
  if (action === 'smelt_item') return { complete: hasAny(bot, ['iron_ingot', 'gold_ingot', 'copper_ingot']), evidence };

  return { complete: step.status === 'completed', evidence, reason: 'action result is primary evidence' };
}

export function calculateGoalProgress(goal) {
  return getGoalProgress(goal);
}

export function updateProgressFromEvidence(goal, evidence) {
  return {
    ...goal,
    evidence: [evidence, ...(goal.evidence || [])].slice(0, 20),
    progressPercent: calculateGoalProgress(goal),
    updatedAt: Date.now()
  };
}

export function checkGoalProgress(bot, memory, goal, perception = {}) {
  const next = getNextGoalStep(goal);
  return {
    goalId: goal?.id,
    progressPercent: calculateGoalProgress(goal),
    nextStep: next,
    nextStepCompletion: next ? checkStepCompletion(bot, memory, goal, next, perception) : { complete: true }
  };
}

export function isGoalBlocked(goal) {
  return goal?.status === 'blocked' || (goal?.blockers || []).length > 0 || (goal?.steps || []).some((step) => step.status === 'blocked');
}

export function getBlockerReason(goal) {
  return goal?.blockers?.[0]?.reason || goal?.steps?.find((step) => step.status === 'blocked')?.lastError || null;
}

export function reportProgress(goal) {
  const next = getNextGoalStep(goal);
  return `${goal?.name || 'Goal'}: ${calculateGoalProgress(goal)}% complete. Next: ${next?.description || 'none'}.`;
}
