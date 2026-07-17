import { getCommands } from './commandRegistry.js';
import { callOllama } from './ollama.js';
import { isLlmCommandRouterAllowed } from './llmMode.js';

export const NATURAL_INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    canonicalCommand: { type: 'string' },
    requiresClarification: { type: 'boolean' },
    clarificationQuestion: { type: 'string' },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
    reason: { type: 'string' },
    alternatives: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          canonicalCommand: { type: 'string' },
          label: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['canonicalCommand', 'label', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['intent', 'confidence', 'canonicalCommand', 'requiresClarification', 'clarificationQuestion', 'riskLevel', 'reason', 'alternatives'],
  additionalProperties: false
};

function commandLabel(command) {
  return `${command.aliases?.[0] || `tj ${command.name}`} :: ${command.description || command.name}`;
}

export function getLlmCommandCandidates(text, limit = 40) {
  const normalized = String(text || '').toLowerCase();
  const words = new Set(normalized.split(/\W+/).filter((word) => word.length > 2));
  return getCommands()
    .filter((command) => command.implemented)
    .map((command) => {
      const haystack = [command.name, command.category, command.description, ...(command.aliases || []), ...(command.naturalExamples || [])]
        .join(' ')
        .toLowerCase();
      let score = 0;
      for (const word of words) if (haystack.includes(word)) score += 1;
      return { command, score };
    })
    .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
    .slice(0, limit)
    .map((item) => item.command);
}

export function normalizeLlmIntentOutput(output, allowedCommands) {
  if (!output || typeof output !== 'object') return null;
  const allowed = new Set(allowedCommands.map((command) => command.aliases?.[0] || `tj ${command.name}`));
  const canonicalCommand = String(output.canonicalCommand || '').trim();
  if (!canonicalCommand || !allowed.has(canonicalCommand)) return null;
  const confidence = Number(output.confidence);
  return {
    intent: String(output.intent || 'unknown').slice(0, 80),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    canonicalCommand,
    requiresClarification: Boolean(output.requiresClarification),
    clarificationQuestion: String(output.clarificationQuestion || '').slice(0, 180),
    riskLevel: ['low', 'medium', 'high', 'unknown'].includes(output.riskLevel) ? output.riskLevel : 'unknown',
    reason: String(output.reason || 'Local Ollama translation.').slice(0, 180),
    alternatives: Array.isArray(output.alternatives) ? output.alternatives.slice(0, 3) : []
  };
}

export async function classifyNaturalIntentWithOllama(bot, text, context = {}) {
  const config = bot?.mcaiConfig || context.config || {};
  // Dialogue-only / off modes never use the model for command routing.
  if (!isLlmCommandRouterAllowed(config)) return null;
  const allowedCommands = context.allowedCommands || getLlmCommandCandidates(text);
  if (!allowedCommands.length) return null;

  try {
    const commandList = allowedCommands.map(commandLabel).join('\n');
    const result = await callOllama({
      config,
      role: 'commandRouter',
      messages: [
        {
          role: 'system',
          content: [
            'Translate ModVinny natural Minecraft bot speech into exactly one existing tj command.',
            'Choose only from the provided command list.',
            'If unsure, set requiresClarification=true.',
            'Do not invent commands, actions, skills, code, coordinates, or evidence.',
            'Output JSON only.'
          ].join(' ')
        },
        {
          role: 'user',
          content: `Message: ${text}\n\nAllowed commands:\n${commandList}`
        }
      ],
      schema: NATURAL_INTENT_SCHEMA,
      json: true,
      options: {
        temperature: 0,
        numPredict: 260,
        timeoutMs: config.llmIntentTimeoutMs || 120000
      }
    });
    if (!result.ok) return null;
    return normalizeLlmIntentOutput(result.json, allowedCommands);
  } catch {
    return null;
  }
}
