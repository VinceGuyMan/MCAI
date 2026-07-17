import { findCommandAlias } from './commandRegistry.js';

const RECOVERY_RULES = [
  { pattern: /no .*coal|missing .*coal|coal/i, options: ['tj run core mine coal', 'tj craft torches'] },
  { pattern: /no .*pickaxe|missing .*pickaxe|need .*pickaxe|tool/i, options: ['tj run core craft basic tools', 'tj tool status'] },
  { pattern: /no .*food|food.*low|hungry/i, options: ['tj run core get food', 'tj food status'] },
  { pattern: /home.*not set|no home|missing home/i, options: ['tj set home', 'tj home status'] },
  { pattern: /path|cannot reach|stuck|unreachable/i, options: ['tj recover', 'tj come here'] },
  { pattern: /storage|chest/i, options: ['tj storage status', 'tj place storage chest'] },
  { pattern: /wood|logs?|planks?/i, options: ['tj run core gather wood', 'tj inventory'] }
];

function normalizeFailureText(result = {}, context = {}) {
  return [
    result.reason,
    result.message,
    result.error?.message,
    context.reason,
    context.lastFailure?.reason
  ].filter(Boolean).join(' ');
}

function existingCommand(command) {
  return Boolean(findCommandAlias(command));
}

function uniqueCommands(commands) {
  return [...new Set(commands)].filter(existingCommand);
}

export function explainFailure(result = {}, context = {}) {
  const text = normalizeFailureText(result, context);
  if (!text) return 'That did not complete, but I do not have a detailed failure reason.';
  if (/cancel/i.test(text)) return 'That was cancelled.';
  if (/pickaxe|tool/i.test(text)) return 'I need a usable tool before I can do that reliably.';
  if (/coal/i.test(text)) return 'I am missing coal or charcoal for that.';
  if (/food|hungry/i.test(text)) return 'Food is the blocker.';
  if (/home/i.test(text)) return 'I need a saved home or base location first.';
  if (/path|reach|stuck/i.test(text)) return 'I could not path there safely.';
  if (/material|missing|not enough/i.test(text)) return 'I am missing required materials.';
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function suggestRecoveryCommands(result = {}, context = {}) {
  const text = normalizeFailureText(result, context);
  for (const rule of RECOVERY_RULES) {
    if (rule.pattern.test(text)) return uniqueCommands(rule.options);
  }
  return uniqueCommands(['tj recover', 'tj status']);
}

export function chooseSafeRecoveryOption(result = {}, context = {}) {
  const options = suggestRecoveryCommands(result, context);
  return options[0] || null;
}

export function askOwnerRecoveryChoice(result = {}, options = []) {
  const explanation = explainFailure(result);
  const safeOptions = uniqueCommands(options.length ? options : suggestRecoveryCommands(result));
  if (!safeOptions.length) {
    return { ok: false, reason: explanation, evidence: [], data: { options: [] }, error: null };
  }
  return {
    ok: false,
    reason: explanation,
    message: `${explanation} I can try: ${safeOptions.map((item) => item.replace(/^tj\s+/i, '')).join(', ')}.`,
    evidence: [],
    data: { options: safeOptions },
    error: null
  };
}
