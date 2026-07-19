import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { summarizeNearbyDanger } from '../brain.js';
import * as eventDialogue from '../eventDialogue.js';
import { findNearbyFishingWater, fishForFood as fishOnce } from '../food.js';
import { routeThinCoreIntent } from '../thinCore.js';
import { createSurvivalHandlers } from '../actions/domains/survival.js';
import { isGlobalStopText } from '../chat.js';

function memory(initial = {}) {
  let state = { ...initial };
  return {
    get: () => state,
    update: (patch) => { state = { ...state, ...patch }; }
  };
}

function fishingBot(overrides = {}) {
  const waterPosition = new Vec3(2, 64, 0);
  return {
    username: 'tj',
    health: 20,
    food: 20,
    entity: { position: new Vec3(0, 64, 0) },
    registry: {
      blocksByName: { water: { id: 1 } },
      itemsByName: {
        fishing_rod: { id: 100, name: 'fishing_rod' },
        bread: { id: 101, name: 'bread' }
      }
    },
    inventory: { items: () => [{ name: 'fishing_rod', count: 1 }] },
    findBlocks: () => [waterPosition],
    blockAt: (position) => position.y === 64
      ? { name: 'water', position }
      : { name: 'air', position },
    equip: async () => {},
    lookAt: async () => {},
    deactivateItem: () => {},
    ...overrides
  };
}

test('danger summaries name and locate nearby hostiles', () => {
  const summary = summarizeNearbyDanger({
    nearbyHostiles: [
      { name: 'zombie', distance: 6.4 },
      { name: 'zombie', distance: 9.2 },
      { name: 'skeleton', distance: 12.1 }
    ],
    dangerFlags: { lavaNearby: true }
  });
  assert.match(summary, /2 zombies about 6 blocks away/);
  assert.match(summary, /skeleton about 12 blocks away/);
  assert.match(summary, /lava within 8 blocks/);
});

test('live danger questions route to the threat scanner before generic Q&A', () => {
  for (const text of ['tj what danger is there?', 'tj what hurt you', 'tj are we safe?']) {
    const route = routeThinCoreIntent(text);
    assert.equal(route?.action, 'threat_scan', text);
    assert.equal(route?.mode, 'execute', text);
  }
});

test('fishing-until-stop phrasing starts work while explicit stop fishing cancels it', () => {
  assert.equal(isGlobalStopText('fish until i say stop'), false);
  assert.equal(isGlobalStopText('keep fishing'), false);
  assert.equal(isGlobalStopText('stop fishing'), true);
  assert.equal(isGlobalStopText('stop'), true);
});

test('low-health warnings report health and suppress repeats unless health sharply worsens', () => {
  const messages = [];
  const mem = memory();
  const bot = {
    mcaiConfig: { allowTaskCommentary: true, lowHealthWarningCooldownMs: 60000 },
    chat: (message) => messages.push(message)
  };

  const first = eventDialogue.onLowHealth({ health: 6, food: 16, hasFood: false, dangerSummary: 'skeleton 5 blocks away' });
  assert.equal(eventDialogue.maybeSayEventComment(bot, mem, first), true);
  assert.equal(eventDialogue.maybeSayEventComment(bot, mem, first), false);
  assert.equal(eventDialogue.maybeSayEventComment(bot, mem, eventDialogue.onLowHealth({ health: 2, food: 16, hasFood: false })), true);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /health is 6\/20/i);
  assert.match(messages[0], /skeleton 5 blocks away/i);
  assert.match(messages[0], /no safe food/i);
});

test('fishing requires nearby surface water and performs one clean cast', async () => {
  let casts = 0;
  const bot = fishingBot({ fish: async () => { casts += 1; } });
  assert.equal(findNearbyFishingWater(bot, 8)?.name, 'water');
  const caught = await fishOnce(bot, { config: { allowFishing: true, fishingWaterSearchRadius: 8 }, returnToOwner: false });
  assert.equal(caught.ok, true);
  assert.equal(casts, 1);

  const landBot = fishingBot({ findBlocks: () => [], fish: async () => { throw new Error('should not cast'); } });
  const noWater = await fishOnce(landBot, { config: { allowFishing: true, fishingWaterSearchRadius: 8 } });
  assert.equal(noWater.ok, false);
  assert.match(noWater.message, /beside open water/i);
});

test('continuous fishing rejects duplicate starts and stops through cancellation', async () => {
  let casts = 0;
  let cancelHandler = null;
  let deactivateCalls = 0;
  const bot = fishingBot({
    fish: () => {
      casts += 1;
      return new Promise(() => {});
    },
    deactivateItem: () => { deactivateCalls += 1; }
  });
  const mem = memory();
  const messages = [];
  const handlers = createSurvivalHandlers({
    bot,
    config: {
      allowFishing: true,
      botUsername: 'tj',
      fishingWaterSearchRadius: 8,
      fishingCastTimeoutMs: 5000,
      fishingProgressEveryCatches: 5,
      fishingMaxConsecutiveFailures: 2
    },
    memory: mem,
    cancellation: {
      registerCancelableTask: (id, handler) => { cancelHandler = handler; return { ok: true, id }; },
      unregisterCancelableTask: () => true
    },
    isCancelled: () => false,
    throwIfCancelled: () => {},
    say: (message) => messages.push(message)
  });

  const active = handlers.fishForFood();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const duplicate = await handlers.fishForFood();
  assert.equal(duplicate.data.alreadyFishing, true);
  assert.equal(casts, 1);
  cancelHandler();
  const stopped = await active;
  assert.equal(stopped.data.stopped, true);
  assert.equal(mem.get().fishingActive, false);
  assert.ok(deactivateCalls >= 1);
  assert.match(messages[0], /until you say "tj stop"/i);
});

test('low-health recovery eats available safe food to restore regeneration', async () => {
  let consumed = 0;
  const bot = fishingBot({
    health: 6,
    food: 16,
    inventory: { items: () => [{ name: 'bread', count: 1 }] },
    consume: async () => { consumed += 1; bot.food = 20; }
  });
  const mem = memory();
  const handlers = createSurvivalHandlers({
    bot,
    config: { lowHealthRecoveryThreshold: 8, healthRecoveryAttemptCooldownMs: 1 },
    memory: mem,
    isCancelled: () => false,
    say: () => {}
  });

  const recovered = await handlers.recoverLowHealth({ health: 6, food: 16, nearbyHostiles: [], dangerFlags: {} });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.data.eaten, true);
  assert.equal(consumed, 1);
  assert.equal(mem.get().lastHealthRecoveryAction, 'ate food');
});
