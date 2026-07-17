import * as homeBase from './homeBase.js';
import * as inventory from './inventory.js';
import * as mineLayout from './mineLayout.js';
import * as miningSafety from './miningSafety.js';
import * as miningTools from './miningTools.js';
import * as oreScanner from './oreScanner.js';
import * as storage from './storage.js';

function result(ok, message, extra = {}) {
  return { ok, success: ok, message, ...extra };
}

export function miningStatus(bot, memory) {
  const tools = miningTools.miningToolStatus(bot);
  const ores = oreScanner.reportVisibleOres(bot, 32);
  return {
    activeMiningExpedition: memory.get().activeMiningExpedition || null,
    tools,
    visibleOres: ores.scan,
    freeSlots: inventory.countFreeInventorySlots(bot),
    torchCount: inventory.countItem(bot, 'torch'),
    loot: inventory.getMiningLootSummary(bot),
    mineEntrance: memory.get().primaryMineEntrance || null
  };
}

export function canStartMining(bot, memory, options = {}) {
  const config = options.config || {};
  if (!config.smartMiningEnabled) return result(false, 'Smart mining is disabled.');
  if (options.isCancelled?.()) return result(false, 'Mining is cancelled.');
  if (!config.allowOwnerCommandedMining && !config.allowAutonomousMining) return result(false, 'Mining is disabled.');
  if (config.allowMiningAtNight === false && bot.time?.timeOfDay >= 13000 && bot.time?.timeOfDay <= 23000) {
    return result(false, 'I should not start mining at night.');
  }
  const ready = miningSafety.hasEnoughFoodHealthTools(bot, options);
  if (!ready.ok) return result(false, ready.reason);
  if (!homeBase.hasHome(memory) && !bot.players?.[config.ownerUsername]?.entity) return result(false, 'I need home set or ModVinny visible so I can return.');
  return result(true, 'Ready for mining.');
}

export async function startMiningExpedition(bot, memory, options = {}) {
  const ready = canStartMining(bot, memory, options);
  if (!ready.ok) return ready;
  const resourceType = options.resourceType || 'stone';
  memory.update({
    activeMiningExpedition: {
      resourceType,
      targetCount: options.targetCount || 16,
      mode: options.mode || 'nearby_ore',
      startedAt: Date.now()
    },
    lastMiningExpeditionAt: Date.now(),
    blocksMinedThisTrip: 0,
    oresFoundThisTrip: {},
    miningStartPosition: bot.entity?.position ? { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z } : null
  });
  return mineResource(bot, memory, resourceType, options.targetCount || 16, options);
}

export function stopMiningExpedition(_bot, memory, reason = 'stopped') {
  memory.update({
    activeMiningExpedition: null,
    farmTaskActive: false,
    animalTaskActive: false,
    lastMiningAbortReason: reason
  });
  return result(true, 'Stopped mining.');
}

export async function mineResource(bot, memory, resourceType = 'stone', targetCount = 16, options = {}) {
  const type = String(resourceType || 'stone').toLowerCase();
  const ready = canStartMining(bot, memory, { ...options, skipTorchRequirement: type === 'stone' });
  if (!ready.ok) return ready;
  if (type === 'stone' || type === 'cobblestone') return mineStone(bot, memory, targetCount, options);

  const max = Math.min(
    Math.max(1, Number(targetCount) || 1),
    options.config?.maxOreBlocksPerMiningTrip || options.config?.maxBlocksPerMiningTrip || 32
  );
  let mined = 0;
  let lastFailure = '';

  for (let i = 0; i < max; i += 1) {
    if (options.throwIfCancelled) options.throwIfCancelled();
    const abort = miningSafety.shouldAbortMining(bot, memory, options);
    if (abort.abort) {
      if (mined > 0) memory.update({ blocksMinedThisTrip: (memory.get().blocksMinedThisTrip || 0) + mined });
      return result(mined > 0, `Stopped after mining ${mined} ${type}: ${abort.reasons.join(', ')}.`, { mined, target: max });
    }
    const visible = oreScanner.findReachableOre(bot, type, options.radius || 32, {
      isSafe: (block) => miningSafety.isSafeToMineBlock(bot, block, options.ownerPosition, options)
    });
    if (!visible) break;
    const dug = await miningSafety.safeDigBlock(bot, visible.block, options);
    if (!dug.ok) {
      lastFailure = dug.reason || dug.message || `could not mine ${type}`;
      break;
    }
    mined += 1;
  }

  if (mined > 0) {
    memory.update({ blocksMinedThisTrip: (memory.get().blocksMinedThisTrip || 0) + mined });
    return result(true, `Mined ${mined}/${max} safe ${type} ore block(s).`, { mined, target: max });
  }
  return result(false, lastFailure || `I do not see safe reachable ${type} ore nearby.`, { mined: 0, target: max });
}

export async function mineStone(bot, memory, targetCount = 16, options = {}) {
  const max = Math.min(targetCount || 16, options.config?.maxBlocksPerMiningTrip || 96);
  let mined = 0;
  for (let i = 0; i < max; i += 1) {
    if (options.throwIfCancelled) options.throwIfCancelled();
    const abort = miningSafety.shouldAbortMining(bot, memory, options);
    if (abort.abort) return result(false, `Aborted mining: ${abort.reasons.join(', ')}.`, { mined });
    const block = bot.findBlock?.({
      matching: (candidate) => ['stone', 'cobblestone', 'deepslate'].includes(candidate.name) && miningSafety.isSafeToMineBlock(bot, candidate, options.ownerPosition, options).ok,
      maxDistance: 8
    });
    if (!block) break;
    const dug = await miningSafety.safeDigBlock(bot, block, options);
    if (!dug.ok) break;
    mined += 1;
  }
  memory.update({ blocksMinedThisTrip: (memory.get().blocksMinedThisTrip || 0) + mined });
  return result(mined > 0, mined > 0 ? `Mined ${mined} stone block(s).` : 'No safe stone nearby.', { mined });
}

export const mineCoal = (bot, memory, targetCount = 8, options = {}) => mineResource(bot, memory, 'coal', targetCount, options);
export const mineIron = (bot, memory, targetCount = 8, options = {}) => mineResource(bot, memory, 'iron', targetCount, options);
export const mineCopper = (bot, memory, targetCount = 8, options = {}) => mineResource(bot, memory, 'copper', targetCount, options);
export const mineRedstone = (bot, memory, targetCount = 8, options = {}) => mineResource(bot, memory, 'redstone', targetCount, options);
export const mineLapis = (bot, memory, targetCount = 8, options = {}) => mineResource(bot, memory, 'lapis', targetCount, options);
export const mineGold = (bot, memory, targetCount = 8, options = {}) => mineResource(bot, memory, 'gold', targetCount, options);
export const mineDiamond = (bot, memory, targetCount = 1, options = {}) => mineResource(bot, memory, 'diamond', targetCount, options);

export async function returnFromMining(bot, memory, options = {}) {
  if (homeBase.hasHome(memory)) {
    await homeBase.returnHome(bot, memory, { throwIfCancelled: options.throwIfCancelled, range: 3 }).catch(() => null);
  }
  memory.update({ activeMiningExpedition: null });
  return result(true, 'Returned from mining.');
}

export async function depositMiningLoot(bot, memory, options = {}) {
  if (!storage.findOwnedStorageChest(bot, memory)) return result(false, 'No registered storage chest for mining loot.');
  return storage.depositItems(bot, memory, options);
}

export async function returnFromMiningAndDeposit(bot, memory, options = {}) {
  await returnFromMining(bot, memory, options);
  if (options.config?.depositLootAfterMining) await depositMiningLoot(bot, memory, options).catch(() => null);
  return reportMiningResults(bot, memory);
}

export function reportMiningResults(_bot, memory) {
  const mined = memory.get().blocksMinedThisTrip || 0;
  const ores = memory.get().oresFoundThisTrip || {};
  return result(true, `Mining report: ${mined} block(s) mined. Ores: ${Object.keys(ores).length ? JSON.stringify(ores) : 'none recorded'}.`);
}

export const createStaircaseMine = mineLayout.createSafeStaircaseMine;
export const createBranchMine = mineLayout.createBranchMine;
export const scanOres = oreScanner.reportVisibleOres;
export const miningToolStatus = miningTools.miningToolStatus;
export const miningToolStatusText = miningTools.miningToolStatusText;
