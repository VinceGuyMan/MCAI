/**
 * Natural router, competent core, learning, idle, test-arena handlers.
 */
import {
  clearPendingNaturalIntent,
  getLastNaturalCommandRoute,
  getPendingNaturalIntent,
  listNaturalExamples,
  routeNaturalCommand
} from '../../naturalCommandRouter.js';
import * as commandLearningMemory from '../../commandLearningMemory.js';
import * as selfCorrection from '../../selfCorrection.js';
import * as competencyTracker from '../../competencyTracker.js';
import * as sessionRecorder from '../../sessionRecorder.js';
import * as idleAutonomy from '../../idleAutonomy.js';
import * as idleMemory from '../../idleMemory.js';
import * as competentCore from '../../competentCore.js';
import { routeCoreIntent } from '../../coreIntentRouter.js';
import { getPlayModePatch, listPlayModes } from '../../companionMode.js';

export function createMetaHandlers(ctx) {
  const {
    bot, config, memory, say, perception, getApi, cancellation
  } = ctx;

  function summarizeNaturalRoute(route) {
    if (!route) return 'No natural command route has been recorded yet.';
    if (route.mode === 'execute') return `Intent ${route.intent}: ${route.canonicalCommand} (${Math.round(route.confidence * 100)}%).`;
    if (route.alternatives?.length) return `Intent ${route.intent}: ${route.mode}. Options: ${route.alternatives.map((item) => item.label || item.canonicalCommand).join(', ')}.`;
    return `Intent ${route.intent}: ${route.mode}. ${route.reason || ''}`.trim();
  }

  async function naturalRouterStatusAction() {
    const pending = getPendingNaturalIntent(memory);
    const last = getLastNaturalCommandRoute();
    const message = pending
      ? `Natural router: pending ${pending.canonicalCommand}. Say yes or no.`
      : `Natural router: ready. ${last ? `Last: ${summarizeNaturalRoute(last)}` : 'No recent natural intent.'}`;
    say(message, true);
    return { ok: true, message, evidence: ['natural_router_status_reported'], data: { pending, last } };
  }

  async function explainLastIntentAction() {
    const last = getLastNaturalCommandRoute();
    const message = summarizeNaturalRoute(last);
    say(message, true);
    return { ok: true, message, evidence: ['natural_router_status_reported'], data: last || {} };
  }

  async function clearPendingIntentAction() {
    const result = clearPendingNaturalIntent(memory);
    say(result.message, true);
    return { ok: true, message: result.message, evidence: ['natural_router_status_reported'], data: {} };
  }

  async function naturalExamplesAction() {
    const examples = listNaturalExamples(12);
    const message = `Natural examples: ${examples.map((item) => item.example).join('; ')}.`;
    say(message, true);
    return { ok: true, message, evidence: ['natural_examples_reported'], data: examples };
  }

  async function naturalTestAction(text = '') {
    const phrase = typeof text === 'object' ? text.text || text.query || '' : text;
    if (!phrase) {
      const message = 'Try: tj natural test: we need food';
      say(message, true);
      return { ok: false, reason: message, evidence: ['natural_router_status_reported'], data: {} };
    }
    const route = await routeNaturalCommand(bot, memory, {
      sender: config.ownerUsername,
      rawText: `${config.botUsername || 'tj'} ${phrase}`,
      isOwner: true,
      addressedToBot: true,
      config,
      dryRun: true
    });
    const message = route.ok
      ? `Intent: ${route.intent}. Mode: ${route.mode}. Canonical: ${route.canonicalCommand || 'none'}. Confidence: ${Math.round(route.confidence * 100)}%.`
      : `Intent test: ${route.mode}. ${route.reason}`;
    say(message, true);
    return { ok: true, message, evidence: ['natural_router_status_reported'], data: route };
  }

  async function competentCoreStatusAction() {
    const result = competentCore.competentCoreStatus(bot, memory);
    say(result.message, true);
    return result;
  }

  async function coreMacrosAction() {
    const macros = competentCore.listCoreMacros();
    const message = `Reliable core macros: ${macros.map((macro) => macro.name.replace(/_/g, ' ')).join(', ')}.`;
    say(message, true);
    return { ok: true, message, evidence: ['status_reported'], data: { macros } };
  }

  async function runCoreMacroAction(args = {}, context = {}) {
    const rawTextForMacro = context.rawText || memory.get()?.lastCommand?.message || '';
    const rawCoreMacro = String(rawTextForMacro)
      .replace(new RegExp(`^\\s*${config.botUsername || 'tj'}\\s+run\\s+core\\s*`, 'i'), '')
      .trim();
    const macroName = typeof args === 'string'
      ? args
      : args.macroName || args.macro || args.name || args.text || args.query || rawCoreMacro || '';
    if (!macroName) {
      const message = 'Tell me which core macro to run. Try: tj run core get food.';
      say(message, true);
      return { ok: false, reason: message, evidence: ['status_reported'], data: {} };
    }
    const actionsApi = typeof getApi === 'function' ? getApi() : null;
    if (!actionsApi) {
      const message = 'Action runtime is not ready yet. Try that command again in a moment.';
      say(message, true);
      return { ok: false, reason: message, evidence: ['status_reported'], data: {} };
    }
    const result = await competentCore.runCoreMacro(bot, memory, macroName, args, {
      ...context,
      sender: context.sender || context.username || '',
      isOwner: context.isOwner === true,
      actions: actionsApi,
      config,
      cancellation: cancellation || context.cancellation || bot?.mcaiCancellation
    });
    if (result.ok === false) {
      const steps = result.data?.stepResults || [];
      const failed = result.data?.failedStep || steps.filter((s) => !s.ok).map((s) => s.step).slice(-2).join(', ');
      const short = result.message || result.reason || 'Core macro failed.';
      say(failed ? `${short} (last issue: ${failed})` : short, true);
    } else {
      // Single summary line for macro — no per-step spam.
      const steps = result.data?.stepResults || [];
      const okSteps = steps.filter((s) => s.ok).map((s) => s.step).filter(Boolean);
      const failSteps = steps.filter((s) => !s.ok).map((s) => s.step).filter(Boolean);
      if (result.data?.partial) {
        say(result.message || 'Macro finished with partial progress.', true);
      } else if (failSteps.length && okSteps.length) {
        say(`${macroNameForChat(macroName)} done as far as possible. OK: ${okSteps.slice(-4).join(', ')}. Skipped/fail: ${failSteps.slice(0, 3).join(', ')}.`, true);
      } else {
        say(result.message || `${macroNameForChat(macroName)} complete.`, true);
      }
    }
    return result;
  }

  function macroNameForChat(name) {
    return String(name || 'macro').replace(/_/g, ' ');
  }

  async function coreRecoverAction(args = {}, context = {}) {
    return runCoreMacroAction({ ...(typeof args === 'object' ? args : {}), macroName: 'recover' }, context);
  }

  async function coreTestAction(args = {}, context = {}) {
    const rawTextForTest = context.rawText || memory.get()?.lastCommand?.message || '';
    const inferred = String(rawTextForTest)
      .replace(new RegExp(`^\\s*${config.botUsername || 'tj'}\\s+core\\s+test\\s*`, 'i'), '')
      .trim();
    const text = typeof args === 'string' ? args : args.text || args.query || inferred || '';
    if (!text) {
      const message = 'Try: tj core test we need food';
      say(message, true);
      return { ok: false, reason: message, evidence: ['status_reported'], data: {} };
    }
    const route = await routeCoreIntent(bot, memory, `${config.botUsername || 'tj'} ${text}`, { config, isOwner: true, sender: config.ownerUsername });
    const message = route
      ? `Core intent: ${route.intent}. Mode: ${route.mode}. Macro: ${route.macroName || 'none'}. Confidence: ${Math.round((route.confidence || 0) * 100)}%.`
      : 'No competent core route matched that phrase.';
    say(message, true);
    return { ok: true, message, evidence: ['status_reported'], data: route || {} };
  }

  async function naturalLearningStatusAction() {
    const mappings = commandLearningMemory.listLearnedMappings();
    const message = mappings.length
      ? `Learned command mappings: ${mappings.slice(0, 5).map((item) => `"${item.phrase}" -> ${item.canonicalCommand}`).join('; ')}.`
      : 'No learned natural command mappings yet.';
    say(message, true);
    return { ok: true, message, evidence: ['natural_learning_reported'], data: { mappings } };
  }

  async function forgetLearnedMappingAction(args = {}) {
    const phrase = typeof args === 'string' ? args : args.phrase || args.text || '';
    if (!phrase) {
      const message = 'Tell me which learned phrase to forget.';
      say(message, true);
      return { ok: false, reason: message, evidence: ['natural_learning_reported'], data: {} };
    }
    const result = commandLearningMemory.forgetCommandMapping(phrase);
    const message = result.ok ? `Forgot learned command phrase: ${phrase}.` : result.reason;
    say(message, true);
    return { ok: result.ok, message, reason: result.reason || '', evidence: ['natural_learning_reported'], data: result.mapping || {} };
  }

  async function competencyStatusAction() {
    const report = competencyTracker.getCompetencyReport();
    const message = `Competency: reliable ${report.counts.reliable || 0}, improving ${report.counts.improving || 0}, shaky ${report.counts.shaky || 0}, blocked ${report.counts.blocked || 0}, untested ${report.counts.untested || 0}.`;
    say(message, true);
    return { ok: true, message, evidence: ['competency_reported'], data: report };
  }

  async function reliableSkillsAction() {
    const skills = competencyTracker.listReliableSkills();
    const message = skills.length ? `Reliable skills: ${skills.slice(0, 12).map((item) => item.skillName).join(', ')}.` : 'No skills have enough evidence to call reliable yet.';
    say(message, true);
    return { ok: true, message, evidence: ['competency_reported'], data: skills };
  }

  async function shakySkillsAction() {
    const skills = competencyTracker.listShakySkills();
    const message = skills.length ? `Shaky skills: ${skills.slice(0, 12).map((item) => `${item.skillName}:${item.level}`).join(', ')}.` : 'No shaky skills are currently flagged.';
    say(message, true);
    return { ok: true, message, evidence: ['competency_reported'], data: skills };
  }

  async function untestedSkillsAction() {
    const skills = competencyTracker.listUntestedSkills();
    const message = skills.length ? `Untested skills: ${skills.slice(0, 12).map((item) => item.skillName).join(', ')}.` : 'No untested skills are currently flagged.';
    say(message, true);
    return { ok: true, message, evidence: ['competency_reported'], data: skills };
  }

  async function sessionEventsAction() {
    const events = sessionRecorder.getRecentSessionEvents(12);
    const message = events.length
      ? `Recent session events: ${events.map((event) => event.type).join(', ')}.`
      : 'No session events recorded yet.';
    say(message, true);
    return { ok: true, message, evidence: ['session_events_reported'], data: events };
  }

  async function interactionModeAction() {
    const state = memory.get();
    const mode = state.interactionMode || config.interactionMode || config.playMode || 'companion';
    const soft = state.companionSoftFollow ?? config.companionSoftFollow;
    const message = `Mode: ${mode}; soft-follow ${soft ? 'on' : 'off'}; learning ${state.learnNaturalCommands === false ? 'off' : 'on'}; verbosity ${state.chatVerbosity || config.chatVerbosity || 'normal'}.`;
    say(message, true);
    return { ok: true, message, evidence: ['interaction_mode_reported'], data: {
      interactionMode: mode,
      companionSoftFollow: Boolean(soft),
      learnNaturalCommands: state.learnNaturalCommands !== false,
      chatVerbosity: state.chatVerbosity || config.chatVerbosity || 'normal'
    } };
  }

  async function setInteractionModeAction(mode = 'companion') {
    const selected = typeof mode === 'object' ? mode.mode || mode.name || 'companion' : mode;
    const key = String(selected || 'companion').toLowerCase().replace(/\s+/g, '_');
    const patch = getPlayModePatch(key);
    if (!patch) {
      const message = `Modes: ${listPlayModes().join(', ')}.`;
      say(message, true);
      return { ok: false, reason: message, evidence: ['interaction_mode_reported'], data: {} };
    }
    memory.update(patch);
    // Mirror onto live config so brain/thin-core see the change this session.
    Object.assign(config, patch);
    if (bot?.mcaiConfig) Object.assign(bot.mcaiConfig, patch);
    const blurb = patch.interactionMode === 'companion'
      ? ' I will stick near you, narrate tasks, and recover from stuck paths.'
      : '';
    const message = `Mode set to ${patch.interactionMode}.${blurb}`;
    say(message, true);
    return { ok: true, message, evidence: ['interaction_mode_reported'], data: patch };
  }

  async function learnCommandsAction(enabled = true) {
    const value = typeof enabled === 'object' ? enabled.enabled !== false : enabled !== false;
    memory.update({ learnNaturalCommands: value });
    const message = `Natural command learning ${value ? 'on' : 'off'}.`;
    say(message, true);
    return { ok: true, message, evidence: ['interaction_mode_reported'], data: { learnNaturalCommands: value } };
  }

  async function idleStatusAction() {
    const status = idleAutonomy.getIdleAutonomyStatus(memory, { config, bot });
    const seconds = Math.round((status.idleDurationMs || 0) / 1000);
    const last = status.lastBehavior?.type ? ` Last: ${status.lastBehavior.type}.` : '';
    const message = `Idle autonomy: ${status.enabled ? 'on' : 'off'}, ${status.paused ? `paused (${status.pausedReason})` : 'ready'}, idle ${seconds}s.${last}`;
    say(message, true);
    return { ok: true, message, evidence: ['idle_status_reported'], data: status };
  }

  async function idleOnAction() {
    memory.update({ idleAutonomyEnabled: true });
    idleAutonomy.resumeIdleAutonomy();
    idleAutonomy.resetIdleTimer(memory, 'idle enabled');
    const message = 'Idle autonomy on.';
    say(message, true);
    return { ok: true, message, evidence: ['idle_status_reported'], data: { enabled: true } };
  }

  async function idleOffAction() {
    memory.update({ idleAutonomyEnabled: false });
    idleAutonomy.pauseIdleAutonomy('disabled by owner');
    const message = 'Idle autonomy off.';
    say(message, true);
    return { ok: true, message, evidence: ['idle_status_reported'], data: { enabled: false } };
  }

  async function quietIdleAction() {
    memory.update({ idleAutonomyEnabled: true, idleAmbientCommentsEnabled: false });
    config.idleAutonomyAllowAmbientComments = false;
    const message = 'Quiet idle on. I will keep helpful checks quieter.';
    say(message, true);
    return { ok: true, message, evidence: ['idle_status_reported'], data: { ambient: false } };
  }

  async function chattyIdleAction() {
    memory.update({ idleAutonomyEnabled: true, idleAmbientCommentsEnabled: true });
    config.idleAutonomyAllowAmbientComments = true;
    const message = 'Chatty idle on, still with cooldowns.';
    say(message, true);
    return { ok: true, message, evidence: ['idle_status_reported'], data: { ambient: true } };
  }

  async function suppressIdleSuggestionAction() {
    const result = idleAutonomy.suppressLastIdleSuggestion('owner asked not to repeat');
    const message = result.ok ? result.message : result.reason;
    say(message, true);
    return { ok: result.ok, message, reason: result.reason || '', evidence: ['idle_memory_updated'], data: result.data || {} };
  }

  async function resetIdleMemoryRequestAction() {
    memory.update({
      pendingIdleMemoryResetConfirmation: {
        requestedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        requestedBy: config.ownerUsername
      }
    });
    const message = 'Reset idle memory? Say "tj confirm reset idle memory" within 60 seconds.';
    say(message, true);
    return { ok: true, message, evidence: ['idle_status_reported'], data: {} };
  }

  async function confirmResetIdleMemoryAction() {
    const pending = memory.get().pendingIdleMemoryResetConfirmation;
    if (!pending || Date.now() > Number(pending.expiresAt || 0)) {
      memory.update({ pendingIdleMemoryResetConfirmation: null });
      const message = 'No active idle memory reset confirmation.';
      say(message, true);
      return { ok: false, reason: message, evidence: ['idle_status_reported'], data: {} };
    }
    const result = idleMemory.resetIdleMemory(true);
    memory.update({ pendingIdleMemoryResetConfirmation: null, lastIdleAutonomyBehavior: null });
    const message = result.message || 'Idle memory reset.';
    say(message, true);
    return { ok: true, message, evidence: ['idle_memory_updated'], data: result.data || {} };
  }

  async function testPlanAction(name = 'all') {
    const target = typeof name === 'object' ? name.name || name.plan || 'all' : name;
    const plans = {
      all: ['status', 'come here', 'follow me', 'get wood', 'mine coal', 'companion mode', 'help'],
      natural_commands: ['we need food', 'get wood', 'make camp', 'place chest', 'show commands'],
      core_helper: ['status', 'come here', 'gather wood', 'mine coal', 'set home'],
      survival_basics: ['eat', 'get food', 'get wood', 'mine stone', 'light home']
    };
    const steps = plans[String(target || 'all').toLowerCase()] || plans.all;
    const message = `Manual smoke plan (${target}): ${steps.join(' | ')}.`;
    say(message, true);
    return { ok: true, message, evidence: ['test_plan_reported'], data: { target, steps } };
  }

  async function testReportAction() {
    const message = 'Smoke tests live under bot/test. Curriculum/progression OS removed. Prefer companion play: come here, resources, camp.';
    say(message, true);
    return { ok: true, message, evidence: ['test_plan_reported'], data: { plans: ['all', 'natural_commands', 'core_helper', 'survival_basics'] } };
  }


  return {
    summarizeNaturalRoute,
    naturalRouterStatusAction,
    explainLastIntentAction,
    clearPendingIntentAction,
    naturalExamplesAction,
    naturalTestAction,
    competentCoreStatusAction,
    coreMacrosAction,
    runCoreMacroAction,
    coreRecoverAction,
    coreTestAction,
    naturalLearningStatusAction,
    forgetLearnedMappingAction,
    competencyStatusAction,
    reliableSkillsAction,
    shakySkillsAction,
    untestedSkillsAction,
    sessionEventsAction,
    interactionModeAction,
    setInteractionModeAction,
    learnCommandsAction,
    idleStatusAction,
    idleOnAction,
    idleOffAction,
    quietIdleAction,
    chattyIdleAction,
    suppressIdleSuggestionAction,
    resetIdleMemoryRequestAction,
    confirmResetIdleMemoryAction,
    testPlanAction,
    testReportAction
  };
}
