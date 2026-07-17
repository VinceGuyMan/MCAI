/**
 * Progression / milestone handlers.
 */
export function createProgressionHandlers(ctx) {
  const {
    bot, config, memory, say,
    progressionSystem, getProgressionHistory
  } = ctx;

  function normalizeMilestoneInput(input = '') {
    if (typeof input === 'object') return input.milestoneId || input.id || input.name || '';
    return String(input || '').trim().toLowerCase().replace(/[?!.,]/g, '').replace(/\s+/g, '_');
  }

  async function progressionStatusAction() {
    const result = progressionSystem.getProgressionStatus(bot, memory);
    const summary = result.summary;
    const next = summary.nextAvailable?.[0];
    const message = next
      ? `Progression: ${summary.completed}/${summary.total} complete (${summary.percent}%). Next available: ${next.name}.`
      : `Progression: ${summary.completed}/${summary.total} complete (${summary.percent}%). No safe next milestone found.`;
    say(message, true);
    return { ok: true, message, evidence: ['progression_status_reported'], data: result };
  }

  async function progressionSummaryAction() {
    return progressionStatusAction();
  }

  async function progressionCheckAction() {
    const result = progressionSystem.checkProgressionNow(bot, memory);
    const summary = result.summary;
    const message = `Progression check complete: ${summary.completed}/${summary.total} complete, ${Object.keys(result.state.blockedMilestones || {}).length} blocked/future.`;
    say(message, true);
    return { ok: true, message, evidence: ['progression_check_completed'], data: result };
  }

  async function progressionMilestonesAction(filter = '') {
    const text = typeof filter === 'object' ? filter.filter || filter.status || '' : filter;
    const result = progressionSystem.getProgressionMilestoneList();
    let milestones = result.milestones;
    if (/completed/i.test(text)) milestones = milestones.filter((item) => item.status === 'completed');
    if (/incomplete/i.test(text)) milestones = milestones.filter((item) => item.status === 'incomplete');
    if (/blocked/i.test(text)) milestones = milestones.filter((item) => item.status === 'blocked' || item.status === 'future');
    const shown = milestones.slice(0, 6).map((item) => `${item.id}:${item.status}`).join(', ');
    const message = shown ? `Milestones: ${shown}.` : 'No milestones matched that filter.';
    say(message, true);
    return { ok: true, message, evidence: ['progression_milestones_reported'], data: { milestones } };
  }

  async function progressionNextAction(options = {}) {
    const args = typeof options === 'object' ? options : {};
    const result = progressionSystem.suggestProgression(bot, memory, { ...args, limit: config.maxProgressionSuggestions || 5 });
    const top = result.suggestions.slice(0, 3);
    const message = top.length
      ? `Next milestones: ${top.map((item) => `${item.name} (${item.priority})`).join(', ')}.`
      : 'No safe progression suggestion right now.';
    say(message, true);
    memory.update?.({ lastProgressionSuggestionAt: Date.now(), lastProgressionAnswer: message });
    return { ok: true, message, evidence: ['progression_suggestion_reported'], data: result };
  }

  async function progressionExplainMilestoneAction(milestoneId = '') {
    const id = normalizeMilestoneInput(milestoneId);
    const result = progressionSystem.explainMilestone(bot, memory, id);
    const message = result.ok ? result.explanation : result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_milestones_reported'], data: result };
  }

  async function progressionPathsAction() {
    const result = progressionSystem.listPaths(memory);
    const message = `Progression paths: ${result.paths.map((item) => item.name).join(', ')}.`;
    say(message, true);
    return { ok: true, message, evidence: ['progression_path_reported'], data: result };
  }

  async function progressionPathAction(pathName = '') {
    const name = typeof pathName === 'object' ? pathName.pathName || pathName.name || '' : pathName;
    const result = progressionSystem.explainPath(memory, name || 'safe_survival');
    const next = result.nextMilestone;
    const message = result.ok
      ? `${result.path.displayName}: next incomplete milestone is ${next?.name || 'none'}.`
      : result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_path_reported'], data: result };
  }

  async function progressionPlanMilestoneAction(milestoneId = '') {
    const id = normalizeMilestoneInput(milestoneId);
    const result = progressionSystem.planMilestone(bot, memory, id, { maxSteps: config.maxProgressionPlanSteps || 12 });
    const message = result.message || result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_plan_reported'], data: result };
  }

  async function progressionCreateGoalAction(milestoneId = '') {
    const id = normalizeMilestoneInput(milestoneId);
    const result = progressionSystem.requestCreateProgressionGoal(bot, memory, id);
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, reason: result.reason || '', evidence: ['progression_goal_requested'], data: result };
  }

  async function confirmProgressionGoalAction() {
    const result = progressionSystem.confirmCreateProgressionGoal(bot, memory);
    const message = result.ok ? `Progression goal created: ${result.goal?.name || result.templateName}.` : result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_goal_requested'], data: result };
  }

  async function progressionCreateCurriculumAction(milestoneId = '') {
    const id = normalizeMilestoneInput(milestoneId);
    const result = progressionSystem.requestCreateProgressionCurriculum(bot, memory, id);
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, reason: result.reason || '', evidence: ['progression_curriculum_requested'], data: result };
  }

  async function confirmProgressionCurriculumAction() {
    const result = progressionSystem.confirmCreateProgressionCurriculum(bot, memory);
    const message = result.ok ? `Progression curriculum draft ready: ${result.trackName}. It will not run without approval.` : result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_curriculum_requested'], data: result };
  }

  async function progressionMarkManualCompleteAction(milestoneId = '') {
    const result = progressionSystem.requestManualMilestoneComplete(memory, normalizeMilestoneInput(milestoneId));
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, reason: result.reason || '', evidence: ['progression_manual_completion_recorded'], data: result };
  }

  async function confirmManualMilestoneCompleteAction() {
    const result = progressionSystem.confirmManualMilestoneComplete(memory);
    const message = result.ok ? `Milestone marked complete: ${result.record.id}.` : result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_manual_completion_recorded'], data: result };
  }

  async function progressionMarkManualBlockedAction(milestoneId = '') {
    const result = progressionSystem.requestManualMilestoneBlocked(memory, normalizeMilestoneInput(milestoneId));
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, reason: result.reason || '', evidence: ['progression_manual_block_recorded'], data: result };
  }

  async function confirmManualMilestoneBlockedAction() {
    const result = progressionSystem.confirmManualMilestoneBlocked(memory);
    const message = result.ok ? `Milestone marked blocked: ${result.record.id}.` : result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_manual_block_recorded'], data: result };
  }

  async function progressionResetAction() {
    const result = progressionSystem.requestResetProgression(memory);
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, reason: result.reason || '', evidence: ['progression_reset_reported'], data: result };
  }

  async function confirmProgressionResetAction() {
    const result = progressionSystem.confirmResetProgression(memory);
    const message = result.ok ? 'Progression memory reset.' : result.reason;
    say(message, true);
    return { ok: Boolean(result.ok), message, reason: result.reason || '', evidence: ['progression_reset_reported'], data: result };
  }

  async function progressionHistoryAction() {
    const history = getProgressionHistory(8);
    const message = history.length
      ? `Recent progression: ${history.slice(0, 3).map((item) => `${item.type}:${item.id || item.at}`).join(', ')}.`
      : 'No progression history yet.';
    say(message, true);
    return { ok: true, message, evidence: ['progression_history_reported'], data: { history } };
  }

  async function vanillaAdvancementStatusAction() {
    const result = progressionSystem.vanillaStatus();
    const message = `Vanilla advancements: best-effort bridge, ${result.status.recordedCount} recorded. Custom progression remains primary.`;
    say(message, true);
    return { ok: true, message, evidence: ['vanilla_advancement_status_reported'], data: result };
  }


  return {
    normalizeMilestoneInput,
    progressionStatusAction,
    progressionSummaryAction,
    progressionCheckAction,
    progressionMilestonesAction,
    progressionNextAction,
    progressionExplainMilestoneAction,
    progressionPathsAction,
    progressionPathAction,
    progressionPlanMilestoneAction,
    progressionCreateGoalAction,
    confirmProgressionGoalAction,
    progressionCreateCurriculumAction,
    confirmProgressionCurriculumAction,
    progressionMarkManualCompleteAction,
    confirmManualMilestoneCompleteAction,
    progressionMarkManualBlockedAction,
    confirmManualMilestoneBlockedAction,
    progressionResetAction,
    confirmProgressionResetAction,
    progressionHistoryAction,
    vanillaAdvancementStatusAction
  };
}
