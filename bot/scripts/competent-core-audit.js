import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommands } from '../commandRegistry.js';
import { getSkills } from '../skillRegistry.js';
import { listCoreMacros, validateCoreMacros } from '../coreMacros.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, '..');

const requiredFiles = [
  'competentCore.js',
  'coreMacros.js',
  'coreIntentRouter.js',
  'coreObservation.js',
  'coreRecovery.js',
  'pluginWrappers.js',
  'test/competent-core.test.js'
];

const requiredCommands = [
  'competent_core_status',
  'core_macros',
  'run_core_macro',
  'core_recover',
  'core_test'
];

const safeInternalActions = new Set([
  'plugin_path_to_owner',
  'plugin_collect_blocks',
  'plugin_eat_safely'
]);

function fail(message, problems) {
  problems.push(message);
  console.error(`[competent:audit] ${message}`);
}

function read(file) {
  return fs.readFileSync(path.join(botDir, file), 'utf8');
}

function main() {
  const problems = [];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(botDir, file))) fail(`Missing required file: ${file}`, problems);
  }

  const commands = getCommands();
  const commandActions = new Set(commands.filter((command) => command.implemented).map((command) => command.action));
  const commandNames = new Set(commands.map((command) => command.name));
  const skills = new Set(getSkills().map((skill) => skill.name));

  for (const name of requiredCommands) {
    if (!commandNames.has(name)) fail(`Missing command registry entry: ${name}`, problems);
  }

  const macroValidation = validateCoreMacros({
    actions: Object.fromEntries([...commandActions, ...safeInternalActions].map((action) => [action, () => {}])),
    skills
  });
  for (const problem of macroValidation.problems) fail(problem, problems);

  for (const macro of listCoreMacros()) {
    if (macro.riskLevel !== 'low' && !macro.requiresConfirmation) {
      fail(`Risky macro lacks confirmation: ${macro.name}`, problems);
    }
    for (const step of macro.steps || []) {
      if (step.type === 'action' && !commandActions.has(step.name) && !safeInternalActions.has(step.name)) fail(`${macro.name} references action without command metadata: ${step.name}`, problems);
      if (step.type === 'skill' && !skills.has(step.name)) fail(`${macro.name} references missing skill: ${step.name}`, problems);
    }
  }

  const llmFiles = ['competentCore.js', 'coreMacros.js', 'coreIntentRouter.js', 'coreObservation.js', 'coreRecovery.js'];
  for (const file of llmFiles) {
    const source = read(file);
    if (/callOllama|\/api\/chat|ollama\.js/i.test(source)) fail(`${file} appears to call an LLM`, problems);
  }

  const coreSource = read('competentCore.js');
  if (!/executeAction/.test(coreSource) || !/runSkill/.test(coreSource)) {
    fail('competentCore.js should route execution through actions.executeAction and skillRunner.', problems);
  }

  const routerSource = read('naturalCommandRouter.js');
  if (!/routeCoreIntent/.test(routerSource)) fail('naturalCommandRouter.js does not call routeCoreIntent.', problems);

  if (problems.length) {
    console.error(`[competent:audit] failed with ${problems.length} problem(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('[competent:audit] ok');
}

main();
