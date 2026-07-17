import { findCommandAlias, getCommands } from './commandRegistry.js';
import { getSkills } from './skillRegistry.js';
import { getNaturalCommandPatterns, getNaturalExamples } from './naturalCommandMap.js';
import { classifyNaturalIntentWithOllama, getLlmCommandCandidates } from './naturalIntentClassifier.js';
import { routeCoreIntent } from './coreIntentRouter.js';
import { isInformationalOwnerQuery, routeThinCoreIntent } from './thinCore.js';
import { normalizeCommonTypos } from './typoNormalizer.js';
import {
  findLearnedCommandMapping,
  rememberCommandMapping,
  updateMappingFailure,
  updateMappingSuccess
} from './commandLearningMemory.js';
import { recordSessionEvent } from './sessionRecorder.js';

const YES_WORDS = new Set(['yes', 'yeah', 'yep', 'do it', 'correct', "that's right", 'thats right', 'go ahead', 'confirm']);
const NO_WORDS = new Set(['no', 'nope', 'cancel', 'not that', 'wrong', 'nevermind', 'never mind']);
let lastRoute = null;
const successHistory = [];
const failureHistory = [];

function now() {
  return Date.now();
}

export function normalizeNaturalText(text) {
  return normalizeCommonTypos(String(text || '')
    .toLowerCase()
    .replace(/[']/g, '')
    .replace(/[?!.,;:\]\)\}]+/g, ' ')
    .replace(/^@?tj\b\s*/i, '')
    .replace(/^!tj\b\s*/i, '')
    .replace(/^!ai\b\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim());
}

function cloneAlternative(item) {
  return {
    canonicalCommand: item.canonicalCommand,
    label: item.label || item.canonicalCommand,
    reason: item.reason || ''
  };
}

function commandMetadata(canonicalCommand) {
  const command = canonicalCommand ? findCommandAlias(canonicalCommand) : null;
  if (!command || !command.implemented) return null;
  const relatedSkills = getSkills().filter((skill) => {
    return skill.implemented && (
      skill.name === command.name ||
      skill.name === command.action ||
      skill.action === command.action
    );
  });
  const riskRank = { low: 0, medium: 1, high: 2 };
  const riskLevels = [
    command.riskLevel,
    command.requiresConfirmation ? 'medium' : null,
    ...relatedSkills.map((skill) => skill.riskLevel)
  ].filter(Boolean);
  const riskLevel = riskLevels.reduce((highest, level) => (
    (riskRank[level] ?? 0) > (riskRank[highest] ?? 0) ? level : highest
  ), 'low');
  const requiresConfirmation = Boolean(command.requiresConfirmation || relatedSkills.some((skill) => skill.requiresConfirmation));
  return { ...command, riskLevel, requiresConfirmation };
}

function createRoute(candidate, command, context = {}) {
  const riskRank = { low: 0, medium: 1, high: 2, unknown: 3 };
  const commandRisk = command?.riskLevel || (command?.requiresConfirmation ? 'medium' : 'low');
  const candidateRisk = candidate.riskLevel || commandRisk;
  const riskLevel = (riskRank[commandRisk] ?? 0) > (riskRank[candidateRisk] ?? 0) ? commandRisk : candidateRisk;
  return {
    ok: true,
    mode: candidate.mode || 'execute',
    confidence: candidate.confidence ?? 0,
    intent: candidate.intent || command?.name || 'unknown',
    canonicalCommand: candidate.canonicalCommand || command?.aliases?.[0] || null,
    action: candidate.action || command?.action || null,
    args: candidate.args || {},
    thinAction: candidate.thinAction || null,
    requiresConfirmation: Boolean(command?.requiresConfirmation || candidate.requiresConfirmation),
    riskLevel,
    reason: candidate.reason || 'Natural command match.',
    alternatives: (candidate.alternatives || []).map(cloneAlternative),
    speak: candidate.speak || '',
    source: candidate.source || context.source || 'deterministic'
  };
}

function createFailure(mode, reason, extras = {}) {
  return {
    ok: false,
    mode,
    confidence: extras.confidence ?? 0,
    intent: extras.intent || 'unknown',
    canonicalCommand: extras.canonicalCommand || null,
    action: null,
    requiresConfirmation: Boolean(extras.requiresConfirmation),
    riskLevel: extras.riskLevel || 'unknown',
    reason,
    alternatives: (extras.alternatives || []).map(cloneAlternative),
    speak: extras.speak || reason
  };
}

export function buildNaturalCommandContext(bot, memory, text) {
  const state = memory?.get?.() || {};
  const config = {
    ...(bot?.mcaiConfig || {}),
    interactionMode: state.interactionMode || bot?.mcaiConfig?.interactionMode,
    askBeforeMediumRisk: state.askBeforeMediumRisk ?? bot?.mcaiConfig?.askBeforeMediumRisk,
    autoRunLowRiskNaturalCommands: state.autoRunLowRiskNaturalCommands ?? bot?.mcaiConfig?.autoRunLowRiskNaturalCommands,
    explainFailures: state.explainFailures ?? bot?.mcaiConfig?.explainFailures,
    learnNaturalCommands: state.learnNaturalCommands ?? bot?.mcaiConfig?.learnNaturalCommands,
    sessionRecorderEnabled: state.sessionRecorderEnabled ?? bot?.mcaiConfig?.sessionRecorderEnabled,
    chatVerbosity: state.chatVerbosity || bot?.mcaiConfig?.chatVerbosity
  };
  return {
    text,
    normalizedText: normalizeNaturalText(text),
    config,
    ownerUsername: config.ownerUsername || 'ModVinny',
    botUsername: config.botUsername || 'tj',
    pending: memory?.get?.().pendingNaturalCommandIntent || null,
    commands: getCommands().filter((command) => command.implemented)
  };
}

export function getCanonicalCommandCandidates(text, context = {}) {
  const normalized = normalizeNaturalText(text);
  const deterministic = [];
  for (const entry of getNaturalCommandPatterns()) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      deterministic.push({ ...entry, source: 'deterministic', score: scoreCommandCandidate(entry, { ...context, normalizedText: normalized }) });
    }
  }

  const exampleMatches = [];
  for (const command of getCommands().filter((item) => item.implemented && Array.isArray(item.naturalExamples))) {
    for (const example of command.naturalExamples) {
      const candidate = {
        intent: command.name,
        canonicalCommand: command.aliases?.[0] || `tj ${command.name}`,
        confidence: normalizeNaturalText(example) === normalized ? 0.9 : 0.72,
        riskLevel: commandMetadata(command.aliases?.[0] || `tj ${command.name}`)?.riskLevel || (command.requiresConfirmation ? 'medium' : 'low'),
        requiresConfirmation: commandMetadata(command.aliases?.[0] || `tj ${command.name}`)?.requiresConfirmation || command.requiresConfirmation,
        reason: `Matched command example: ${example}.`,
        source: 'command_examples'
      };
      if (normalizeNaturalText(example) === normalized || normalized.includes(normalizeNaturalText(example))) {
        exampleMatches.push({ ...candidate, score: scoreCommandCandidate(candidate, { ...context, normalizedText: normalized }) });
      }
    }
  }

  return [...deterministic, ...exampleMatches].sort((a, b) => (b.score || b.confidence || 0) - (a.score || a.confidence || 0));
}

export function scoreCommandCandidate(candidate, context = {}) {
  let score = Math.round((candidate.confidence || 0) * 100);
  if (candidate.mode === 'refuse') score += 5;
  if (candidate.mode === 'clarify') score += 2;
  if (candidate.canonicalCommand && commandMetadata(candidate.canonicalCommand)) score += 10;
  if ((candidate.riskLevel || 'low') === 'low') score += 3;
  if (context.normalizedText && (candidate.naturalExamples || []).some((example) => normalizeNaturalText(example) === context.normalizedText)) score += 8;
  return score;
}

export async function classifyNaturalIntent(bot, memory, text, context = {}) {
  // Informational questions always prefer thin-core knowledge answers (never learned/LLM execute).
  if (isInformationalOwnerQuery(text) && (context.config?.thinCoreEnabled !== false && bot?.mcaiConfig?.thinCoreEnabled !== false)) {
    const thinQ = routeThinCoreIntent(text, context);
    if (thinQ) return thinQ;
  }

  if (context.config?.thinCoreEnabled === true || bot?.mcaiConfig?.thinCoreEnabled === true) {
    const thinRoute = routeThinCoreIntent(text, context);
    if (thinRoute) return thinRoute;
  }

  if (context.config?.learnNaturalCommands !== false) {
    const learned = findLearnedCommandMapping(text);
    if (learned?.matchType === 'exact' && commandMetadata(learned.canonicalCommand)) {
      return {
        intent: 'learned_command_mapping',
        canonicalCommand: learned.canonicalCommand,
        confidence: learned.matchConfidence || learned.confidence || 0.9,
        mode: 'execute',
        riskLevel: commandMetadata(learned.canonicalCommand)?.riskLevel || 'low',
        requiresConfirmation: commandMetadata(learned.canonicalCommand)?.requiresConfirmation || false,
        reason: `Learned owner-approved mapping for "${learned.phrase}".`,
        alternatives: [],
        speak: '',
        source: 'learned_mapping'
      };
    }
  }

  const coreRoute = await routeCoreIntent(bot, memory, text, context);
  if (coreRoute) {
    return {
      intent: coreRoute.intent,
      canonicalCommand: coreRoute.canonicalCommand,
      confidence: coreRoute.confidence,
      mode: coreRoute.mode,
      riskLevel: coreRoute.riskLevel,
      requiresConfirmation: coreRoute.requiresConfirmation,
      reason: coreRoute.reason,
      alternatives: coreRoute.alternatives,
      speak: coreRoute.speak,
      source: coreRoute.source
    };
  }

  if (context.config?.learnNaturalCommands !== false) {
    const learned = findLearnedCommandMapping(text);
    if (learned && commandMetadata(learned.canonicalCommand)) {
      return {
        intent: 'learned_command_mapping',
        canonicalCommand: learned.canonicalCommand,
        confidence: learned.matchConfidence || learned.confidence || 0.84,
        mode: 'execute',
        riskLevel: commandMetadata(learned.canonicalCommand)?.riskLevel || 'low',
        requiresConfirmation: commandMetadata(learned.canonicalCommand)?.requiresConfirmation || false,
        reason: `Learned owner-approved mapping for "${learned.phrase}".`,
        alternatives: [],
        speak: '',
        source: 'learned_mapping'
      };
    }
  }

  const candidates = getCanonicalCommandCandidates(text, context);
  if (candidates.length) return candidates[0];

  const allowedCommands = getLlmCommandCandidates(text, 40);
  const llm = await classifyNaturalIntentWithOllama(bot, text, { ...context, allowedCommands });
  if (!llm) return null;
  return {
    intent: llm.intent,
    canonicalCommand: llm.canonicalCommand,
    confidence: llm.confidence,
    mode: llm.requiresClarification ? 'clarify' : 'execute',
    riskLevel: llm.riskLevel,
    reason: llm.reason,
    alternatives: llm.alternatives,
    speak: llm.clarificationQuestion,
    source: 'local_ollama'
  };
}

export function mapIntentToCanonicalCommand(intent, context = {}) {
  const canonicalCommand = typeof intent === 'string' ? intent : intent?.canonicalCommand;
  const command = commandMetadata(canonicalCommand);
  if (!command) return null;
  return createRoute(typeof intent === 'object' ? intent : { canonicalCommand, confidence: 1 }, command, context);
}

export function mapIntentToAction(intent, context = {}) {
  const route = mapIntentToCanonicalCommand(intent, context);
  return route?.action || null;
}

export function shouldExecuteImmediately(routeResult) {
  if (!routeResult?.ok || routeResult.mode !== 'execute') return false;
  if (routeResult.requiresConfirmation) return false;
  if (routeResult.riskLevel === 'high' || routeResult.riskLevel === 'unknown') return false;
  // Clear low-risk matches run immediately.
  if (routeResult.riskLevel === 'low' && routeResult.confidence >= 0.85) return true;
  // Very high-confidence deterministic medium-risk helpers (e.g. place chest at 0.92+) can run without a second yes.
  // Keep conf === 0.9 on medium (make camp) as clarify so pending yes/no still works.
  if (
    routeResult.riskLevel === 'medium'
    && routeResult.confidence > 0.9
    && (routeResult.source === 'deterministic' || routeResult.source === 'thin_core' || routeResult.source === 'competent_core')
  ) {
    return true;
  }
  return false;
}

export function shouldAskClarification(routeResult) {
  if (!routeResult || routeResult.mode === 'clarify') return true;
  if (routeResult.mode === 'refuse' || routeResult.mode === 'ignore') return false;
  if (routeResult.requiresConfirmation) return true;
  if (shouldExecuteImmediately(routeResult)) return false;
  if (!['low'].includes(routeResult.riskLevel)) return routeResult.confidence >= 0.45;
  if (routeResult.riskLevel === 'medium' && routeResult.confidence >= 0.75) return true;
  return routeResult.confidence >= 0.45 && routeResult.confidence < 0.85;
}

export function createClarificationMessage(routeResult) {
  if (!routeResult) return 'I am not sure what you want me to do. Try food, wood, coal, iron, come here, make camp, or status.';
  if (routeResult.speak) return routeResult.speak;
  if (routeResult.requiresConfirmation && routeResult.canonicalCommand) {
    return `That maps to "${routeResult.canonicalCommand}", which needs confirmation. Use the normal command flow first.`;
  }
  if (routeResult.alternatives?.length) {
    return `I can do that a few ways: ${routeResult.alternatives.map((item) => item.label || item.canonicalCommand).join(', ')}. Which one?`;
  }
  if (routeResult.canonicalCommand) {
    const short = routeResult.canonicalCommand.replace(/^tj\s+/i, '');
    return `I think you mean "${short}". Say yes or no.`;
  }
  return routeResult.reason || 'I need a clearer command before doing that. Try "tj help".';
}

export function createAssumptionMessage(routeResult) {
  if (routeResult?.speak) return routeResult.speak;
  if (!routeResult?.canonicalCommand) return '';
  const label = routeResult.canonicalCommand.replace(/^tj\s+/i, '');
  if (routeResult.intent === 'get_food') return 'Food run. I am checking what I can get.';
  if (routeResult.intent === 'prepare_for_mining') return 'Good call. I will start the mining prep plan.';
  // thin-core startTaskNarration already says "On it — collecting N resource"; keep one chat line.
  if (routeResult.intent === 'collect_resource' || routeResult.thinAction === 'collect_resource') {
    return '';
  }
  if (routeResult.intent === 'come_to_owner' || routeResult.thinAction === 'come_to_owner') return 'Coming to you.';
  if (routeResult.intent === 'help') return 'Here is what I can do:';
  if (routeResult.intent === 'place_storage_chest') return 'Placing a storage chest if I have materials.';
  if (routeResult.intent === 'make_camp') return 'Setting up a small camp.';
  if (routeResult.intent === 'finish_last_job' || routeResult.thinAction === 'resume_last_collect' || routeResult.action === 'resume_last_collect') {
    return 'Picking up the last gather job.';
  }
  if (routeResult.intent === 'store_items' || routeResult.thinAction === 'store_items') return '';
  // Chat/dialogue intents should not announce "I think you want answer dialogue".
  if (/dialogue|chat|answer/i.test(label) || /dialogue|chat|answer/i.test(String(routeResult.action || ''))) {
    return '';
  }
  return `On it — ${label}.`;
}

function setPendingIntent(memory, routeResult, originalText) {
  const config = memory?.get?.().config || {};
  memory?.update?.({
    pendingNaturalCommandIntent: {
      type: 'natural_command_confirmation',
      originalText,
      canonicalCommand: routeResult.canonicalCommand,
      alternatives: (routeResult.alternatives || []).map(cloneAlternative),
      expiresAt: now() + (config.naturalCommandPendingIntentMs || 30000),
      confidence: routeResult.confidence
    }
  });
}

function setPendingClarification(memory, routeResult, originalText) {
  const config = memory?.get?.().config || {};
  memory?.update?.({
    pendingNaturalCommandIntent: {
      type: 'natural_command_clarification',
      originalText,
      canonicalCommand: routeResult.canonicalCommand || null,
      alternatives: (routeResult.alternatives || []).map(cloneAlternative),
      expiresAt: now() + (config.naturalCommandPendingIntentMs || 30000),
      confidence: routeResult.confidence
    }
  });
}

function clearPendingIntent(memory) {
  memory?.update?.({ pendingNaturalCommandIntent: null });
}

function routeFromPending(memory, pending, text) {
  const normalized = normalizeNaturalText(text);
  if (!pending || pending.expiresAt <= now()) {
    clearPendingIntent(memory);
    return null;
  }
  if (YES_WORDS.has(normalized)) {
    clearPendingIntent(memory);
    const command = commandMetadata(pending.canonicalCommand);
    if (!command) return createFailure('refuse', 'That pending command is no longer available.');
    return {
      ...createRoute({
        intent: 'pending_natural_command',
        canonicalCommand: pending.canonicalCommand,
        confidence: 1,
        reason: `Owner confirmed natural command: ${pending.originalText}.`,
        speak: `Okay, running ${pending.canonicalCommand.replace(/^tj\s+/i, '')}.`
      }, command),
      mode: 'execute'
    };
  }
  if (pending.alternatives?.length) {
    const selected = pending.alternatives.find((item) => {
      const canonical = normalizeNaturalText(item.canonicalCommand || '');
      const label = normalizeNaturalText(item.label || '');
      const commandWithoutBot = normalizeNaturalText(String(item.canonicalCommand || '').replace(/^tj\s+/i, ''));
      return normalized === canonical || normalized === label || normalized === commandWithoutBot;
    }) || pending.alternatives.find((item) => findCommandAlias(`tj ${normalized}`)?.aliases?.[0] === item.canonicalCommand);

    if (selected?.canonicalCommand) {
      clearPendingIntent(memory);
      const command = commandMetadata(selected.canonicalCommand);
      if (!command) return createFailure('refuse', 'That clarification option is no longer available.');
      if (command.requiresConfirmation) {
        return createRoute({
          intent: 'clarified_confirmation_required',
          canonicalCommand: selected.canonicalCommand,
          confidence: pending.confidence || 0.84,
          mode: 'clarify',
          reason: 'Clarified command requires the normal confirmation flow.',
          speak: `That maps to "${selected.canonicalCommand}", which needs the normal confirmation flow first.`
        }, command);
      }
      const learnResult = memory?.get?.().learnNaturalCommands === false
        ? { ok: false, reason: 'Learning disabled.' }
        : rememberCommandMapping(pending.originalText, selected.canonicalCommand, {
          isOwner: true,
          approvedByOwner: true,
          confidence: pending.confidence || 0.84,
          confirmed: true,
          notes: 'Owner clarified this natural command option.'
        });
      const route = createRoute({
        intent: 'learned_after_clarification',
        canonicalCommand: selected.canonicalCommand,
        confidence: Math.max(0.9, pending.confidence || 0.84),
        reason: `Owner clarified natural command: ${pending.originalText}.`,
        speak: `Got it. I will remember that as ${selected.canonicalCommand.replace(/^tj\s+/i, '')}.`
      }, command);
      route.learned = learnResult.ok;
      return route;
    }
  }
  if (NO_WORDS.has(normalized)) {
    clearPendingIntent(memory);
    return createFailure('refuse', 'Okay, I cancelled that pending command.', { speak: 'Okay, I cancelled that.' });
  }
  return null;
}

export async function routeNaturalCommand(bot, memory, messageContext = {}) {
  const text = messageContext.rawText || messageContext.text || '';
  const context = buildNaturalCommandContext(bot, memory, text);
  if (context.config.naturalCommandRouterEnabled === false) {
    return createFailure('ignore', 'Natural command router disabled.', { speak: '' });
  }
  const normalized = context.normalizedText;
  if (!normalized) return createFailure('ignore', 'No natural command text.', { speak: '' });

  if (messageContext.isOwner === false) {
    const route = createFailure('refuse', 'Only ModVinny can give me natural action commands.', { speak: 'Only ModVinny can tell me to do that.' });
    lastRoute = route;
    return route;
  }

  const pendingRoute = routeFromPending(memory, context.pending, normalized);
  if (pendingRoute) {
    lastRoute = pendingRoute;
    recordSessionEvent('natural_command_route', {
      ownerText: text,
      canonicalCommand: pendingRoute.canonicalCommand,
      confidence: pendingRoute.confidence,
      result: pendingRoute.mode,
      source: pendingRoute.source || 'pending'
    }, context.config);
    return pendingRoute;
  }

  const intent = await classifyNaturalIntent(bot, memory, normalized, { ...context, source: 'natural_router' });
  if (!intent) {
    const route = createFailure('ignore', 'No natural command match.', { speak: '' });
    lastRoute = route;
    return route;
  }

  if (intent.mode === 'refuse') {
    const route = createFailure('refuse', intent.reason || 'Unsupported natural command.', intent);
    lastRoute = route;
    rememberNaturalCommandFailure(text, route.reason);
    return route;
  }

  // Knowledge / Q&A from thin-core — speak only, never execute.
  if (intent.mode === 'answer' || intent.mode === 'dialogue') {
    const route = {
      ok: true,
      mode: 'answer',
      confidence: intent.confidence ?? 0.95,
      intent: intent.intent || 'knowledge',
      canonicalCommand: null,
      action: null,
      args: {},
      thinAction: null,
      requiresConfirmation: false,
      riskLevel: 'low',
      reason: intent.reason || 'Informational answer.',
      alternatives: [],
      speak: intent.speak || intent.reason || 'Ask me with a clear command when you want a job.',
      source: intent.source || 'thin_core'
    };
    lastRoute = route;
    recordSessionEvent('natural_command_route', {
      ownerText: text,
      canonicalCommand: null,
      confidence: route.confidence,
      result: 'answer',
      source: route.source
    }, context.config);
    return route;
  }

  if (intent.mode === 'clarify' && !intent.canonicalCommand) {
    const route = createFailure('clarify', intent.reason || 'Natural command needs clarification.', intent);
    if (!messageContext.dryRun && route.alternatives?.length) setPendingClarification(memory, route, text);
    lastRoute = route;
    recordSessionEvent('natural_command_clarification', {
      ownerText: text,
      alternatives: route.alternatives,
      reason: route.reason
    }, context.config);
    return route;
  }

  if (intent.source === 'thin_core' && intent.action) {
    let route = {
      ok: true,
      mode: intent.mode || 'execute',
      confidence: intent.confidence ?? 0.9,
      intent: intent.intent || intent.action,
      canonicalCommand: intent.canonicalCommand || `tj ${intent.action.replace(/_/g, ' ')}`,
      action: intent.action,
      args: intent.args || {},
      thinAction: intent.thinAction || null,
      requiresConfirmation: false,
      riskLevel: intent.riskLevel || 'low',
      reason: intent.reason || 'Thin-core natural command match.',
      alternatives: (intent.alternatives || []).map(cloneAlternative),
      speak: intent.speak || '',
      source: 'thin_core'
    };
    if (shouldExecuteImmediately(route)) {
      route.speak = createAssumptionMessage(route);
    } else if (shouldAskClarification(route)) {
      route = { ...route, mode: 'clarify', speak: createClarificationMessage(route) };
      if (!messageContext.dryRun && route.canonicalCommand) setPendingIntent(memory, route, text);
    }
    lastRoute = route;
    recordSessionEvent('natural_command_route', {
      ownerText: text,
      canonicalCommand: route.canonicalCommand,
      confidence: route.confidence,
      result: route.mode,
      source: route.source
    }, context.config);
    return route;
  }

  const command = commandMetadata(intent.canonicalCommand);
  if (!command) {
    const route = createFailure('refuse', `That maps to unsupported command: ${intent.canonicalCommand || 'none'}.`, {
      intent: intent.intent,
      canonicalCommand: intent.canonicalCommand,
      speak: 'I do not have a safe command for that yet.'
    });
    lastRoute = route;
    rememberNaturalCommandFailure(text, route.reason);
    return route;
  }

  let route = createRoute(intent, command, context);
  if (route.requiresConfirmation || route.riskLevel === 'high') {
    route = {
      ...route,
      mode: 'clarify',
      speak: route.speak || `That maps to "${route.canonicalCommand}", which needs the normal confirmation flow.`
    };
  } else if (shouldExecuteImmediately(route)) {
    route.speak = createAssumptionMessage(route);
  } else if (shouldAskClarification(route)) {
    route = { ...route, mode: 'clarify', speak: createClarificationMessage(route) };
    if (!messageContext.dryRun && route.canonicalCommand) setPendingIntent(memory, route, text);
  }

  lastRoute = route;
  recordSessionEvent('natural_command_route', {
    ownerText: text,
    canonicalCommand: route.canonicalCommand,
    confidence: route.confidence,
    result: route.mode,
    source: route.source
  }, context.config);
  return route;
}

export function rememberNaturalCommandSuccess(text, command, result) {
  successHistory.unshift({ text, command, ok: result?.ok !== false, at: now() });
  successHistory.splice(20);
  const learned = findLearnedCommandMapping(text);
  if (learned?.canonicalCommand === command) updateMappingSuccess(learned.phrase);
  recordSessionEvent('command_execution_result', {
    ownerText: text,
    canonicalCommand: command,
    result: result?.ok === false ? 'failed' : 'ok',
    evidence: result?.evidence || []
  });
}

export function rememberNaturalCommandFailure(text, reason) {
  failureHistory.unshift({ text, reason, at: now() });
  failureHistory.splice(20);
  const learned = findLearnedCommandMapping(text);
  if (learned) updateMappingFailure(learned.phrase, reason);
  recordSessionEvent('natural_command_failure', { ownerText: text, reason });
}

export function getLastNaturalCommandRoute() {
  return lastRoute ? { ...lastRoute, alternatives: (lastRoute.alternatives || []).map(cloneAlternative) } : null;
}

export function getNaturalCommandHistory() {
  return {
    successes: successHistory.map((item) => ({ ...item })),
    failures: failureHistory.map((item) => ({ ...item }))
  };
}

export function getPendingNaturalIntent(memory) {
  const pending = memory?.get?.().pendingNaturalCommandIntent || null;
  if (!pending || pending.expiresAt <= now()) return null;
  return { ...pending };
}

export function clearPendingNaturalIntent(memory) {
  clearPendingIntent(memory);
  return { ok: true, message: 'Pending natural command cleared.' };
}

export function listNaturalExamples(limit = 24) {
  return getNaturalExamples().slice(0, limit);
}
