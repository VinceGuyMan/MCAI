import { runSkill } from './skillRunner.js';
import { getCoreMacro, isCoreMacroAllowed, listCoreMacros as listMacroDefinitions } from './coreMacros.js';
import { getCoreObservation } from './coreObservation.js';
import { askOwnerRecoveryChoice, explainFailure, suggestRecoveryCommands } from './coreRecovery.js';
import { isCancelledError } from './cancellation.js';

let activeCoreMacro = null;

function now() {
  return Date.now();
}

function standardOk(message, evidence = [], data = {}) {
  return { ok: true, message, evidence: [...new Set(evidence.filter(Boolean))], data };
}

function standardFail(reason, evidence = [], data = {}, error = null) {
  return { ok: false, reason, message: reason, evidence: [...new Set(evidence.filter(Boolean))], data, error };
}

function configFrom(bot, memory, context = {}) {
  return {
    ...(bot?.mcaiConfig || {}),
    ...(memory?.get?.().config || {}),
    ...(context.config || {})
  };
}

function senderIsOwner(bot, memory, context = {}) {
  if (context.isOwner === true) return true;
  const config = configFrom(bot, memory, context);
  const sender = context.sender || context.username || context.requestedBy || null;
  return Boolean(sender && sender === (config.ownerUsername || 'ModVinny'));
}

function cancellationFrom(bot, context = {}) {
  return context.cancellation || bot?.mcaiCancellation || null;
}

function throwIfCancelled(bot, context = {}, macro = null) {
  const cancellation = cancellationFrom(bot, context);
  if (macro?.allowDuringCancellation) return;
  cancellation?.throwIfCancelled?.();
  if (activeCoreMacro?.cancelled) {
    const error = new Error(activeCoreMacro.reason || 'cancelled');
    error.cancelled = true;
    throw error;
  }
}

function mergeEvidence(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

function macroNameForDisplay(macroName) {
  return String(macroName || '').replace(/_/g, ' ');
}

function withStepArgs(stepArgs = {}, macroArgs = {}) {
  const result = { ...stepArgs };
  for (const key of ['targetCount', 'count', 'itemName', 'item', 'toolType', 'resourceName']) {
    if (macroArgs[key] !== undefined && result[key] === undefined) result[key] = macroArgs[key];
  }
  return result;
}

async function executeActionStep(bot, memory, step, args, context) {
  const actions = context.actions || bot?.mcaiActions;
  if (!actions) return standardFail('actions.js is not available.');
  const stepArgs = withStepArgs(step.args || {}, args || {});
  const actionContext = {
    ...context,
    source: 'competentCore',
    silent: true,
    // One summary at end of macro — suppress per-step chat spam.
    quietMacro: true,
    ownerUsername: configFrom(bot, memory, context).ownerUsername || 'ModVinny',
    config: configFrom(bot, memory, context),
    bot,
    memory,
    cancellation: cancellationFrom(bot, context)
  };
  if (typeof actions.executeAction === 'function') {
    return actions.executeAction(step.name, stepArgs, actionContext);
  }
  if (typeof actions[step.name] !== 'function') return standardFail(`Action is not wired: ${step.name}`);
  const output = Object.keys(stepArgs).length ? await actions[step.name](stepArgs, actionContext) : await actions[step.name]();
  return output && typeof output === 'object' && 'ok' in output
    ? output
    : standardOk(`${step.name} completed.`, [], { output });
}

async function executeSkillStep(bot, memory, step, args, context) {
  return runSkill(bot, memory, step.name, withStepArgs(step.args || {}, args || {}), {
    ...context,
    source: 'competentCore',
    force: step.force === true,
    actions: context.actions || bot?.mcaiActions,
    cancellation: cancellationFrom(bot, context)
  });
}

async function executeStep(bot, memory, macro, step, args, context) {
  if (step.type === 'report') return standardOk(step.message || 'Step complete.');
  if (step.type === 'skill') return executeSkillStep(bot, memory, step, args, context);
  if (step.type === 'action') return executeActionStep(bot, memory, step, args, context);
  return standardFail(`Unknown core step type: ${step.type}`);
}

export function competentCoreStatus(bot, memory) {
  const config = configFrom(bot, memory);
  const observation = getCoreObservation(bot, memory);
  return standardOk(
    `Competent core is ${config.competentCoreEnabled === false ? 'off' : 'on'}; active macro: ${activeCoreMacro?.macroName || 'none'}.`,
    ['status_reported'],
    {
      enabled: config.competentCoreEnabled !== false,
      mode: config.competentCoreMode || 'helper',
      activeMacro: getActiveCoreMacro(memory),
      macros: listCoreMacros().map((macro) => macro.name),
      observation
    }
  );
}

export function listCoreMacros() {
  return listMacroDefinitions().map((macro) => ({
    name: macro.name,
    description: macro.description,
    riskLevel: macro.riskLevel,
    requiresConfirmation: macro.requiresConfirmation,
    aliases: macro.aliases
  }));
}

export function explainCoreMacro(macroName) {
  const macro = getCoreMacro(macroName);
  if (!macro) return null;
  return {
    name: macro.name,
    description: macro.description,
    riskLevel: macro.riskLevel,
    requiresConfirmation: macro.requiresConfirmation,
    steps: macro.steps.map((step) => step.type === 'report' ? `report:${step.message}` : `${step.type}:${step.name}`)
  };
}

export function getActiveCoreMacro(memory = null) {
  return activeCoreMacro ? { ...activeCoreMacro } : memory?.get?.().activeCoreMacro || null;
}

export function canRunCoreMacro(bot, memory, macroName, context = {}) {
  const config = configFrom(bot, memory, context);
  const macro = getCoreMacro(macroName);
  if (!macro) return standardFail(`Unsupported core macro: ${macroName}`);
  if (config.competentCoreEnabled === false) return standardFail('Competent core is disabled.');
  if (!senderIsOwner(bot, memory, context)) return standardFail('Only ModVinny can run core macros.');
  if (activeCoreMacro && activeCoreMacro.macroName !== macro.name) return standardFail(`Another core macro is active: ${activeCoreMacro.macroName}`);
  if (config.competentCoreAllowOnlySafeMacros !== false && !isCoreMacroAllowed(macro.name, config)) {
    return standardFail(`Core macro is not in the allowed list: ${macro.name}`);
  }
  // Allow-listed macros may run even if risk is medium (e.g. long progression helpers).
  // Non-listed macros are already rejected above when allow-only-safe is on.
  if (
    config.competentCoreAllowOnlySafeMacros !== false
    && macro.riskLevel !== 'low'
    && macro.riskLevel !== 'medium'
  ) {
    return standardFail(`Core macro is not low/medium-risk: ${macro.name}`);
  }
  if (macro.requiresConfirmation && context.confirmed !== true && context.approved !== true) {
    return standardFail(`${macro.name} requires confirmation.`);
  }
  const cancellation = cancellationFrom(bot, context);
  if (cancellation?.isCancelled?.() && !macro.allowDuringCancellation) {
    return standardFail(`Core macro blocked because cancellation is active: ${cancellation.getCancellationReason?.() || 'cancelled'}`);
  }
  return { ok: true, macro };
}

export async function runCoreMacro(bot, memory, macroName, args = {}, context = {}) {
  const canRun = canRunCoreMacro(bot, memory, macroName, context);
  if (!canRun.ok) return canRun;
  const macro = canRun.macro;
  const config = configFrom(bot, memory, context);
  const cancellation = cancellationFrom(bot, context);
  const startedAt = now();
  const timeoutMs = Math.max(
    1000,
    Number(args.timeoutMs || macro.timeoutMs || config.competentCoreMaxActiveTaskMs || 180000)
  );
  const taskId = `core:${macro.name}:${startedAt}`;
  let localCancelled = false;

  activeCoreMacro = {
    taskId,
    macroName: macro.name,
    startedAt,
    args: { ...args },
    sender: context.sender || context.username || '',
    cancelled: false,
    reason: ''
  };
  memory?.update?.({ activeCoreMacro });
  cancellation?.registerCancelableTask?.(taskId, ({ reason }) => {
    localCancelled = true;
    if (activeCoreMacro?.taskId === taskId) {
      activeCoreMacro.cancelled = true;
      activeCoreMacro.reason = reason || 'cancelled';
    }
  });

  const evidence = [];
  const stepResults = [];
  try {
    for (const step of macro.steps) {
      if (now() - startedAt > timeoutMs) {
        // Soft-complete on timeout if we made progress through optional steps.
        const anyOk = stepResults.some((s) => s.ok);
        if (anyOk && macro.name === 'progress_to_iron') {
          return standardOk(
            `Progress to iron timed out after partial work. Steps done: ${stepResults.filter((s) => s.ok).map((s) => s.step).join(', ') || 'none'}. Say "finish last job" or run the next step manually.`,
            mergeEvidence(evidence, ['skill_timed_out', 'partial_progress']),
            { macroName: macro.name, stepResults, partial: true }
          );
        }
        return standardFail('Core macro timed out.', mergeEvidence(evidence, ['skill_timed_out']), { macroName: macro.name, stepResults });
      }
      if (localCancelled && !macro.allowDuringCancellation) throw new Error('cancelled');
      throwIfCancelled(bot, context, macro);
      const result = await executeStep(bot, memory, macro, step, args, context);
      // Treat partial collect success (got some of target) as ok for optional gather steps.
      const softPartial = step.optional
        && result?.ok === false
        && /only got|partial|inventory count did not reach/i.test(String(result?.reason || result?.message || ''))
        && Number(result?.data?.collectedCount || result?.evidence?.collectedCount || 0) > 0;
      const stepOk = result?.ok !== false || softPartial;
      stepResults.push({
        step: step.type === 'report' ? 'report' : step.name,
        ok: stepOk,
        message: result?.message || result?.reason || ''
      });
      evidence.push(...(Array.isArray(result?.evidence) ? result.evidence : []));
      if (result?.ok === false && !step.optional && !softPartial) {
        const failure = standardFail(result.reason || result.message || `${step.name} failed.`, mergeEvidence(evidence), {
          macroName: macro.name,
          failedStep: step.name,
          stepResults,
          recovery: suggestRecoveryCommands(result, context)
        }, result.error || null);
        if (config.competentCoreAskOnFailure !== false) failure.data.recovery = coreFailureRecovery(bot, memory, failure, context);
        return failure;
      }
    }
    const resultEvidence = mergeEvidence(evidence, macro.successEvidence || []);
    return standardOk(`${macroNameForDisplay(macro.name)} complete.`, resultEvidence, {
      macroName: macro.name,
      durationMs: now() - startedAt,
      stepResults
    });
  } catch (error) {
    const reason = isCancelledError(error) || localCancelled || /cancel/i.test(error.message || '') ? 'cancelled' : error.message || 'Core macro failed.';
    return standardFail(reason, mergeEvidence(evidence, reason === 'cancelled' ? ['skill_cancelled'] : ['skill_failed']), {
      macroName: macro.name,
      durationMs: now() - startedAt,
      stepResults,
      recovery: suggestRecoveryCommands({ reason }, context)
    }, reason === 'cancelled' ? null : { name: error.name || 'Error', message: error.message || String(error) });
  } finally {
    cancellation?.unregisterCancelableTask?.(taskId);
    if (activeCoreMacro?.taskId === taskId) activeCoreMacro = null;
    memory?.update?.({ activeCoreMacro: null });
  }
}

export async function handleCoreIntent(bot, memory, intent, context = {}) {
  const macroName = typeof intent === 'string' ? intent : intent?.macroName;
  if (!macroName) return standardFail('No core macro was selected.');
  return runCoreMacro(bot, memory, macroName, intent?.args || {}, context);
}

export function stopCoreMacro(bot, memory, reason = 'cancelled') {
  if (!activeCoreMacro) return standardFail('No core macro is active.');
  const taskId = activeCoreMacro.taskId;
  activeCoreMacro.cancelled = true;
  activeCoreMacro.reason = reason;
  cancellationFrom(bot)?.cancelTask?.(taskId, reason);
  memory?.update?.({ activeCoreMacro: null });
  activeCoreMacro = null;
  return standardOk('Core macro stopped.', ['skill_cancelled'], { taskId, reason });
}

export function coreFailureRecovery(bot, memory, result, context = {}) {
  const options = suggestRecoveryCommands(result, context);
  return {
    explanation: explainFailure(result, context),
    options,
    prompt: askOwnerRecoveryChoice(result, options).message
  };
}
