import test from 'node:test';
import assert from 'node:assert/strict';
import { createCancellation } from '../cancellation.js';
import {
  collectBlockSafely,
  equipBestToolSafely,
  followOwnerSafely,
  pathToOwnerSafely,
  pluginWrapperStatus
} from '../pluginWrappers.js';
import { runCoreMacro } from '../competentCore.js';

function position(x = 0, y = 64, z = 0) {
  return { x, y, z };
}

test('wrapper status reports missing critical runtime plugins', () => {
  const result = pluginWrapperStatus({});
  assert.equal(result.ok, false);
  assert.match(result.message, /missing critical/i);
});

test('collectBlockSafely returns ok:false when collectblock is missing', async () => {
  const result = await collectBlockSafely({ findBlocks: () => [] }, 'oak_log');
  assert.equal(result.ok, false);
  assert.match(result.reason, /mineflayer-collectblock is not loaded/);
});

test('collectBlockSafely uses bot.collectBlock when available', async () => {
  const collected = [];
  const bot = {
    collectBlock: { collect: async (blocks) => collected.push(...blocks) },
    tool: { equipForBlock: async () => true },
    pathfinder: { goto: async () => true },
    findBlocks: () => [position(1, 64, 1)],
    blockAt: () => ({ name: 'oak_log', position: position(1, 64, 1) })
  };
  const result = await collectBlockSafely(bot, 'wood', { count: 1, requireToolPlugin: true });
  assert.equal(result.ok, true);
  assert.equal(collected.length, 1);
  assert.equal(result.data.usedPlugin, 'mineflayer-collectblock');
});

test('collectBlockSafely requires pathfinder runtime before collecting', async () => {
  let collected = false;
  const result = await collectBlockSafely({
    collectBlock: { collect: async () => { collected = true; } },
    tool: { equipForBlock: async () => true },
    findBlocks: () => [position(1, 64, 1)],
    blockAt: () => ({ name: 'stone', position: position(1, 64, 1) })
  }, 'stone', { requireToolPlugin: true });
  assert.equal(result.ok, false);
  assert.equal(collected, false);
  assert.match(result.reason, /mineflayer-pathfinder is not loaded/);
});

test('equipBestToolSafely uses mineflayer-tool when available', async () => {
  let equipped = false;
  const result = await equipBestToolSafely({
    tool: { equipForBlock: async () => { equipped = true; } }
  }, { name: 'stone' });
  assert.equal(result.ok, true);
  assert.equal(equipped, true);
  assert.equal(result.data.usedPlugin, 'mineflayer-tool');
});

test('pathToOwnerSafely requires pathfinder runtime', async () => {
  const result = await pathToOwnerSafely({
    mcaiConfig: { ownerUsername: 'ModVinny' },
    players: { ModVinny: { entity: { position: position() } } }
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /mineflayer-pathfinder is not loaded/);
});

test('pathToOwnerSafely uses pathfinder when loaded', async () => {
  let went = false;
  const result = await pathToOwnerSafely({
    mcaiConfig: { ownerUsername: 'ModVinny' },
    players: { ModVinny: { entity: { position: position(4, 64, 4) } } },
    pathfinder: { goto: async () => { went = true; } }
  });
  assert.equal(result.ok, true);
  assert.equal(went, true);
});

test('pathToOwnerSafely clears pathfinder goal when cancelled during goto', async () => {
  const cancellation = createCancellation();
  let rejectGoto;
  let clearedGoal = false;
  const pending = pathToOwnerSafely({
    mcaiConfig: { ownerUsername: 'ModVinny' },
    players: { ModVinny: { entity: { position: position(4, 64, 4) } } },
    pathfinder: {
      goto: () => new Promise((resolve, reject) => { rejectGoto = reject; }),
      setGoal: (goal) => {
        if (goal === null) {
          clearedGoal = true;
          rejectGoto?.(new Error('Path stopped'));
        }
      }
    }
  }, { cancellation });
  await new Promise((resolve) => setTimeout(resolve, 0));
  cancellation.cancelAll('stop path test');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(clearedGoal, true);
});

test('followOwnerSafely registers persistent follow goal cancellation', async () => {
  const cancellation = createCancellation();
  const goals = [];
  const result = await followOwnerSafely({
    mcaiConfig: { ownerUsername: 'ModVinny' },
    players: { ModVinny: { entity: { position: position(4, 64, 4) } } },
    pathfinder: { setGoal: (goal, dynamic) => goals.push({ goal, dynamic }) }
  }, { cancellation });
  assert.equal(result.ok, true);
  assert.deepEqual(cancellation.listActiveCancelableTasks(), ['pluginWrappers:followOwner']);
  cancellation.cancelAll('stop following');
  assert.equal(goals[0].dynamic, true);
  assert.equal(goals.at(-1).goal, null);
  assert.deepEqual(cancellation.listActiveCancelableTasks(), []);
});

test('collectBlockSafely cancels active collection and pathfinder goal', async () => {
  const cancellation = createCancellation();
  let rejectCollect;
  let cancelledCollection = false;
  let clearedGoal = false;
  const pending = collectBlockSafely({
    collectBlock: {
      collect: async () => new Promise((resolve, reject) => { rejectCollect = reject; }),
      cancelTask: () => {
        cancelledCollection = true;
        rejectCollect?.(new Error('collection stopped'));
      }
    },
    tool: { equipForBlock: async () => true },
    pathfinder: {
      goto: async () => true,
      setGoal: (goal) => { if (goal === null) clearedGoal = true; }
    },
    findBlocks: () => [position(1, 64, 1)],
    blockAt: () => ({ name: 'stone', position: position(1, 64, 1) })
  }, 'stone', { cancellation, requireToolPlugin: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  cancellation.cancelAll('stop collection');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(cancelledCollection, true);
  assert.equal(clearedGoal, true);
});

test('competent core gather_wood rejects honestly when collectblock is missing', async () => {
  const actions = {
    executeAction: async (name, args, context) => {
      if (name === 'plugin_collect_blocks') return collectBlockSafely(context.bot, args.resourceName, args);
      if (name === 'collect_resource') return collectBlockSafely(context.bot, args.resource, { ...args, resourceName: args.resource });
      return { ok: true, message: 'ok', evidence: [], data: {} };
    }
  };
  const bot = {
    username: 'tj',
    mcaiConfig: { ownerUsername: 'ModVinny', competentCoreEnabled: true },
    mcaiActions: actions,
    mcaiCancellation: createCancellation(),
    inventory: { items: () => [] },
    players: {},
    entities: {}
  };
  const memory = { get: () => ({}), update: () => ({}) };
  const result = await runCoreMacro(bot, memory, 'gather_wood', {}, { sender: 'ModVinny', isOwner: true, actions, bot });
  assert.equal(result.ok, false);
  assert.match(result.reason, /mineflayer-collectblock is not loaded/);
});

test('wrappers check cancellation before using plugins', async () => {
  const cancellation = createCancellation();
  cancellation.cancelAll('stop test');
  const result = await collectBlockSafely({
    collectBlock: { collect: async () => true },
    tool: { equipForBlock: async () => true },
    findBlocks: () => [position()],
    blockAt: () => ({ name: 'oak_log', position: position() })
  }, 'oak_log', { cancellation });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
});
