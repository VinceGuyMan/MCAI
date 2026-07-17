/**
 * Lazy Tier-2 system loader.
 * Parked domains resolve to safe no-op stubs (no disk import of systems/*).
 * Enabled domains dynamic-import from bot/systems/<domain>/.
 */

function parkedFn(system, flag) {
  return (..._args) => ({
    ok: false,
    parked: true,
    message: `${system} is parked. Set ${flag}=true in config.json to enable.`,
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
  return import(`../systems/${domain}/index.js`);
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
  // Curriculum + progression OS removed from live tree (Player-2 focus). Always retired stubs.
  // Gear: load unless thin-core hard-disable advanced, or always lazy-load when first needed.
  const gearOn = config.gearSystemEnabled === true
    || (config.thinCoreEnabled !== true && config.competentCoreDisableAdvancedAutonomy !== true)
    || config.loadGearSystems === true;

  const loads = await Promise.all([
    combatOn ? loadDomain('combat') : null,
    netherOn ? loadDomain('nether') : null,
    villagersOn ? loadDomain('villagers') : null,
    blueprintsOn ? loadDomain('blueprints') : null,
    gearOn ? loadDomain('gear') : null
  ]);

  const [combatDom, netherDom, villagerDom, blueprintDom, gearDom] = loads;

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

  // Retired meta systems (code lives under archive/removed-for-player2/).
  const curriculumEngine = makeParkedModule('curriculum', 'removed');
  const curriculumExecutor = makeParkedModule('curriculum', 'removed');
  curriculumExecutor.pauseCurriculum = () => ({ ok: true, retired: true });
  curriculumExecutor.getCurriculumExecutionStatus = () => ({ enabled: false, retired: true });
  const listCurriculumTemplates = () => [];
  const normalizeCurriculumTemplateName = (name) => String(name || '').toLowerCase();
  const progressionSystem = makeParkedModule('progression', 'removed');
  const getProgressionHistory = () => [];

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
      curriculumLoad: false,
      progressionOn: false,
      gearOn,
      curriculumRemoved: true,
      progressionRemoved: true
    }
  };
}
