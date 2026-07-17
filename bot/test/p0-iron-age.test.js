import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSmeltInput, listSmeltable } from '../smelting.js';
import { normalizeThinResource, routeThinCoreIntent } from '../thinCore.js';
import { classifyCoreIntent } from '../coreIntentRouter.js';

function fakeBot(items = []) {
  return {
    inventory: {
      items: () => items.map((name) => ({ name, count: 8, id: 1 }))
    }
  };
}

test('charcoal is not a thin collect resource (smelt instead)', () => {
  assert.equal(normalizeThinResource('charcoal'), null);
  assert.equal(normalizeThinResource('coal'), 'coal');
});

test('normalizeSmeltInput resolves iron and charcoal', () => {
  const withRaw = fakeBot(['raw_iron', 'oak_log', 'coal']);
  assert.equal(normalizeSmeltInput(withRaw, 'iron').input, 'raw_iron');
  assert.equal(normalizeSmeltInput(withRaw, 'iron').output, 'iron_ingot');
  assert.equal(normalizeSmeltInput(withRaw, 'charcoal').input, 'oak_log');
  assert.equal(normalizeSmeltInput(withRaw, 'charcoal').output, 'charcoal');
  assert.ok(listSmeltable().some((line) => /charcoal/i.test(line)));
});

test('core intent routes charcoal to smelt not mine coal', () => {
  const charcoal = classifyCoreIntent('tj make charcoal');
  assert.equal(charcoal?.macroName, 'smelt_charcoal');
  const coal = classifyCoreIntent('tj mine coal');
  assert.equal(coal?.macroName, 'mine_coal');
  const smeltIron = classifyCoreIntent('tj smelt iron');
  assert.equal(smeltIron?.macroName, 'smelt_iron');
});

test('thin still routes dig sand and mine iron', () => {
  assert.equal(routeThinCoreIntent('tj dig 10 sand')?.args?.resource, 'sand');
  assert.equal(routeThinCoreIntent('tj get 8 iron')?.args?.resource, 'iron');
});

test('core intent routes progress to iron macro', () => {
  const route = classifyCoreIntent('tj progress to iron');
  assert.equal(route?.macroName, 'progress_to_iron');
  const age = classifyCoreIntent('tj iron age');
  assert.equal(age?.macroName, 'progress_to_iron');
});

test('thin default iron count is aligned for iron age', () => {
  const iron = routeThinCoreIntent('tj get iron');
  assert.equal(iron?.args?.resource, 'iron');
  assert.equal(iron?.args?.count, 8);
});

test('listSmeltable includes charcoal and iron', () => {
  const list = listSmeltable().join(' ');
  assert.match(list, /charcoal/i);
  assert.match(list, /iron/i);
});
