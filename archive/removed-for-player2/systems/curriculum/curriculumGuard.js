import { getSkill } from '../../skillRegistry.js';
import { MILESTONE_2_RUNNER_ALLOWLIST, validateSkillEvidenceDefinitions } from '../../skillValidator.js';
import { isSkillRunning } from '../../skillRunner.js';

export const MILESTONE_5_EXECUTION_ALLOWLIST = [
  'status',
  'inventory_summary',
  'home_status',
  'food_status',
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

const riskRank = { low: 1, medium: 2, high: 3 };
const blockedSkillNames = new Set([
  'mine_stone',
  'mine_coal',
  'mine_iron',
  'mine_diamond',
  'deep_mining',
  'cave_mining',
  'build_camp',
  'build_shelter',
  'build_workstation',
  'create_farm',
  'maintain_farm',
  'lure_animal_to_pen',
  'breed_animals',
  'guard_base',
  'defend_owner',
  'engage_hostile',
  'pvp_attack',
  'light_portal',
  'safe_nether_entry',
  'enter_nether',
  'nether_exploration',
  'nether_mining',
  'fortress_search',
  'bastion_search',
  'store_items',
  'withdraw_item',
  'bring_item_to_owner',
  'go_to_waypoint',
  'scout_direction',
  'explore_around_home',
  'explore_around_owner',
  'follow_route',
  'return_from_nether'
]);

const worldMutatingPrefixes = [
  'mine_',
  'build_',
  'create_',
  'maintain_',
  'lure_',
  'breed_',
  'store_',
  'withdraw_',
  'go_to_',
  'scout_',
  'explore_',
  'light_',
  'safe_nether_',
  'engage_',
  'guard_',
  'defend_'
];

function stateFromMemory(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function distance(a, b) {
  if (!a || !b) return null;
  const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
  const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
  const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getConfig(bot, context = {}) {
  return { ...(bot?.mcaiConfig || {}), ...(context.config || {}) };
}

export function validateCurriculumOwner(context = {}) {
  const owner = context.ownerUsername || context.config?.ownerUsername || context.bot?.mcaiConfig?.ownerUsername || 'ModVinny';
  if (context.isOwner === true || context.sender === owner || context.username === owner) return { ok: true };
  return { ok: false, reason: 'Only ModVinny can approve or run curriculum steps.' };
}

export function validateCurriculumRiskCeiling(skill, config = {}) {
  if (!skill) return { ok: false, reason: 'unknown skill' };
  const ceiling = config.curriculumExecutionRiskCeiling || 'low';
  if (skill.riskLevel === 'medium' && config.allowMediumRiskCurriculumSteps) return { ok: true };
  if (skill.riskLevel === 'high' && config.allowHighRiskCurriculumSteps) return { ok: true };
  if ((riskRank[skill.riskLevel] || 99) > (riskRank[ceiling] || 1)) {
    return { ok: false, reason: `${skill.name} risk ${skill.riskLevel} is above curriculum ceiling ${ceiling}` };
  }
  return { ok: true };
}

export function skillMutatesWorld(skillOrName) {
  const skill = typeof skillOrName === 'string' ? getSkill(skillOrName) : skillOrName;
  if (!skill) return true;
  if (blockedSkillNames.has(skill.name)) return true;
  if (worldMutatingPrefixes.some((prefix) => skill.name.startsWith(prefix))) return true;
  return false;
}

export function isSkillLowRiskReadinessSkill(skillOrName) {
  const skill = typeof skillOrName === 'string' ? getSkill(skillOrName) : skillOrName;
  if (!skill) return false;
  return MILESTONE_5_EXECUTION_ALLOWLIST.includes(skill.name) && skill.riskLevel === 'low' && !skill.requiresConfirmation && !skillMutatesWorld(skill);
}

export function validateCurriculumFeatureFlags(skill, config = {}) {
  if (!skill) return { ok: false, reason: 'unknown skill' };
  if (!MILESTONE_5_EXECUTION_ALLOWLIST.includes(skill.name)) return { ok: false, reason: `${skill.name} is not enabled for Milestone 5 curriculum execution` };
  if (skillMutatesWorld(skill)) return { ok: false, reason: `${skill.name} mutates the world and is blocked for curriculum execution` };
  if (!config.curriculumAllowCombat && ['engage_hostile', 'guard_base', 'defend_owner'].includes(skill.name)) return { ok: false, reason: 'combat execution is disabled for curriculum' };
  if (!config.curriculumAllowNetherEntry && ['light_portal', 'safe_nether_entry', 'enter_nether'].includes(skill.name)) return { ok: false, reason: 'Nether entry and portal lighting are blocked for curriculum' };
  if (!config.curriculumAllowMiningExecution && /^mine_/.test(skill.name)) return { ok: false, reason: 'mining execution is blocked for curriculum' };
  if (!config.curriculumAllowBuildingExecution && /^build_/.test(skill.name)) return { ok: false, reason: 'building execution is blocked for curriculum' };
  if (!config.curriculumAllowExplorationTravel && /^(go_to_|scout_|explore_|follow_route)/.test(skill.name)) return { ok: false, reason: 'exploration travel is blocked for curriculum' };
  if (!config.curriculumAllowStorageMutation && /^(store_|withdraw_|bring_item)/.test(skill.name)) return { ok: false, reason: 'storage mutation is blocked for curriculum' };
  return { ok: true };
}

export function validateCurriculumContext(bot, memory, context = {}) {
  const blockers = [];
  const state = stateFromMemory(memory);
  if (bot?.mcaiCancellation?.isCancelled?.() || context.cancellation?.isCancelled?.()) blockers.push('cancelled');
  if (isSkillRunning()) blockers.push('another skill is already running');
  if (Number(bot?.health ?? 20) <= 6) blockers.push('critical health');
  if (Number(bot?.food ?? 20) <= 4) blockers.push('critical hunger');
  if (context.danger || state.hostileNearby || (Array.isArray(state.nearbyHostiles) && state.nearbyHostiles.length)) blockers.push('danger nearby');
  return blockers.length ? { ok: false, reason: blockers.join('; '), blockers } : { ok: true, blockers: [] };
}

export function validateCurriculumDistance(bot, memory, config = {}) {
  const blockers = [];
  const state = stateFromMemory(memory);
  const botPos = bot?.entity?.position;
  const owner = bot?.players?.[config.ownerUsername || 'ModVinny']?.entity;
  if (config.pauseCurriculumWhenOwnerFar && botPos && owner?.position) {
    const ownerDistance = distance(botPos, owner.position);
    if (ownerDistance > (config.maxCurriculumDistanceFromOwner || 96)) blockers.push('ModVinny is too far away');
  }
  if (botPos && state.homeBasePosition) {
    const homeDistance = distance(botPos, state.homeBasePosition);
    if (homeDistance > (config.maxCurriculumDistanceFromHome || 128)) blockers.push('tj is too far from home');
  }
  return blockers.length ? { ok: false, reason: blockers.join('; '), blockers } : { ok: true, blockers: [] };
}

export function validateCurriculumDanger(bot, memory) {
  return validateCurriculumContext(bot, memory, {});
}

export function validateCurriculumApproval(memory, curriculum, step) {
  if (!curriculum) return { ok: false, reason: 'no active curriculum' };
  if (!['approved', 'active', 'paused'].includes(curriculum.status)) return { ok: false, reason: `curriculum is ${curriculum.status}` };
  if (!step) return { ok: false, reason: 'no curriculum step selected' };
  if (!['pending', 'approved', 'partial'].includes(step.status)) return { ok: false, reason: `step is ${step.status}` };
  return { ok: true };
}

export function canCurriculumExecuteSkill(bot, memory, skillOrName, context = {}) {
  const skill = typeof skillOrName === 'string' ? getSkill(skillOrName) : skillOrName;
  const config = getConfig(bot, context);
  const blockers = [];
  if (!skill) blockers.push('unknown skill');
  if (skill && config.curriculumAllowOnlyImplementedSkills && !skill.implemented) blockers.push(`${skill.name} is not implemented`);
  if (skill && config.curriculumAllowOnlyRunnerEnabledSkills && !MILESTONE_2_RUNNER_ALLOWLIST.includes(skill.name)) blockers.push(`${skill.name} is not enabled in skillRunner`);
  if (skill?.requiresConfirmation) blockers.push(`${skill.name} requires confirmation and is blocked by default`);
  if (skill) {
    for (const check of [
      validateCurriculumRiskCeiling(skill, config),
      validateCurriculumFeatureFlags(skill, config),
      validateSkillEvidenceDefinitions(skill),
      validateCurriculumOwner({ ...context, bot, config }),
      validateCurriculumContext(bot, memory, context),
      validateCurriculumDistance(bot, memory, config)
    ]) {
      if (!check.ok) blockers.push(check.reason);
    }
  }
  return blockers.length ? { ok: false, reason: blockers[0], blockers: [...new Set(blockers)] } : { ok: true, skill, blockers: [] };
}

export function explainCurriculumExecutionBlockers(bot, memory, skillOrName, context = {}) {
  return canCurriculumExecuteSkill(bot, memory, skillOrName, context).blockers || [];
}
