import { getSkill } from '../../skillRegistry.js';

const templates = [
  template(
    'survival_basics',
    'Survival Basics',
    'Practice basic status, food, armor, inventory, and safety checks.',
    'low',
    false,
    [
      step('status', true),
      step('food_status', true),
      step('inventory_summary', true),
      step('armor_status', true),
      step('combat_status', true)
    ]
  ),
  template(
    'base_readiness',
    'Base Readiness',
    'Check whether home, storage, and skill systems are healthy.',
    'low',
    false,
    [
      step('home_status', true),
      step('storage_status', true),
      step('skills_status', true),
      step('inventory_summary', true),
      step('build_workstation', false, 'building is not enabled for curriculum execution yet', true)
    ]
  ),
  template(
    'mining_readiness',
    'Mining Readiness',
    'Check whether tj is ready for mining before any mining task starts.',
    'low',
    false,
    [
      step('mining_status', true),
      step('inventory_summary', true),
      step('food_status', true),
      step('armor_status', true),
      step('mine_coal', false, 'mining execution is not enabled for curriculum execution yet', true)
    ]
  ),
  template(
    'food_security',
    'Food Security',
    'Check food, farms, and storage readiness.',
    'low',
    false,
    [
      step('food_status', true),
      step('farming_status', true),
      step('inventory_summary', true),
      step('storage_status', true)
    ]
  ),
  template(
    'exploration_readiness',
    'Exploration Readiness',
    'Check map, home, food, and inventory readiness before exploring.',
    'low',
    false,
    [
      step('map_status', true),
      step('inventory_summary', true),
      step('food_status', true),
      step('home_status', true),
      step('go_to_waypoint', false, 'exploration travel is not enabled for curriculum execution yet', true)
    ]
  ),
  template(
    'combat_readiness',
    'Combat Readiness',
    'Check whether tj is ready to defend or flee.',
    'medium',
    false,
    [
      step('combat_status', true),
      step('armor_status', true),
      step('inventory_summary', true),
      step('food_status', true),
      step('engage_hostile', false, 'combat execution is not enabled for curriculum execution yet', true)
    ]
  ),
  template(
    'nether_readiness',
    'Nether Readiness',
    'Check Nether prep without entering the Nether.',
    'medium',
    false,
    [
      step('nether_checklist', true),
      step('armor_status', true),
      step('food_status', true),
      step('inventory_summary', true),
      step('home_status', true),
      step('light_portal', false, 'portal lighting is blocked in curriculum execution', true),
      step('safe_nether_entry', false, 'Nether entry is blocked in curriculum execution', true)
    ]
  ),
  template(
    'progression_survival_check',
    'Progression Survival Check',
    'Readiness checks for early survival milestones.',
    'low',
    false,
    [
      step('status', true),
      step('food_status', true),
      step('inventory_summary', true),
      step('armor_status', true),
      step('combat_status', true)
    ]
  ),
  template(
    'progression_base_check',
    'Progression Base Check',
    'Readiness checks for home, storage, and base milestones.',
    'low',
    false,
    [
      step('home_status', true),
      step('storage_status', true),
      step('skills_status', true),
      step('inventory_summary', true)
    ]
  ),
  template(
    'progression_mining_check',
    'Progression Mining Check',
    'Readiness checks before mining progression.',
    'low',
    false,
    [
      step('mining_status', true),
      step('inventory_summary', true),
      step('food_status', true),
      step('armor_status', true),
      step('mine_coal', false, 'mining execution is not enabled for curriculum execution yet', true)
    ]
  ),
  template(
    'progression_food_security_check',
    'Progression Food Security Check',
    'Readiness checks for food, farm, and storage milestones.',
    'low',
    false,
    [
      step('food_status', true),
      step('farming_status', true),
      step('inventory_summary', true),
      step('storage_status', true)
    ]
  ),
  template(
    'progression_nether_check',
    'Progression Nether Check',
    'Readiness checks for Nether preparation without entering the Nether.',
    'medium',
    false,
    [
      step('nether_checklist', true),
      step('armor_status', true),
      step('food_status', true),
      step('inventory_summary', true),
      step('home_status', true),
      step('light_portal', false, 'portal lighting remains blocked for progression curriculum', true),
      step('safe_nether_entry', false, 'Nether entry remains blocked for progression curriculum', true)
    ]
  ),
  template(
    'skill_system_health',
    'Skill System Health',
    'Check the skill system, evidence system, and skill audit status.',
    'low',
    false,
    [
      step('skills_status', true),
      step('evidence_status', false, 'evidence status is not enabled in the Milestone 5 execution allowlist yet'),
      step('skill_audit', false, 'skill audit is not enabled in the Milestone 5 execution allowlist yet')
    ]
  ),
  template(
    'gear_readiness',
    'Gear Readiness',
    'Check general gear, enchanting, anvil, potion, and brewing readiness without spending resources.',
    'low',
    false,
    [
      step('gear_status', true),
      step('suggest_gear_upgrades', true),
      step('enchant_status', true),
      step('anvil_status', true),
      step('potion_status', true),
      step('brewing_status', true)
    ]
  ),
  template(
    'mining_gear_readiness',
    'Mining Gear Readiness',
    'Check mining gear and safe upgrade readiness.',
    'low',
    false,
    [
      step('mining_status', true),
      step('gear_status', true),
      step('enchant_status', true),
      step('anvil_status', true),
      step('enchant_item', false, 'enchanting spends XP and lapis and is not automatic curriculum execution', true)
    ]
  ),
  template(
    'combat_gear_readiness',
    'Combat Gear Readiness',
    'Check defensive gear readiness without starting combat.',
    'low',
    false,
    [
      step('combat_status', true),
      step('armor_status', true),
      step('gear_status', true),
      step('potion_status', true),
      step('use_potion', false, 'potion use needs explicit confirmation and is not automatic curriculum execution', true)
    ]
  ),
  template(
    'nether_gear_readiness',
    'Nether Gear Readiness',
    'Check Nether gear, gold armor, potion, and brewing readiness without entering the Nether.',
    'medium',
    false,
    [
      step('nether_checklist', true),
      step('nether_gear_readiness', true),
      step('potion_status', true),
      step('brewing_status', true),
      step('safe_nether_entry', false, 'Nether entry is blocked in curriculum execution', true)
    ]
  ),
  template(
    'enchanting_readiness',
    'Enchanting Readiness',
    'Check XP, lapis, table readiness, and options without enchanting automatically.',
    'low',
    false,
    [
      step('enchant_status', true),
      step('gear_status', true),
      step('enchant_options', false, 'option inspection can open a table window and is left as a direct command'),
      step('enchant_item', false, 'actual enchanting requires confirmation', true)
    ]
  ),
  template(
    'potion_readiness',
    'Potion Readiness',
    'Check carried potions and brewing support honestly.',
    'low',
    false,
    [
      step('potion_status', true),
      step('brewing_status', true),
      step('use_potion', false, 'potion use requires confirmation', true),
      step('brew_potion', false, 'brewing mutation is scaffolded only', true)
    ]
  ),
  template(
    'village_readiness',
    'Village Readiness',
    'Check nearby village and villager memory without trading.',
    'low',
    false,
    [
      step('villager_status', true),
      step('village_status', true),
      step('scan_villagers', false, 'scanning writes villager memory, so use the direct owner command when ready')
    ]
  ),
  template(
    'trading_readiness',
    'Trading Readiness',
    'Check trading support, known trades, and economy state without executing trades.',
    'low',
    false,
    [
      step('trade_status', true),
      step('economy_status', true),
      step('suggest_trades', true),
      step('inspect_villager_trades', false, 'trade inspection can open a villager window and is direct-command only')
    ]
  ),
  template(
    'economy_check',
    'Economy Check',
    'Check emerald reserves and useful known trade options.',
    'low',
    false,
    [
      step('economy_status', true),
      step('suggest_trades', true),
      step('trade_status', true)
    ]
  ),
  template(
    'librarian_search_readiness',
    'Librarian Search Readiness',
    'Prepare to look for librarians and book trades without transport or automation.',
    'low',
    false,
    [
      step('villager_status', true),
      step('village_status', true),
      step('suggest_trades', true),
      step('execute_trade', false, 'trade execution requires direct owner confirmation and is not curriculum automation', true)
    ]
  ),
  template(
    'gear_trade_readiness',
    'Gear Trade Readiness',
    'Check whether villager trades can support gear upgrades.',
    'low',
    false,
    [
      step('gear_status', true),
      step('economy_status', true),
      step('suggest_trades', true),
      step('execute_trade', false, 'buying tools, armor, or books requires explicit trade confirmation', true)
    ]
  ),
  template(
    'building_readiness',
    'Building Readiness',
    'Check blueprint system, inventory, and home context before any building.',
    'low',
    false,
    [
      step('blueprint_status', true),
      step('list_blueprints', true),
      step('inventory_summary', true),
      step('home_status', true),
      step('blueprint_build_small', false, 'blueprint building requires direct owner confirmation and is not automatic curriculum execution', true)
    ]
  ),
  template(
    'base_blueprint_readiness',
    'Base Blueprint Readiness',
    'Check base-oriented blueprints and materials without placing blocks.',
    'low',
    false,
    [
      step('home_status', true),
      step('storage_status', true),
      step('blueprint_status', true),
      step('blueprint_materials', true),
      step('blueprint_build_small', false, 'base blueprint execution is direct-command only', true)
    ]
  ),
  template(
    'shelter_blueprint_readiness',
    'Shelter Blueprint Readiness',
    'Check shelter blueprint readiness without building automatically.',
    'low',
    false,
    [
      step('blueprint_status', true),
      step('blueprint_preview', true),
      step('blueprint_materials', true),
      step('inventory_summary', true),
      step('blueprint_build_small', false, 'shelter construction requires confirmation and a direct build command', true)
    ]
  )
];

const aliases = new Map([
  ['survival', 'survival_basics'],
  ['survival basics', 'survival_basics'],
  ['base', 'base_readiness'],
  ['base readiness', 'base_readiness'],
  ['mining', 'mining_readiness'],
  ['mining readiness', 'mining_readiness'],
  ['food', 'food_security'],
  ['food security', 'food_security'],
  ['exploration', 'exploration_readiness'],
  ['exploration readiness', 'exploration_readiness'],
  ['combat', 'combat_readiness'],
  ['combat readiness', 'combat_readiness'],
  ['nether', 'nether_readiness'],
  ['nether readiness', 'nether_readiness'],
  ['progression survival check', 'progression_survival_check'],
  ['progression base check', 'progression_base_check'],
  ['progression mining check', 'progression_mining_check'],
  ['progression food security check', 'progression_food_security_check'],
  ['progression nether check', 'progression_nether_check'],
  ['skill health', 'skill_system_health'],
  ['skill system health', 'skill_system_health'],
  ['skills health', 'skill_system_health'],
  ['gear readiness', 'gear_readiness'],
  ['gear', 'gear_readiness'],
  ['mining gear readiness', 'mining_gear_readiness'],
  ['mining gear', 'mining_gear_readiness'],
  ['combat gear readiness', 'combat_gear_readiness'],
  ['combat gear', 'combat_gear_readiness'],
  ['nether gear readiness', 'nether_gear_readiness'],
  ['nether gear', 'nether_gear_readiness'],
  ['enchanting readiness', 'enchanting_readiness'],
  ['enchanting', 'enchanting_readiness'],
  ['potion readiness', 'potion_readiness'],
  ['potions', 'potion_readiness'],
  ['village readiness', 'village_readiness'],
  ['village', 'village_readiness'],
  ['trading readiness', 'trading_readiness'],
  ['trading', 'trading_readiness'],
  ['economy check', 'economy_check'],
  ['economy', 'economy_check'],
  ['librarian search readiness', 'librarian_search_readiness'],
  ['librarian search', 'librarian_search_readiness'],
  ['gear trade readiness', 'gear_trade_readiness'],
  ['gear trade', 'gear_trade_readiness'],
  ['building readiness', 'building_readiness'],
  ['building', 'building_readiness'],
  ['base blueprint readiness', 'base_blueprint_readiness'],
  ['base blueprints', 'base_blueprint_readiness'],
  ['shelter blueprint readiness', 'shelter_blueprint_readiness'],
  ['shelter blueprints', 'shelter_blueprint_readiness']
]);

function step(skillName, executableInMilestone5, reasonIfBlocked = '', mutatesWorld = false) {
  const skill = getSkill(skillName);
  return {
    skillName,
    description: skill?.description || `Run ${skillName}.`,
    executableInMilestone5: Boolean(executableInMilestone5),
    requiresOwnerApproval: true,
    riskLevel: skill?.riskLevel || 'high',
    mutatesWorld: Boolean(mutatesWorld),
    reasonIfBlocked
  };
}

function normalizeStep(input) {
  if (typeof input === 'string') return step(input, false, 'step metadata missing');
  return input;
}

function template(name, displayName, description, riskLevel, requiresConfirmation, steps) {
  const normalizedSteps = steps.map(normalizeStep);
  return {
    name,
    displayName,
    description,
    riskLevel,
    requiresConfirmation,
    skills: normalizedSteps.map((item) => item.skillName),
    steps: normalizedSteps,
    stopConditions: ['critical danger', 'owner says stop']
  };
}

function cloneTemplate(item) {
  return {
    ...item,
    skills: [...item.skills],
    steps: item.steps.map((stepItem) => ({ ...stepItem })),
    stopConditions: [...item.stopConditions]
  };
}

export function getCurriculumTemplates() {
  return templates.map(cloneTemplate);
}

export function listCurriculumTemplates() {
  return getCurriculumTemplates();
}

export function normalizeCurriculumTemplateName(name) {
  const text = String(name || '').trim().toLowerCase().replace(/[?!.,]/g, '').replace(/\s+/g, ' ');
  return aliases.get(text) || text.replace(/\s+/g, '_');
}

export function getTemplateAliases() {
  return Object.fromEntries(aliases);
}

export function getCurriculumTemplate(name) {
  const key = normalizeCurriculumTemplateName(name);
  const found = templates.find((item) => item.name === key);
  return found ? cloneTemplate(found) : null;
}

export function validateCurriculumTemplate(templateToValidate) {
  const errors = [];
  if (!templateToValidate) return { ok: false, errors: ['missing template'] };
  if (!/^[a-z0-9_]+$/.test(templateToValidate.name || '')) errors.push('invalid template name');
  if (!['low', 'medium', 'high'].includes(templateToValidate.riskLevel)) errors.push(`${templateToValidate.name} has invalid risk level`);
  if (!Array.isArray(templateToValidate.skills) || !templateToValidate.skills.length) errors.push(`${templateToValidate.name} needs skills`);
  if (!Array.isArray(templateToValidate.steps) || !templateToValidate.steps.length) errors.push(`${templateToValidate.name} needs execution step metadata`);
  for (const skillName of templateToValidate.skills || []) {
    if (!getSkill(skillName)) errors.push(`${templateToValidate.name} references unknown skill ${skillName}`);
  }
  for (const stepItem of templateToValidate.steps || []) {
    if (!stepItem.skillName) errors.push(`${templateToValidate.name} has a step without skillName`);
    if (typeof stepItem.executableInMilestone5 !== 'boolean') errors.push(`${templateToValidate.name}/${stepItem.skillName} missing executableInMilestone5`);
    if (stepItem.requiresOwnerApproval !== true) errors.push(`${templateToValidate.name}/${stepItem.skillName} must require owner approval`);
  }
  return { ok: errors.length === 0, errors };
}

export function explainTrackBlockers(bot, memory, templateToExplain, context = {}) {
  const blockers = [];
  for (const skillName of templateToExplain?.skills || []) {
    const skill = getSkill(skillName);
    if (!skill) blockers.push(`${skillName} is not registered`);
    else if (!skill.implemented) blockers.push(`${skillName} is not implemented`);
    else if (skill.requiresConfirmation) blockers.push(`${skillName} requires confirmation`);
    else if (context.runnerAllowlist && !context.runnerAllowlist.includes(skill.name)) blockers.push(`${skillName} is not runner-enabled yet`);
  }
  return blockers;
}

export function getNextRecommendedStepForTrack(bot, memory, templateToCheck, context = {}) {
  for (const skillName of templateToCheck?.skills || []) {
    const skill = getSkill(skillName);
    if (!skill || !skill.implemented) continue;
    if (context.runnerAllowlist && !context.runnerAllowlist.includes(skill.name)) continue;
    return skill;
  }
  return null;
}

export function buildTrackSuggestion(bot, memory, templateName, context = {}) {
  const track = getCurriculumTemplate(templateName);
  if (!track) return null;
  const blockers = explainTrackBlockers(bot, memory, track, context);
  const nextSkill = getNextRecommendedStepForTrack(bot, memory, track, context);
  return {
    type: 'track',
    trackName: track.name,
    displayName: track.displayName,
    description: track.description,
    riskLevel: track.riskLevel,
    requiresConfirmation: track.requiresConfirmation,
    skills: track.skills,
    steps: track.steps,
    nextSkill: nextSkill?.name || null,
    blockers,
    recommended: blockers.length === 0 || Boolean(nextSkill),
    suggestedCommand: nextSkill ? `tj run skill ${nextSkill.name}` : null
  };
}
