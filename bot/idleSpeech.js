import { callOllama } from './ollama.js';
import { isLlmDialogueAllowed } from './llmMode.js';

const MAX_IDLE_MESSAGE_LENGTH = 160;

function trimMessage(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  return cleaned.length <= MAX_IDLE_MESSAGE_LENGTH ? cleaned : `${cleaned.slice(0, MAX_IDLE_MESSAGE_LENGTH - 1).trim()}.`;
}

export function createSafetyIdleMessage(decision, context = {}) {
  const state = context.state || {};
  if (decision?.danger === 'low_food' || Number(state.food || 20) <= 8) {
    return trimMessage("Food is getting low. I won't run off, but food should be next.");
  }
  if (decision?.danger === 'low_health' || Number(state.health || 20) <= 8) {
    return trimMessage("Health is low. I'm staying cautious until we're safer.");
  }
  return trimMessage("I noticed possible danger nearby. I'm not starting anything risky.");
}

export function createSuggestionIdleMessage(decision) {
  const type = decision?.type || '';
  if (type === 'owner_distance_check') return trimMessage("I'm a little far from you. Staying close would be safer.");
  if (type === 'food_check') return trimMessage("Food is looking thin. Getting food soon would help.");
  if (type === 'base_check') return trimMessage('We are near home. Lighting or storage is probably the next useful base check.');
  if (type === 'progression_suggestion') return trimMessage('I can check the next safe milestone whenever you want.');
  if (type === 'curriculum_suggestion') return trimMessage('A quick readiness check would be useful practice.');
  if (type === 'gear_suggestion') return trimMessage('Gear status is worth checking before anything risky.');
  if (type === 'pending_followup') return trimMessage(decision.text || 'That earlier blocker is still worth fixing.');
  return trimMessage(decision?.text || 'I have a small safe suggestion ready.');
}

export function createAmbientIdleMessage(decision, context = {}) {
  const state = context.state || {};
  if (state.homeExists) return trimMessage("Area looks calm. I'm staying close.");
  if (state.dimension && /nether|end/i.test(String(state.dimension))) return trimMessage("I'm idle, and I'm keeping this cautious.");
  return trimMessage("I'm not doing anything risky. Just keeping watch.");
}

export function createIdleClarification(decision) {
  return trimMessage(decision?.clarification || 'I can suggest a safe next step, but I need you to choose.');
}

export function fallbackIdleMessage(decision, context = {}) {
  if (!decision) return '';
  if (decision.shouldSpeak === false) return '';
  if (decision.type === 'safety_scan') return createSafetyIdleMessage(decision, context);
  if (decision.type === 'ambient_comment' || decision.type === 'memory_reflection') return createAmbientIdleMessage(decision, context);
  if (decision.mode === 'clarify') return createIdleClarification(decision, context);
  return createSuggestionIdleMessage(decision, context);
}

export function shouldUseDialogueModel(decision) {
  return Boolean(decision?.type === 'ambient_comment' && decision?.allowDialogueFlavor === true);
}

export async function generateIdleMessageWithOllama(decision, context = {}) {
  if (!shouldUseDialogueModel(decision)) return fallbackIdleMessage(decision, context);
  const config = context.config || context.bot?.mcaiConfig || {};
  if (!isLlmDialogueAllowed(config)) return fallbackIdleMessage(decision, context);
  try {
    const response = await callOllama({
      config,
      role: 'dialogue',
      messages: [
        {
          role: 'system',
          content: 'Write one short Minecraft bot idle comment under 120 characters. Do not suggest risky action. Do not claim feelings or consciousness.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            behavior: decision.type,
            reason: decision.reason || '',
            context: {
              health: context.state?.health,
              food: context.state?.food,
              nearHome: context.state?.nearHome
            }
          })
        }
      ],
      options: { temperature: 0.6, stream: false, think: false, timeoutMs: context.config?.llmDialogueTimeoutMs || 120000 }
    });
    const text = response?.text || response?.message || response?.content || '';
    return trimMessage(text || fallbackIdleMessage(decision, context));
  } catch {
    return fallbackIdleMessage(decision, context);
  }
}

export function createIdleMessage(decision, context = {}) {
  return fallbackIdleMessage(decision, context);
}
