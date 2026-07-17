import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPlayModeToMemory,
  buildGroundedAmbientLine,
  companionFeatureEnabled,
  getPlayMode,
  getPlayModePatch,
  isCompanionMode,
  listPlayModes,
  shouldNarrateTasks,
  tryStuckRecovery
} from '../companionMode.js';
import { routeThinCoreIntent } from '../thinCore.js';
import { routeNaturalCommand } from '../naturalCommandRouter.js';

function fakeMemory(seed = {}) {
  let state = {
    interactionMode: 'companion',
    playMode: 'companion',
    companionSoftFollow: true,
    companionTaskNarration: true,
    companionStuckRecovery: true,
    ...seed
  };
  return {
    get: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
    }
  };
}

test('play mode patches include companion and list all modes', () => {
  const modes = listPlayModes();
  assert.ok(modes.includes('companion'));
  assert.ok(modes.includes('helper'));
  const patch = getPlayModePatch('companion');
  assert.equal(patch.interactionMode, 'companion');
  assert.equal(patch.companionSoftFollow, true);
  assert.equal(patch.companionTaskNarration, true);
});

test('isCompanionMode reads memory over config', () => {
  const memory = fakeMemory({ interactionMode: 'companion' });
  assert.equal(isCompanionMode({ interactionMode: 'helper' }, memory), true);
  memory.update({ interactionMode: 'helper', playMode: 'helper' });
  assert.equal(isCompanionMode({ interactionMode: 'companion' }, memory), false);
  assert.equal(getPlayMode({ playMode: 'quiet' }, fakeMemory({ interactionMode: 'quiet' })), 'quiet');
});

test('companion features default on in companion mode', () => {
  const memory = fakeMemory();
  const config = { interactionMode: 'companion' };
  assert.equal(companionFeatureEnabled('companionSoftFollow', config, memory), true);
  assert.equal(companionFeatureEnabled('companionTaskNarration', config, memory), true);
  assert.equal(companionFeatureEnabled('companionStuckRecovery', config, memory), true);
  assert.equal(shouldNarrateTasks(config, memory), true);
});

test('grounded ambient lines react to world state', () => {
  const night = buildGroundedAmbientLine({
    dangerFlags: { nightTime: true },
    ownerDistance: 3,
    food: 20,
    health: 20
  }, { ownerUsername: 'ModVinny' }, fakeMemory());
  assert.match(night, /night|light|close/i);

  const hungry = buildGroundedAmbientLine({
    food: 8,
    health: 20,
    ownerDistance: 2,
    dangerFlags: {}
  }, {}, fakeMemory());
  assert.match(hungry, /hungry|food/i);
});

test('applyPlayModeToMemory switches modes', () => {
  const memory = fakeMemory({ interactionMode: 'helper' });
  const result = applyPlayModeToMemory(memory, 'companion');
  assert.equal(result.ok, true);
  assert.equal(memory.get().interactionMode, 'companion');
  assert.equal(memory.get().companionSoftFollow, true);
});

test('stuck recovery wiggles without throwing on minimal bot', async () => {
  const states = [];
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    setControlState: (name, value) => states.push([name, value]),
    clearControlStates: () => states.push(['clear']),
    pathfinder: { setGoal: () => {} }
  };
  const result = await tryStuckRecovery(bot, { jumpMs: 5, backMs: 5 });
  assert.equal(result.ok, true);
  assert.ok(states.some((entry) => entry[0] === 'jump'));
});

test('companion mode natural phrase routes', async () => {
  const bot = {
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      thinCoreEnabled: true,
      naturalCommandRouterEnabled: true
    },
    entity: { position: { x: 1, y: 64, z: 2 } },
    health: 20,
    food: 20,
    players: {}
  };
  const route = await routeNaturalCommand(bot, fakeMemory({ learnNaturalCommands: false, pendingNaturalCommandIntent: null }), {
    rawText: 'tj companion mode',
    isOwner: true,
    dryRun: true
  });
  assert.equal(route.mode, 'execute');
  assert.equal(route.canonicalCommand, 'tj companion mode');
});

test('thin core still maps coal while companion features exist', () => {
  const route = routeThinCoreIntent('tj mine coal');
  assert.equal(route.action, 'collect_resource');
  assert.equal(route.args.resource, 'coal');
});
