import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as homeBase from './homeBase.js';
import * as lighting from './lighting.js';
import * as miningSafety from './miningSafety.js';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function rememberEntrance(memory, position) {
  const pos = point(position);
  if (!pos) return null;
  const current = memory.get().knownMineEntrances || [];
  const next = current.filter((entry) => !(entry.x === pos.x && entry.y === pos.y && entry.z === pos.z));
  next.unshift({ ...pos, at: Date.now() });
  memory.update({ primaryMineEntrance: pos, knownMineEntrances: next.slice(0, 12) });
  return pos;
}

function cardinalDirection(bot, memory) {
  const home = homeBase.getHome(memory);
  const pos = bot.entity?.position;
  if (!home || !pos) return new Vec3(1, 0, 0);
  const dx = Math.abs(pos.x - home.x);
  const dz = Math.abs(pos.z - home.z);
  if (dx > dz) return new Vec3(pos.x >= home.x ? 1 : -1, 0, 0);
  return new Vec3(0, 0, pos.z >= home.z ? 1 : -1);
}

function leftOf(direction) {
  return new Vec3(-direction.z, 0, direction.x);
}

function rightOf(direction) {
  return new Vec3(direction.z, 0, -direction.x);
}

function isAir(block) {
  return ['air', 'cave_air', 'void_air'].includes(block?.name);
}

async function moveNear(bot, pos) {
  if (!bot.pathfinder?.goto) return;
  if (bot.entity?.position?.distanceTo(pos) <= 1.5) return;
  await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1));
}

async function digIfNeeded(bot, block, options) {
  if (!block || isAir(block)) return { ok: true, message: 'clear' };
  return miningSafety.safeDigBlock(bot, block, options);
}

export function getMiningDirection(bot, memory) {
  return cardinalDirection(bot, memory);
}

export async function markMineEntrance(bot, memory) {
  const pos = rememberEntrance(memory, bot.entity?.position);
  return pos
    ? { ok: true, message: `Mine entrance marked at ${pos.x}, ${pos.y}, ${pos.z}.`, position: pos }
    : { ok: false, message: 'I do not know where I am to mark a mine entrance.' };
}

export async function findOrCreateMineEntrance(bot, memory, options = {}) {
  const existing = memory.get().primaryMineEntrance;
  if (existing && bot.entity) {
    const pos = new Vec3(existing.x, existing.y, existing.z);
    if (bot.entity.position.distanceTo(pos) <= (options.config?.maxMiningDistanceFromHome || 64)) {
      return { ok: true, message: 'Using known mine entrance.', position: existing };
    }
  }

  if (homeBase.hasHome(memory) && !homeBase.isNearHome(bot, memory, options.config?.mineEntranceRadiusFromHome || 12)) {
    await homeBase.returnHome(bot, memory, { throwIfCancelled: options.throwIfCancelled, range: options.config?.mineEntranceRadiusFromHome || 8 }).catch(() => null);
  }

  return markMineEntrance(bot, memory);
}

export async function placeTorchesInMine(bot, memory, options = {}) {
  return lighting.placeMiningTorch(bot, memory, {
    ownerUsername: options.config?.ownerUsername,
    torchSpacing: options.config?.torchSpacing || 7,
    survivalMode: true
  });
}

export async function digTunnel(bot, memory, direction, length, options = {}) {
  const dir = direction || getMiningDirection(bot, memory);
  const maxLength = Math.min(Math.max(1, Number(length) || 1), options.config?.maxBranchLength || 24);
  const mined = [];

  for (let i = 0; i < maxLength; i += 1) {
    if (options.throwIfCancelled) options.throwIfCancelled();
    const abort = miningSafety.shouldAbortMining(bot, memory, options);
    if (abort.abort) return { ok: false, message: `Aborted tunnel: ${abort.reasons.join(', ')}.`, mined };

    const base = bot.entity.position.floored().offset(dir.x, 0, dir.z);
    const foot = bot.blockAt(base);
    const head = bot.blockAt(base.offset(0, 1, 0));
    const footResult = await digIfNeeded(bot, foot, options);
    if (!footResult.ok) return { ok: false, message: footResult.message, mined };
    const headResult = await digIfNeeded(bot, head, options);
    if (!headResult.ok) return { ok: false, message: headResult.message, mined };
    mined.push(foot?.name, head?.name).filter(Boolean);
    await moveNear(bot, base);
    await placeTorchesInMine(bot, memory, options).catch(() => null);
  }

  return { ok: true, message: `Dug ${maxLength} tunnel step(s).`, mined };
}

export async function digBranch(bot, memory, direction, length, options = {}) {
  return digTunnel(bot, memory, direction, length, options);
}

export async function digStairStep(bot, memory, direction, options = {}) {
  const dir = direction || getMiningDirection(bot, memory);
  if (options.throwIfCancelled) options.throwIfCancelled();
  const here = bot.entity.position.floored();
  const ahead = here.offset(dir.x, 0, dir.z);
  const lower = ahead.offset(0, -1, 0);
  const blocks = [
    bot.blockAt(ahead.offset(0, 1, 0)),
    bot.blockAt(ahead),
    bot.blockAt(lower)
  ];

  for (const block of blocks) {
    const result = await digIfNeeded(bot, block, options);
    if (!result.ok) return result;
  }

  await moveNear(bot, lower);
  await placeTorchesInMine(bot, memory, options).catch(() => null);
  return { ok: true, message: 'Dug one staircase step.' };
}

export async function createSafeStaircaseMine(bot, memory, options = {}) {
  const entrance = await findOrCreateMineEntrance(bot, memory, options);
  if (!entrance.ok) return entrance;
  const direction = getMiningDirection(bot, memory);
  const targetY = options.targetY ?? options.config?.defaultMineYLevel ?? 48;
  const maxSteps = Math.min(40, Math.max(1, Math.abs(Math.floor((bot.entity?.position?.y ?? targetY) - targetY)) + 4));
  let steps = 0;

  while ((bot.entity?.position?.y ?? targetY) > targetY && steps < maxSteps) {
    if (options.throwIfCancelled) options.throwIfCancelled();
    const abort = miningSafety.shouldAbortMining(bot, memory, options);
    if (abort.abort) return { ok: false, message: `Aborted staircase: ${abort.reasons.join(', ')}.`, steps };
    const step = await digStairStep(bot, memory, direction, options);
    if (!step.ok) return { ...step, steps };
    steps += 1;
  }

  return { ok: steps > 0, message: steps > 0 ? `Staircase mine extended ${steps} step(s).` : 'I am already near the target mine level.', steps };
}

export async function createBranchMine(bot, memory, options = {}) {
  const entrance = await findOrCreateMineEntrance(bot, memory, options);
  if (!entrance.ok) return entrance;
  const direction = getMiningDirection(bot, memory);
  const branchCount = Math.min(options.branchCount || options.config?.maxBranchCount || 4, options.config?.maxBranchCount || 4);
  const branchLength = Math.min(options.branchLength || options.config?.maxBranchLength || 24, options.config?.maxBranchLength || 24);
  const spacing = options.config?.branchSpacing || 3;
  let completed = 0;

  const main = await digTunnel(bot, memory, direction, Math.min(branchCount * spacing, options.config?.maxBranchLength || 24), options);
  if (!main.ok) return main;

  for (let i = 0; i < branchCount; i += 1) {
    if (options.throwIfCancelled) options.throwIfCancelled();
    const branchDir = i % 2 === 0 ? leftOf(direction) : rightOf(direction);
    const branch = await digBranch(bot, memory, branchDir, branchLength, options);
    if (branch.ok) completed += 1;
    await digTunnel(bot, memory, new Vec3(-branchDir.x, 0, -branchDir.z), branchLength, options).catch(() => null);
    if (i < branchCount - 1) await digTunnel(bot, memory, direction, spacing, options);
  }

  return { ok: completed > 0, message: `Branch mine: completed ${completed}/${branchCount} branch(es).`, completed };
}
