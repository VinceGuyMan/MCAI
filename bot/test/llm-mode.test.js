import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLlmMode,
  isLlmEnabled,
  isLlmDialogueAllowed,
  isLlmCommandRouterAllowed,
  isLlmPlannerAllowed
} from '../llmMode.js';

test('default mode is dialogue', () => {
  assert.equal(resolveLlmMode({}), 'dialogue');
  assert.equal(isLlmDialogueAllowed({}), true);
  assert.equal(isLlmCommandRouterAllowed({}), false);
});

test('off mode disables all LLM use', () => {
  const cfg = { llmMode: 'off' };
  assert.equal(resolveLlmMode(cfg), 'off');
  assert.equal(isLlmEnabled(cfg), false);
  assert.equal(isLlmDialogueAllowed(cfg), false);
  assert.equal(isLlmCommandRouterAllowed(cfg), false);
});

test('full mode allows command router only when fallback flag is true', () => {
  assert.equal(isLlmCommandRouterAllowed({ llmMode: 'full', llmFallbackForMessyCommands: false }), false);
  assert.equal(isLlmCommandRouterAllowed({ llmMode: 'full', llmFallbackForMessyCommands: true }), true);
  assert.equal(isLlmDialogueAllowed({ llmMode: 'full' }), true);
});

test('planner requires full mode and advanced autonomy', () => {
  assert.equal(isLlmPlannerAllowed({ llmMode: 'full', advancedAutonomyEnabled: true }), true);
  assert.equal(isLlmPlannerAllowed({ llmMode: 'dialogue', advancedAutonomyEnabled: true }), false);
  assert.equal(isLlmPlannerAllowed({ llmMode: 'full', advancedAutonomyEnabled: false }), false);
});

test('llmEnabled false forces off', () => {
  assert.equal(resolveLlmMode({ llmMode: 'full', llmEnabled: false }), 'off');
});
