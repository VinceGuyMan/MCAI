import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSkill,
  getSkills,
  listRiskySkills,
  listUnimplementedSkills,
  validateSkillDefinitions
} from '../skillRegistry.js';
import {
  isSkillSafeForAutonomy,
  validateSkillCanRun
} from '../skillValidator.js';
import {
  ensureSkillMemoryShape,
  recordSkillFailure,
  recordSkillStart,
  recordSkillSuccess,
  saveSkillMemory,
  getSkillStats
} from '../skillMemory.js';

const requiredFields = [
  'name',
  'category',
  'description',
  'implemented',
  'riskLevel',
  'requiresConfirmation',
  'preconditions',
  'inputs',
  'successEvidence',
  'cooldownMs',
  'maxRuntimeMs',
  'action'
];

function mockMemory(patch = {}) {
  return {
    get: () => patch
  };
}

function mockBot(config = {}, items = []) {
  return {
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      allowPvp: false,
      allowDiamondMining: false,
      allowDeepMining: false,
      allowCaving: false,
      allowCaveExploration: false,
      allowNetherExploration: false,
      allowNetherMining: false,
      allowFortressSearch: false,
      allowBastionSearch: false,
      ...config
    },
    game: { dimension: 'overworld' },
    players: {},
    inventory: {
      items: () => items
    }
  };
}

test('skill registry definitions are complete and unique', () => {
  const skills = getSkills();
  assert.ok(skills.length > 50);

  const names = new Set();
  for (const skill of skills) {
    for (const field of requiredFields) assert.ok(field in skill, `${skill.name} missing ${field}`);
    assert.equal(names.has(skill.name), false, `duplicate skill ${skill.name}`);
    names.add(skill.name);
  }

  const validation = validateSkillDefinitions();
  assert.equal(validation.ok, true, validation.errors.join('; '));
});

test('implemented skills have action names', () => {
  const missing = getSkills().filter((skill) => skill.implemented && !skill.action);
  assert.deepEqual(missing, []);
});

test('risky and unimplemented skills are marked honestly', () => {
  assert.equal(getSkill('light_portal').requiresConfirmation, true);
  assert.equal(getSkill('safe_nether_entry').riskLevel, 'high');
  assert.equal(getSkill('mine_diamond').implemented, false);
  assert.equal(getSkill('pvp_attack').implemented, false);
  assert.ok(listRiskySkills().some((skill) => skill.name === 'safe_nether_entry'));
  assert.ok(listUnimplementedSkills().some((skill) => skill.name === 'mine_diamond'));
});

test('unimplemented and unknown skills cannot run', () => {
  assert.equal(validateSkillCanRun(mockBot(), mockMemory(), 'mine_diamond').ok, false);
  assert.match(validateSkillCanRun(mockBot(), mockMemory(), 'mine_diamond').reason, /not implemented/);
  assert.equal(validateSkillCanRun(mockBot(), mockMemory(), 'does_not_exist').ok, false);
  assert.match(validateSkillCanRun(mockBot(), mockMemory(), 'does_not_exist').reason, /unknown skill/);
});

test('Nether entry and portal lighting require confirmation', () => {
  const entry = validateSkillCanRun(mockBot(), mockMemory(), 'safe_nether_entry');
  assert.equal(entry.ok, false);
  assert.match(entry.reason, /requires confirmation/);

  const lighting = validateSkillCanRun(mockBot(), mockMemory(), 'light_portal');
  assert.equal(lighting.ok, false);
  assert.match(lighting.reason, /requires confirmation/);
});

test('PVP and unsafe combat skills are blocked', () => {
  const pvp = validateSkillCanRun(mockBot({ allowPvp: false }), mockMemory(), 'pvp_attack');
  assert.equal(pvp.ok, false);

  const hostile = validateSkillCanRun(mockBot(), mockMemory(), 'engage_hostile');
  assert.equal(hostile.ok, false);
  assert.match(hostile.reason, /requires confirmation/);
});

test('dialogue skills do not expose raw gameplay actions', () => {
  const dialogueSkills = getSkills().filter((skill) => skill.category === 'dialogue');
  assert.ok(dialogueSkills.length > 0);
  for (const skill of dialogueSkills) {
    assert.doesNotMatch(skill.action, /pathfinder|dig|attack|place|openChest|openFurnace/i);
  }
});

test('safe autonomy excludes risky and unimplemented skills', () => {
  assert.equal(isSkillSafeForAutonomy('status'), true);
  assert.equal(isSkillSafeForAutonomy('mine_coal'), false);
  assert.equal(isSkillSafeForAutonomy('mine_diamond'), false);
  assert.equal(isSkillSafeForAutonomy('safe_nether_entry'), false);
});

test('skill memory shape and run records are safe', () => {
  const shaped = ensureSkillMemoryShape({ skills: 'bad', recentRuns: 'bad' });
  assert.deepEqual(shaped.skills, {});
  assert.deepEqual(shaped.recentRuns, []);

  recordSkillStart('status');
  recordSkillSuccess('status', ['status_reported'], 10);
  recordSkillFailure('status', 'test failure', 5);
  const stats = getSkillStats('status');
  assert.ok(stats.successCount >= 1);
  assert.ok(stats.failureCount >= 1);
  assert.equal(Array.isArray(stats.lastEvidence), true);
  saveSkillMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skills: {},
    recentRuns: []
  });
});
