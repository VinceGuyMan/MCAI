import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_SCHEMA } from './ollama.js';

const capabilities = [
  { action: 'status', category: 'survival', description: 'Report tj status.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'actions', implemented: true },
  { action: 'food_status', category: 'food', description: 'Report hunger and food inventory.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'food', implemented: true },
  { action: 'get_food', category: 'food', description: 'Run the safe food acquisition pipeline.', riskLevel: 'medium', requiresConfirmation: false, requires: ['safe area'], module: 'food', implemented: true },
  { action: 'eat_if_hungry', category: 'food', description: 'Eat safe food if hungry.', riskLevel: 'low', requiresConfirmation: false, requires: ['food'], module: 'food', implemented: true },
  { action: 'cook_food', category: 'food', description: 'Cook raw food with furnace logic.', riskLevel: 'low', requiresConfirmation: false, requires: ['raw food', 'furnace', 'fuel'], module: 'food', implemented: true },
  { action: 'smelt_item', category: 'crafting', description: 'Smelt raw ore into ingots or logs into charcoal.', riskLevel: 'medium', requiresConfirmation: false, requires: ['ore or logs', 'furnace', 'fuel'], module: 'smelting', implemented: true },
  { action: 'smelt_iron', category: 'crafting', description: 'Smelt iron into ingots.', riskLevel: 'medium', requiresConfirmation: false, requires: ['raw iron', 'furnace', 'fuel'], module: 'smelting', implemented: true },
  { action: 'smelt_charcoal', category: 'crafting', description: 'Smelt logs into charcoal.', riskLevel: 'low', requiresConfirmation: false, requires: ['logs', 'furnace', 'fuel'], module: 'smelting', implemented: true },
  { action: 'armor_status', category: 'survival', description: 'Report equipped armour.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'armor', implemented: true },
  { action: 'equip_best_armor', category: 'survival', description: 'Equip best available armour.', riskLevel: 'low', requiresConfirmation: false, requires: ['armour'], module: 'armor', implemented: true },
  { action: 'combat_status', category: 'combat', description: 'Report combat status.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'combat', implemented: true },
  { action: 'threat_scan', category: 'combat', description: 'Scan nearby threats.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'combat', implemented: true },
  { action: 'equip_combat_gear', category: 'combat', description: 'Equip weapon, armour, and shield.', riskLevel: 'low', requiresConfirmation: false, requires: ['gear'], module: 'combat', implemented: true },
  { action: 'flee_threat', category: 'combat', description: 'Retreat from nearby danger.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'combat', implemented: true },
  { action: 'defend_owner', category: 'combat', description: 'Enable owner defense mode.', riskLevel: 'medium', requiresConfirmation: false, requires: ['weapon'], module: 'combat', implemented: true },
  { action: 'guard_base', category: 'combat', description: 'Guard the known home base.', riskLevel: 'medium', requiresConfirmation: false, requires: ['home', 'weapon'], module: 'combat', implemented: true },

  { action: 'craft_item', category: 'crafting', description: 'Craft a specific item using real recipes.', riskLevel: 'medium', requiresConfirmation: false, requires: ['materials'], module: 'crafting', implemented: true },
  { action: 'craft_survival_kit', category: 'crafting', description: 'Craft useful early survival supplies.', riskLevel: 'medium', requiresConfirmation: false, requires: ['wood', 'stone'], module: 'crafting', implemented: true },
  { action: 'craft_basic_tools', category: 'crafting', description: 'Craft full wooden tool set.', riskLevel: 'low', requiresConfirmation: false, requires: ['wood'], module: 'crafting', implemented: true },
  { action: 'craft_stone_tools', category: 'crafting', description: 'Craft full stone tool set if materials exist.', riskLevel: 'low', requiresConfirmation: false, requires: ['cobblestone', 'sticks'], module: 'crafting', implemented: true },
  { action: 'craft_iron_tools', category: 'crafting', description: 'Craft full iron tool set if ingots exist.', riskLevel: 'medium', requiresConfirmation: false, requires: ['iron ingots', 'sticks'], module: 'crafting', implemented: true },
  { action: 'craft_iron_armor', category: 'crafting', description: 'Craft iron armour if ingots exist.', riskLevel: 'medium', requiresConfirmation: false, requires: ['iron ingots'], module: 'armor', implemented: true },
  { action: 'craft_lighting', category: 'crafting', description: 'Craft torches or lighting supplies.', riskLevel: 'low', requiresConfirmation: false, requires: ['coal or charcoal', 'sticks'], module: 'crafting', implemented: true },
  { action: 'craft_storage', category: 'crafting', description: 'Craft storage supplies.', riskLevel: 'low', requiresConfirmation: false, requires: ['planks'], module: 'crafting', implemented: true },
  { action: 'craft_shelter_supplies', category: 'crafting', description: 'Craft early shelter supplies.', riskLevel: 'medium', requiresConfirmation: false, requires: ['materials'], module: 'crafting', implemented: true },

  { action: 'home_status', category: 'base', description: 'Report home base status.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'homeBase', implemented: true },
  { action: 'return_home', category: 'base', description: 'Return to saved home.', riskLevel: 'low', requiresConfirmation: false, requires: ['home'], module: 'homeBase', implemented: true },
  { action: 'build_workstation', category: 'base', description: 'Build deterministic workstation area.', riskLevel: 'medium', requiresConfirmation: false, requires: ['home', 'materials'], module: 'builder', implemented: true },
  { action: 'build_shelter', category: 'base', description: 'Build deterministic small shelter.', riskLevel: 'medium', requiresConfirmation: true, requires: ['home', 'materials'], module: 'builder', implemented: true },
  { action: 'light_home', category: 'base', description: 'Place safe lighting around home.', riskLevel: 'low', requiresConfirmation: false, requires: ['home', 'torches'], module: 'builder', implemented: true },
  { action: 'storage_status', category: 'storage', description: 'Report registered storage.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'storage', implemented: true },
  { action: 'store_items', category: 'storage', description: 'Store excess safe items in registered storage.', riskLevel: 'low', requiresConfirmation: false, requires: ['registered chest'], module: 'storage', implemented: true },
  { action: 'base_maintenance', category: 'base', description: 'Run safe base maintenance.', riskLevel: 'low', requiresConfirmation: false, requires: ['home'], module: 'baseMaintenance', implemented: true },

  { action: 'mining_status', category: 'mining', description: 'Report mining status.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'mining', implemented: true },
  { action: 'collect_resource', category: 'mining', description: 'Thin-core collect wood/stone/coal/iron/dirt/sand/gravel/clay/food.', riskLevel: 'medium', requiresConfirmation: false, requires: ['tools when needed'], module: 'thinCore', implemented: true },
  { action: 'mine_stone', category: 'mining', description: 'Mine a capped safe amount of stone.', riskLevel: 'medium', requiresConfirmation: false, requires: ['pickaxe'], module: 'mining', implemented: true },
  { action: 'mine_coal', category: 'mining', description: 'Mine visible reachable coal.', riskLevel: 'medium', requiresConfirmation: false, requires: ['pickaxe', 'food'], module: 'mining', implemented: true },
  { action: 'mine_iron', category: 'mining', description: 'Mine visible reachable iron.', riskLevel: 'medium', requiresConfirmation: false, requires: ['stone pickaxe or better', 'food'], module: 'mining', implemented: true },
  { action: 'resource_run_iron', category: 'mining', description: 'Gather a capped amount of iron.', riskLevel: 'medium', requiresConfirmation: false, requires: ['pickaxe'], module: 'resourceRuns', implemented: true },
  { action: 'resource_run_wood', category: 'base', description: 'Gather a capped amount of wood.', riskLevel: 'low', requiresConfirmation: false, requires: ['safe trees'], module: 'resourceRuns', implemented: true },
  { action: 'resource_run_stone', category: 'mining', description: 'Gather a capped amount of stone.', riskLevel: 'medium', requiresConfirmation: false, requires: ['pickaxe'], module: 'resourceRuns', implemented: true },
  { action: 'resource_run_coal', category: 'mining', description: 'Gather a capped amount of coal.', riskLevel: 'medium', requiresConfirmation: false, requires: ['pickaxe'], module: 'resourceRuns', implemented: true },

  { action: 'farming_status', category: 'farming', description: 'Report farm status.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'farming', implemented: true },
  { action: 'create_farm', category: 'farming', description: 'Create a small registered crop farm.', riskLevel: 'medium', requiresConfirmation: false, requires: ['home', 'seeds'], module: 'farming', implemented: true },
  { action: 'maintain_farm', category: 'farming', description: 'Harvest mature crops and replant.', riskLevel: 'low', requiresConfirmation: false, requires: ['farm'], module: 'farming', implemented: true },
  { action: 'create_animal_pen', category: 'animals', description: 'Create a small animal pen.', riskLevel: 'medium', requiresConfirmation: false, requires: ['home', 'fences'], module: 'animalPens', implemented: true },

  { action: 'map_status', category: 'exploration', description: 'Report map memory status.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'mapMemory', implemented: true },
  { action: 'scan_area', category: 'exploration', description: 'Scan nearby visible resources and danger.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'worldScanner', implemented: true },
  { action: 'explore_around_home', category: 'exploration', description: 'Explore a small area around home.', riskLevel: 'medium', requiresConfirmation: false, requires: ['home', 'food'], module: 'exploration', implemented: true },
  { action: 'remember_location', category: 'exploration', description: 'Remember current location as a waypoint.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'mapMemory', implemented: true },
  { action: 'go_to_waypoint', category: 'exploration', description: 'Travel to a known waypoint.', riskLevel: 'medium', requiresConfirmation: false, requires: ['waypoint'], module: 'waypointNavigator', implemented: true },

  { action: 'nether_status', category: 'nether', description: 'Report Nether readiness, portal memory, and supplies.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'netherPrep', implemented: true },
  { action: 'nether_checklist', category: 'nether', description: 'Check required and recommended Nether supplies.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'netherPrep', implemented: true },
  { action: 'prepare_nether', category: 'nether', description: 'Prepare safe Nether supplies using existing systems.', riskLevel: 'medium', requiresConfirmation: false, requires: ['food', 'blocks', 'gear'], module: 'netherPrep', implemented: true },
  { action: 'prepare_nether_food', category: 'nether', description: 'Prepare or gather safe food for Nether entry.', riskLevel: 'medium', requiresConfirmation: false, requires: ['food system'], module: 'netherPrep', implemented: true },
  { action: 'prepare_nether_blocks', category: 'nether', description: 'Gather solid blocks for Nether safety.', riskLevel: 'medium', requiresConfirmation: false, requires: ['resource runs'], module: 'netherPrep', implemented: true },
  { action: 'prepare_nether_gear', category: 'nether', description: 'Prepare and inspect Nether gear.', riskLevel: 'low', requiresConfirmation: false, requires: ['gear'], module: 'netherGear', implemented: true },
  { action: 'prepare_nether_portal_supplies', category: 'nether', description: 'Prepare flint and steel and portal supplies.', riskLevel: 'medium', requiresConfirmation: false, requires: ['iron', 'flint', 'obsidian'], module: 'netherPrep', implemented: true },
  { action: 'equip_nether_gear', category: 'nether', description: 'Equip armour, shield, weapon, and a gold armour piece if available.', riskLevel: 'low', requiresConfirmation: false, requires: ['armour'], module: 'netherGear', implemented: true },
  { action: 'portal_status', category: 'nether', description: 'Report nearby and remembered portal state.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'portalManager', implemented: true },
  { action: 'build_portal', category: 'nether', description: 'Build a small Nether portal frame near home if obsidian exists.', riskLevel: 'medium', requiresConfirmation: false, requires: ['home', 'obsidian'], module: 'portalManager', implemented: true },
  { action: 'light_portal', category: 'nether', description: 'Light a known Nether portal with confirmation.', riskLevel: 'high', requiresConfirmation: true, requires: ['portal', 'flint_and_steel'], module: 'portalManager', implemented: true },
  { action: 'safe_nether_entry', category: 'nether', description: 'Enter the Nether, remember the return portal, scan danger, and return if unsafe.', riskLevel: 'high', requiresConfirmation: true, requires: ['ready checklist', 'portal'], module: 'netherScout', implemented: true },
  { action: 'scan_nether', category: 'nether', description: 'Scan Nether danger near the portal.', riskLevel: 'medium', requiresConfirmation: false, requires: ['in Nether'], module: 'netherSafety', implemented: true },
  { action: 'return_from_nether', category: 'nether', description: 'Return through the remembered Nether portal.', riskLevel: 'high', requiresConfirmation: false, requires: ['nether portal memory'], module: 'portalManager', implemented: true },
  { action: 'nether_memory_status', category: 'nether', description: 'Report saved Nether portals and danger zones.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'netherMemory', implemented: true },

  { action: 'dialogue_status', category: 'dialogue', description: 'Report dialogue mode, banter state, and memory count.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'dialogue', implemented: true },
  { action: 'personality_status', category: 'dialogue', description: 'Explain tj personality and honesty boundaries.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'personality', implemented: true },
  { action: 'conversation_memory_status', category: 'dialogue', description: 'Report saved conversation memory facts.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'conversationMemory', implemented: true },
  { action: 'answer_dialogue', category: 'dialogue', description: 'Give a short dialogue reply without executing actions.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'dialogue', implemented: true },
  { action: 'ask_clarification', category: 'dialogue', description: 'Ask a short clarification question.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'dialogue', implemented: true },

  { action: 'create_goal', category: 'planning', description: 'Create a long-term goal.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'goals_status', category: 'planning', description: 'Report goal status.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'list_goals', category: 'planning', description: 'List active goals.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'create_goal_from_template', category: 'planning', description: 'Create a goal from a safe template.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goalTemplates', implemented: true },
  { action: 'start_goal', category: 'planning', description: 'Start an approved goal.', riskLevel: 'low', requiresConfirmation: false, requires: ['goal'], module: 'goals', implemented: true },
  { action: 'pause_goal', category: 'planning', description: 'Pause an active goal.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'resume_goal', category: 'planning', description: 'Resume a paused goal.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'cancel_goal', category: 'planning', description: 'Cancel a goal.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'complete_goal', category: 'planning', description: 'Mark a goal complete with evidence.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'fail_goal', category: 'planning', description: 'Mark a goal failed.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'archive_goal', category: 'planning', description: 'Archive a goal.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'set_goal_priority', category: 'planning', description: 'Set goal priority.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'next_goal_step', category: 'planning', description: 'Explain the next goal step.', riskLevel: 'low', requiresConfirmation: false, requires: ['goal'], module: 'goals', implemented: true },
  { action: 'execute_next_goal_step', category: 'planning', description: 'Execute one safe goal step.', riskLevel: 'medium', requiresConfirmation: false, requires: ['approved goal'], module: 'goalExecutor', implemented: true },
  { action: 'approve_goal', category: 'planning', description: 'Approve a pending goal.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'reject_goal', category: 'planning', description: 'Reject a pending goal.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'goals', implemented: true },
  { action: 'suggest_goals', category: 'planning', description: 'Suggest practical goals.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'advisor', implemented: true },
  { action: 'explain_goal', category: 'planning', description: 'Explain current plan.', riskLevel: 'low', requiresConfirmation: false, requires: [], module: 'planReview', implemented: true }
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleFiles = {
  actions: 'actions.js',
  food: 'food.js',
  smelting: 'smelting.js',
  armor: 'armor.js',
  combat: 'combat.js',
  crafting: 'crafting.js',
  homeBase: 'homeBase.js',
  builder: 'builder.js',
  storage: 'storage.js',
  baseMaintenance: 'baseMaintenance.js',
  mining: 'mining.js',
  resourceRuns: 'resourceRuns.js',
  farming: 'farming.js',
  animalPens: 'animalPens.js',
  mapMemory: 'mapMemory.js',
  worldScanner: 'worldScanner.js',
  exploration: 'exploration.js',
  waypointNavigator: 'waypointNavigator.js',
  netherPrep: 'netherPrep.js',
  netherGear: 'netherGear.js',
  portalManager: 'portalManager.js',
  netherScout: 'netherScout.js',
  netherSafety: 'netherSafety.js',
  netherMemory: 'netherMemory.js',
  dialogue: 'dialogue.js',
  personality: 'personality.js',
  conversationMemory: 'conversationMemory.js',
  goals: 'goals.js',
  goalTemplates: 'goalTemplates.js',
  goalExecutor: 'goalExecutor.js',
  advisor: 'advisor.js',
  planReview: 'planReview.js'
};

function schemaActionNames() {
  return ACTION_SCHEMA?.properties?.actions?.items?.properties?.action?.enum || [];
}

const capabilitySeed = new Map(capabilities.map((capability) => [capability.action, capability]));
for (const action of schemaActionNames()) {
  if (!capabilitySeed.has(action)) {
    capabilitySeed.set(action, {
      action,
      category: 'unclassified',
      description: 'Action appears in the planner schema but is not accepted for 1.0 goal execution.',
      riskLevel: action === 'none' ? 'low' : 'high',
      requiresConfirmation: true,
      requires: [],
      module: 'unknown',
      implemented: false
    });
  }
}

const allCapabilities = [...capabilitySeed.values()];
const byAction = new Map(allCapabilities.map((capability) => [capability.action, capability]));

export function getCapabilities() {
  return allCapabilities.map((capability) => ({ ...capability, requires: [...capability.requires] }));
}

export function hasCapability(actionName) {
  return byAction.has(String(actionName || ''));
}

export function getCapability(actionName) {
  const capability = byAction.get(String(actionName || ''));
  return capability ? { ...capability, requires: [...capability.requires] } : null;
}

export function listCapabilitiesByCategory(category) {
  return getCapabilities().filter((capability) => capability.category === category);
}

export function getCapabilityRequirements(actionName) {
  return getCapability(actionName)?.requires || [];
}

export function getCapabilityRisk(actionName) {
  return getCapability(actionName)?.riskLevel || 'high';
}

export function getCapabilityDescription(actionName) {
  return getCapability(actionName)?.description || 'Unsupported action.';
}

export function validateCapabilitiesAgainstActions(actions = {}) {
  const missing = [];
  for (const capability of allCapabilities) {
    if (!capability.implemented) continue;
    if (typeof actions[capability.action] !== 'function') missing.push({ action: capability.action, module: capability.module });
  }
  return { ok: missing.length === 0, missing };
}

export function validateCapabilitiesAgainstModules() {
  const missing = [];
  for (const capability of allCapabilities) {
    if (!capability.implemented) continue;
    const file = moduleFiles[capability.module];
    if (!file) continue;
    if (!fs.existsSync(path.join(__dirname, file))) missing.push({ action: capability.action, module: capability.module, file });
  }
  return { ok: missing.length === 0, missing };
}

export function listUnimplementedCapabilities() {
  return getCapabilities().filter((capability) => !capability.implemented);
}

export function listRiskyCapabilities() {
  return getCapabilities().filter((capability) => capability.requiresConfirmation || ['medium', 'high'].includes(capability.riskLevel));
}

export function listCapabilitiesFor1_0() {
  return getCapabilities().filter((capability) => capability.implemented);
}
