import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSkill, getSkills } from '../skillRegistry.js';
import { MILESTONE_2_RUNNER_ALLOWLIST, validateSkillForSuggestion } from '../skillValidator.js';
import { ensureSkillMemoryShape } from '../skillMemory.js';
import { listEvidenceDefinitions } from '../progressEvidence.js';
import { getCurriculumTemplates, validateCurriculumTemplate } from '../curriculumTemplates.js';
import { suggestNextSkills } from '../curriculumEngine.js';
import { ensureCurriculumMemoryShape } from '../curriculumMemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineSource = fs.readFileSync(path.resolve(__dirname, '..', 'curriculumEngine.js'), 'utf8');

function mockMemory() {
  const state = {};
  return {
    get: () => state,
    update: (patch) => Object.assign(state, patch)
  };
}

function main() {
  const errors = [];
  assert.ok(getSkills().length > 0, 'skills must load');
  assert.ok(listEvidenceDefinitions().length > 0, 'evidence definitions must load');
  assert.ok(ensureSkillMemoryShape({}).skills, 'skill memory shape must load');
  assert.ok(ensureCurriculumMemoryShape({}).lastSuggestions, 'curriculum memory shape must load');

  for (const template of getCurriculumTemplates()) {
    const validation = validateCurriculumTemplate(template);
    if (!validation.ok) errors.push(...validation.errors);
    for (const skillName of template.skills) {
      if (!getSkill(skillName)) errors.push(`${template.name} references unknown skill ${skillName}`);
    }
  }

  const suggestions = suggestNextSkills(null, mockMemory(), {
    force: true,
    config: {
      curriculumSuggestionsEnabled: true,
      includeBlockedSuggestions: true,
      maxCurriculumSuggestions: 3,
      maxBlockedSuggestions: 5
    },
    skillMemory: ensureSkillMemoryShape({})
  });

  for (const suggestion of suggestions) {
    if (!getSkill(suggestion.skillName)) errors.push(`suggested unknown skill ${suggestion.skillName}`);
    if (suggestion.recommended && !suggestion.implemented) errors.push(`recommended unimplemented skill ${suggestion.skillName}`);
    if (suggestion.recommended && !MILESTONE_2_RUNNER_ALLOWLIST.includes(suggestion.skillName)) errors.push(`recommended non-runner skill ${suggestion.skillName}`);
    if (suggestion.recommended && suggestion.requiresConfirmation) errors.push(`recommended confirmation-gated skill ${suggestion.skillName}`);
  }

  const risky = getSkill('safe_nether_entry');
  const riskyValidation = validateSkillForSuggestion(null, mockMemory(), risky, { skillMemory: ensureSkillMemoryShape({}), runnerOnly: true });
  assert.equal(riskyValidation.ok, false, 'safe_nether_entry should be blocked for suggestions');

  if (/from\s+['"]\.\/skillRunner\.js['"]/.test(engineSource) || /skillRunner\./.test(engineSource) || /\.runSkill\s*\(/.test(engineSource) || /runSkill\s*\(/.test(engineSource)) {
    errors.push('curriculumEngine must not import or call skillRunner.runSkill');
  }
  if (/openai/i.test(engineSource)) errors.push('curriculumEngine must not depend on OpenAI/cloud APIs');

  if (errors.length) {
    console.error(`Curriculum audit failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Curriculum audit');
  console.log(`Templates: ${getCurriculumTemplates().length}`);
  console.log(`Suggestions checked: ${suggestions.length}`);
  console.log('Execution: audited separately by curriculum:execution:audit');
  console.log('PASS curriculum suggestions valid');
}

main();
