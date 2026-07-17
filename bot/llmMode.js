/**
 * LLM usage modes for MCAI.
 * - off:      no Ollama calls; canned dialogue only
 * - dialogue: chat flavor only (default on modest hardware)
 * - full:     dialogue + messy-command fallback + planner (heavy)
 */

export const LLM_MODES = ['off', 'dialogue', 'full'];

export function resolveLlmMode(config = {}) {
  if (config.llmEnabled === false) return 'off';
  const raw = String(config.llmMode || 'dialogue').toLowerCase().trim();
  if (raw === 'off' || raw === 'none' || raw === 'disabled') return 'off';
  if (raw === 'full' || raw === 'all' || raw === 'on') return 'full';
  return 'dialogue';
}

export function isLlmEnabled(config = {}) {
  return resolveLlmMode(config) !== 'off';
}

/** Open-ended chat / banter via model. */
export function isLlmDialogueAllowed(config = {}) {
  const mode = resolveLlmMode(config);
  return mode === 'dialogue' || mode === 'full';
}

/** Fuzzy natural-language → command via model (expensive, often times out). */
export function isLlmCommandRouterAllowed(config = {}) {
  if (resolveLlmMode(config) !== 'full') return false;
  return config.llmFallbackForMessyCommands === true;
}

/** Brain/planner idle decisions via model. */
export function isLlmPlannerAllowed(config = {}) {
  return resolveLlmMode(config) === 'full' && config.advancedAutonomyEnabled === true;
}

export function llmModeLabel(config = {}) {
  const mode = resolveLlmMode(config);
  if (mode === 'off') return 'off (code-only companion)';
  if (mode === 'dialogue') return 'dialogue-only (actions are code)';
  return 'full (dialogue + fuzzy commands + optional planner)';
}
