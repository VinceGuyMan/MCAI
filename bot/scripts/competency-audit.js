import { getCommands, findCommandAlias } from '../commandRegistry.js';
import { getNaturalCommandPatterns } from '../naturalCommandMap.js';
import { listLearnedMappings, validateLearnedCommandTarget } from '../commandLearningMemory.js';
import { getCompetencyReport } from '../competencyTracker.js';
import { suggestRecoveryOptions } from '../selfCorrection.js';

const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const modules = await Promise.all([
  import('../commandLearningMemory.js'),
  import('../selfCorrection.js'),
  import('../competencyTracker.js'),
  import('../sessionRecorder.js'),
  import('../testArena.js')
]);

check(modules.every(Boolean), 'Phase 18.5 modules failed to import');

const commands = getCommands();
for (const name of ['competency', 'shaky_skills', 'reliable_skills', 'untested_skills', 'natural_learning_status', 'interaction_mode', 'test_plan']) {
  check(commands.some((command) => command.name === name && command.implemented), `missing command ${name}`);
}

for (const mapping of listLearnedMappings()) {
  const result = validateLearnedCommandTarget(mapping.canonicalCommand, { confirmed: true, approvedByOwner: true });
  check(result.ok, `learned mapping points at unsupported command: ${mapping.phrase} -> ${mapping.canonicalCommand}`);
}

for (const pattern of getNaturalCommandPatterns()) {
  if (pattern.canonicalCommand) check(Boolean(findCommandAlias(pattern.canonicalCommand)), `natural map target missing: ${pattern.canonicalCommand}`);
}

const recovery = suggestRecoveryOptions({ ok: false, reason: 'missing coal' });
check(recovery.every((option) => findCommandAlias(option.canonicalCommand)), 'recovery options must be registered commands');

const report = getCompetencyReport();
check(report && report.counts && Array.isArray(report.untested), 'competency report shape invalid');

if (errors.length) {
  console.error('Competency audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('PASS competency audit');
