import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getSkill, getSkills } from '../skillRegistry.js';
import {
  createEvidenceRecord,
  evidenceFailed,
  evidencePassed,
  getEvidenceDefinition,
  listEvidenceDefinitions,
  summarizeEvidence,
  verifySkillEvidence
} from '../progressEvidence.js';
import {
  getSkillEvidenceHistory,
  getSkillStats,
  recordSkillFailure,
  recordSkillSuccess,
  saveSkillMemory
} from '../skillMemory.js';
import { runSkill } from '../skillRunner.js';

function resetSkillMemory() {
  saveSkillMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skills: {},
    recentRuns: [],
    evidenceStats: {}
  });
}

function mockBot(items = []) {
  return {
    username: 'tj',
    mcaiConfig: { ownerUsername: 'ModVinny' },
    entity: { position: { x: 0, y: 64, z: 0 } },
    health: 20,
    food: 20,
    game: { dimension: 'overworld' },
    players: {},
    inventory: { items: () => items }
  };
}

function mockMemory(patch = {}) {
  return { get: () => patch };
}

function mockActions(patch = {}) {
  return {
    executeAction: async (actionName) => ({
      ok: true,
      message: `${actionName} reported.`,
      evidence: actionName === 'inventory_summary' ? ['inventory_reported'] : [`${actionName}_reported`],
      data: {}
    }),
    ...patch
  };
}

function evidenceNames(result) {
  return (result.evidence || []).map((item) => typeof item === 'string' ? item : item.name);
}

beforeEach(() => resetSkillMemory());
afterEach(() => resetSkillMemory());

test('evidence definitions load and names are unique', () => {
  const definitions = listEvidenceDefinitions();
  assert.ok(definitions.length > 40);
  const names = new Set(definitions.map((item) => item.name));
  assert.equal(names.size, definitions.length);
  assert.ok(getEvidenceDefinition('status_reported'));
});

test('evidence records and summaries work', () => {
  const verified = createEvidenceRecord('status_reported', 'verified', { source: 'test', confidence: 'high' });
  const failed = createEvidenceRecord('home_exists', 'failed', { source: 'test', confidence: 'high' });
  assert.equal(verified.status, 'verified');
  assert.match(summarizeEvidence([verified]), /status_reported/);
  assert.equal(evidencePassed([verified]), true);
  assert.equal(evidenceFailed([failed]), true);
});

test('skill registry evidence names are valid and runnable skills avoid future evidence', () => {
  const runnable = new Set(['status', 'inventory_summary', 'home_status', 'mining_status', 'farming_status', 'nether_checklist', 'skills_status']);
  for (const skill of getSkills()) {
    assert.ok(skill.successEvidence.length > 0, `${skill.name} missing evidence`);
    for (const evidenceName of skill.successEvidence) {
      const definition = getEvidenceDefinition(evidenceName);
      assert.ok(definition, `${skill.name} unknown evidence ${evidenceName}`);
      if (runnable.has(skill.name)) assert.equal(definition.implemented, true, `${skill.name} uses future evidence`);
    }
  }
});

test('status and nether checklist evidence validate', () => {
  assert.ok(getEvidenceDefinition(getSkill('status').successEvidence[0]));
  assert.ok(getEvidenceDefinition(getSkill('nether_checklist').successEvidence[0]));
});

test('verifySkillEvidence uses action result evidence', () => {
  const skill = getSkill('status');
  const report = verifySkillEvidence(mockBot(), mockMemory(), skill, {}, {}, {}, {
    ok: true,
    evidence: ['status_reported'],
    message: 'Status checked.'
  });
  assert.equal(report.ok, true);
  assert.equal(report.status, 'success');
  assert.ok(report.evidence.some((item) => item.name === 'status_reported' && item.status === 'verified'));
});

test('skillMemory records evidence history', () => {
  const evidence = [createEvidenceRecord('status_reported', 'verified', { source: 'test', confidence: 'high' })];
  recordSkillSuccess('status', evidence, 10, 'status ok');
  recordSkillFailure('status', 'test failure', 5, [createEvidenceRecord('skill_failed', 'verified', { source: 'test', confidence: 'high' })]);
  const stats = getSkillStats('status');
  assert.equal(stats.successCount, 1);
  assert.equal(stats.failureCount, 1);
  assert.match(stats.lastEvidenceSummary, /skill_failed/);
  assert.equal(getSkillEvidenceHistory('status', 5).length, 2);
});

test('skillRunner merges registry, runner, and action evidence', async () => {
  const result = await runSkill(mockBot(), mockMemory(), 'status', {}, {
    sender: 'ModVinny',
    actions: mockActions(),
    force: true
  });
  assert.equal(result.ok, true);
  assert.ok(evidenceNames(result).includes('status_reported'));
  assert.ok(evidenceNames(result).includes('skill_completed'));
});

test('skillRunner records failed evidence on action failure', async () => {
  const result = await runSkill(mockBot(), mockMemory(), 'status', {}, {
    sender: 'ModVinny',
    actions: mockActions({
      executeAction: async () => ({ ok: false, reason: 'bad action', evidence: ['action_result_failed'] })
    }),
    force: true
  });
  assert.equal(result.ok, false);
  assert.ok(evidenceNames(result).includes('skill_failed'));
});

test('timeout skill records skill_timed_out evidence', async () => {
  const result = await runSkill(mockBot(), mockMemory(), 'status', {}, {
    sender: 'ModVinny',
    actions: mockActions({
      executeAction: async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { ok: true, evidence: ['status_reported'] };
      }
    }),
    force: true,
    timeoutMs: 5
  });
  assert.equal(result.ok, false);
  assert.ok(evidenceNames(result).includes('skill_timed_out'));
});
