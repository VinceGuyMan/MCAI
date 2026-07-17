import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSkill } from '../skillRegistry.js';
import { MILESTONE_5_EXECUTION_ALLOWLIST, canCurriculumExecuteSkill } from '../curriculumGuard.js';
import { getCurriculumTemplates } from '../curriculumTemplates.js';
import { ensureCurriculumMemoryShape } from '../curriculumMemory.js';
import { suggestNextSkills } from '../curriculumEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(botDir, '..');

function read(file) {
  return fs.readFileSync(path.resolve(botDir, file), 'utf8');
}

function mockBot() {
  return {
    username: 'tj',
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      curriculumExecutionEnabled: true,
      allowAutonomousCurriculum: false,
      allowCurriculumToRunSkills: true,
      curriculumAllowOnlyImplementedSkills: true,
      curriculumAllowOnlyRunnerEnabledSkills: true,
      curriculumExecutionRiskCeiling: 'low',
      maxCurriculumStepsPerApproval: 1,
      pauseCurriculumWhenOwnerFar: false
    },
    health: 20,
    food: 20,
    entity: { position: { x: 0, y: 64, z: 0 } },
    players: {},
    inventory: { items: () => [] }
  };
}

function mockMemory() {
  return { get: () => ({}) };
}

function main() {
  const errors = [];
  const config = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'config.json'), 'utf8'));
  assert.equal(config.curriculumExecutionEnabled, true, 'curriculumExecutionEnabled must be true');
  assert.equal(config.allowCurriculumToRunSkills, true, 'allowCurriculumToRunSkills must be true');
  assert.equal(config.allowAutonomousCurriculum, false, 'allowAutonomousCurriculum must stay false');
  assert.equal(Number(config.maxCurriculumStepsPerApproval || 1), 1, 'maxCurriculumStepsPerApproval must be 1');

  assert.ok(ensureCurriculumMemoryShape({}).curriculumSessions, 'curriculum memory must support sessions');
  assert.ok(MILESTONE_5_EXECUTION_ALLOWLIST.length > 0, 'execution allowlist must exist');

  for (const skillName of MILESTONE_5_EXECUTION_ALLOWLIST) {
    const skill = getSkill(skillName);
    if (!skill) errors.push(`allowlisted unknown skill ${skillName}`);
    if (skill && skill.riskLevel !== 'low') errors.push(`${skillName} is not low risk`);
    if (skill && skill.requiresConfirmation) errors.push(`${skillName} requires confirmation`);
  }

  for (const template of getCurriculumTemplates()) {
    for (const step of template.steps || []) {
      if (typeof step.executableInMilestone5 !== 'boolean') errors.push(`${template.name}/${step.skillName} missing executableInMilestone5`);
      if (step.executableInMilestone5 && !MILESTONE_5_EXECUTION_ALLOWLIST.includes(step.skillName)) {
        errors.push(`${template.name}/${step.skillName} marked executable but not allowlisted`);
      }
    }
  }

  const bot = mockBot();
  const memory = mockMemory();
  for (const blocked of ['safe_nether_entry', 'light_portal', 'engage_hostile', 'mine_coal', 'build_camp', 'store_items', 'go_to_waypoint']) {
    const result = canCurriculumExecuteSkill(bot, memory, blocked, { sender: 'ModVinny', config: bot.mcaiConfig });
    if (result.ok) errors.push(`${blocked} should be blocked for curriculum execution`);
  }

  const suggestions = suggestNextSkills(bot, memory, {
    force: true,
    config: { curriculumSuggestionsEnabled: true, includeBlockedSuggestions: true, maxCurriculumSuggestions: 3, maxBlockedSuggestions: 5 }
  });
  for (const suggestion of suggestions) {
    if (suggestion.recommended && suggestion.executableNow && !suggestion.suggestedApprovalCommand) {
      errors.push(`${suggestion.skillName} executable suggestion missing approval command`);
    }
  }

  const executorSource = read('curriculumExecutor.js');
  if (/mineflayer/i.test(executorSource)) errors.push('curriculumExecutor must not import Mineflayer directly');
  if (/from\s+['"]\.\/actions\.js['"]/.test(executorSource)) errors.push('curriculumExecutor must not import actions.js');
  if (/ollama/i.test(executorSource)) errors.push('curriculumExecutor must not call Ollama');
  if (!/from\s+['"]\.\/skillRunner\.js['"]/.test(executorSource) || !/runSkill\s*\(/.test(executorSource)) {
    errors.push('curriculumExecutor must execute through skillRunner.runSkill');
  }

  if (errors.length) {
    console.error(`Curriculum execution audit failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Curriculum execution audit');
  console.log(`Allowed execution skills: ${MILESTONE_5_EXECUTION_ALLOWLIST.length}`);
  console.log(`Templates checked: ${getCurriculumTemplates().length}`);
  console.log('Autonomy: disabled');
  console.log('PASS approved curriculum execution wiring valid');
}

main();
