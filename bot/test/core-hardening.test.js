import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  executeGatedAction,
  normalizeActionResult,
  validateActionRequest
} from '../actionGate.js';
import {
  clearAllConfirmations,
  confirm,
  requestConfirmation
} from '../confirmationManager.js';
import { createCancellation } from '../cancellation.js';
import { loadJsonSafe, saveJsonAtomic } from '../memorySafeWrite.js';
import { createDashboardRequestHandler } from '../../dashboard/dashboardRoutes.js';

function makeActionApi(extra = {}) {
  return {
    status: async () => ({ ok: true, message: 'status ok', evidence: ['status_reported'], data: {} }),
    blueprintBuildApproved: async () => ({ ok: true, message: 'build approved' }),
    bridgeRegisterRegion: async () => ({ ok: true, message: 'registered' }),
    ...extra
  };
}

test('non-owner cannot execute an owner-only action through the gate', async () => {
  const result = await executeGatedAction(null, null, 'status', {}, {
    actionApi: makeActionApi(),
    sender: 'NotModVinny'
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Only ModVinny/);
});

test('ModVinny can execute a safe action through the gate', async () => {
  const result = await executeGatedAction(null, null, 'status', {}, {
    actionApi: makeActionApi(),
    sender: 'ModVinny'
  });
  assert.equal(result.ok, true);
  assert.equal(result.message, 'status ok');
});

test('unknown action is rejected before execution', () => {
  const result = validateActionRequest('totallyFakeAction', {}, {
    actionApi: makeActionApi(),
    sender: 'ModVinny'
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Unknown action/);
});

test('risky action requires matching confirmation context', () => {
  const blocked = validateActionRequest('blueprintBuildApproved', {}, {
    actionApi: makeActionApi(),
    sender: 'ModVinny'
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /requires confirmation/);

  const allowed = validateActionRequest('blueprintBuildApproved', {}, {
    actionApi: makeActionApi(),
    sender: 'ModVinny',
    confirmed: true
  });
  assert.equal(allowed.ok, true);
});

test('wrong confirmation type does not approve a different action', () => {
  clearAllConfirmations('test reset');
  requestConfirmation('villager_trade', { description: 'buy book' }, { requestedBy: 'ModVinny' });
  const result = confirm('blueprint_build', 'ModVinny');
  assert.equal(result.ok, false);
  assert.match(result.reason, /No pending confirmation/);
});

test('expired confirmation is rejected', async () => {
  clearAllConfirmations('test reset');
  requestConfirmation('memory_reset', {}, { requestedBy: 'ModVinny', expiresInMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const result = confirm('memory_reset', 'ModVinny');
  assert.equal(result.ok, false);
  assert.match(result.reason, /No pending confirmation/);
});

test('cancellation cancels registered tasks', () => {
  const cancellation = createCancellation();
  let cancelled = false;
  cancellation.registerCancelableTask('blueprint-build-test', () => {
    cancelled = true;
  });
  cancellation.cancelAll('test stop');
  assert.equal(cancelled, true);
  assert.equal(cancellation.isCancelled(), true);
  assert.deepEqual(cancellation.listActiveCancelableTasks(), []);
});

test('standard result normalization is stable', () => {
  const ok = normalizeActionResult('hello');
  assert.equal(ok.ok, true);
  assert.equal(ok.message, 'hello');
  assert.deepEqual(ok.evidence, []);

  const failed = normalizeActionResult({ ok: false, reason: 'nope' });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'nope');
  assert.deepEqual(failed.data, {});
});

test('memory corrupted file gets backed up and reset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-hardening-'));
  const filePath = path.join(dir, 'memory.json');
  fs.writeFileSync(filePath, '{ broken json');
  const loaded = loadJsonSafe(filePath, { version: 1, history: [] });
  assert.equal(loaded.version, 1);
  assert.equal(fs.readdirSync(dir).some((name) => name.includes('.corrupt-')), true);
});

test('atomic memory write creates valid JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcai-hardening-'));
  const filePath = path.join(dir, 'memory.json');
  saveJsonAtomic(filePath, { ok: true });
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).ok, true);
});

test('dashboard blueprint controls go through executeAction', async () => {
  let executed = null;
  const actions = {
    executeAction: async (actionName, args, context) => {
      executed = { actionName, args, context };
      return { ok: true, message: 'gated' };
    },
    blueprintStartBuild: () => {
      throw new Error('direct blueprint call should not happen');
    }
  };
  const config = {
    ownerUsername: 'ModVinny',
    dashboardRequireOwnerToken: true,
    dashboardToken: 'test-token',
    dashboardLocalOnly: true
  };
  const server = http.createServer(createDashboardRequestHandler({ config, actions }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/blueprints/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dashboard-token': 'test-token' },
      body: '{}'
    });
    assert.equal(response.status, 200);
    assert.equal(executed.actionName, 'blueprintStartBuild');
    assert.equal(executed.context.source, 'dashboard');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('bridge client source has no raw server command surface', () => {
  const source = fs.readFileSync(new URL('../../bridge/bridgeClient.js', import.meta.url), 'utf8');
  assert.equal(/\/commands?|teleport|give-items?|worldedit/i.test(source), false);
});
