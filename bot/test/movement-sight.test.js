import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimMove,
  releaseMove,
  canClaimMove,
  getMoveClaim,
  gotoNear,
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

test('move claim: unrelated equal-priority work cannot overlap', () => {
  const memory = memStore();
  assert.equal(claimMove(memory, { owner: 'collect_a', priority: 'job' }).ok, true);
  assert.equal(canClaimMove(memory, 'job', 'collect_b'), false);
  const competing = claimMove(memory, { owner: 'collect_b', priority: 'job' });
  assert.equal(competing.ok, false);
  assert.equal(getMoveClaim(memory).owner, 'collect_a');
});

test('move claim: stale completion cannot release a newer claim generation', () => {
  const memory = memStore();
  const first = claimMove(memory, { owner: 'water_rescue', priority: 'emergency' });
  const second = claimMove(memory, { owner: 'water_rescue', priority: 'emergency' });
  const firstId = first.data.claim.claimId;
  const secondId = second.data.claim.claimId;
  assert.notEqual(firstId, secondId);
  assert.equal(releaseMove(memory, 'water_rescue', { claimId: firstId }).ok, false);
  assert.equal(getMoveClaim(memory).claimId, secondId);
  assert.equal(releaseMove(memory, 'water_rescue', { claimId: secondId }).ok, true);
});

test('goto cleanup does not clear a successor claim path', async () => {
  const memory = memStore();
  let rejectGoto;
  let clearedGoals = 0;
  const bot = {
    entity: { position: pos(0, 64, 0) },
    pathfinder: {
      goto: () => new Promise((resolve, reject) => { rejectGoto = reject; }),
      setGoal: (goal) => { if (goal === null) clearedGoals += 1; }
    }
  };
  const pending = gotoNear(bot, pos(8, 64, 8), {
    memory,
    owner: 'old_job',
    priority: 'job',
    timeoutMs: 5000
  });
  const clearsBeforeSuccessor = clearedGoals;
  assert.equal(claimMove(memory, { owner: 'emergency_successor', priority: 'emergency' }).ok, true);
  rejectGoto(new Error('old path failed'));
  await pending;
  assert.equal(clearedGoals, clearsBeforeSuccessor);
  assert.equal(getMoveClaim(memory).owner, 'emergency_successor');
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
