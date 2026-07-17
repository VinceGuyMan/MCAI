import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getSkill } from '../skillRegistry.js';
import { ensureSkillMemoryShape, saveSkillMemory } from '../skillMemory.js';
import { MILESTONE_2_RUNNER_ALLOWLIST, validateSkillForSuggestion } from '../skillValidator.js';
import { createEvidenceRecord } from '../progressEvidence.js';
import { getCurriculumTemplates, validateCurriculumTemplate } from '../curriculumTemplates.js';
import { scoreSkillCandidate } from '../curriculumScoring.js';
import {
  acceptLastSuggestion,
  dismissLastSuggestion,
  suggestCurriculumTrack,
  suggestNextSkills
} from '../curriculumEngine.js';
import { curriculumMemoryPath, loadCurriculumMemory, saveCurriculumMemory } from '../curriculumMemory.js';

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

function resetCurriculumMemory() {
  saveCurriculumMemory({
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSuggestionAt: 0,
    lastSuggestions: [],
    dismissedSuggestions: [],
    acceptedSuggestions: [],
    trackHistory: [],
    ownerPreferences: { preferredTracks: [], dismissedTracks: [] }
  });
}

function mockBot() {
  return {
    username: 'tj',
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      curriculumSuggestionsEnabled: true,
      includeBlockedSuggestions: true,
      maxCurriculumSuggestions: 3,
      maxBlockedSuggestions: 5
    },
    entity: { position: { x: 0, y: 64, z: 0 } },
    health: 20,
    food: 20,
    game: { dimension: 'overworld' },
    players: {},
    inventory: { items: () => [{ name: 'cooked_beef', count: 6 }, { name: 'stone_pickaxe', count: 1 }] }
  };
}

function mockMemory() {
  const state = { homeBasePosition: { x: 0, y: 64, z: 0 }, knownStorageChests: [{ x: 1, y: 64, z: 1 }] };
  return {
    get: () => state,
    update: (patch) => Object.assign(state, patch)
  };
}

beforeEach(() => {
  resetSkillMemory();
  resetCurriculumMemory();
});

afterEach(() => {
  resetSkillMemory();
  resetCurriculumMemory();
  if (fs.existsSync(`${curriculumMemoryPath}.tmp`)) fs.rmSync(`${curriculumMemoryPath}.tmp`, { force: true });
});

test('curriculum templates load and reference known skills', () => {
  const templates = getCurriculumTemplates();
  assert.ok(templates.length >= 8);
  const names = new Set(templates.map((item) => item.name));
  assert.equal(names.size, templates.length);
  for (const template of templates) {
    const validation = validateCurriculumTemplate(template);
    assert.equal(validation.ok, true, validation.errors.join(', '));
  }
});

test('scoring prefers low-risk implemented skills over unimplemented risky skills', () => {
  const context = {
    skillsByName: { status: getSkill('status'), mine_diamond: getSkill('mine_diamond') },
    skillStats: {},
    evidenceBySkill: {
      status: { hasVerified: true },
      mine_diamond: { hasFailed: true }
    },
    needs: {},
    unsafe: false
  };
  assert.ok(scoreSkillCandidate(getSkill('status'), context) > scoreSkillCandidate(getSkill('mine_diamond'), context));
});

test('risky and unknown skills are blocked for suggestion', () => {
  const bot = mockBot();
  const memory = mockMemory();
  const skillMemory = ensureSkillMemoryShape({});
  assert.equal(validateSkillForSuggestion(bot, memory, 'safe_nether_entry', { skillMemory, runnerOnly: true }).ok, false);
  assert.equal(validateSkillForSuggestion(bot, memory, 'not_a_skill', { skillMemory, runnerOnly: true }).ok, false);
});

test('suggestNextSkills returns capped runner-enabled recommendations and blocked items', () => {
  const suggestions = suggestNextSkills(mockBot(), mockMemory(), {
    force: true,
    config: { curriculumSuggestionsEnabled: true, includeBlockedSuggestions: true, maxCurriculumSuggestions: 3, maxBlockedSuggestions: 5 },
    skillMemory: ensureSkillMemoryShape({})
  });
  assert.ok(suggestions.length <= 8);
  const recommended = suggestions.filter((item) => item.recommended);
  assert.ok(recommended.length <= 3);
  for (const suggestion of recommended) {
    assert.ok(MILESTONE_2_RUNNER_ALLOWLIST.includes(suggestion.skillName));
    assert.equal(suggestion.runnableViaSkillRunner, true);
    assert.ok(suggestion.suggestedCommand.startsWith('tj run skill '));
  }
});

test('evidence-backed skills are boosted and recent failures are blocked', () => {
  const skillMemory = ensureSkillMemoryShape({
    skills: {
      status: {
        name: 'status',
        successCount: 1,
        failureCount: 0,
        lastEvidence: [createEvidenceRecord('status_reported', 'verified', { source: 'test', confidence: 'high' })]
      },
      food_status: {
        name: 'food_status',
        successCount: 0,
        failureCount: 1,
        lastEvidence: [createEvidenceRecord('skill_failed', 'failed', { source: 'test', confidence: 'high' })],
        lastFailureAt: Date.now()
      }
    },
    recentRuns: []
  });
  const suggestions = suggestNextSkills(mockBot(), mockMemory(), {
    force: true,
    config: { curriculumSuggestionsEnabled: true, includeBlockedSuggestions: true, maxCurriculumSuggestions: 5 },
    skillMemory
  });
  assert.ok(suggestions.some((item) => item.skillName === 'status'));
  const food = suggestions.find((item) => item.skillName === 'food_status');
  assert.ok(!food || food.recommended === false);
});

test('track suggestion reports steps and blockers without executing', () => {
  const track = suggestCurriculumTrack(mockBot(), mockMemory(), 'mining_readiness', {
    force: true,
    skillMemory: ensureSkillMemoryShape({})
  });
  assert.equal(track.trackName, 'mining_readiness');
  assert.ok(track.skills.length > 0);
  assert.ok(!('runResult' in track));
});

test('accept and dismiss suggestion update memory only', () => {
  suggestNextSkills(mockBot(), mockMemory(), { force: true, skillMemory: ensureSkillMemoryShape({}) });
  acceptLastSuggestion();
  dismissLastSuggestion('', 'test');
  const memory = loadCurriculumMemory();
  assert.equal(memory.acceptedSuggestions.length, 1);
  assert.equal(memory.dismissedSuggestions.length, 1);
});
