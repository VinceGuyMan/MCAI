import { chooseIdleBehavior, explainIdleDecision, shouldSpeakForIdleDecision } from './idleDecision.js';
import { createIdleMessage, generateIdleMessageWithOllama } from './idleSpeech.js';
import {
  getRecentIdleSummary,
  loadIdleMemory,
  recordIdleBehavior,
  recordIdleSuggestion,
  resetIdleMemory as resetIdleMemoryFile,
  suppressSuggestion
} from './idleMemory.js';
import { getSkillRunStatus, runSkill } from './skillRunner.js';

let paused = false;
let pausedReason = '';

function now() {
  return Date.now();
}

function memState(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function updateMemory(memory, patch) {
  if (typeof memory?.update === 'function') return memory.update(patch);
  if (memory && typeof memory === 'object') Object.assign(memory, patch);
  return memory;
}

function configFrom(bot, memory, context = {}) {
  return context.config || bot?.mcaiConfig || memState(memory).config || {};
}

function taskActiveInMemory(mem = {}) {
  return Boolean(
    mem.currentTask ||
    mem.activeResourceRun ||
    mem.foodTaskActive ||
    mem.farmTaskActive ||
    mem.animalTaskActive ||
    mem.activeMiningExpedition ||
    mem.activeExploration ||
    mem.currentRouteRecording ||
    mem.currentWaypointTarget ||
    mem.activeGoalStepId ||
    mem.netherScoutActive ||
    mem.pendingBlueprintBuild ||
    (mem.combatMode && mem.combatMode !== 'off') ||
    mem.activeThreat
  );
}

function hasPendingOwnerResponse(mem = {}) {
  const current = now();
  for (const [key, value] of Object.entries(mem)) {
    if (!key.startsWith('pending') || !value) continue;
    if (key === 'pendingNaturalCommandIntent' || key.includes('Confirmation') || key.includes('Clarification')) {
      if (typeof value === 'object') {
        const expiresAt = Number(value.expiresAt || mem[`${key}ExpiresAt`] || 0);
        if (!expiresAt || expiresAt > current) return true;
      } else if (value === true) {
        return true;
      }
    }
  }
  return false;
}

function pathfinderBusy(bot) {
  return Boolean(bot?.pathfinder?.goal || bot?.pathfinder?._goal || bot?.pathfinder?.isMoving?.());
}

function dangerActive(state = {}) {
  return Boolean(
    state.dangerFlags?.hostileNearby ||
    state.dangerFlags?.lavaNearby ||
    state.dangerFlags?.fireNearby ||
    state.activeThreat ||
    state.primaryThreat
  );
}

export function initializeIdleAutonomy(bot, memory, config = {}) {
  if (bot) bot.mcaiIdleAutonomy = { initialized: true, startedAt: now() };
  const mem = memState(memory);
  if (!mem.lastIdleResetAt) resetIdleTimer(memory, 'idle autonomy initialized');
  return getIdleAutonomyStatus(memory, { config, bot });
}

export function resetIdleTimer(memory, reason = 'activity') {
  updateMemory(memory, {
    lastIdleResetAt: now(),
    lastIdleResetReason: String(reason || 'activity').slice(0, 120)
  });
}

export function getIdleDurationMs(memory) {
  const mem = memState(memory);
  const lastActivity = Math.max(
    Number(mem.lastIdleResetAt || 0),
    Number(mem.lastActionAt || 0),
    Number(mem.lastCommand?.at || 0),
    Number(mem.lastOwnerActivityAt || 0),
    Number(mem.lastDialogueAt || 0),
    Number(mem.lastManualStopAt || 0)
  );
  return Math.max(0, now() - lastActivity);
}

export function isTjIdle(bot, memory, context = {}) {
  const mem = memState(memory);
  const state = context.state || {};
  const cancellation = context.cancellation || bot?.mcaiCancellation || null;
  if (!bot) return false;
  if (bot.entity === null) return false;
  if (cancellation?.isCancelled?.()) return false;
  if (pathfinderBusy(bot)) return false;
  if (context.taskQueue?.getCurrentTask?.()) return false;
  if (taskActiveInMemory(mem)) return false;
  if (getSkillRunStatus().running) return false;
  if (hasPendingOwnerResponse(mem)) return false;
  if (dangerActive(state) && context.allowDangerWarning !== true) return false;
  if (Number(state.health || 20) <= 0) return false;
  return true;
}

export function shouldRunIdleAutonomy(bot, memory, context = {}) {
  const config = configFrom(bot, memory, context);
  if (config.idleAutonomyEnabled === false || memState(memory).idleAutonomyEnabled === false) return false;
  if (paused) return false;
  const idleMemory = context.idleMemory || loadIdleMemory();
  const duration = getIdleDurationMs(memory);
  if (duration < Number(config.idleAutonomyDelayMs || 100000)) return false;
  if (!isTjIdle(bot, memory, {
    ...context,
    allowDangerWarning: dangerActive(context.state || {}) && config.idleAutonomyDangerOverridesCooldown !== false
  })) return false;
  const state = context.state || {};
  const globalCooldown = Number(config.idleAutonomyGlobalCooldownMs || 60000);
  if (!dangerActive(state) || config.idleAutonomyDangerOverridesCooldown === false) {
    if (now() - Number(idleMemory.lastIdleAt || 0) < globalCooldown) return false;
  }
  return true;
}

export async function runIdleAutonomy(bot, memory, context = {}) {
  const config = configFrom(bot, memory, context);
  const actions = context.actions || bot?.mcaiActions || {};
  const idleMemory = context.idleMemory || loadIdleMemory();
  const decision = chooseIdleBehavior(bot, memory, { ...context, config, idleMemory });
  if (!decision.ok) return { ok: false, reason: decision.reason || 'No idle behavior selected.', evidence: [], data: { decision } };

  let message = '';
  if (shouldSpeakForIdleDecision(decision, { ...context, config })) {
    message = decision.allowDialogueFlavor
      ? await generateIdleMessageWithOllama(decision, { ...context, config }).catch(() => createIdleMessage(decision, { ...context, config }))
      : createIdleMessage(decision, { ...context, config });
  }

  let skillResult = null;
  if (decision.runSkill === true && decision.skillName && config.idleAutonomyAllowSkillRunner !== false) {
    skillResult = await runSkill(bot, memory, decision.skillName, {}, {
      source: 'idleAutonomy',
      sender: config.ownerUsername || 'ModVinny',
      username: config.ownerUsername || 'ModVinny',
      isOwner: true,
      allowOnlyLowRisk: true,
      config,
      actions
    });
  } else if (message && typeof actions.answerChat === 'function') {
    await actions.answerChat(message);
  }

  recordIdleBehavior({ ...decision, text: message || skillResult?.message || explainIdleDecision(decision) });
  if (decision.suggestedCommand || /suggest|check|followup/i.test(decision.type || '')) {
    recordIdleSuggestion(decision.key, message || decision.suggestedCommand || decision.reason || decision.type);
  }
  updateMemory(memory, {
    lastIdleAutonomyAt: now(),
    lastIdleAutonomyBehavior: {
      type: decision.type,
      key: decision.key,
      message,
      suggestedCommand: decision.suggestedCommand || null,
      at: now()
    }
  });

  return {
    ok: true,
    message: message || skillResult?.message || explainIdleDecision(decision),
    evidence: ['idle_autonomy_ran'],
    data: { decision, skillResult }
  };
}

export async function idleAutonomyTick(bot, memory, context = {}) {
  const idleMemory = loadIdleMemory();
  if (!shouldRunIdleAutonomy(bot, memory, { ...context, idleMemory })) {
    return { ok: true, message: 'Idle autonomy did not run.', evidence: [], data: { ran: false } };
  }
  return runIdleAutonomy(bot, memory, { ...context, idleMemory });
}

export function pauseIdleAutonomy(reason = 'paused') {
  paused = true;
  pausedReason = String(reason || 'paused').slice(0, 160);
  return { ok: true, message: `Idle autonomy paused: ${pausedReason}` };
}

export function resumeIdleAutonomy() {
  paused = false;
  pausedReason = '';
  return { ok: true, message: 'Idle autonomy resumed.' };
}

export function getIdleAutonomyStatus(memory, context = {}) {
  const config = context.config || {};
  const summary = getRecentIdleSummary();
  return {
    enabled: memState(memory).idleAutonomyEnabled ?? config.idleAutonomyEnabled !== false,
    paused,
    pausedReason,
    idleDurationMs: getIdleDurationMs(memory),
    delayMs: Number(config.idleAutonomyDelayMs || 100000),
    lastBehavior: memState(memory).lastIdleAutonomyBehavior || summary.lastIdleBehavior,
    recentBehaviors: summary.recentBehaviors,
    recentSuggestions: summary.recentSuggestions,
    suppressedSuggestions: summary.suppressedSuggestions
  };
}

export function suppressLastIdleSuggestion(reason = 'owner asked to suppress') {
  const summary = getRecentIdleSummary();
  const key = summary.lastIdleBehavior?.key || summary.recentSuggestions.at(-1)?.key;
  if (!key) return { ok: false, reason: 'No recent idle suggestion to suppress.' };
  suppressSuggestion(key, reason, now() + 24 * 60 * 60 * 1000);
  return { ok: true, message: `Suppressed idle suggestion: ${key}`, data: { key } };
}

export function resetIdleMemory(confirm = false) {
  return resetIdleMemoryFile(confirm);
}
