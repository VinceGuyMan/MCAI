import assert from 'node:assert/strict';
import { getSkills } from '../skillRegistry.js';
import { listRunnableSkills } from '../skillRunner.js';
import { ensureSkillMemoryShape } from '../skillMemory.js';
import {
  createEvidenceRecord,
  getEvidenceDefinition,
  listEvidenceDefinitions,
  summarizeEvidence
} from '../progressEvidence.js';

function main() {
  const definitions = listEvidenceDefinitions();
  const names = new Set();
  const duplicateNames = [];
  for (const definition of definitions) {
    if (names.has(definition.name)) duplicateNames.push(definition.name);
    names.add(definition.name);
    assert.ok(definition.name, 'evidence definition missing name');
    assert.ok(definition.category, `${definition.name} missing category`);
    assert.ok(definition.verificationMode, `${definition.name} missing verificationMode`);
  }

  const errors = [];
  const runnable = new Set(listRunnableSkills());
  for (const skill of getSkills()) {
    if (!Array.isArray(skill.successEvidence) || !skill.successEvidence.length) {
      errors.push(`${skill.name} missing successEvidence`);
      continue;
    }
    for (const evidenceName of skill.successEvidence) {
      const definition = getEvidenceDefinition(evidenceName);
      if (!definition) errors.push(`${skill.name} references unknown evidence ${evidenceName}`);
      if (definition && !definition.implemented && runnable.has(skill.name)) {
        errors.push(`${skill.name} depends on future evidence ${evidenceName}`);
      }
    }
  }

  const memory = ensureSkillMemoryShape({
    skills: {
      status: {
        name: 'status',
        lastEvidence: [createEvidenceRecord('status_reported', 'verified', { source: 'test', confidence: 'high' })]
      }
    },
    recentRuns: []
  });
  assert.equal(Array.isArray(memory.skills.status.lastEvidence), true);
  assert.match(summarizeEvidence(memory.skills.status.lastEvidence), /status_reported/);

  if (duplicateNames.length) errors.push(`duplicate evidence names: ${duplicateNames.join(', ')}`);
  if (errors.length) {
    console.error(`Evidence audit failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Evidence audit');
  console.log(`Definitions: ${definitions.length}`);
  console.log(`Implemented definitions: ${definitions.filter((item) => item.implemented).length}`);
  console.log(`Skills checked: ${getSkills().length}`);
  console.log(`Runnable skills checked: ${runnable.size}`);
  console.log('PASS evidence registry valid');
}

main();
