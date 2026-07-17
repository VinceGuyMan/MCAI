/**
 * MCAI maintainability restructure:
 * 1) Move Tier-2 domain modules into bot/systems/<domain>/ with shims
 * 2) Split actions.js → actions/shared.js + actions/createActions.js + actions.js re-export
 * 3) Wire lazy Tier-2 domain factories (only import when flag enabled)
 *
 * Run: node scripts/restructure-actions.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botRoot = path.resolve(__dirname, '..');
const systemsRoot = path.join(botRoot, 'systems');
const actionsDir = path.join(botRoot, 'actions');

const DOMAINS = {
  nether: {
    flag: 'netherSystemEnabled',
    files: ['netherPrep.js', 'netherGear.js', 'netherMemory.js', 'netherSafety.js', 'netherScout.js', 'portalManager.js']
  },
  combat: {
    flag: 'experimentalCombatEnabled',
    files: ['combat.js', 'combatEquipment.js', 'combatMovement.js', 'threatAssessment.js', 'baseDefense.js', 'ownerDefense.js']
  },
  villagers: {
    flag: 'villagerSystemEnabled',
    files: [
      'villagerEconomy.js', 'villagerMemory.js', 'villagerScanner.js', 'villagerTrading.js',
      'tradeScoring.js', 'economyManager.js', 'tradeSafety.js', 'villageProtection.js'
    ]
  },
  blueprints: {
    flag: 'blueprintSystemEnabled',
    files: [
      'blueprintSystem.js', 'blueprintRegistry.js', 'blueprintMemory.js', 'materialEstimator.js',
      'blueprintPlanner.js', 'blueprintSafety.js', 'blueprintBuilder.js', 'blueprintPreview.js', 'schematicImport.js'
    ]
  },
  curriculum: {
    flag: 'curriculumExecutionEnabled',
    files: [
      'curriculumEngine.js', 'curriculumExecutor.js', 'curriculumGuard.js',
      'curriculumMemory.js', 'curriculumScoring.js', 'curriculumTemplates.js'
    ]
  },
  progression: {
    flag: 'progressionExecutionEnabled',
    files: [
      'progressionSystem.js', 'progressionState.js', 'progressionAdvisor.js', 'progressionEvidence.js',
      'progressionPaths.js', 'progressionPlanner.js', 'progressionRegistry.js', 'progressionTracker.js',
      'vanillaAdvancementBridge.js'
    ]
  },
  gear: {
    flag: null, // lazy-on-demand via gear domain factory; not a hard park flag in config
    files: [
      'gearUpgradeSystem.js', 'gearMemory.js', 'gearSafety.js', 'gearScore.js',
      'enchanting.js', 'anvilSystem.js', 'potionSystem.js', 'brewing.js'
    ]
  }
};

// Map basename → domain
const fileToDomain = new Map();
for (const [domain, meta] of Object.entries(DOMAINS)) {
  for (const file of meta.files) fileToDomain.set(file, domain);
}

function rewriteImports(source, domain, fileName) {
  return source.replace(/from\s+['"](\.[^'"]+)['"]/g, (full, spec) => {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return full;
    // Only rewrite relative imports that pointed at bot-root siblings
    if (!spec.startsWith('./')) {
      // already multi-level; leave
      return full;
    }
    const base = path.basename(spec.endsWith('.js') ? spec : `${spec}.js`);
    const targetDomain = fileToDomain.get(base);
    if (targetDomain === domain) {
      return `from './${base}'`;
    }
    if (targetDomain) {
      return `from '../${targetDomain}/${base}'`;
    }
    // core / other bot-root module
    return `from '../../${base}'`;
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function moveDomains() {
  const moved = [];
  for (const [domain, meta] of Object.entries(DOMAINS)) {
    const destDir = path.join(systemsRoot, domain);
    ensureDir(destDir);
    for (const file of meta.files) {
      const src = path.join(botRoot, file);
      const dest = path.join(destDir, file);
      if (!fs.existsSync(src)) {
        if (fs.existsSync(dest)) {
          console.log(`skip (already moved) ${file}`);
          continue;
        }
        console.warn(`missing ${file}`);
        continue;
      }
      let text = fs.readFileSync(src, 'utf8');
      text = rewriteImports(text, domain, file);
      fs.writeFileSync(dest, text, 'utf8');
      const shim = `/** Shim — implementation lives in systems/${domain}/${file} */\nexport * from './systems/${domain}/${file}';\n`;
      fs.writeFileSync(src, shim, 'utf8');
      moved.push(`${file} → systems/${domain}/`);
    }
    // domain index
    const exports = meta.files
      .map((f) => {
        const name = f.replace(/\.js$/, '');
        return `export * as ${name} from './${f}';`;
      })
      .join('\n');
    fs.writeFileSync(
      path.join(destDir, 'index.js'),
      `/** Domain bundle: ${domain} */\n${exports}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(destDir, 'README.md'),
      `# systems/${domain}\n\nConfig flag: \`${meta.flag || 'lazy on first gear action'}\`\n\nFiles loaded only when the domain factory is imported (see \`bot/actions/domains\`).\n`,
      'utf8'
    );
  }
  return moved;
}

function extractSharedAndCreateActions() {
  const actionsPath = path.join(botRoot, 'actions.js');
  const original = fs.readFileSync(actionsPath, 'utf8');

  // Backup once
  const backup = path.join(botRoot, 'actions.js.pre-restructure.bak');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

  // If already restructured to re-export only, skip splitting body
  if (original.includes("from './actions/createActions.js'") && original.length < 2000) {
    console.log('actions.js already a re-export; skipping body split');
    return null;
  }

  // Prefer restoring from bak if current is already partial
  const source = original.includes('export function createActions') ? original : fs.readFileSync(backup, 'utf8');

  const createIdx = source.indexOf('export function createActions');
  if (createIdx < 0) throw new Error('createActions not found');

  // Find start of normalizeActionCount export (shared exports)
  const sharedStart = source.indexOf('export function normalizeActionCount');
  if (sharedStart < 0) throw new Error('normalizeActionCount not found');

  // Imports block: everything before normalizeActionCount, but we'll rebuild createActions imports
  const headerImports = source.slice(0, sharedStart);
  const sharedBody = source.slice(sharedStart, createIdx);
  const createBody = source.slice(createIdx); // includes export function createActions...

  ensureDir(actionsDir);
  ensureDir(path.join(actionsDir, 'domains'));

  // shared.js — pure helpers/constants (no heavy domain imports)
  const sharedJs = `/**
 * Shared action helpers and evidence maps.
 * Extracted from actions.js for maintainability.
 */
${sharedBody}`;
  fs.writeFileSync(path.join(actionsDir, 'shared.js'), sharedJs, 'utf8');

  // Rewrite createActions imports: drop Tier-2 static imports (loaded lazily via domains)
  const tier2ImportPatterns = [
    /import \* as combat from '\.\/combat\.js';\r?\n/,
    /import \* as combatEquipment from '\.\/combatEquipment\.js';\r?\n/,
    /import \* as threatAssessment from '\.\/threatAssessment\.js';\r?\n/,
    /import \* as baseDefense from '\.\/baseDefense\.js';\r?\n/,
    /import \* as ownerDefense from '\.\/ownerDefense\.js';\r?\n/,
    /import \* as netherPrep from '\.\/netherPrep\.js';\r?\n/,
    /import \* as netherGear from '\.\/netherGear\.js';\r?\n/,
    /import \* as portalManager from '\.\/portalManager\.js';\r?\n/,
    /import \* as netherSafety from '\.\/netherSafety\.js';\r?\n/,
    /import \* as netherScout from '\.\/netherScout\.js';\r?\n/,
    /import \* as netherMemory from '\.\/netherMemory\.js';\r?\n/,
    /import \* as brewing from '\.\/brewing\.js';\r?\n/,
    /import \* as gearScore from '\.\/gearScore\.js';\r?\n/,
    /import \* as enchanting from '\.\/enchanting\.js';\r?\n/,
    /import \* as anvilSystem from '\.\/anvilSystem\.js';\r?\n/,
    /import \* as potionSystem from '\.\/potionSystem\.js';\r?\n/,
    /import \* as gearUpgradeSystem from '\.\/gearUpgradeSystem\.js';\r?\n/,
    /import \* as gearMemory from '\.\/gearMemory\.js';\r?\n/,
    /import \* as villagerEconomy from '\.\/villagerEconomy\.js';\r?\n/,
    /import \* as villagerMemory from '\.\/villagerMemory\.js';\r?\n/,
    /import \* as blueprintSystem from '\.\/blueprintSystem\.js';\r?\n/,
    /import \* as curriculumEngine from '\.\/curriculumEngine\.js';\r?\n/,
    /import \* as curriculumExecutor from '\.\/curriculumExecutor\.js';\r?\n/,
    /import \{ listCurriculumTemplates, normalizeCurriculumTemplateName \} from '\.\/curriculumTemplates\.js';\r?\n/,
    /import \* as progressionSystem from '\.\/progressionSystem\.js';\r?\n/,
    /import \{ getProgressionHistory \} from '\.\/progressionState\.js';\r?\n/
  ];

  let imports = headerImports
    .replace(/from '\.\//g, "from '../")
    .replace(/from "\.\//g, 'from "../')
    .replace(/from '\.\.\/bridge\//g, "from '../../bridge/")
    .replace(/from "\.\.\/bridge\//g, 'from "../../bridge/');

  for (const re of tier2ImportPatterns) imports = imports.replace(re, '');

  // Fix shared imports in createActions — use local shared
  const createActionsHeader = `${imports}
import {
  normalizeActionCount,
  adaptActionArguments,
  actionEvidenceMap,
  contextAwareActions,
  thinCoreActionNames,
  // re-export sets used inside createActions if referenced as free names
} from './shared.js';
import { attachLazyTier2 } from './lazyTier2.js';

// Re-bind names that shared.js exports as named constants — import * style for maps used in body
import * as shared from './shared.js';
const actionEvidenceMap = shared.actionEvidenceMap || {};
const contextAwareActions = shared.contextAwareActions || new Set();

`;

  // The createBody still references actionEvidenceMap etc. defined in shared - they were originally in same file.
  // We need createBody WITHOUT the shared section (already sliced).
  // createBody starts with export function createActions - good.
  // But actionEvidenceMap was BEFORE createActions in sharedBody - createBody may reference it.
  // Also createBody may still have references to combat, netherPrep as free vars - attachLazyTier2 injects them.

  let body = createBody
    // make createActions async for lazy attach
    .replace('export function createActions(bot, config, deps) {', `export async function createActions(bot, config, deps) {
  // Lazy Tier-2: only import systems/* when the matching config flag is true (gear loads on demand).
  const tier2 = await attachLazyTier2(config);
  const {
    combat, combatEquipment, threatAssessment, baseDefense, ownerDefense,
    netherPrep, netherGear, portalManager, netherSafety, netherScout, netherMemory,
    brewing, gearScore, enchanting, anvilSystem, potionSystem, gearUpgradeSystem, gearMemory,
    villagerEconomy, villagerMemory, blueprintSystem,
    curriculumEngine, curriculumExecutor, listCurriculumTemplates, normalizeCurriculumTemplateName,
    progressionSystem, getProgressionHistory
  } = tier2;
`);

  // Fix normalizeActionCount - still imported
  // Remove duplicate const actionEvidenceMap from body if any left - it's in shared only

  const createActionsJs = `/**
 * Action runtime (createActions).
 * Tier-0/1 systems are statically imported.
 * Tier-2 systems are resolved via attachLazyTier2 (systems/* only when enabled).
 */
${createActionsHeader}
${body}
`;

  fs.writeFileSync(path.join(actionsDir, 'createActions.js'), createActionsJs, 'utf8');

  // Thin actions.js re-export
  const facade = `/**
 * Public actions entry — keep import paths stable for bot.js / tests / scripts.
 */
export {
  normalizeActionCount,
  adaptActionArguments
} from './actions/shared.js';

export { createActions } from './actions/createActions.js';
`;
  fs.writeFileSync(actionsPath, facade, 'utf8');

  return { backup, size: source.length };
}

function writeLazyTier2() {
  const code = `/**
 * Lazy Tier-2 system loader.
 * Parked domains resolve to safe no-op stubs (no disk import of systems/*).
 * Enabled domains dynamic-import from bot/systems/<domain>/.
 */

function parkedFn(system, flag) {
  return (..._args) => ({
    ok: false,
    parked: true,
    message: \`\${system} is parked. Set \${flag}=true in config.json to enable.\`,
    reason: 'parked'
  });
}

function makeParkedModule(system, flag, methodNames = []) {
  const base = {};
  for (const name of methodNames) base[name] = parkedFn(system, flag);
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then' || prop === '@@toStringTag') return undefined;
      return parkedFn(system, flag);
    }
  });
}

async function loadDomain(domain) {
  // Import domain index which re-exports modules as namespaces
  return import(\`../systems/\${domain}/index.js\`);
}

function pick(mod, name) {
  return mod?.[name] || mod?.default?.[name] || null;
}

/**
 * @param {object} config
 * @returns {Promise<object>} bindings matching former static imports in actions.js
 */
export async function attachLazyTier2(config = {}) {
  const combatOn = config.experimentalCombatEnabled === true || config.allowCombat === true;
  const netherOn = config.netherSystemEnabled === true;
  const villagersOn = config.villagerSystemEnabled === true;
  const blueprintsOn = config.blueprintSystemEnabled === true;
  const curriculumOn = config.curriculumExecutionEnabled === true;
  // Allow curriculum *status* helpers without full execution by loading when either flag or explicit read flag
  const curriculumLoad = curriculumOn || config.curriculumStatusEnabled === true;
  const progressionOn = config.progressionExecutionEnabled === true;
  // Gear: load unless thin-core hard-disable advanced, or always lazy-load when first needed.
  // For simplicity at createActions time: load gear if not thin-locked.
  const gearOn = config.gearSystemEnabled === true
    || (config.thinCoreEnabled !== true && config.competentCoreDisableAdvancedAutonomy !== true)
    || config.loadGearSystems === true;

  const loads = await Promise.all([
    combatOn ? loadDomain('combat') : null,
    netherOn ? loadDomain('nether') : null,
    villagersOn ? loadDomain('villagers') : null,
    blueprintsOn ? loadDomain('blueprints') : null,
    curriculumLoad ? loadDomain('curriculum') : null,
    progressionOn ? loadDomain('progression') : null,
    gearOn ? loadDomain('gear') : null
  ]);

  const [combatDom, netherDom, villagerDom, blueprintDom, curriculumDom, progressionDom, gearDom] = loads;

  const combat = combatDom
    ? pick(combatDom, 'combat')
    : makeParkedModule('combat', 'experimentalCombatEnabled');
  const combatEquipment = combatDom ? pick(combatDom, 'combatEquipment') : makeParkedModule('combat', 'experimentalCombatEnabled');
  const threatAssessment = combatDom ? pick(combatDom, 'threatAssessment') : makeParkedModule('combat', 'experimentalCombatEnabled');
  const baseDefense = combatDom ? pick(combatDom, 'baseDefense') : makeParkedModule('combat', 'experimentalCombatEnabled');
  const ownerDefense = combatDom ? pick(combatDom, 'ownerDefense') : makeParkedModule('combat', 'experimentalCombatEnabled');

  // threatAssessment.summarizeThreats is sync string helper — provide minimal stub
  if (!combatDom) {
    threatAssessment.summarizeThreats = () => 'none (combat parked)';
    threatAssessment.scanThreats = () => [];
    threatAssessment.choosePrimaryThreat = () => null;
  }

  const netherPrep = netherDom ? pick(netherDom, 'netherPrep') : makeParkedModule('nether', 'netherSystemEnabled');
  const netherGear = netherDom ? pick(netherDom, 'netherGear') : makeParkedModule('nether', 'netherSystemEnabled');
  const portalManager = netherDom ? pick(netherDom, 'portalManager') : makeParkedModule('nether', 'netherSystemEnabled');
  const netherSafety = netherDom ? pick(netherDom, 'netherSafety') : makeParkedModule('nether', 'netherSystemEnabled');
  const netherScout = netherDom ? pick(netherDom, 'netherScout') : makeParkedModule('nether', 'netherSystemEnabled');
  const netherMemory = netherDom ? pick(netherDom, 'netherMemory') : makeParkedModule('nether', 'netherSystemEnabled');
  if (!netherDom) {
    netherSafety.isInNether = () => false;
  }

  const villagerEconomy = villagerDom ? pick(villagerDom, 'villagerEconomy') : makeParkedModule('villagers', 'villagerSystemEnabled');
  const villagerMemory = villagerDom ? pick(villagerDom, 'villagerMemory') : makeParkedModule('villagers', 'villagerSystemEnabled');

  const blueprintSystem = blueprintDom ? pick(blueprintDom, 'blueprintSystem') : makeParkedModule('blueprints', 'blueprintSystemEnabled');
  if (!blueprintDom) {
    blueprintSystem.cancelBlueprintBuild = () => ({ ok: true, message: 'no active blueprint (parked)' });
  }

  const curriculumEngine = curriculumDom ? pick(curriculumDom, 'curriculumEngine') : makeParkedModule('curriculum', 'curriculumExecutionEnabled');
  const curriculumExecutor = curriculumDom ? pick(curriculumDom, 'curriculumExecutor') : makeParkedModule('curriculum', 'curriculumExecutionEnabled');
  let listCurriculumTemplates = () => [];
  let normalizeCurriculumTemplateName = (name) => String(name || '').toLowerCase();
  if (curriculumDom) {
    const templates = pick(curriculumDom, 'curriculumTemplates');
    if (templates?.listCurriculumTemplates) listCurriculumTemplates = templates.listCurriculumTemplates;
    if (templates?.normalizeCurriculumTemplateName) normalizeCurriculumTemplateName = templates.normalizeCurriculumTemplateName;
  }
  if (!curriculumDom) {
    curriculumExecutor.pauseCurriculum = () => ({ ok: true });
    curriculumExecutor.getCurriculumExecutionStatus = () => ({ enabled: false, parked: true });
  }

  const progressionSystem = progressionDom ? pick(progressionDom, 'progressionSystem') : makeParkedModule('progression', 'progressionExecutionEnabled');
  let getProgressionHistory = () => [];
  if (progressionDom) {
    const state = pick(progressionDom, 'progressionState');
    if (state?.getProgressionHistory) getProgressionHistory = state.getProgressionHistory;
  }

  // Gear modules — real or parked
  const gearUpgradeSystem = gearDom ? pick(gearDom, 'gearUpgradeSystem') : makeParkedModule('gear', 'loadGearSystems');
  const gearMemory = gearDom ? pick(gearDom, 'gearMemory') : makeParkedModule('gear', 'loadGearSystems');
  const gearScore = gearDom ? pick(gearDom, 'gearScore') : makeParkedModule('gear', 'loadGearSystems');
  const enchanting = gearDom ? pick(gearDom, 'enchanting') : makeParkedModule('gear', 'loadGearSystems');
  const anvilSystem = gearDom ? pick(gearDom, 'anvilSystem') : makeParkedModule('gear', 'loadGearSystems');
  const potionSystem = gearDom ? pick(gearDom, 'potionSystem') : makeParkedModule('gear', 'loadGearSystems');
  const brewing = gearDom ? pick(gearDom, 'brewing') : makeParkedModule('gear', 'loadGearSystems');
  if (!gearDom) {
    gearMemory.recordEnchantingAttempt = () => {};
    gearMemory.recordAnvilAttempt = () => {};
    gearMemory.recordPotionUse = () => {};
    gearMemory.recordBrewingAttempt = () => {};
    brewing.brewingStatus = () => ({ fireResistance: 0, message: 'gear parked' });
  }

  return {
    combat,
    combatEquipment,
    threatAssessment,
    baseDefense,
    ownerDefense,
    netherPrep,
    netherGear,
    portalManager,
    netherSafety,
    netherScout,
    netherMemory,
    brewing,
    gearScore,
    enchanting,
    anvilSystem,
    potionSystem,
    gearUpgradeSystem,
    gearMemory,
    villagerEconomy,
    villagerMemory,
    blueprintSystem,
    curriculumEngine,
    curriculumExecutor,
    listCurriculumTemplates,
    normalizeCurriculumTemplateName,
    progressionSystem,
    getProgressionHistory,
    _meta: {
      combatOn,
      netherOn,
      villagersOn,
      blueprintsOn,
      curriculumLoad,
      progressionOn,
      gearOn
    }
  };
}
`;
  fs.writeFileSync(path.join(actionsDir, 'lazyTier2.js'), code, 'utf8');
}

function patchCallSites() {
  const files = [
    path.join(botRoot, 'bot.js'),
    path.join(botRoot, 'scripts', 'smoke-test.js'),
    path.join(botRoot, 'scripts', 'doctor.js'),
    path.join(botRoot, 'scripts', 'skill-runner-test.js'),
    path.join(botRoot, 'scripts', 'skill-audit.js'),
    path.join(botRoot, 'scripts', 'natural-router-audit.js'),
    path.join(botRoot, 'test', 'runtime-bugs.test.js'),
    path.join(botRoot, 'test', 'phase10-16-regression.test.js')
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, 'utf8');
    const before = text;
    // createActions( → await createActions( when not already awaited
    text = text.replace(/(?<!await\s)createActions\(/g, 'await createActions(');
    // ensure enclosing function is async if we added await at top-level in bot.js
    if (file.endsWith('bot.js')) {
      // bot.js top-level already uses await for plugins — ok for ESM
    }
    // test callbacks: test('name', () => { await createActions — need async
    text = text.replace(/test\((['"`][^'"`]+['"`])\s*,\s*async\s*\(/g, 'test($1, async ('); // already async
    text = text.replace(/test\((['"`][^'"`]+['"`])\s*,\s*\(\s*\)\s*=>\s*\{/g, 'test($1, async () => {');
    text = text.replace(/test\((['"`][^'"`]+['"`])\s*,\s*\(\s*\)\s*=>\s*await/g, 'test($1, async () => await');
    // helper functions that return createActions
    text = text.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{\s*\n(\s*)return await createActions/g,
      'async function $1($2) {\n$3return await createActions');
    text = text.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{\s*\n(\s*)return createActions/g,
      'async function $1($2) {\n$3return await createActions');
    text = text.replace(/const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*createActions/g,
      'const $1 = async ($2) => await createActions');
    text = text.replace(/const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*await createActions/g,
      'const $1 = async ($2) => await createActions');
    if (text !== before) {
      fs.writeFileSync(file, text, 'utf8');
      console.log('patched call sites:', path.relative(botRoot, file));
    }
  }
}

function writeDomainReadme() {
  const md = `# actions/ — split action runtime

| File | Role |
|------|------|
| \`../actions.js\` | Stable public entry (re-exports) |
| \`shared.js\` | Count helpers, evidence maps |
| \`lazyTier2.js\` | Dynamic import of \`systems/*\` when flags allow |
| \`createActions.js\` | Main action runtime (was monolithic actions.js) |
| \`domains/\` | Future extractions of handler groups |

Tier-2 physical modules live in \`../systems/<domain>/\` with shims at the old \`bot/*.js\` paths.
`;
  fs.writeFileSync(path.join(actionsDir, 'README.md'), md, 'utf8');
}

// Fix shared.js exports - need to export actionEvidenceMap and contextAwareActions
function fixSharedExports() {
  const sharedPath = path.join(actionsDir, 'shared.js');
  if (!fs.existsSync(sharedPath)) return;
  let text = fs.readFileSync(sharedPath, 'utf8');
  // actionEvidenceMap and contextAwareActions were const - export them
  text = text.replace(/^const actionEvidenceMap = /m, 'export const actionEvidenceMap = ');
  text = text.replace(/^const contextAwareActions = /m, 'export const contextAwareActions = ');
  // Also export other consts that createActions might need if they were top-level
  for (const name of [
    'thinCoreActionNames',
    'TOOL_PRIORITY',
    'MATERIAL_PRIORITY',
    'logNames'
  ]) {
    text = text.replace(new RegExp(`^const ${name} = `, 'm'), `export const ${name} = `);
  }
  fs.writeFileSync(sharedPath, text, 'utf8');
}

function main() {
  console.log('=== Moving domain modules to systems/ ===');
  const moved = moveDomains();
  console.log(`Moved ${moved.length} files`);

  console.log('=== Writing lazyTier2 ===');
  ensureDir(actionsDir);
  ensureDir(path.join(actionsDir, 'domains'));
  writeLazyTier2();
  writeDomainReadme();

  console.log('=== Splitting actions.js ===');
  const split = extractSharedAndCreateActions();
  fixSharedExports();
  if (split) console.log('Split complete, backup at', split.backup);

  console.log('=== Patching createActions call sites to await ===');
  patchCallSites();

  console.log('Done.');
}

main();
