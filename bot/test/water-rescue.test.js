import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import {
  chooseEmergencyFooting,
  findNearestDryStand,
  isEmergencyDiggableBlock,
  manualSwimToward,
  rescueFromWater,
  swimToTarget,
  waterRecoveryMode
} from '../waterRescue.js';

test('water rescue emergency digging rejects valuable and structural blocks', () => {
  for (const name of ['diamond_block', 'iron_block', 'emerald_block', 'chest', 'obsidian', 'stone']) {
    assert.equal(isEmergencyDiggableBlock({ name, boundingBox: 'block' }), false, name);
  }
  for (const name of ['kelp', 'seagrass', 'dirt', 'sand', 'gravel']) {
    assert.equal(isEmergencyDiggableBlock({ name, boundingBox: 'block' }), true, name);
  }
});

test('water rescue footing ignores valuable storage blocks', () => {
  const stack = chooseEmergencyFooting([
    { name: 'diamond_block', count: 4 },
    { name: 'iron_block', count: 8 },
    { name: 'chest', count: 2 },
    { name: 'cobblestone', count: 16 }
  ]);
  assert.equal(stack?.name, 'cobblestone');
  assert.equal(chooseEmergencyFooting([{ name: 'gold_block', count: 2 }]), null);
  assert.equal(chooseEmergencyFooting([{ name: 'sand', count: 16 }, { name: 'gravel', count: 16 }]), null);
});

test('target swimming immediately hands dry bots back to normal pathing', async () => {
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5), isInWater: false, isInLava: false },
    oxygenLevel: 20,
    blockAt(position) {
      return position.y < 64
        ? { name: 'stone', boundingBox: 'block', position }
        : { name: 'air', boundingBox: 'empty', position };
    }
  };
  const result = await swimToTarget(bot, new Vec3(30, 64, 30));
  assert.equal(result.ok, true);
  assert.equal(result.data.handoff, true);
});

test('duplicate shore rescue callers join one active operation', async () => {
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5), isInWater: false, isInLava: false },
    oxygenLevel: 20,
    clearControlStates: () => {},
    setControlState: () => {},
    blockAt(position) {
      return position.y < 64
        ? { name: 'stone', boundingBox: 'block', position }
        : { name: 'air', boundingBox: 'empty', position };
    }
  };
  const first = rescueFromWater(bot, { force: true });
  const duplicate = rescueFromWater(bot, { force: true });
  assert.equal(first, duplicate);
  assert.equal((await first).ok, true);
});

test('dry-stand scan obeys its block-read budget', () => {
  let reads = 0;
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5) },
    blockAt(position) {
      reads += 1;
      return { name: 'air', boundingBox: 'empty', position };
    }
  };
  const result = findNearestDryStand(bot, { radius: 48, maxBlockReads: 360 });
  assert.equal(result, null);
  assert.ok(reads <= 360, `expected at most 360 block reads, got ${reads}`);
});

test('successful water arrival holds near owner instead of forcing distant shore rescue', () => {
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5), isInWater: true, isInLava: false },
    oxygenLevel: 20,
    blockAt(position) {
      if (position.y < 63.8) return { name: 'stone', boundingBox: 'block', position };
      if (position.y < 64.8) return { name: 'water', boundingBox: 'empty', position };
      return { name: 'air', boundingBox: 'empty', position };
    }
  };

  assert.equal(waterRecoveryMode(bot, { reachedTarget: true }), 'hold_near_target');
  assert.equal(waterRecoveryMode(bot, { reachedTarget: false }), 'shore_rescue');
  bot.oxygenLevel = 14;
  assert.equal(waterRecoveryMode(bot, { reachedTarget: true }), 'surface_near_target');
});

test('manual swimming surfaces at the safety threshold before oxygen becomes critical', async () => {
  let submerged = true;
  let jumpStarted = false;
  const bot = {
    entity: { position: new Vec3(0.5, 62, 0.5), isInWater: true, isInLava: false },
    oxygenLevel: 14,
    pathfinder: { stop: () => {} },
    clearControlStates: () => {},
    look: async () => {},
    setControlState(control, enabled) {
      if (control === 'jump' && enabled && submerged) {
        jumpStarted = true;
        submerged = false;
        this.oxygenLevel = 20;
        this.entity.isInWater = false;
        this.entity.position = new Vec3(0.5, 64, 0.5);
      }
    },
    blockAt(position) {
      if (submerged) return { name: 'water', boundingBox: 'empty', position };
      return position.y < 64
        ? { name: 'stone', boundingBox: 'block', position }
        : { name: 'air', boundingBox: 'empty', position };
    }
  };

  const result = await manualSwimToward(bot, new Vec3(12, 64, 0), {
    maxMs: 1500,
    surfaceOxygenThreshold: 14
  });

  assert.equal(result.ok, true);
  assert.equal(jumpStarted, true);
  assert.equal(result.data.surfaceAttempts, 1);
  assert.equal(result.data.minOxygen, 14);
  assert.equal(result.data.endOxygen, 20);
});
