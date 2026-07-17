import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMilestoneDefinitions, getProgressionMilestones } from '../progressionRegistry.js';
import { getProgressionEvidenceDefinitions, validateProgressionEvidenceNames } from '../progressionEvidence.js';
import { loadProgressionState, saveProgressionState } from '../progressionState.js';
import { getProgressionPaths } from '../progressionPaths.js';
import { listGoalTemplates } from '../goalTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`[progression:audit] FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[progression:audit] OK ${message}`);
}

function readSource(fileName) {
  return fs.readFileSync(path.join(botDir, fileName), 'utf8');
}

const milestones = getProgressionMilestones();
const registry = validateMilestoneDefinitions();
if (!registry.ok) {
  for (const error of registry.errors) fail(error);
} else {
  pass(`${registry.count} milestones validated`);
}

const evidence = getProgressionEvidenceDefinitions();
const evidenceNames = new Set();
for (const item of evidence) {
  if (evidenceNames.has(item.name)) fail(`duplicate progression evidence ${item.name}`);
  evidenceNames.add(item.name);
}
const evidenceValidation = validateProgressionEvidenceNames(milestones);
if (!evidenceValidation.ok) evidenceValidation.errors.forEach(fail);
else pass(`${evidence.length} progression evidence definitions validated`);

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

const goalTemplateNames = new Set(listGoalTemplates().flatMap((item) => [
  item.name,
  normalizeName(item.name)
]));
for (const canonical of [
  'prepare_for_night',
  'improve_base',
  'prepare_for_mining',
  'get_iron_gear',
  'food_security',
  'stockpile_resources',
  'secure_base',
  'prepare_for_nether',
  'progression_base_readiness'
]) goalTemplateNames.add(canonical);
for (const milestone of milestones) {
  for (const goalName of milestone.recommendedGoals || []) {
    if (!goalTemplateNames.has(goalName) && milestone.implemented) {
      fail(`${milestone.id} recommends unknown goal template ${goalName}`);
    }
  }
  if (!milestone.implemented && milestone.riskLevel !== 'high') {
    fail(`${milestone.id} is future but not marked high risk`);
  }
}

const pathMilestoneIds = new Set(milestones.map((item) => item.id));
for (const progressionPath of getProgressionPaths()) {
  for (const milestoneId of progressionPath.milestones) {
    if (!pathMilestoneIds.has(milestoneId)) fail(`${progressionPath.name} references unknown milestone ${milestoneId}`);
  }
}
pass(`${getProgressionPaths().length} progression paths validated`);

const state = loadProgressionState();
saveProgressionState(state);
pass('progression state loads and saves');

for (const fileName of [
  'progressionSystem.js',
  'progressionRegistry.js',
  'progressionTracker.js',
  'progressionAdvisor.js',
  'progressionPlanner.js'
]) {
  const source = readSource(fileName);
  if (/from ['"]mineflayer|bot\.pathfinder|bot\.dig|bot\.attack|bot\.placeBlock|ollama/i.test(source)) {
    fail(`${fileName} appears to import or call direct execution/LLM APIs`);
  }
}
pass('progression modules do not directly call Mineflayer execution or Ollama');

if (!process.exitCode) console.log('[progression:audit] Progression audit passed.');
