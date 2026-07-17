import { getSkill, validateSkillDefinitions } from './skillRegistry.js';
import { isSkillOnCooldown, loadSkillMemory } from './skillMemory.js';
import { getEvidenceDefinition } from './progressEvidence.js';

export const MILESTONE_2_RUNNER_ALLOWLIST = [
  'status',
  'inventory_summary',
  'home_status',
  'mining_status',
  'farming_status',
  'nether_checklist',
  'skills_status',
  'food_status',
  'progression_status',
  'armor_status',
  'storage_status',
  'map_status',
  'goals_status',
  'combat_status',
  'gear_status',
  'suggest_gear_upgrades',
  'enchant_status',
  'anvil_status',
  'potion_status',
  'brewing_status',
  'nether_gear_readiness',
  'villager_status',
  'scan_villagers',
  'village_status',
  'trade_status',
  'economy_status',
  'suggest_trades',
  'blueprint_status',
  'list_blueprints',
  'blueprint_preview',
  'blueprint_materials',
  'schematic_status',
  'server_bridge_status',
  'bridge_health',
  'bridge_recent_events',
  'bridge_recent_deaths',
  'bridge_recent_advancements',
  'bridge_regions'
];

export const MILESTONE_5_CURRICULUM_EXECUTION_ALLOWLIST = [
  'status',
  'inventory_summary',
  'home_status',
  'food_status',
  'progression_status',
  'armor_status',
  'storage_status',
  'mining_status',
  'farming_status',
  'map_status',
  'goals_status',
  'combat_status',
  'nether_checklist',
  'skills_status',
  'gear_status',
  'suggest_gear_upgrades',
  'enchant_status',
  'anvil_status',
  'potion_status',
  'brewing_status',
  'nether_gear_readiness',
  'villager_status',
  'village_status',
  'trade_status',
  'economy_status',
  'suggest_trades',
  'blueprint_status',
  'list_blueprints',
  'blueprint_preview',
  'blueprint_materials',
  'schematic_status',
  'server_bridge_status',
  'bridge_health',
  'bridge_recent_events',
  'bridge_recent_deaths',
  'bridge_recent_advancements',
  'bridge_regions'
];

const WORLD_MUTATING_SKILL_PATTERNS = [
  /^mine_/,
  /^build_/,
  /^blueprint_build/,
  /^blueprint_continue_build/,
  /^create_/,
  /^maintain_/,
  /^harvest_/,
  /^replant_/,
  /^plant_/,
  /^lure_/,
  /^breed_/,
  /^feed_/,
  /^store_/,
  /^withdraw_/,
  /^go_to_/,
  /^scout_/,
  /^explore_/,
  /^light_/,
  /^enter_/,
  /^safe_nether_entry$/,
  /^engage_/,
  /^guard_/,
  /^defend_/,
  /^return_from_nether$/,
  /^enchant_/,
  /^repair_/,
  /^combine_/,
  /^apply_book_/,
  /^use_potion$/,
  /^brew_/
];

const RAW_ACTION_PATTERNS = [
  /\bbot\./i,
  /\bpathfinder\b/i,
  /\bdig\b/i,
  /\battack\b/i,
  /\bplaceBlock\b/i,
  /\bopenChest\b/i,
  /\bopenFurnace\b/i
];

const FOOD_NAMES = new Set([
  'apple',
  'baked_potato',
  'bread',
  'carrot',
  'cooked_beef',
  'cooked_chicken',
  'cooked_cod',
  'cooked_mutton',
  'cooked_porkchop',
  'cooked_rabbit',
  'cooked_salmon',
  'potato'
]);

function stateFromMemory(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function normalizeSkill(skillOrName) {
  if (typeof skillOrName === 'string') return getSkill(skillOrName);
  if (skillOrName?.name) return skillOrName;
  return null;
}

function inventoryItems(bot) {
  try {
    return bot?.inventory?.items?.() || [];
  } catch {
    return [];
  }
}

function countMatching(bot, matcher) {
  return inventoryItems(bot)
    .filter((item) => matcher(item.name))
    .reduce((sum, item) => sum + (item.count || 0), 0);
}

function hasAny(bot, names) {
  const wanted = new Set(names);
  return inventoryItems(bot).some((item) => wanted.has(item.name));
}

function hasPickaxe(bot) {
  return inventoryItems(bot).some((item) => item.name.endsWith('_pickaxe'));
}

function hasStonePickaxeOrBetter(bot) {
  return hasAny(bot, ['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']);
}

function hasIronPickaxeOrBetter(bot) {
  return hasAny(bot, ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']);
}

function hasFood(bot) {
  return inventoryItems(bot).some((item) => FOOD_NAMES.has(item.name));
}

function hasHome(memoryState) {
  return Boolean(memoryState.homeBasePosition);
}

function pendingMatches(memoryState, skill, keys) {
  const now = Date.now();
  const direct = memoryState.pendingSkillConfirmation;
  if (direct?.skillName === skill.name && now < (direct.expiresAt || 0)) return true;

  const generic = memoryState.pendingConfirmation;
  if (keys.includes(generic) && now < (memoryState.pendingConfirmationExpiresAt || 0)) return true;

  const mining = memoryState.pendingMiningConfirmation;
  if (mining && keys.includes(mining.action || mining.type || mining) && now < (mining.expiresAt || 0)) return true;

  const nether = memoryState.pendingNetherConfirmation;
  if (nether && keys.includes(nether.action || nether.type || nether) && now < (memoryState.pendingNetherConfirmationExpiresAt || nether.expiresAt || 0)) return true;

  const combat = memoryState.pendingCombatConfirmation;
  if (combat && keys.includes(combat.action || combat.type || combat) && now < (combat.expiresAt || 0)) return true;

  const dialogue = memoryState.pendingClearConversationMemoryConfirmation;
  if (skill.name === 'clear_conversation_memory' && dialogue && now < (dialogue.expiresAt || 0)) return true;

  return false;
}

function confirmationKeys(skill) {
  const keys = [skill.name, skill.action];
  if (skill.name === 'light_portal') keys.push('portal_lighting');
  if (skill.name === 'safe_nether_entry') keys.push('nether_entry', 'nether_scout');
  if (skill.name === 'mine_diamond') keys.push('diamond_mining');
  if (skill.name === 'deep_mining') keys.push('deep_mining');
  if (skill.name === 'cave_mining' || skill.name === 'cave_exploration') keys.push('caving', 'cave_exploration');
  if (skill.name === 'pvp_attack') keys.push('pvp_attack', 'pvp');
  if (skill.name === 'engage_hostile') keys.push('dangerous_combat');
  if (skill.name === 'craft_diamond_armor') keys.push('diamond_armor');
  return keys;
}

export function validateSkill(skill) {
  if (!skill) return { ok: false, reason: 'unknown skill' };
  const registry = validateSkillDefinitions();
  if (!registry.ok) return { ok: false, reason: `skill registry invalid: ${registry.errors[0]}` };

  const definition = getSkill(skill.name || skill.action);
  if (!definition) return { ok: false, reason: `unknown skill: ${skill.name || skill.action || 'unnamed'}` };
  if (!definition.implemented) return { ok: false, reason: `${definition.name} is not implemented` };
  if (!definition.action) return { ok: false, reason: `${definition.name} has no action` };
  if (definition.category === 'dialogue' && RAW_ACTION_PATTERNS.some((pattern) => pattern.test(definition.action))) {
    return { ok: false, reason: 'dialogue skills cannot execute raw gameplay actions' };
  }

  return { ok: true, skill: definition };
}

export function validateEvidenceNames(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill', errors: ['unknown skill'] };
  const errors = [];
  if (!Array.isArray(skill.successEvidence) || skill.successEvidence.length === 0) errors.push(`${skill.name} needs successEvidence`);
  for (const evidenceName of skill.successEvidence || []) {
    if (!getEvidenceDefinition(evidenceName)) errors.push(`${skill.name} references unknown evidence ${evidenceName}`);
  }
  return { ok: errors.length === 0, errors, reason: errors[0] || '' };
}

export function validateRequiredEvidence(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill' };
  const errors = [];
  for (const evidenceName of skill.successEvidence || []) {
    const definition = getEvidenceDefinition(evidenceName);
    if (!definition) errors.push(`${evidenceName} is unknown`);
    if (definition && !definition.implemented && MILESTONE_2_RUNNER_ALLOWLIST.includes(skill.name)) {
      errors.push(`${skill.name} depends on future evidence ${evidenceName}`);
    }
  }
  return { ok: errors.length === 0, errors, reason: errors[0] || '' };
}

export function validateSkillEvidenceDefinitions(skillOrName) {
  const names = validateEvidenceNames(skillOrName);
  if (!names.ok) return names;
  return validateRequiredEvidence(skillOrName);
}

export function explainEvidenceRequirements(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return ['Unknown skill.'];
  return (skill.successEvidence || []).map((evidenceName) => {
    const definition = getEvidenceDefinition(evidenceName);
    return definition
      ? `${evidenceName}: ${definition.implemented ? definition.verificationMode : 'future'}`
      : `${evidenceName}: unknown`;
  });
}

export function validateSkillPreconditions(bot, memory, skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill' };

  const memoryState = stateFromMemory(memory);
  const blockers = [];
  const config = bot?.mcaiConfig || {};

  for (const precondition of skill.preconditions || []) {
    switch (precondition) {
      case 'owner_visible':
        if (!bot?.players?.[config.ownerUsername]?.entity) blockers.push('ModVinny is not visible');
        break;
      case 'has_home':
        if (!hasHome(memoryState)) blockers.push('home is not set');
        break;
      case 'has_home_or_owner_nearby':
        if (!hasHome(memoryState) && !bot?.players?.[config.ownerUsername]?.entity) blockers.push('home is not set and ModVinny is not visible');
        break;
      case 'has_pickaxe':
        if (bot && !hasPickaxe(bot)) blockers.push('no pickaxe available');
        break;
      case 'has_stone_pickaxe_or_better':
        if (bot && !hasStonePickaxeOrBetter(bot)) blockers.push('stone pickaxe or better required');
        break;
      case 'has_iron_pickaxe_or_better':
        if (bot && !hasIronPickaxeOrBetter(bot)) blockers.push('iron pickaxe or better required');
        break;
      case 'has_food':
        if (bot && !hasFood(bot)) blockers.push('food required');
        break;
      case 'has_torches':
        if (bot && countMatching(bot, (name) => name === 'torch') <= 0) blockers.push('torches required');
        break;
      case 'has_logs':
        if (bot && countMatching(bot, (name) => name.endsWith('_log')) <= 0) blockers.push('logs required');
        break;
      case 'has_planks':
        if (bot && countMatching(bot, (name) => name.endsWith('_planks')) <= 0) blockers.push('planks required');
        break;
      case 'has_cobblestone':
        if (bot && countMatching(bot, (name) => name === 'cobblestone') <= 0) blockers.push('cobblestone required');
        break;
      case 'has_coal_or_charcoal':
        if (bot && !hasAny(bot, ['coal', 'charcoal'])) blockers.push('coal or charcoal required');
        break;
      case 'has_sticks':
        if (bot && countMatching(bot, (name) => name === 'stick') <= 0) blockers.push('sticks required');
        break;
      case 'has_obsidian':
        if (bot && countMatching(bot, (name) => name === 'obsidian') < 10) blockers.push('obsidian required');
        break;
      case 'has_flint_and_steel':
        if (bot && !hasAny(bot, ['flint_and_steel'])) blockers.push('flint and steel required');
        break;
      case 'overworld':
        if (bot && /nether|end/i.test(String(bot.game?.dimension || 'overworld'))) blockers.push('must be in the Overworld');
        break;
      case 'in_nether':
        if (bot && !/nether/i.test(String(bot.game?.dimension || ''))) blockers.push('must be in the Nether');
        break;
      default:
        break;
    }
  }

  return blockers.length ? { ok: false, reason: blockers.join('; '), blockers } : { ok: true, blockers: [] };
}

export function validateSkillRisk(bot, memory, skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill' };

  const config = bot?.mcaiConfig || {};
  const memoryState = stateFromMemory(memory);

  if (skill.name === 'pvp_attack' || /pvp|attack_player/i.test(skill.name)) {
    if (!config.allowPvp) return { ok: false, reason: 'PVP is disabled' };
  }

  if (skill.name === 'mine_diamond' && !config.allowDiamondMining && !pendingMatches(memoryState, skill, confirmationKeys(skill))) {
    return { ok: false, reason: 'diamond mining requires confirmation' };
  }

  if (skill.name === 'deep_mining' && !config.allowDeepMining && !pendingMatches(memoryState, skill, confirmationKeys(skill))) {
    return { ok: false, reason: 'deep mining requires confirmation' };
  }

  if ((skill.name === 'cave_mining' || skill.name === 'cave_exploration') && !config.allowCaving && !config.allowCaveExploration && !pendingMatches(memoryState, skill, confirmationKeys(skill))) {
    return { ok: false, reason: 'caving requires confirmation' };
  }

  if (skill.name === 'nether_exploration' && !config.allowNetherExploration) return { ok: false, reason: 'Nether exploration is disabled' };
  if (skill.name === 'nether_mining' && !config.allowNetherMining) return { ok: false, reason: 'Nether mining is disabled' };
  if (skill.name === 'fortress_search' && !config.allowFortressSearch) return { ok: false, reason: 'fortress search is disabled' };
  if (skill.name === 'bastion_search' && !config.allowBastionSearch) return { ok: false, reason: 'bastion search is disabled' };

  if (skill.category === 'dialogue' && RAW_ACTION_PATTERNS.some((pattern) => pattern.test(`${skill.name} ${skill.action}`))) {
    return { ok: false, reason: 'dialogue skills cannot execute raw actions' };
  }

  return { ok: true };
}

export function validateSkillConfirmation(bot, memory, skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill' };
  if (!skill.requiresConfirmation) return { ok: true };

  const memoryState = stateFromMemory(memory);
  if (pendingMatches(memoryState, skill, confirmationKeys(skill))) return { ok: true, confirmed: true };

  return { ok: false, reason: `${skill.name} requires confirmation`, requiresConfirmation: true };
}

export function validateSkillRunnerAllowlist(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill' };
  if (!MILESTONE_2_RUNNER_ALLOWLIST.includes(skill.name)) {
    return { ok: false, reason: 'This skill is registered, but not enabled for the Milestone 2 runner yet.' };
  }
  return { ok: true };
}

export function validateSkillCooldown(skillOrName, skillMemory = null, context = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill' };
  if (context.force) return { ok: true };

  const memory = skillMemory || loadSkillMemory();
  const stats = memory.skills?.[skill.name];
  if (stats?.cooldownUntil > Date.now()) {
    return { ok: false, reason: `${skill.name} is on cooldown for ${Math.ceil((stats.cooldownUntil - Date.now()) / 1000)}s` };
  }
  if (isSkillOnCooldown(skill.name)) {
    return { ok: false, reason: `${skill.name} is on cooldown` };
  }
  return { ok: true };
}

export function validateSkillTimeout(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill' };
  if (!Number.isFinite(skill.maxRuntimeMs) || skill.maxRuntimeMs <= 0) return { ok: false, reason: `${skill.name} has invalid maxRuntimeMs` };
  return { ok: true };
}

export function validateSkillOwnerPermission(context = {}, skillOrName = null) {
  const skill = skillOrName ? normalizeSkill(skillOrName) : null;
  if (skill && !isSkillOwnerOnly(skill)) return { ok: true };

  const owner = context.ownerUsername || context.config?.ownerUsername || context.bot?.mcaiConfig?.ownerUsername || 'ModVinny';
  if (!context.sender && !context.username && context.isOwner === undefined) return { ok: true };
  if (context.isOwner === true || context.sender === owner || context.username === owner) return { ok: true };
  return { ok: false, reason: 'Only ModVinny can run skills.' };
}

export function validateSkillRiskConfirmation(bot, memory, skillOrName, context = {}) {
  if (context.confirmed || context.forceConfirmed) return { ok: true, confirmed: true };
  return validateSkillConfirmation(bot, memory, skillOrName);
}

export function validateSkillCanRun(bot, memory, skillOrName, args = {}, context = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: `unknown skill: ${String(skillOrName || '') || 'missing'}` };

  const base = validateSkill(skill);
  if (!base.ok) return base;
  const evidence = validateSkillEvidenceDefinitions(skill);
  if (!evidence.ok) return evidence;
  if (args.cancelled || bot?.mcaiCancellation?.isCancelled?.() || context.cancellation?.isCancelled?.()) return { ok: false, reason: 'cancelled' };

  const ownerPermission = validateSkillOwnerPermission({ ...context, bot }, skill);
  if (!ownerPermission.ok) return ownerPermission;

  if (context.runner) {
    const allowlist = validateSkillRunnerAllowlist(skill);
    if (!allowlist.ok) return allowlist;
  }

  const risk = validateSkillRisk(bot, memory, skill);
  if (!risk.ok) return risk;

  const confirmation = args.confirmed ? { ok: true, confirmed: true } : validateSkillRiskConfirmation(bot, memory, skill, context);
  if (!confirmation.ok) return confirmation;

  if (context.runner) {
    const cooldown = validateSkillCooldown(skill, context.skillMemory, context);
    if (!cooldown.ok) return cooldown;
    const timeout = validateSkillTimeout(skill);
    if (!timeout.ok) return timeout;
  }

  const preconditions = validateSkillPreconditions(bot, memory, skill);
  if (!preconditions.ok) return preconditions;

  return { ok: true, skill };
}

export function explainSkillBlockers(bot, memory, skillOrName, args = {}, context = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return [`Unknown skill: ${String(skillOrName || '') || 'missing'}`];

  const blockers = [];
  for (const check of [
    validateSkill(skill),
    validateSkillOwnerPermission({ ...context, bot }, skill),
    context.runner ? validateSkillRunnerAllowlist(skill) : { ok: true },
    validateSkillRisk(bot, memory, skill),
    args.confirmed ? { ok: true } : validateSkillRiskConfirmation(bot, memory, skill, context),
    context.runner ? validateSkillCooldown(skill, context.skillMemory, context) : { ok: true },
    context.runner ? validateSkillTimeout(skill) : { ok: true },
    validateSkillPreconditions(bot, memory, skill)
  ]) {
    if (!check.ok) blockers.push(check.reason);
  }
  return blockers;
}

export function isSkillSafeForAutonomy(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill || !skill.implemented) return false;
  if (skill.requiresConfirmation || skill.riskLevel !== 'low') return false;
  if (['combat', 'nether', 'dialogue'].includes(skill.category)) return false;
  return true;
}

export function isSkillOwnerOnly(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return true;
  return !['help', 'answer_dialogue', 'ask_clarification', 'personality_status'].includes(skill.name);
}

export function validateSkillForSuggestion(bot, memory, skillOrName, context = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill', blockers: ['unknown skill'] };

  const blockers = [];
  if (!skill.implemented) blockers.push('not implemented');
  const evidence = validateSkillEvidenceDefinitions(skill);
  if (!evidence.ok) blockers.push(evidence.reason || 'invalid evidence definitions');
  const risk = validateSkillRisk(bot, memory, skill);
  if (!risk.ok) blockers.push(risk.reason);
  if (skill.requiresConfirmation) blockers.push('requires confirmation');
  if (skill.riskLevel === 'high') blockers.push('high risk');
  if (context.runnerOnly !== false && !MILESTONE_2_RUNNER_ALLOWLIST.includes(skill.name)) blockers.push('not enabled in skillRunner');
  const cooldown = validateSkillCooldown(skill, context.skillMemory, context);
  if (!cooldown.ok) blockers.push(cooldown.reason);
  if (context.unsafe) blockers.push('current context is unsafe');
  if (skill.category === 'dialogue' && RAW_ACTION_PATTERNS.some((pattern) => pattern.test(`${skill.name} ${skill.action}`))) {
    blockers.push('dialogue skill has unsafe action text');
  }

  return { ok: blockers.length === 0, skill, blockers, reason: blockers[0] || '' };
}

export function explainSuggestionBlockers(bot, memory, skillOrName, context = {}) {
  return validateSkillForSuggestion(bot, memory, skillOrName, context).blockers || [];
}

export function isSkillSuggestible(skillOrName, context = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return false;
  if (context.recommendOnly === false) return true;
  if (!skill.implemented) return false;
  if (skill.requiresConfirmation || skill.riskLevel === 'high') return false;
  if (context.runnerOnly !== false && !MILESTONE_2_RUNNER_ALLOWLIST.includes(skill.name)) return false;
  return true;
}

export function isSkillBlockedForSuggestion(skillOrName, context = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return true;
  return !isSkillSuggestible(skill, context);
}

export function validateTrackForSuggestion(bot, memory, template, context = {}) {
  if (!template) return { ok: false, reason: 'unknown curriculum track', blockers: ['unknown curriculum track'] };
  const blockers = [];
  const skillResults = [];
  for (const skillName of template.skills || []) {
    const result = validateSkillForSuggestion(bot, memory, skillName, context);
    skillResults.push({ skillName, ...result });
    if (!result.ok) blockers.push(`${skillName}: ${result.reason || result.blockers?.[0] || 'blocked'}`);
  }
  return { ok: blockers.length === 0, blockers, skillResults, reason: blockers[0] || '' };
}

export function isTrackSuggestible(template, context = {}) {
  if (!template || !Array.isArray(template.skills)) return false;
  return template.skills.some((skillName) => isSkillSuggestible(skillName, context));
}

export function skillMutatesWorld(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  const name = skill?.name || String(skillOrName || '');
  if (!name) return true;
  if (MILESTONE_5_CURRICULUM_EXECUTION_ALLOWLIST.includes(name)) return false;
  return WORLD_MUTATING_SKILL_PATTERNS.some((pattern) => pattern.test(name));
}

export function isSkillLowRiskReadinessSkill(skillOrName) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return false;
  return skill.implemented
    && skill.riskLevel === 'low'
    && !skill.requiresConfirmation
    && MILESTONE_5_CURRICULUM_EXECUTION_ALLOWLIST.includes(skill.name)
    && !skillMutatesWorld(skill);
}

export function isSkillAllowedForCurriculumExecution(skillOrName, config = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return false;
  if (config.curriculumExecutionEnabled === false) return false;
  if (config.allowCurriculumToRunSkills === false) return false;
  if (config.curriculumAllowOnlyImplementedSkills !== false && !skill.implemented) return false;
  if (config.curriculumAllowOnlyRunnerEnabledSkills !== false && !MILESTONE_2_RUNNER_ALLOWLIST.includes(skill.name)) return false;
  if (!MILESTONE_5_CURRICULUM_EXECUTION_ALLOWLIST.includes(skill.name)) return false;
  if (skill.riskLevel !== 'low' && config.allowMediumRiskCurriculumSteps !== true) return false;
  if (skill.riskLevel === 'high' && config.allowHighRiskCurriculumSteps !== true) return false;
  if (skill.requiresConfirmation) return false;
  if (skillMutatesWorld(skill) && !config.curriculumAllowWorldMutation) return false;
  return true;
}

export function validateSkillForCurriculumExecution(bot, memory, skillOrName, args = {}, context = {}) {
  const skill = normalizeSkill(skillOrName);
  if (!skill) return { ok: false, reason: 'unknown skill', blockers: ['unknown skill'] };
  const config = { ...(bot?.mcaiConfig || {}), ...(context.config || {}) };
  const blockers = [];

  const base = validateSkillCanRun(bot, memory, skill, args, {
    ...context,
    runner: true
  });
  if (!base.ok) blockers.push(base.reason);
  if (!isSkillAllowedForCurriculumExecution(skill, config)) blockers.push('not allowed for Milestone 5 curriculum execution');
  if (!isSkillLowRiskReadinessSkill(skill)) blockers.push('not a low-risk readiness/status skill');
  const evidence = validateSkillEvidenceDefinitions(skill);
  if (!evidence.ok) blockers.push(evidence.reason || 'invalid evidence definitions');
  if (skillMutatesWorld(skill)) blockers.push('world-mutating skill');

  return blockers.length ? { ok: false, skill, reason: blockers[0], blockers } : { ok: true, skill, blockers: [] };
}

export function explainCurriculumSkillBlockers(bot, memory, skillOrName, args = {}, context = {}) {
  return validateSkillForCurriculumExecution(bot, memory, skillOrName, args, context).blockers || [];
}
