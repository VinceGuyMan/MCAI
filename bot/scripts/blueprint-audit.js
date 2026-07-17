import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from '../commandRegistry.js';
import { getSkill } from '../skillRegistry.js';
import { getEvidenceDefinition } from '../progressEvidence.js';
import { loadConfig } from '../config.js';
import { validateAllBlueprints, getBlueprints } from '../blueprintRegistry.js';
import { schematicImportStatus } from '../schematicImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

const requiredModules = [
  'blueprintRegistry.js',
  'blueprintMemory.js',
  'materialEstimator.js',
  'blueprintPlanner.js',
  'blueprintSafety.js',
  'blueprintBuilder.js',
  'blueprintPreview.js',
  'schematicImport.js',
  'blueprintSystem.js'
];

const requiredActions = [
  'blueprintStatus',
  'listBlueprints',
  'blueprintPreview',
  'blueprintMaterials',
  'blueprintPlan',
  'blueprintBuildApproved',
  'blueprintContinueBuild',
  'blueprintCancelBuild',
  'schematicStatus'
];

const requiredEvidence = [
  'blueprint_status_reported',
  'blueprint_list_reported',
  'blueprint_preview_created',
  'blueprint_materials_checked',
  'blueprint_plan_created',
  'blueprint_build_approved',
  'blueprint_block_placed',
  'blueprint_block_verified',
  'blueprint_build_completed',
  'blueprint_build_cancelled',
  'schematic_status_reported',
  'schematic_import_unsupported'
];

function fail(message) {
  console.error(`ERROR ${message}`);
  process.exitCode = 1;
}

for (const moduleName of requiredModules) {
  if (!fs.existsSync(path.join(botDir, moduleName))) fail(`${moduleName} is missing`);
}

const validation = validateAllBlueprints();
if (!validation.ok) {
  for (const problem of validation.errors || []) fail(`blueprint validation: ${problem}`);
}

const config = loadConfig();
for (const blueprint of getBlueprints()) {
  if (blueprint.blocks.length > config.maxBlueprintBlocks) fail(`${blueprint.id} exceeds maxBlueprintBlocks`);
  if (blueprint.blocks.some((block) => ['tnt', 'lava', 'fire'].includes(block.block))) fail(`${blueprint.id} contains a dangerous block`);
}

const commandNames = new Set(getCommands().map((command) => command.action));
for (const action of requiredActions) {
  if (!commandNames.has(action)) fail(`command registry does not expose ${action}`);
}

for (const evidenceName of requiredEvidence) {
  if (!getEvidenceDefinition(evidenceName)) fail(`evidence definition missing: ${evidenceName}`);
}

for (const skillName of ['blueprint_status', 'list_blueprints', 'blueprint_preview', 'blueprint_materials', 'blueprint_build_small', 'schematic_status']) {
  const skill = getSkill(skillName);
  if (!skill) fail(`skill missing: ${skillName}`);
  if (skillName.includes('build') && (!skill.requiresConfirmation || skill.riskLevel === 'low')) fail(`${skillName} must be confirmation-gated and risky`);
}

const schematicStatus = schematicImportStatus();
if (schematicStatus.supported) fail('schematic import is marked supported without a parser');
if (config.schematicImportEnabled || config.allowImportedSchematics) fail('schematic import should be disabled by default');

const source = fs.readFileSync(path.join(botDir, 'blueprintBuilder.js'), 'utf8') + fs.readFileSync(path.join(botDir, 'blueprintSystem.js'), 'utf8');
if (/ollama|openai|chatgpt/i.test(source)) fail('blueprint execution layer must not call LLM/cloud APIs');

if (!process.exitCode) console.log(`Blueprint audit passed: ${getBlueprints().length} built-in blueprints validated.`);
