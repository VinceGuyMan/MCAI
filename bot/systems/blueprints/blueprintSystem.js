import { getBlueprint, listBlueprints, validateAllBlueprints } from './blueprintRegistry.js';
import * as blueprintPlanner from './blueprintPlanner.js';
import * as blueprintSafety from './blueprintSafety.js';
import * as blueprintMemory from './blueprintMemory.js';
import * as blueprintBuilder from './blueprintBuilder.js';
import * as blueprintPreview from './blueprintPreview.js';
import * as materialEstimator from './materialEstimator.js';
import * as schematicImport from './schematicImport.js';
import { loadConfig } from '../../config.js';

function memoryState(memory) {
  return typeof memory?.get === 'function' ? memory.get() : memory || {};
}

function updateMemory(memory, patch) {
  if (typeof memory?.update === 'function') memory.update(patch);
  else Object.assign(memory, patch);
}

function pendingBuild(memory) {
  const pending = memoryState(memory).pendingBlueprintBuild;
  if (!pending || Date.now() > (pending.expiresAt || 0)) return null;
  return pending;
}

function setPendingBuild(memory, plan, materialStatus) {
  updateMemory(memory, {
    pendingBlueprintBuild: {
      plan,
      materialStatus,
      expiresAt: Date.now() + 60000,
      createdAt: Date.now()
    }
  });
}

export function blueprintStatus(bot, memory) {
  const validation = validateAllBlueprints();
  const validationProblems = validation.errors || validation.problems || [];
  const active = blueprintMemory.getActiveBuild();
  return {
    ok: validation.ok,
    message: `Blueprints: ${listBlueprints().length} built-in, ${validationProblems.length} validation issues. ${active ? `Active build: ${active.blueprintId}.` : 'No active build.'}`,
    evidence: ['blueprint_status_reported'],
    data: { validation, activeBuild: active }
  };
}

export function listBlueprintsAction() {
  const blueprints = listBlueprints();
  return {
    ok: true,
    message: `Blueprints: ${blueprints.map((item) => item.id).join(', ')}.`,
    evidence: ['blueprint_list_reported'],
    data: { blueprints }
  };
}

export function previewBlueprint(bot, memory, blueprintId) {
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) return { ok: false, reason: `Unknown blueprint: ${blueprintId}` };
  return {
    ok: true,
    message: blueprintPreview.generateTextPreview(blueprint),
    evidence: ['blueprint_preview_created'],
    data: { blueprint }
  };
}

export function blueprintMaterials(bot, memory, blueprintId) {
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) return { ok: false, reason: `Unknown blueprint: ${blueprintId}` };
  const materialStatus = materialEstimator.hasEnoughMaterials(bot, blueprint);
  return {
    ok: materialStatus.ok,
    message: blueprintPreview.generateMaterialPreview(blueprint, materialStatus),
    evidence: materialStatus.ok ? ['blueprint_materials_checked'] : ['blueprint_materials_checked', 'blueprint_missing_materials_reported'],
    data: materialStatus
  };
}

export function planBlueprintBuild(bot, memory, blueprintId, options = {}) {
  const planResult = blueprintPlanner.createBuildPlan(bot, memory, blueprintId, options);
  if (!planResult.ok) return planResult;
  const materials = materialEstimator.hasEnoughMaterials(bot, planResult.plan.blueprint);
  const safety = blueprintSafety.validateBlueprintSafety(bot, memory, planResult.plan.blueprint, { context: options.context });
  const area = blueprintSafety.validateBuildArea(bot, memory, planResult.plan);
  const blockers = [...(safety.blockers || []), ...(area.blockers || [])];
  if (!materials.ok) blockers.push(materialEstimator.explainMissingMaterials(materials.required, materials.available));
  setPendingBuild(memory, planResult.plan, materials);
  return {
    ok: blockers.length === 0,
    reason: blockers.length ? blockers.join('; ') : '',
    message: blockers.length
      ? `${blueprintPreview.generateChatPreview(planResult.plan)} Blocked: ${blockers.slice(0, 3).join('; ')}.`
      : `${blueprintPreview.generateChatPreview(planResult.plan)} Materials ready.`,
    evidence: blockers.length ? ['blueprint_plan_created', 'blueprint_missing_materials_reported'] : ['blueprint_plan_created', 'blueprint_materials_checked'],
    data: { plan: planResult.plan, materials, blockers }
  };
}

export async function confirmAndStartBuild(bot, memory, context = {}) {
  const pending = pendingBuild(memory);
  if (!pending) return { ok: false, reason: 'No pending blueprint build confirmation.' };
  const config = loadConfig();
  if (context.sender && context.sender !== config.ownerUsername) return { ok: false, reason: 'Only ModVinny can confirm a build.' };
  if (!pending.materialStatus?.ok) {
    return { ok: false, reason: `Missing materials: ${materialEstimator.explainMissingMaterials(pending.materialStatus.required, pending.materialStatus.available)}` };
  }
  const start = await blueprintBuilder.startApprovedBuild(bot, memory, pending.plan, { ...context, confirmed: true });
  if (!start.ok) return start;
  updateMemory(memory, { pendingBlueprintBuild: null });
  const run = await blueprintBuilder.continueBuild(bot, memory, start.buildId);
  return {
    ok: run.ok,
    message: run.ok ? run.message || start.message : run.reason,
    evidence: [...(start.evidence || []), ...(run.evidence || [])],
    data: { start, run }
  };
}

export function blueprintProgress(bot, memory) {
  const result = blueprintBuilder.reportBuildProgress(bot, memory);
  return {
    ok: result.ok,
    message: result.message || result.reason,
    evidence: ['blueprint_status_reported'],
    data: result.data || {}
  };
}

export function blueprintHistory() {
  const history = blueprintMemory.getBuildHistory(10);
  return {
    ok: true,
    message: history.length
      ? `Recent builds: ${history.slice(0, 5).map((item) => `${item.blueprintId}:${item.status}`).join(', ')}.`
      : 'No blueprint build history yet.',
    evidence: ['blueprint_status_reported'],
    data: { history }
  };
}

export async function continueBlueprintBuild(bot, memory) {
  const result = await blueprintBuilder.continueBuild(bot, memory);
  return { ...result, evidence: result.evidence || ['blueprint_build_partial'] };
}

export function pauseBlueprintBuild(bot, memory, reason = 'paused by owner') {
  return blueprintBuilder.pauseBuild(bot, memory, reason);
}

export function resumeBlueprintBuild(bot, memory) {
  return blueprintBuilder.resumeBuild(bot, memory);
}

export function cancelBlueprintBuild(bot, memory, reason = 'cancelled by owner') {
  return blueprintBuilder.cancelBuild(bot, memory, reason);
}

export function schematicStatus() {
  const status = schematicImport.schematicImportStatus();
  return {
    ok: true,
    message: status.reason,
    evidence: ['schematic_status_reported', 'schematic_import_unsupported'],
    data: status
  };
}

export function importSchematicAction(filePath, options = {}) {
  return schematicImport.importSchematic(filePath, options);
}
