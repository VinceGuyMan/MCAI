import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThinResource, normalizeThinFoodRequest, routeThinCoreIntent, thinCoreStatus } from '../thinCore.js';
import { normalizeFoodName, listKnownFoodItems } from '../food.js';
import { routeNaturalCommand } from '../naturalCommandRouter.js';

function fakeMemory() {
  let state = {
    learnNaturalCommands: false,
    pendingNaturalCommandIntent: null
  };
  return {
    get: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
    }
  };
}

function fakeBot() {
  return {
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
}

test('thin resource aliases normalize to the iron-down resource set', () => {
  assert.equal(normalizeThinResource('logs'), 'wood');
  assert.equal(normalizeThinResource('cobblestone'), 'stone');
  assert.equal(normalizeThinResource('raw iron'), 'iron');
  assert.equal(normalizeThinResource('dirt'), 'dirt');
  assert.equal(normalizeThinResource('grass block'), 'dirt');
  assert.equal(normalizeThinResource('sand'), 'sand');
  assert.equal(normalizeThinResource('red sand'), 'sand');
  assert.equal(normalizeThinResource('gravel'), 'gravel');
  assert.equal(normalizeThinResource('clay'), 'clay');
  assert.equal(normalizeThinResource('food'), 'food');
  assert.equal(normalizeThinResource('bread'), 'food');
  assert.equal(normalizeThinResource('steak'), 'food');
  assert.equal(normalizeThinResource('apples'), 'food');
  assert.equal(normalizeThinResource('diamond'), null);
});

test('food name aliases normalize to item ids', () => {
  assert.equal(normalizeFoodName('steak'), 'cooked_beef');
  assert.equal(normalizeFoodName('bread'), 'bread');
  assert.equal(normalizeFoodName('apples'), 'apple');
  assert.equal(normalizeFoodName('porkchop'), 'porkchop');
  assert.equal(normalizeFoodName('sweet berries'), 'sweet_berries');
  assert.equal(normalizeFoodName('food'), 'food');
  assert.equal(normalizeFoodName('netherite'), null);
  assert.ok(listKnownFoodItems().includes('bread'));
  assert.ok(listKnownFoodItems().includes('cooked_beef'));
});

test('thin natural routing maps core movement and status commands', () => {
  assert.equal(routeThinCoreIntent('tj status').action, 'thin_status');
  assert.equal(routeThinCoreIntent('tj come here').action, 'thin_come_to_owner');
  assert.equal(routeThinCoreIntent('tj follow me').action, 'thin_follow_owner');
  assert.equal(routeThinCoreIntent('tj stay').action, 'thin_stay');
  assert.equal(routeThinCoreIntent('tj eat').action, 'thin_eat_if_hungry');
  assert.equal(routeThinCoreIntent('tj stop').action, 'thin_stop');
});

test('thin natural routing maps resource requests with counts', () => {
  const wood = routeThinCoreIntent('tj get 8 wood');
  assert.equal(wood.action, 'collect_resource');
  assert.deepEqual(wood.args, { resource: 'wood', count: 8 });

  const stone = routeThinCoreIntent('tj mine 16 stone');
  assert.equal(stone.action, 'collect_resource');
  assert.deepEqual(stone.args, { resource: 'stone', count: 16 });

  const coal = routeThinCoreIntent('tj find coal');
  assert.equal(coal.action, 'collect_resource');
  assert.equal(coal.args.resource, 'coal');
});

test('unknown thin natural commands fall through so natural map can handle them', () => {
  assert.equal(routeThinCoreIntent('tj place a chest down next to you'), null);
  assert.equal(routeThinCoreIntent('tj make a base'), null);
  assert.equal(routeThinCoreIntent('tj show commands'), null);
});

test('diamond mining is refused with a helpful message instead of a dead-end missing report', () => {
  const route = routeThinCoreIntent('tj mine 1 diamond');
  assert.equal(route.mode, 'refuse');
  assert.match(route.speak || '', /diamond/i);
  assert.ok((route.alternatives || []).length >= 1);
});

test('large custom builds are refused with camp/shelter alternatives', () => {
  const route = routeThinCoreIntent('tj build a giant castle');
  assert.equal(route.mode, 'refuse');
  assert.match(route.speak || '', /camp|shelter/i);
});

test('finish last job routes to resume_last_collect', () => {
  const route = routeThinCoreIntent('tj finish last job');
  assert.equal(route.action, 'resume_last_collect');
  assert.equal(route.thinAction, 'resume_last_collect');
});

test('dig dirt routes to collect_resource with count', () => {
  const route = routeThinCoreIntent('tj dig 10 dirt');
  assert.equal(route.mode, 'execute');
  assert.equal(route.action, 'collect_resource');
  assert.equal(route.thinAction, 'collect_resource');
  assert.deepEqual(route.args, { resource: 'dirt', count: 10 });
});

test('surface building blocks sand gravel clay route to collect', () => {
  const sand = routeThinCoreIntent('tj get 16 sand');
  assert.equal(sand.action, 'collect_resource');
  assert.deepEqual(sand.args, { resource: 'sand', count: 16 });

  const gravel = routeThinCoreIntent('tj dig gravel');
  assert.equal(gravel.action, 'collect_resource');
  assert.equal(gravel.args.resource, 'gravel');

  const clay = routeThinCoreIntent('tj collect 8 clay');
  assert.equal(clay.action, 'collect_resource');
  assert.deepEqual(clay.args, { resource: 'clay', count: 8 });
});

test('food requests route to collect_resource with preferred item', () => {
  const generic = routeThinCoreIntent('tj get food');
  assert.equal(generic.action, 'collect_resource');
  assert.equal(generic.args.resource, 'food');
  assert.equal(generic.args.count, 6);

  const bread = routeThinCoreIntent('tj get bread');
  assert.equal(bread.action, 'collect_resource');
  assert.equal(bread.args.resource, 'food');
  assert.equal(bread.args.preferredFood, 'bread');

  const steak = routeThinCoreIntent('tj need 8 steak');
  assert.equal(steak.action, 'collect_resource');
  assert.equal(steak.args.resource, 'food');
  assert.equal(steak.args.preferredFood, 'cooked_beef');
  assert.equal(steak.args.count, 8);

  const apples = routeThinCoreIntent('tj grab apples');
  assert.equal(apples.action, 'collect_resource');
  assert.equal(apples.args.preferredFood, 'apple');

  assert.deepEqual(normalizeThinFoodRequest('pork chop'), { resource: 'food', preferredFood: 'porkchop' });
});

test('naturalCommandRouter returns executable thin action without needing dynamic command aliases', async () => {
  const route = await routeNaturalCommand(fakeBot(), fakeMemory(), {
    rawText: 'tj get 8 wood',
    isOwner: true,
    dryRun: true
  });
  assert.equal(route.mode, 'execute');
  assert.equal(route.source, 'thin_core');
  assert.equal(route.action, 'collect_resource');
  assert.deepEqual(route.args, { resource: 'wood', count: 8 });
});

test('thin status uses the exact thin result shape', () => {
  const result = thinCoreStatus(fakeBot(), fakeMemory());
  assert.equal(typeof result.ok, 'boolean');
  assert.equal(typeof result.message, 'string');
  assert.equal(typeof result.evidence, 'object');
  assert.equal(typeof result.data, 'object');
});
