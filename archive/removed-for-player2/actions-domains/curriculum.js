/**
 * Curriculum suggestion + execution handlers.
 */
export function createCurriculumHandlers(ctx) {
  const {
    bot, config, memory, say,
    curriculumEngine, curriculumExecutor, listCurriculumTemplates, normalizeCurriculumTemplateName
  } = ctx;

  function formatSuggestionList(suggestions) {
    const recommended = (suggestions || []).filter((item) => item.recommended).slice(0, config.maxCurriculumSuggestions || 3);
    const blocked = (suggestions || []).filter((item) => !item.recommended).slice(0, 2);
    const recommendedText = recommended.map((item) => `${item.skillName} (${item.priority})`).join(', ');
    const blockedText = blocked.length ? ` Blocked: ${blocked.map((item) => `${item.skillName}: ${item.blockers?.[0] || 'blocked'}`).join('; ')}.` : '';
    return recommendedText ? `Curriculum suggests: ${recommendedText}.${blockedText}` : `No runnable skill suggestions right now.${blockedText}`;
  }

  async function curriculumStatusAction() {
    const status = curriculumEngine.getCurriculumStatus(bot, memory, { config });
    const execution = curriculumExecutor.getCurriculumExecutionStatus(bot, memory);
    const message = `Curriculum: suggestions ${status.enabled ? 'on' : 'off'}, execution ${execution.enabled ? 'on' : 'off'}, tracks ${status.tracks}, last suggestions ${status.lastSuggestions.length}.`;
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_status_reported'], data: { ...status, execution } };
  }

  async function suggestNextSkillsAction(args = {}, context = {}) {
    const suggestions = curriculumEngine.suggestNextSkills(bot, memory, {
      ...args,
      ...context,
      config,
      force: args.force ?? context.force ?? true
    });
    const message = formatSuggestionList(suggestions);
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_suggestion_reported'], data: { suggestions } };
  }

  async function suggestNextSkillAction(args = {}, context = {}) {
    const suggestion = curriculumEngine.suggestNextSkill(bot, memory, {
      ...args,
      ...context,
      config,
      force: args.force ?? context.force ?? true
    });
    const message = suggestion ? curriculumEngine.explainSuggestion(suggestion) : 'No safe curriculum skill suggestion right now.';
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_suggestion_reported'], data: { suggestion } };
  }

  async function listCurriculumTracksAction() {
    const tracks = listCurriculumTemplates();
    const text = tracks.map((track) => track.displayName).join(', ');
    const message = `Curriculum tracks: ${text}.`;
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_track_reported'], data: { tracks } };
  }

  async function suggestCurriculumTrackAction(trackName = '', options = {}) {
    const name = typeof trackName === 'object' ? trackName.trackName || trackName.name : trackName;
    const track = curriculumEngine.suggestCurriculumTrack(bot, memory, normalizeCurriculumTemplateName(name), {
      ...options,
      config,
      force: true
    });
    if (!track) {
      const message = `Unknown curriculum track: ${name || 'missing'}.`;
      say(message, true);
      return { ok: false, reason: message, evidence: ['curriculum_track_reported'] };
    }
    const first = track.skills?.find((item) => item.recommended);
    const message = first
      ? `${track.displayName}: next safe skill is ${first.skillName}. ${track.blockers?.length ? `Blocked pieces: ${track.blockers.slice(0, 2).join('; ')}.` : ''}`
      : `${track.displayName}: no runnable step yet. Blocked: ${(track.blockers || []).slice(0, 3).join('; ') || 'none listed'}.`;
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_track_reported'], data: { track } };
  }

  async function explainCurriculumAction() {
    const status = curriculumEngine.getCurriculumStatus(bot, memory, { config });
    const message = `Curriculum suggests safe skills only. It does not run them. Execution is ${status.executionEnabled ? 'enabled' : 'disabled'} in this milestone.`;
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_status_reported'], data: status };
  }

  async function explainCurriculumSuggestionAction() {
    const suggestions = curriculumEngine.getLastCurriculumSuggestions(memory);
    const message = curriculumEngine.explainSuggestion(suggestions[0]);
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_suggestion_reported'], data: { suggestion: suggestions[0] || null } };
  }

  async function curriculumHistoryAction() {
    const history = curriculumEngine.getCurriculumHistory(8);
    const last = curriculumEngine.getLastCurriculumSuggestions(memory);
    const message = last.length
      ? `Last curriculum suggestion: ${last.slice(0, 3).map((item) => item.skillName || item.trackName).join(', ')}. History entries: ${history.length}.`
      : `No curriculum suggestions recorded yet. History entries: ${history.length}.`;
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_history_reported'], data: { history, last } };
  }

  async function acceptCurriculumSuggestionAction(skillName = '') {
    const saved = curriculumEngine.acceptLastSuggestion(typeof skillName === 'object' ? skillName.skillName || '' : skillName);
    const last = saved.acceptedSuggestions.at(-1);
    const message = last ? `Marked ${last.skillName} as a useful curriculum suggestion. I am not running it.` : 'No curriculum suggestion to accept.';
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_history_reported'], data: { accepted: last || null } };
  }

  async function dismissCurriculumSuggestionAction(skillName = '') {
    const saved = curriculumEngine.dismissLastSuggestion(typeof skillName === 'object' ? skillName.skillName || '' : skillName, 'owner dismissed');
    const last = saved.dismissedSuggestions.at(-1);
    const message = last ? `Dismissed ${last.skillName} for now.` : 'No curriculum suggestion to dismiss.';
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_history_reported'], data: { dismissed: last || null } };
  }

  async function curriculumExecutionStatusAction() {
    const status = curriculumExecutor.getCurriculumExecutionStatus(bot, memory);
    const active = status.activeCurriculum;
    const message = active
      ? `Curriculum execution: ${status.enabled ? 'on' : 'off'}. Active: ${active.name} (${active.status}), ${status.progress.completed}/${status.progress.total} complete.`
      : `Curriculum execution: ${status.enabled ? 'on' : 'off'}. No active curriculum.`;
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_execution_status_reported'], data: status };
  }

  async function approveCurriculumSuggestionAction(skillName = '', context = {}) {
    const name = typeof skillName === 'object' ? skillName.skillName || skillName.name || '' : skillName;
    const sender = context.sender || config.ownerUsername;
    const result = curriculumExecutor.approveCurriculumSuggestion(bot, memory, name, {
      ...context,
      sender,
      isOwner: context.isOwner ?? sender === config.ownerUsername,
      config
    });
    say(result.message || result.reason, true);
    return {
      ok: Boolean(result.ok),
      message: result.message || result.reason,
      reason: result.reason || '',
      evidence: result.evidence || (result.ok ? ['curriculum_approved'] : ['curriculum_blocked']),
      data: result
    };
  }

  async function approveCurriculumTrackAction(trackName = '', context = {}) {
    const name = typeof trackName === 'object' ? trackName.trackName || trackName.name || '' : trackName;
    const sender = context.sender || config.ownerUsername;
    const result = curriculumExecutor.approveCurriculumTrack(bot, memory, normalizeCurriculumTemplateName(name), {
      ...context,
      sender,
      isOwner: context.isOwner ?? sender === config.ownerUsername,
      config
    });
    say(result.message || result.reason, true);
    return {
      ok: Boolean(result.ok),
      message: result.message || result.reason,
      reason: result.reason || '',
      evidence: result.evidence || (result.ok ? ['curriculum_track_approved'] : ['curriculum_blocked']),
      data: result
    };
  }

  async function startApprovedCurriculumAction(curriculumId = null) {
    const result = curriculumExecutor.startApprovedCurriculum(bot, memory, typeof curriculumId === 'object' ? curriculumId.curriculumId || null : curriculumId);
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, evidence: result.evidence || ['curriculum_resumed'], data: result };
  }

  async function executeNextCurriculumStepAction(args = {}, context = {}) {
    const sender = context.sender || config.ownerUsername;
    const result = await curriculumExecutor.executeNextCurriculumStep(bot, memory, typeof args === 'object' ? args.curriculumId || null : args, {
      ...context,
      sender,
      isOwner: context.isOwner ?? sender === config.ownerUsername,
      actions: api,
      cancellation,
      config
    });
    say(result.message || result.reason, true);
    return {
      ok: Boolean(result.ok),
      message: result.message || result.reason,
      reason: result.reason || '',
      evidence: result.evidence || (result.ok ? ['curriculum_step_completed'] : ['curriculum_step_failed']),
      data: result
    };
  }

  async function pauseCurriculumAction(reason = 'paused') {
    const text = typeof reason === 'object' ? reason.reason || 'paused' : reason;
    const result = curriculumExecutor.pauseCurriculum(bot, memory, text);
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, evidence: result.evidence || ['curriculum_paused'], data: result };
  }

  async function resumeCurriculumAction(curriculumId = null) {
    const result = curriculumExecutor.resumeCurriculum(bot, memory, typeof curriculumId === 'object' ? curriculumId.curriculumId || null : curriculumId);
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, evidence: result.evidence || ['curriculum_resumed'], data: result };
  }

  async function cancelCurriculumAction(reason = 'cancelled by owner') {
    const text = typeof reason === 'object' ? reason.reason || 'cancelled by owner' : reason;
    const result = curriculumExecutor.cancelCurriculum(bot, memory, text);
    say(result.message || result.reason, true);
    return { ok: Boolean(result.ok), message: result.message || result.reason, evidence: result.evidence || ['curriculum_step_cancelled'], data: result };
  }

  async function curriculumProgressAction() {
    const progress = curriculumExecutor.getCurriculumProgress(memory);
    const message = progress.active
      ? `Curriculum progress: ${progress.completed}/${progress.total} complete, ${progress.blocked} blocked. Next: ${progress.nextStep?.skillName || 'none'}.`
      : 'No active curriculum.';
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_execution_status_reported'], data: progress };
  }

  async function curriculumNextStepAction() {
    const message = curriculumExecutor.explainNextStep(memory);
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_execution_status_reported'], data: { step: curriculumExecutor.getNextCurriculumStep(memory) } };
  }

  async function curriculumExecutionHistoryAction() {
    const history = curriculumExecutor.getCurriculumExecutionHistory(8);
    const message = history.length
      ? `Recent curriculum execution: ${history.slice(0, 3).map((item) => `${item.skillName || item.stepId}:${item.status}`).join(', ')}.`
      : 'No curriculum execution history yet.';
    say(message, true);
    return { ok: true, message, evidence: ['curriculum_history_reported'], data: { history } };
  }

  async function explainCurriculumBlockersAction() {
    const blockers = curriculumExecutor.explainCurriculumBlockers(bot, memory);
    const message = blockers.length ? `Curriculum blocked: ${blockers.slice(0, 3).join('; ')}.` : 'No curriculum blockers right now.';
    say(message, true);
    return { ok: blockers.length === 0, message, evidence: ['curriculum_blocked'], data: { blockers } };
  }


  return {
    formatSuggestionList,
    curriculumStatusAction,
    suggestNextSkillsAction,
    suggestNextSkillAction,
    listCurriculumTracksAction,
    suggestCurriculumTrackAction,
    explainCurriculumAction,
    explainCurriculumSuggestionAction,
    curriculumHistoryAction,
    acceptCurriculumSuggestionAction,
    dismissCurriculumSuggestionAction,
    curriculumExecutionStatusAction,
    approveCurriculumSuggestionAction,
    approveCurriculumTrackAction,
    startApprovedCurriculumAction,
    executeNextCurriculumStepAction,
    pauseCurriculumAction,
    resumeCurriculumAction,
    cancelCurriculumAction,
    curriculumProgressAction,
    curriculumNextStepAction,
    curriculumExecutionHistoryAction,
    explainCurriculumBlockersAction
  };
}
