import { getMilestone } from './progressionRegistry.js';
import { createGoalFromTemplate } from '../../goals.js';
import { getCurriculumTemplate } from '../curriculum/curriculumTemplates.js';

const goalMap = {
  prepare_for_night: 'prepare_for_night',
  get_food: 'food_security',
  food_security: 'food_security',
  create_wheat_farm: 'food_security',
  maintain_farm: 'food_security',
  mining_readiness: 'prepare_for_mining',
  gather_coal: 'stockpile_resources',
  gather_iron: 'get_iron_gear',
  smelt_iron: 'get_iron_gear',
  craft_iron_tools: 'get_iron_gear',
  craft_shield: 'get_iron_gear',
  craft_iron_armor: 'get_iron_gear',
  base_readiness: 'improve_base',
  set_home: 'improve_base',
  place_storage: 'improve_base',
  light_home: 'secure_base',
  build_workstation: 'improve_base',
  nether_checklist: 'prepare_for_nether',
  equip_gold_armor_piece: 'prepare_for_nether',
  prepare_nether_supplies: 'prepare_for_nether',
  build_portal: 'prepare_for_nether'
};

const curriculumMap = {
  get_food: 'progression_survival_check',
  prepare_for_night: 'progression_survival_check',
  base_readiness: 'progression_base_check',
  set_home: 'progression_base_check',
  place_storage: 'progression_base_check',
  mining_readiness: 'progression_mining_check',
  gather_coal: 'progression_mining_check',
  gather_iron: 'progression_mining_check',
  food_security: 'progression_food_security_check',
  create_wheat_farm: 'progression_food_security_check',
  nether_checklist: 'progression_nether_check',
  prepare_nether_supplies: 'progression_nether_check',
  build_portal: 'progression_nether_check'
};

function now() {
  return Date.now();
}

export function createPlanForMilestone(bot, memory, milestoneId, options = {}) {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${milestoneId}` };
  const steps = [];
  for (const skillName of mapMilestoneToRequiredSkills(milestone)) {
    steps.push({
      type: 'skill',
      name: skillName,
      description: `Run or verify skill ${skillName}.`,
      requiresApproval: true,
      riskLevel: milestone.riskLevel
    });
  }
  const trackName = mapMilestoneToCurriculumTrack(milestone);
  if (trackName) {
    steps.push({
      type: 'curriculum',
      name: trackName,
      description: `Use curriculum readiness track ${trackName}.`,
      requiresApproval: true,
      riskLevel: milestone.riskLevel
    });
  }
  const goalTemplate = mapMilestoneToGoalTemplate(milestone);
  if (goalTemplate) {
    steps.push({
      type: 'goal',
      name: goalTemplate,
      description: `Create or approve goal template ${goalTemplate}.`,
      requiresApproval: true,
      riskLevel: milestone.riskLevel
    });
  }

  const plan = {
    id: `prog_plan_${now()}_${Math.random().toString(36).slice(2, 7)}`,
    targetMilestoneId: milestone.id,
    status: 'draft',
    steps: steps.slice(0, options.maxSteps || 12),
    blockers: [],
    evidenceRequired: [...milestone.successEvidence]
  };
  return validateProgressionPlan(plan);
}

export function createGoalForMilestone(bot, memory, milestoneId, options = {}) {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${milestoneId}` };
  const templateName = mapMilestoneToGoalTemplate(milestone);
  if (!templateName) return { ok: false, reason: `${milestone.name} does not map to an implemented goal template.` };
  if (!options.persist) {
    return {
      ok: true,
      status: 'draft',
      milestoneId: milestone.id,
      templateName,
      message: `Draft goal request: ${templateName}. Use confirmation before creating it.`
    };
  }
  const goal = createGoalFromTemplate(templateName, {
    source: 'progression',
    targetMilestoneId: milestone.id,
    createdBy: options.createdBy || 'ModVinny',
    status: 'pending_approval'
  });
  return { ok: true, goal, templateName, milestoneId: milestone.id };
}

export function createCurriculumForMilestone(bot, memory, milestoneId, options = {}) {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return { ok: false, reason: `Unknown milestone: ${milestoneId}` };
  const trackName = mapMilestoneToCurriculumTrack(milestone);
  if (!trackName) return { ok: false, reason: `${milestone.name} does not map to a curriculum track.` };
  const template = getCurriculumTemplate(trackName);
  if (!template) return { ok: false, reason: `Curriculum track ${trackName} is not implemented.` };
  return {
    ok: true,
    status: 'draft',
    milestoneId: milestone.id,
    trackName,
    template,
    message: `Draft curriculum request: ${trackName}. Approval is required before any step can run.`
  };
}

export function mapMilestoneToGoalTemplate(milestoneOrId) {
  const milestone = typeof milestoneOrId === 'string' ? getMilestone(milestoneOrId) : milestoneOrId;
  if (!milestone) return null;
  return goalMap[milestone.id] || milestone.recommendedGoals?.[0] || null;
}

export function mapMilestoneToCurriculumTrack(milestoneOrId) {
  const milestone = typeof milestoneOrId === 'string' ? getMilestone(milestoneOrId) : milestoneOrId;
  if (!milestone) return null;
  return curriculumMap[milestone.id] || null;
}

export function mapMilestoneToRequiredSkills(milestoneOrId) {
  const milestone = typeof milestoneOrId === 'string' ? getMilestone(milestoneOrId) : milestoneOrId;
  return milestone?.requiredSkills ? [...milestone.requiredSkills] : [];
}

export function validateProgressionPlan(plan) {
  const blockers = [];
  if (!plan?.targetMilestoneId) blockers.push('Missing target milestone.');
  if (!Array.isArray(plan?.steps)) blockers.push('Plan steps must be an array.');
  if (Array.isArray(plan?.steps) && plan.steps.length === 0) blockers.push('No safe plan steps are available.');
  for (const step of plan.steps || []) {
    if (!['skill', 'curriculum', 'goal', 'manual'].includes(step.type)) blockers.push(`Unsupported step type ${step.type}.`);
    if (step.riskLevel === 'high') blockers.push(`${step.name} is high risk and requires explicit confirmation.`);
  }
  return {
    ok: blockers.length === 0,
    ...plan,
    status: blockers.length ? 'blocked' : plan.status || 'draft',
    blockers
  };
}

export function explainProgressionPlan(plan) {
  if (!plan?.ok && plan?.reason) return plan.reason;
  const steps = (plan.steps || []).map((step) => `${step.type}:${step.name}`).join(', ');
  const blockers = plan.blockers?.length ? ` Blockers: ${plan.blockers.join('; ')}.` : '';
  return `Progression plan for ${plan.targetMilestoneId}: ${steps || 'no steps'}.${blockers}`;
}

