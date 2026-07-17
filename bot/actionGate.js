import { getCommands } from './commandRegistry.js';

const DEFAULT_OWNER = 'ModVinny';

const riskyActionPatterns = [
  /nether.*entry/i,
  /portal.*light/i,
  /trade|villager.*buy/i,
  /blueprint.*build|schematic/i,
  /enchant|anvil|book|potion|brew/i,
  /diamond|netherite|deep.*min/i,
  /pvp/i,
  /bridge.*(register|delete|region)/i,
  /memory.*reset/i
];

const allowedDuringCancellation = [
  /^stop$/i,
  /cancel/i,
  /status/i,
  /summary/i,
  /history/i,
  /list/i,
  /help/i
];

function commandsForAction(actionName) {
  return getCommands().filter((command) => command.action === actionName || command.name === actionName);
}

function ownerFrom(context = {}) {
  return context.ownerUsername || context.config?.ownerUsername || context.bot?.mcaiConfig?.ownerUsername || DEFAULT_OWNER;
}

function senderFrom(context = {}) {
  return context.sender || context.username || context.requestedBy || null;
}

function isOwnerContext(context = {}) {
  if (context.isOwner === true) return true;
  const sender = senderFrom(context);
  return Boolean(sender && sender === ownerFrom(context));
}

function isAllowedDuringCancellation(actionName) {
  return allowedDuringCancellation.some((pattern) => pattern.test(String(actionName || '')));
}

function isLikelyWorldMutation(actionName) {
  const name = String(actionName || '');
  if (/status|summary|history|list|help|suggest|check|readiness|scan|report|paths?|milestones?/i.test(name)) return false;
  return /mine|gather|build|blueprint|place|break|dig|craft|store|withdraw|trade|enchant|anvil|potion|brew|attack|combat|nether|portal|farm|harvest|plant|breed|lure|give|drop/i.test(name);
}

export function normalizeActionResult(result) {
  if (result && typeof result === 'object') {
    return {
      ok: Boolean(result.ok),
      message: result.message || result.reason || '',
      reason: result.reason || (result.ok === false ? result.message || 'Action failed.' : ''),
      evidence: Array.isArray(result.evidence) ? result.evidence : [],
      data: result.data ?? result.result ?? {},
      error: result.error ?? null
    };
  }
  if (typeof result === 'string') return { ok: true, message: result, evidence: [], data: {}, error: null };
  return { ok: true, message: 'Action completed.', evidence: [], data: result ?? {}, error: null };
}

export function rejectAction(reason, extra = {}) {
  return { ok: false, reason, message: reason, evidence: [], data: {}, error: null, ...extra };
}

export function getActionSafetyMetadata(actionName) {
  const commands = commandsForAction(actionName);
  if (!commands.length) {
    return {
      actionName,
      ownerOnly: true,
      implemented: true,
      requiresConfirmation: riskyActionPatterns.some((pattern) => pattern.test(String(actionName || ''))),
      riskLevel: 'unknown',
      commands: []
    };
  }
  return {
    actionName,
    ownerOnly: commands.every((command) => command.ownerOnly !== false),
    implemented: commands.some((command) => command.implemented !== false),
    requiresConfirmation: commands.some((command) => command.requiresConfirmation === true),
    riskLevel: commands.some((command) => command.riskLevel === 'high') ? 'high' : commands.some((command) => command.riskLevel === 'medium') ? 'medium' : 'low',
    commands
  };
}

export function isRiskyAction(actionName) {
  const metadata = getActionSafetyMetadata(actionName);
  if (metadata.commands.length) return Boolean(metadata.requiresConfirmation || ['medium', 'high'].includes(metadata.riskLevel));
  return Boolean(metadata.requiresConfirmation);
}

export function actionRequiresConfirmation(actionName) {
  return isRiskyAction(actionName);
}

export function actionIsOwnerOnly(actionName) {
  return getActionSafetyMetadata(actionName).ownerOnly;
}

export function actionIsImplemented(actionName, actionApi = {}) {
  if (typeof actionApi[actionName] !== 'function') return false;
  return getActionSafetyMetadata(actionName).implemented !== false;
}

export function validateActionRequest(actionName, args = {}, context = {}) {
  const actionApi = context.actionApi || context.actions || {};
  if (!actionName || typeof actionName !== 'string') return rejectAction('Action name is required.');
  if (actionName === 'executeAction') return rejectAction('executeAction cannot be called as an action.');
  if (typeof actionApi[actionName] !== 'function') return rejectAction(`Unknown action: ${actionName}`, { evidence: ['action_missing'] });
  if (!actionIsImplemented(actionName, actionApi)) return rejectAction(`Action is not implemented: ${actionName}`);

  if (context.source === 'idleAutonomy') {
    const config = context.config || context.bot?.mcaiConfig || {};
    const blocked = new Set(config.idleAutonomyBlockedActions || []);
    if (blocked.has(actionName)) return rejectAction(`Idle autonomy cannot run blocked action: ${actionName}`);
    if (context.allowOnlyLowRisk === true && isRiskyAction(actionName)) return rejectAction(`Idle autonomy cannot run risky action: ${actionName}`);
    if (config.idleAutonomyAllowWorldMutation !== true && isLikelyWorldMutation(actionName)) {
      return rejectAction(`Idle autonomy cannot run mutating action: ${actionName}`);
    }
  }

  const cancellation = context.cancellation || context.bot?.mcaiCancellation || null;
  if (cancellation?.isCancelled?.() && !isAllowedDuringCancellation(actionName)) {
    return rejectAction(`Action rejected because cancellation is active: ${cancellation.getCancellationReason?.() || 'cancelled'}`);
  }

  if (actionIsOwnerOnly(actionName) && !isOwnerContext(context)) {
    return rejectAction('Only ModVinny can run that action.');
  }

  if (actionRequiresConfirmation(actionName) && context.confirmed !== true && context.approved !== true) {
    return rejectAction(`${actionName} requires confirmation before it can run.`);
  }

  const safety = context.safety || context.bot?.mcaiSafety || null;
  if (typeof safety?.validateActionRequest === 'function') {
    const result = safety.validateActionRequest(actionName, args, context);
    if (result && result.ok === false) return rejectAction(result.reason || 'Safety blocked this action.');
  }

  return { ok: true, metadata: getActionSafetyMetadata(actionName) };
}

export async function executeGatedAction(bot, memory, actionName, args = {}, context = {}) {
  const actionApi = context.actionApi || context.actions || bot?.mcaiActions || {};
  const validation = validateActionRequest(actionName, args, { ...context, bot, memory, actionApi });
  if (!validation.ok) return validation;
  try {
    const output = Array.isArray(args?._positional)
      ? await actionApi[actionName](...args._positional)
      : args && Object.keys(args).length
        ? await actionApi[actionName](args, context)
        : await actionApi[actionName]();
    return normalizeActionResult(output);
  } catch (error) {
    return rejectAction(error.message || `${actionName} failed`, { error: { name: error.name || 'Error', message: error.message || String(error) } });
  }
}
