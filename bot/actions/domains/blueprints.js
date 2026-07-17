/**
 * Blueprint / schematic handlers.
 */
export function createBlueprintHandlers(ctx) {
  const {
    bot, config, memory, say, blueprintSystem
  } = ctx;

  async function sayBlueprintResult(result, fallback = 'Blueprint action finished.') {
    const message = result?.message || result?.reason || fallback;
    say(message, true);
    return result;
  }

  function normalizeBlueprintQuery(input = '') {
    if (typeof input === 'object') return input.blueprintId || input.id || input.name || input.query || 'starter_workstation';
    return String(input || 'starter_workstation');
  }

  async function blueprintStatusAction() {
    return sayBlueprintResult(blueprintSystem.blueprintStatus(bot, memory));
  }

  async function listBlueprintsAction() {
    return sayBlueprintResult(blueprintSystem.listBlueprintsAction(bot, memory));
  }

  async function blueprintPreviewAction(input = '') {
    return sayBlueprintResult(blueprintSystem.previewBlueprint(bot, memory, normalizeBlueprintQuery(input)));
  }

  async function blueprintMaterialsAction(input = '') {
    return sayBlueprintResult(blueprintSystem.blueprintMaterials(bot, memory, normalizeBlueprintQuery(input)));
  }

  async function blueprintPlanAction(input = {}, context = {}) {
    const blueprintId = normalizeBlueprintQuery(input);
    return sayBlueprintResult(blueprintSystem.planBlueprintBuild(bot, memory, blueprintId, { context, requestedBy: context.sender || config.ownerUsername }));
  }

  async function blueprintBuildApprovedAction(input = {}, context = {}) {
    const blueprintId = normalizeBlueprintQuery(input);
    const planned = blueprintSystem.planBlueprintBuild(bot, memory, blueprintId, { context, requestedBy: context.sender || config.ownerUsername });
    if (!planned.ok) return sayBlueprintResult(planned);
    const message = `${planned.message} Say "tj confirm build" to start.`;
    say(message, true);
    return { ...planned, message, requiresConfirmation: true, evidence: ['blueprint_plan_created'] };
  }

  async function blueprintStartBuildAction(input = {}, context = {}) {
    return sayBlueprintResult(await blueprintSystem.confirmAndStartBuild(bot, memory, { ...context, sender: context.sender || config.ownerUsername }));
  }

  async function blueprintContinueBuildAction() {
    return sayBlueprintResult(await blueprintSystem.continueBlueprintBuild(bot, memory));
  }

  async function blueprintPauseBuildAction(reason = 'paused by owner') {
    return sayBlueprintResult(blueprintSystem.pauseBlueprintBuild(bot, memory, typeof reason === 'string' ? reason : 'paused by owner'));
  }

  async function blueprintResumeBuildAction() {
    return sayBlueprintResult(blueprintSystem.resumeBlueprintBuild(bot, memory));
  }

  async function blueprintCancelBuildAction(reason = 'cancelled by owner') {
    return sayBlueprintResult(blueprintSystem.cancelBlueprintBuild(bot, memory, typeof reason === 'string' ? reason : 'cancelled by owner'));
  }

  async function blueprintProgressAction() {
    return sayBlueprintResult(blueprintSystem.blueprintProgress(bot, memory));
  }

  async function blueprintHistoryAction() {
    return sayBlueprintResult(blueprintSystem.blueprintHistory(bot, memory));
  }

  async function schematicStatusAction() {
    return sayBlueprintResult(blueprintSystem.schematicStatus());
  }

  async function schematicImportStatusAction() {
    return schematicStatusAction();
  }


  return {
    sayBlueprintResult,
    normalizeBlueprintQuery,
    blueprintStatusAction,
    listBlueprintsAction,
    blueprintPreviewAction,
    blueprintMaterialsAction,
    blueprintPlanAction,
    blueprintBuildApprovedAction,
    blueprintStartBuildAction,
    blueprintContinueBuildAction,
    blueprintPauseBuildAction,
    blueprintResumeBuildAction,
    blueprintCancelBuildAction,
    blueprintProgressAction,
    blueprintHistoryAction,
    schematicStatusAction,
    schematicImportStatusAction
  };
}
