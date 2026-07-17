import { findCommandAlias } from './commandRegistry.js';
import { updateMappingFailure } from './commandLearningMemory.js';

const FAILURE_PATTERNS = [];

function now() {
  return Date.now();
}

function textFromResult(result) {
  return String(result?.reason || result?.message || result?.error?.message || result || '').toLowerCase();
}

function existingOption(canonicalCommand, label, reason) {
  const command = findCommandAlias(canonicalCommand);
  if (!command || !command.implemented) return null;
  return {
    canonicalCommand: command.aliases?.[0] || canonicalCommand,
    label,
    reason
  };
}

function compactOptions(options) {
  const seen = new Set();
  return options.filter(Boolean).filter((option) => {
    const key = option.canonicalCommand;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

export function analyzeFailure(result, context = {}) {
  const text = textFromResult(result);
  const command = context.command || context.canonicalCommand || '';
  const category = (() => {
    if (/coal|charcoal/.test(text)) return 'missing_coal';
    if (/planks?|logs?|wood/.test(text) && /missing|need|not enough|lack/.test(text)) return 'missing_wood';
    if (/pickaxe|tool/.test(text) && /missing|need|no usable|not have/.test(text)) return 'missing_tool';
    if (/food|hungry|hunger/.test(text) && /missing|need|low|not have/.test(text)) return 'missing_food';
    if (/crafting table|workbench/.test(text)) return 'missing_crafting_table';
    if (/chest|storage/.test(text) && /missing|need|no/.test(text)) return 'missing_storage';
    if (/material|materials|not enough|missing/.test(text)) return 'missing_materials';
    if (/unsafe|danger|hostile|health|food too low/.test(text)) return 'unsafe';
    if (/unsupported|not implemented|cannot|can't/.test(text)) return 'unsupported';
    if (/cancel/.test(text)) return 'cancelled';
    return 'unknown';
  })();

  return {
    category,
    command,
    reason: result?.reason || result?.message || 'That did not work.',
    raw: result,
    context
  };
}

export function suggestRecoveryOptions(result, context = {}) {
  const analysis = analyzeFailure(result, context);
  const options = [];
  if (analysis.category === 'missing_coal') {
    options.push(existingOption('tj get coal', 'mine coal', 'Coal is the normal torch fuel.'));
    options.push(existingOption('tj get wood', 'gather wood', 'Wood can help with tools and backup fuel.'));
  } else if (analysis.category === 'missing_wood') {
    options.push(existingOption('tj get wood', 'gather wood', 'Wood is the missing base material.'));
    options.push(existingOption('tj craft planks', 'craft planks', 'If logs are already available, planks may solve it.'));
  } else if (analysis.category === 'missing_tool') {
    options.push(existingOption('tj make pickaxe', 'make a pickaxe', 'A usable pickaxe is needed first.'));
    options.push(existingOption('tj craft stone tools', 'craft stone tools', 'Stone tools are a good low-risk upgrade.'));
  } else if (analysis.category === 'missing_food') {
    options.push(existingOption('tj get food', 'get food', 'Find or gather food before continuing.'));
    options.push(existingOption('tj eat', 'eat', 'Eat now if food is already in inventory.'));
  } else if (analysis.category === 'missing_crafting_table') {
    options.push(existingOption('tj craft table', 'craft a crafting table', 'A crafting table unlocks more recipes.'));
    options.push(existingOption('tj place crafting table', 'place a crafting table', 'Place one if already carried.'));
  } else if (analysis.category === 'missing_storage') {
    options.push(existingOption('tj place storage chest', 'place storage', 'Create a safe storage spot.'));
    options.push(existingOption('tj register chest', 'register nearby chest', 'Use an existing chest as storage.'));
  } else if (analysis.category === 'missing_materials') {
    options.push(existingOption('tj inventory', 'check inventory', 'Check what is actually available.'));
    options.push(existingOption('tj get wood', 'gather wood', 'Wood solves many early material gaps.'));
    options.push(existingOption('tj get stone', 'gather stone', 'Stone helps tools and shelter supplies.'));
  } else if (analysis.category === 'unsafe') {
    options.push(existingOption('tj threat scan', 'scan threats', 'Check the nearby danger first.'));
    options.push(existingOption('tj flee threat', 'flee danger', 'Move away if danger is active.'));
    options.push(existingOption('tj light home', 'light home', 'Lighting can reduce future danger near base.'));
  } else if (analysis.category === 'unsupported') {
    options.push(existingOption('tj help', 'show commands', 'Pick an implemented command.'));
    options.push(existingOption('tj skills', 'show skills', 'See what is wired and safe.'));
  }
  return compactOptions(options);
}

export function createRecoveryQuestion(result, options = null) {
  const choices = options || suggestRecoveryOptions(result);
  const analysis = analyzeFailure(result);
  const plainReason = explainFailureSimply(result);
  if (!choices.length) return plainReason;
  return `${plainReason} I can try: ${choices.map((option) => option.label).join(', ')}.`;
}

export function rememberFailurePattern(command, reason, context = {}) {
  const record = {
    command: String(command || '').slice(0, 120),
    reason: String(reason || '').slice(0, 240),
    category: analyzeFailure({ reason }, context).category,
    at: now()
  };
  FAILURE_PATTERNS.unshift(record);
  FAILURE_PATTERNS.splice(50);
  if (context.originalText) updateMappingFailure(context.originalText, reason);
  return { ok: true, record };
}

export function getCommonFailureForCommand(command) {
  const normalized = String(command || '').toLowerCase();
  const matches = FAILURE_PATTERNS.filter((item) => item.command.toLowerCase() === normalized);
  if (!matches.length) return null;
  const counts = {};
  for (const match of matches) counts[match.category] = (counts[match.category] || 0) + 1;
  const [category] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  return { command, category, count: counts[category] || 0, last: matches[0] };
}

export function explainFailureSimply(result) {
  const analysis = analyzeFailure(result);
  const reason = String(analysis.reason || '').trim();
  if (analysis.category === 'missing_coal') return "I can't do that because I don't have coal.";
  if (analysis.category === 'missing_wood') return "I can't do that because I need more wood or planks.";
  if (analysis.category === 'missing_tool') return 'I need a usable tool first.';
  if (analysis.category === 'missing_food') return 'Food is the blocker right now.';
  if (analysis.category === 'missing_crafting_table') return 'I need a crafting table for that.';
  if (analysis.category === 'missing_storage') return 'I need known storage for that.';
  if (analysis.category === 'missing_materials') return `I am missing materials${reason ? `: ${reason}` : '.'}`;
  if (analysis.category === 'unsafe') return `That is unsafe right now${reason ? `: ${reason}` : '.'}`;
  if (analysis.category === 'unsupported') return `I do not have a safe implemented command for that yet${reason ? `: ${reason}` : '.'}`;
  if (analysis.category === 'cancelled') return 'That was cancelled.';
  return reason ? `That failed: ${reason}` : 'That failed, but I do not have a clearer reason yet.';
}

