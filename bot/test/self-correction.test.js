import test from 'node:test';
import assert from 'node:assert/strict';
import { findCommandAlias } from '../commandRegistry.js';
import {
  analyzeFailure,
  createRecoveryQuestion,
  explainFailureSimply,
  suggestRecoveryOptions
} from '../selfCorrection.js';

test('failure analysis classifies missing resources', () => {
  assert.equal(analyzeFailure({ reason: 'missing coal for torches' }).category, 'missing_coal');
  assert.equal(analyzeFailure({ reason: 'Need a usable pickaxe first' }).category, 'missing_tool');
});

test('recovery options are existing registered commands', () => {
  const options = suggestRecoveryOptions({ ok: false, reason: 'missing coal for torches' });
  assert.ok(options.length >= 1);
  for (const option of options) {
    assert.ok(findCommandAlias(option.canonicalCommand), `${option.canonicalCommand} should exist`);
  }
});

test('recovery explanation is concise and actionable', () => {
  const message = createRecoveryQuestion({ ok: false, reason: 'missing 24 planks' });
  assert.match(message, /wood|planks|try/i);
  assert.match(explainFailureSimply({ reason: 'unsupported feature' }), /safe implemented command|not have/i);
});

