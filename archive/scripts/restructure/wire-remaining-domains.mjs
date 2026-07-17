/**
 * Wire pre-built remaining domain modules into createActions.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createPath = path.join(botRoot, 'actions', 'createActions.js');
const domainsDir = path.join(botRoot, 'actions', 'domains');

let src = fs.readFileSync(createPath, 'utf8');
if (src.includes('createCombatHandlers(')) {
  console.log('already wired');
  process.exit(0);
}

function namesFromDomain(file) {
  const text = fs.readFileSync(path.join(domainsDir, file), 'utf8');
  const m = text.match(/return \{\s*([^}]+)\s*\};[\s\n]*$/);
  if (!m) {
    // fallback: list function names
    const names = [];
    const re = /(?:async\s+)?function\s+(\w+)\s*\(/g;
    let x;
    while ((x = re.exec(text))) names.push(x[1]);
    return names;
  }
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

function removeBetween(startMark, endMark, label) {
  const startIdx = src.indexOf(startMark);
  const endIdx = src.indexOf(endMark);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(`remove failed (${label}): ${startIdx},${endIdx}`);
  }
  src = src.slice(0, startIdx) + src.slice(endIdx);
  console.log('removed', label);
}

// Imports
const importExtra = `import { createGearHandlers } from './domains/gear.js';
import { createVillagerHandlers } from './domains/villagers.js';
import { createBlueprintHandlers } from './domains/blueprints.js';
import { createBridgeHandlers } from './domains/bridge.js';
import { createNetherHandlers } from './domains/nether.js';
import { createCombatHandlers } from './domains/combat.js';
import { createPlanningHandlers } from './domains/planning.js';
import { createSkillsHandlers } from './domains/skills.js';
import { createMetaHandlers } from './domains/meta.js';
import { createCurriculumHandlers } from './domains/curriculum.js';
import { createProgressionHandlers } from './domains/progression.js';
`;

if (!src.includes("from './domains/gear.js'")) {
  src = src.replace(
    "import { createBaseHandlers } from './domains/base.js';",
    "import { createBaseHandlers } from './domains/base.js';\n" + importExtra
  );
}

// Top-down removals
const removals = [
  ['  function pendingGearConfirmation(type, args = {}, message = null) {', '  function pendingTradeConfirmation(args = {}, message = null) {', 'gear'],
  ['  function pendingTradeConfirmation(args = {}, message = null) {', '  async function sayBlueprintResult(result, fallback = \'Blueprint action finished.\') {', 'villagers'],
  ['  async function sayBlueprintResult(result, fallback = \'Blueprint action finished.\') {', '  async function sayBridgeResult(result, fallback = \'Bridge action finished.\') {', 'blueprints'],
  ['  async function sayBridgeResult(result, fallback = \'Bridge action finished.\') {', '  function resourceOptions(extra = {}) {', 'bridge'],
  ['  function setPendingNetherConfirmation(action, extra = {}) {', '  async function combatStatusAction() {', 'nether'],
  ['  async function combatStatusAction() {', '  function findGoal(name = null) {', 'combat'],
  ['  function findGoal(name = null) {', '  async function brainStatus() {', 'planning'],
  ['  function categorySkillLine(category, counts) {', '  function summarizeNaturalRoute(route) {', 'skills'],
  ['  function summarizeNaturalRoute(route) {', '  function formatSuggestionList(suggestions) {', 'meta'],
  ['  function formatSuggestionList(suggestions) {', '  function normalizeMilestoneInput(input = \'\') {', 'curriculum'],
  ['  function normalizeMilestoneInput(input = \'\') {', '  async function help() {', 'progression']
];

for (const [a, b, label] of removals) removeBetween(a, b, label);

const gearNames = namesFromDomain('gear.js');
const villagerNames = namesFromDomain('villagers.js');
const blueprintNames = namesFromDomain('blueprints.js');
const bridgeNames = namesFromDomain('bridge.js');
const netherNames = namesFromDomain('nether.js');
const combatNames = namesFromDomain('combat.js');
const planningNames = namesFromDomain('planning.js');
const skillsNames = namesFromDomain('skills.js');
const metaNames = namesFromDomain('meta.js');
const curriculumNames = namesFromDomain('curriculum.js');
const progressionNames = namesFromDomain('progression.js');

// Early sayPlanning for mining
if (!src.includes('let sayPlanning')) {
  const mapStart = src.indexOf('  const {\n    currentDimension,');
  if (mapStart < 0) throw new Error('map helpers wire point not found');
  src = src.slice(0, mapStart) + `  let sayPlanning = (message, options = {}) => {
    if (!options?.silent) say(message, true);
  };

` + src.slice(mapStart);
}

// Ensure mining uses getter
if (src.includes('const miningHandlers = createMiningHandlers') && !src.includes('get sayPlanning()')) {
  src = src.replace(
    '    thinCollectResourceAction,\n    // sayPlanning is a function declaration later in createActions (hoisted).\n    get sayPlanning() {\n      // Function declaration later in this scope is hoisted.\n      return sayPlanning;\n    }\n  });',
    `    thinCollectResourceAction,
    get sayPlanning() { return sayPlanning; }
  });`
  );
  // alternate mining block format
  src = src.replace(
    /const miningHandlers = createMiningHandlers\(\{\n([\s\S]*?)thinCollectResourceAction\n  \}\);/,
    (full, mid) => {
      if (full.includes('get sayPlanning')) return full;
      return `const miningHandlers = createMiningHandlers({
${mid}thinCollectResourceAction,
    get sayPlanning() { return sayPlanning; }
  });`;
    }
  );
}

const baseAssign = '  resourceRunAction = baseHandlers.resourceRunAction;';
const baseIdx = src.indexOf(baseAssign);
if (baseIdx < 0) throw new Error('base assign missing');

const wire = `

  const gearHandlers = createGearHandlers({
    bot, config, memory, say,
    gearUpgradeSystem, enchanting, anvilSystem, potionSystem, brewing, gearMemory
  });
  const { ${gearNames.join(', ')} } = gearHandlers;

  const villagerHandlers = createVillagerHandlers({
    bot, config, memory, say, villagerEconomy, villagerMemory
  });
  const { ${villagerNames.join(', ')} } = villagerHandlers;

  const blueprintHandlers = createBlueprintHandlers({
    bot, config, memory, say, blueprintSystem
  });
  const { ${blueprintNames.join(', ')} } = blueprintHandlers;

  const bridgeHandlers = createBridgeHandlers({
    bot, config, memory, say, cancellation
  });
  const { ${bridgeNames.join(', ')} } = bridgeHandlers;

  const netherHandlers = createNetherHandlers({
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, posText,
    resourceOptions, loadMapMemory, saveMapMemory,
    netherPrep, netherGear, portalManager, netherSafety, netherScout, netherMemory, brewing
  });
  const { ${netherNames.join(', ')} } = netherHandlers;

  const combatHandlers = createCombatHandlers({
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, perception, safety, resourceOptions,
    combat, combatEquipment, threatAssessment, baseDefense, ownerDefense,
    eatIfHungry, collectNearbyDrops
  });
  const { ${combatNames.join(', ')} } = combatHandlers;

  const planningHandlers = createPlanningHandlers({
    bot, config, memory, say, perception, taskQueue, throwIfCancelled, state
  });
  const { ${planningNames.join(', ')} } = planningHandlers;
  if (typeof planningHandlers.sayPlanning === 'function') {
    sayPlanning = planningHandlers.sayPlanning;
  }

  const skillsHandlers = createSkillsHandlers({
    bot, config, memory, say
  });
  const { ${skillsNames.join(', ')} } = skillsHandlers;

  const metaHandlers = createMetaHandlers({
    bot, config, memory, say, perception, getApi: () => api
  });
  const { ${metaNames.join(', ')} } = metaHandlers;

  const curriculumHandlers = createCurriculumHandlers({
    bot, config, memory, say,
    curriculumEngine, curriculumExecutor, listCurriculumTemplates, normalizeCurriculumTemplateName
  });
  const { ${curriculumNames.join(', ')} } = curriculumHandlers;

  const progressionHandlers = createProgressionHandlers({
    bot, config, memory, say,
    progressionSystem, getProgressionHistory
  });
  const { ${progressionNames.join(', ')} } = progressionHandlers;

`;

src = src.slice(0, baseIdx + baseAssign.length) + wire + src.slice(baseIdx + baseAssign.length);

fs.writeFileSync(createPath, src, 'utf8');
console.log('wired createActions', src.length);
