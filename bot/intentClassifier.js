import { normalizeCommonTypos } from './typoNormalizer.js';

const actionVerbs = /^(come|follow|stay|stop|cancel|halt|freeze|get|gather|mine|craft|make|build|place|return|scan|remember|forget|go|take|bring|drop|give|guard|defend|attack|fight|kill|slay|slaughter|flee|prepare|light|cook|eat|fish|hunt|plant|harvest|breed|lure|nether|portal)\b/;

export function classifyWithRules(text) {
  const normalized = normalizeCommonTypos(text);
  if (actionVerbs.test(normalized)) {
    return {
      intent: 'command',
      confidence: 0.85,
      normalizedText: normalized,
      possibleCommand: normalized,
      shouldExecuteAction: true,
      needsClarification: false,
      reason: 'action verb'
    };
  }
  if (/^(what|where|why|how|who|are|do|can|should)\b/.test(normalized)) {
    return {
      intent: 'question',
      confidence: 0.75,
      normalizedText: normalized,
      possibleCommand: '',
      shouldExecuteAction: false,
      needsClarification: false,
      reason: 'question'
    };
  }
  if (/thank|thanks|good job|sorry|hello|hey|hi|joke|scary|close/.test(normalized)) {
    return {
      intent: 'casual_chat',
      confidence: 0.8,
      normalizedText: normalized,
      possibleCommand: '',
      shouldExecuteAction: false,
      needsClarification: false,
      reason: 'casual'
    };
  }
  return {
    intent: 'unknown',
    confidence: 0.35,
    normalizedText: normalized,
    possibleCommand: '',
    shouldExecuteAction: false,
    needsClarification: true,
    reason: 'unrecognized'
  };
}

export async function classifyWithOllama() {
  return null;
}

export function parseIntentOutput(output) {
  return output && typeof output === 'object' ? output : classifyWithRules('');
}

export function mapIntentToCommand(intent) {
  return intent?.possibleCommand || '';
}

export function isActionIntent(intent) {
  return Boolean(intent?.shouldExecuteAction || intent?.intent === 'command');
}

export function isDialogueIntent(intent) {
  return ['question', 'casual_chat', 'status_question', 'task_question', 'memory_request', 'thanks', 'praise', 'apology', 'joke', 'unknown'].includes(intent?.intent);
}

export function isUnsafeIntent(intent) {
  return intent?.intent === 'unsafe';
}

export async function classifyIntent(bot, memory, messageContext) {
  const ruled = classifyWithRules(messageContext.cleanedText || messageContext.rawText || '');
  if (!messageContext.isOwner) ruled.shouldExecuteAction = false;
  return ruled;
}
