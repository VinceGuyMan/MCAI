import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrain } from '../brain.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('brain tick is single-flight while asynchronous work is running', async () => {
  const gate = deferred();
  const state = {};
  const memory = {
    get: () => state,
    update: (patch) => Object.assign(state, patch)
  };
  let perceptionCalls = 0;
  const brain = createBrain({
    foodEnabled: true,
    combatEnabled: false,
    playMode: 'helper',
    thinCoreEnabled: true
  }, {
    bot: null,
    memory,
    cancellation: { isCancelled: () => false },
    perception: () => {
      perceptionCalls += 1;
      return {
        currentTask: null,
        position: null,
        health: 20,
        food: 20,
        isInNether: false,
        activeExploration: false,
        dangerFlags: {},
        missingArmorSlots: [],
        inventory: []
      };
    },
    safety: { assess: () => ({ emergency: false }) },
    actions: {
      handleFoodSurvival: () => gate.promise
    },
    taskQueue: { getCurrentTask: () => null },
    planner: {}
  });

  const first = brain.tick();
  const overlapping = brain.tick();
  assert.equal(first, overlapping);
  assert.equal(perceptionCalls, 1);

  gate.resolve(false);
  await first;
  await brain.tick();
  assert.equal(perceptionCalls, 2);
});
