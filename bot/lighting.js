import { placeBlockSafely } from './placement.js';

let lastTorchAt = 0;
let lastTorchPosition = null;

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function currentBlock(bot) {
  if (!bot.entity) return null;
  return bot.blockAt(bot.entity.position.floored());
}

export function hasTorches(bot) {
  return (bot.inventory?.items?.() || []).some((item) => item.name === 'torch' && item.count > 0);
}

export function lightingStatus(bot) {
  const block = currentBlock(bot);
  const lightLevel = block?.light ?? block?.skyLight ?? null;
  return {
    hasTorches: hasTorches(bot),
    lightLevel,
    dark: typeof lightLevel === 'number' ? lightLevel <= 7 : false,
    lastTorchAt,
    lastTorchPosition
  };
}

export async function placeTorchNear(bot, options = {}) {
  if (!hasTorches(bot)) return { ok: false, message: 'I do not have torches.' };
  const here = currentBlock(bot);
  if (here && ['water', 'lava'].includes(here.name)) return { ok: false, message: 'I should not place torches underwater or in lava.' };
  if (!options.survivalMode && Date.now() - lastTorchAt < 10000) return { ok: false, message: 'I placed a torch recently.' };
  if (lastTorchPosition && distance(point(bot.entity?.position), lastTorchPosition) < 4) {
    return { ok: false, message: 'There is already a recent torch spot nearby.' };
  }

  const placed = await placeBlockSafely(bot, 'torch', { ownerUsername: options.ownerUsername, maxRadius: 2 });
  if (placed.ok) {
    lastTorchAt = Date.now();
    lastTorchPosition = placed.position;
  }
  return placed;
}

export async function placeTorchIfDark(bot, options = {}) {
  const status = lightingStatus(bot);
  if (!status.dark && !options.force) return { ok: false, message: 'It is not dark enough for a torch here.' };
  return placeTorchNear(bot, options);
}

export function lightingStatusText(bot) {
  const status = lightingStatus(bot);
  return `Lighting: torches ${status.hasTorches ? 'yes' : 'no'}, light ${status.lightLevel ?? 'unknown'}, dark ${status.dark ? 'yes' : 'no'}.`;
}

export function getLastTorchDistance(memory, bot = null) {
  const last = memory.get?.().lastMiningTorchPosition || lastTorchPosition;
  const here = bot?.entity?.position ? point(bot.entity.position) : null;
  return here && last ? distance(here, last) : null;
}

export function shouldPlaceMiningTorch(bot, memory, options = {}) {
  if (!hasTorches(bot)) return false;
  const torchCount = bot.inventory?.items?.().filter((item) => item.name === 'torch').reduce((sum, item) => sum + item.count, 0) || 0;
  if (torchCount <= (options.keepTorches ?? 2) && !options.survivalMode) return false;
  const lastDistance = getLastTorchDistance(memory, bot);
  if (lastDistance === null) return true;
  return lastDistance >= (options.torchSpacing || 7);
}

export async function placeMiningTorch(bot, memory, options = {}) {
  if (!shouldPlaceMiningTorch(bot, memory, options)) {
    return { ok: false, message: 'No mining torch needed yet.' };
  }
  const placed = await placeTorchNear(bot, {
    ownerUsername: options.ownerUsername,
    survivalMode: true
  });
  if (placed.ok) {
    memory.update?.({
      lastMiningTorchAt: Date.now(),
      lastMiningTorchPosition: placed.position,
      lastTorchPlacedAt: Date.now()
    });
  }
  return placed;
}

export async function ensureMineLit(bot, memory, options = {}) {
  const status = lightingStatus(bot);
  if (status.dark || shouldPlaceMiningTorch(bot, memory, options)) {
    return placeMiningTorch(bot, memory, options);
  }
  return { ok: true, message: 'Mine lighting looks okay.' };
}
