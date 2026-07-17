import { Vec3 } from 'vec3';
import { loadConfig } from '../../config.js';
import * as blueprintMemory from './blueprintMemory.js';
import * as blueprintSafety from './blueprintSafety.js';
import * as placement from '../../placement.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toVec3(position) {
  return new Vec3(Math.floor(position.x || 0), Math.floor(position.y || 0), Math.floor(position.z || 0));
}

function throwIfCancelled(bot) {
  bot?.mcaiCancellation?.throwIfCancelled?.();
}

function cancellationActive(bot) {
  return Boolean(bot?.mcaiCancellation?.isCancelled?.());
}

function compactEvidence(...items) {
  return items.flat().filter(Boolean);
}

export function blueprintBuildStatus(bot, memory) {
  const active = blueprintMemory.getActiveBuild();
  const history = blueprintMemory.getBuildHistory(5);
  return {
    ok: true,
    activeBuild: active,
    recentBuilds: history,
    message: active
      ? `Active build: ${active.blueprintId} (${active.status}), ${active.placedBlocks.length} placed, ${active.remainingBlocks.length} remaining.`
      : `No active blueprint build. Recent builds: ${history.length}.`
  };
}

export async function startApprovedBuild(bot, memory, buildPlan, context = {}) {
  const config = loadConfig();
  if (!buildPlan?.blueprint) return { ok: false, reason: 'Missing build plan.' };
  const active = blueprintMemory.getActiveBuild();
  if (active && ['planned', 'approved', 'active', 'paused'].includes(active.status)) {
    return { ok: false, reason: `Another build is already ${active.status}.` };
  }
  const blueprintCheck = blueprintSafety.validateBlueprintSafety(bot, memory, buildPlan.blueprint, {
    requireConfirmation: true,
    context: { ...context, confirmed: true }
  });
  if (!blueprintCheck.ok) return { ok: false, reason: blueprintCheck.blockers.join('; '), blockers: blueprintCheck.blockers };
  const areaCheck = blueprintSafety.validateBuildArea(bot, memory, buildPlan);
  if (!areaCheck.ok) return { ok: false, reason: areaCheck.blockers.join('; '), blockers: areaCheck.blockers };
  if (cancellationActive(bot)) return { ok: false, reason: 'Cancellation is active.' };

  const record = blueprintMemory.createBuildRecord(buildPlan.blueprint, buildPlan.origin, {
    status: 'active',
    rotation: buildPlan.rotation,
    remainingBlocks: buildPlan.blocks,
    materialSnapshot: buildPlan.materials?.required || {}
  });
  blueprintMemory.setActiveBuild(record.id);
  blueprintMemory.updateBuildRecord(record.id, {
    status: 'active',
    startedAt: Date.now(),
    evidence: ['blueprint_build_approved', 'blueprint_build_started']
  });
  return {
    ok: true,
    buildId: record.id,
    message: `Started ${buildPlan.blueprint.name}.`,
    evidence: ['blueprint_build_approved', 'blueprint_build_started'],
    maxBlocksPerRun: Number(config.maxBlocksPlacedPerRun || 64)
  };
}

export async function verifyPlacedBlock(bot, position, expectedBlock) {
  const result = placement.verifyBlockAt
    ? placement.verifyBlockAt(bot, toVec3(position), expectedBlock)
    : { ok: false, reason: 'placement verification helper unavailable' };
  return result;
}

export async function placeNextBlueprintBlock(bot, memory, buildId) {
  throwIfCancelled(bot);
  const active = blueprintMemory.getActiveBuild();
  const record = active?.id === buildId ? active : blueprintMemory.getBuildHistory(100).find((item) => item.id === buildId);
  if (!record) return { ok: false, reason: 'Build record not found.' };
  if (!record.remainingBlocks.length) return completeBuild(bot, memory, buildId);
  const block = record.remainingBlocks[0];
  const pseudoPlan = { origin: record.origin, blocks: [block], blueprint: { id: record.blueprintId, blocks: [{ ...block.local, block: block.block }] } };
  const areaCheck = blueprintSafety.validateBuildArea(bot, memory, pseudoPlan);
  if (!areaCheck.ok) {
    blueprintMemory.pauseBuild(buildId, areaCheck.blockers[0] || 'Build area became unsafe.');
    return { ok: false, reason: areaCheck.blockers.join('; '), paused: true, evidence: ['blueprint_build_partial'] };
  }
  const placed = await placement.placeBlockSafely(bot, block.block, toVec3(block.position), { ownerUsername: loadConfig().ownerUsername });
  if (!placed.ok) {
    blueprintMemory.recordBlockFailed(buildId, block, placed.message || placed.reason || 'placement failed');
    blueprintMemory.pauseBuild(buildId, placed.message || placed.reason || 'placement failed');
    return { ok: false, reason: placed.message || placed.reason || 'placement failed', paused: true, evidence: ['blueprint_build_partial'] };
  }
  const verified = await verifyPlacedBlock(bot, block.position, block.block);
  if (!verified.ok) {
    blueprintMemory.recordBlockFailed(buildId, block, verified.reason || 'block verification failed');
    blueprintMemory.pauseBuild(buildId, verified.reason || 'block verification failed');
    return { ok: false, reason: verified.reason || 'block verification failed', paused: true, evidence: ['blueprint_build_partial'] };
  }
  const evidence = compactEvidence('blueprint_block_placed', 'blueprint_block_verified');
  blueprintMemory.recordBlockPlaced(buildId, block, evidence);
  return { ok: true, block, evidence, message: `Placed ${block.block}.` };
}

export async function continueBuild(bot, memory, buildId = null) {
  const config = loadConfig();
  const active = blueprintMemory.getActiveBuild();
  if (!active) return { ok: false, reason: 'No active blueprint build.' };
  const id = buildId || active.id;
  if (!['active', 'paused', 'approved'].includes(active.status)) return { ok: false, reason: `Build is ${active.status}.` };
  blueprintMemory.updateBuildRecord(id, { status: 'active', updatedAt: Date.now() });
  const placed = [];
  const failed = [];
  const limit = Number(config.maxBlocksPlacedPerRun || 64);
  for (let count = 0; count < limit; count += 1) {
    throwIfCancelled(bot);
    const current = blueprintMemory.getActiveBuild();
    if (!current?.remainingBlocks?.length) break;
    const result = await placeNextBlueprintBlock(bot, memory, id);
    if (!result.ok) {
      failed.push(result);
      break;
    }
    placed.push(result.block);
    await wait(Number(config.blueprintPlacementDelayMs || 150));
  }
  const updated = blueprintMemory.getActiveBuild();
  if (updated && updated.remainingBlocks.length === 0) {
    return completeBuild(bot, memory, id, ['blueprint_build_completed']);
  }
  if (failed.length) {
    return {
      ok: false,
      buildId: id,
      placedCount: placed.length,
      remainingCount: updated?.remainingBlocks?.length || 0,
      reason: failed[0].reason,
      evidence: ['blueprint_build_partial']
    };
  }
  blueprintMemory.pauseBuild(id, 'Placed capped run; waiting for continue.');
  return {
    ok: true,
    partial: true,
    buildId: id,
    placedCount: placed.length,
    remainingCount: updated?.remainingBlocks?.length || 0,
    message: `Placed ${placed.length} blocks. Paused with ${updated?.remainingBlocks?.length || 0} remaining.`,
    evidence: ['blueprint_build_partial']
  };
}

export function pauseBuild(bot, memory, reason = 'paused') {
  const active = blueprintMemory.getActiveBuild();
  if (!active) return { ok: false, reason: 'No active blueprint build.' };
  const record = blueprintMemory.pauseBuild(active.id, reason);
  return { ok: true, build: record, message: `Build paused: ${reason}`, evidence: ['blueprint_build_partial'] };
}

export function resumeBuild(bot, memory, buildId = null) {
  const active = blueprintMemory.getActiveBuild();
  const id = buildId || active?.id;
  if (!id) return { ok: false, reason: 'No build to resume.' };
  const record = blueprintMemory.resumeBuild(id);
  if (!record) return { ok: false, reason: 'Build record not found.' };
  return { ok: true, build: record, message: `Build resumed: ${record.blueprintId}` };
}

export function cancelBuild(bot, memory, reason = 'cancelled') {
  const active = blueprintMemory.getActiveBuild();
  if (!active) return { ok: false, reason: 'No active blueprint build.' };
  const record = blueprintMemory.cancelBuild(active.id, reason);
  return { ok: true, build: record, message: `Build cancelled: ${reason}`, evidence: ['blueprint_build_cancelled'] };
}

export function completeBuild(bot, memory, buildId, evidence = []) {
  const record = blueprintMemory.completeBuild(buildId, compactEvidence(evidence, 'blueprint_build_completed'));
  return { ok: true, build: record, buildId, message: `Build complete: ${record?.blueprintId || buildId}.`, evidence: ['blueprint_build_completed'] };
}

export function failBuild(bot, memory, buildId, reason) {
  const record = blueprintMemory.failBuild(buildId, reason);
  return { ok: false, build: record, buildId, reason, evidence: ['blueprint_build_failed'] };
}

export function getBuildProgress(bot, memory, buildId = null) {
  const active = blueprintMemory.getActiveBuild();
  const record = buildId && active?.id !== buildId
    ? blueprintMemory.getBuildHistory(100).find((item) => item.id === buildId)
    : active;
  if (!record) return { ok: false, reason: 'No active blueprint build.' };
  const total = record.placedBlocks.length + record.failedBlocks.length + record.remainingBlocks.length;
  return {
    ok: true,
    build: record,
    total,
    placed: record.placedBlocks.length,
    failed: record.failedBlocks.length,
    remaining: record.remainingBlocks.length,
    percent: total > 0 ? Math.round((record.placedBlocks.length / total) * 100) : 100
  };
}

export function reportBuildProgress(bot, memory, buildId = null) {
  const progress = getBuildProgress(bot, memory, buildId);
  if (!progress.ok) return progress;
  return {
    ok: true,
    message: `${progress.build.blueprintId}: ${progress.placed}/${progress.total} placed, ${progress.remaining} remaining, status ${progress.build.status}.`,
    data: progress
  };
}

