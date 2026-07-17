import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimMove,
  releaseMove,
  canClaimMove,
  getMoveClaim,
  MOVE_PRIORITY
} from '../movementController.js';
import { rankBlocks, expandCluster, RESOURCE_BLOCKS, SIGHT_RADIUS } from '../sight.js';

function memStore() {
  const data = {};
  return {
    get: () => data,
    update: (patch) => Object.assign(data, patch)
  };
}

function pos(x, y, z) {
  return {
    x, y, z,
    distanceTo(other) {
      return Math.hypot(other.x - this.x, other.y - this.y, other.z - this.z);
    },
    offset(dx, dy, dz) {
      return pos(this.x + dx, this.y + dy, this.z + dz);
    },
    clone() {
      return pos(this.x, this.y, this.z);
    }
  };
}

test('move claim: soft_follow cannot steal job; emergency can', () => {
  const memory = memStore();
  assert.equal(claimMove(memory, { owner: 'job', priority: 'job' }).ok, true);
  assert.equal(canClaimMove(memory, 'soft_follow'), false);
  assert.equal(canClaimMove(memory, 'come'), false); // come (60) < job (70)
  assert.equal(canClaimMove(memory, 'emergency'), true);
  assert.equal(claimMove(memory, { owner: 'surface', priority: 'emergency' }).ok, true);
  assert.equal(getMoveClaim(memory).owner, 'surface');
  assert.equal(releaseMove(memory, 'surface').ok, true);
  assert.equal(getMoveClaim(memory), null);
});

test('move claim: same owner can re-claim', () => {
  const memory = memStore();
  assert.equal(claimMove(memory, { owner: 'collect', priority: MOVE_PRIORITY.job }).ok, true);
  assert.equal(claimMove(memory, { owner: 'collect', priority: MOVE_PRIORITY.job }).ok, true);
});

test('rankBlocks clusters nearest group first', () => {
  const origin = pos(0, 64, 0);
  const bot = { entity: { position: origin } };
  const blocks = [
    { name: 'oak_log', position: pos(10, 64, 0) },
    { name: 'oak_log', position: pos(10, 65, 0) },
    { name: 'oak_log', position: pos(30, 64, 0) }
  ];
  const ranked = rankBlocks(bot, blocks, { origin, clusterFirst: true, skipLosScore: true });
  assert.equal(ranked[0].position.x, 10);
  assert.equal(ranked[1].position.x, 10);
  assert.equal(ranked[2].position.x, 30);
});

test('expandCluster walks adjacent wood upward', () => {
  const seedPos = pos(5, 70, 5);
  const map = new Map([
    ['5,70,5', { name: 'oak_log', position: seedPos }],
    ['5,71,5', { name: 'oak_log', position: pos(5, 71, 5) }],
    ['5,72,5', { name: 'oak_log', position: pos(5, 72, 5) }],
    ['8,70,5', { name: 'oak_log', position: pos(8, 70, 5) }]
  ]);
  const bot = {
    blockAt(p) {
      const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
      return map.get(key) || { name: 'air', position: pos(p.x, p.y, p.z) };
    }
  };
  const seed = map.get('5,70,5');
  const cluster = expandCluster(bot, seed, RESOURCE_BLOCKS.wood, { maxBlocks: 20, maxDistance: 8 });
  assert.ok(cluster.length >= 3);
  assert.equal(cluster[0].position.y, 70);
  assert.ok(cluster.some((b) => b.position.y === 72));
});

test('sight radius defaults cover dig and ore', () => {
  assert.ok(SIGHT_RADIUS.dig >= 32);
  assert.ok(SIGHT_RADIUS.ore >= SIGHT_RADIUS.dig);
});
