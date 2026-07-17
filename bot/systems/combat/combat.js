import * as threatAssessment from './threatAssessment.js';
import * as combatEquipment from './combatEquipment.js';
import * as combatMovement from './combatMovement.js';
import * as mapMemoryStore from '../../mapMemory.js';
import pathfinderPkg from 'mineflayer-pathfinder';

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

function now() {
  return Date.now();
}

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function config(bot) {
  return bot.mcaiConfig || {};
}

function shouldFlee(bot, threats = []) {
  const cfg = config(bot);
  if ((bot.health ?? 20) <= (cfg.criticalHealthToFlee || 8)) return { flee: true, reason: 'low health' };
  if ((bot.food ?? 20) < (cfg.minFoodToFight || 10)) return { flee: true, reason: 'low food' };
  if (threats.some((threat) => threat.name === 'warden')) return { flee: true, reason: 'warden nearby' };
  if (threats.filter((threat) => threat.kind === 'hostile').length > (cfg.maxHostilesBeforeFlee || 3)) return { flee: true, reason: 'too many hostiles' };
  return { flee: false };
}

function isPathInterrupted(error) {
  const message = String(error?.message || error || '');
  return message.includes('GoalChanged') || message.includes('goal was changed') || message.includes('Path was stopped');
}

function rememberMeaningfulDanger(bot, memory, threat, reason = '') {
  if (!bot.mcaiConfig?.mapMemoryEnabled || !threat?.position) return;
  if (!['warden', 'witch', 'creeper', 'ravager', 'evoker'].includes(threat.name) && !reason.includes('base')) return;
  const mapMemory = mapMemoryStore.loadMapMemory();
  mapMemoryStore.addDangerZone(mapMemory, {
    dangerType: threat.name === 'warden' ? 'warden' : 'hostile_mobs',
    dimension: bot.game?.dimension || 'overworld',
    position: threat.position,
    severity: threat.name === 'warden' ? 'high' : 'medium',
    notes: reason || `Hostile observed: ${threat.name}`
  });
  mapMemoryStore.saveMapMemory(mapMemory);
}

export function combatStatus(bot, memory) {
  const threats = threatAssessment.scanThreats(bot, memory, config(bot).hostileDetectionRadius || 24);
  const primary = threatAssessment.choosePrimaryThreat(bot, threats);
  const gear = combatEquipment.combatEquipmentStatus(bot);
  const flee = shouldFlee(bot, threats);
  return {
    combatMode: memory.get?.().combatMode || 'off',
    activeThreat: memory.get?.().activeThreat || null,
    threatCount: threats.filter((threat) => threat.kind === 'hostile').length,
    threats,
    primaryThreat: primary,
    gear,
    health: bot.health ?? 20,
    food: bot.food ?? 20,
    shouldFleeCombat: flee.flee,
    fleeReason: flee.reason || null
  };
}

export function startCombatMode(bot, memory, options = {}) {
  const mode = options.mode || 'self_defense';
  memory.update?.({
    combatMode: mode,
    guardedPosition: options.position ? point(options.position) : memory.get().guardedPosition,
    lastCombatStartedAt: now(),
    lastCombatAbortReason: null
  });
  return { ok: true, message: `Combat mode: ${mode}.` };
}

export function stopCombatMode(bot, memory, reason = 'stopped') {
  bot.pathfinder?.setGoal?.(null);
  bot.clearControlStates?.();
  memory.update?.({
    combatMode: 'off',
    activeThreat: null,
    activeThreatId: null,
    activeThreatType: null,
    guardedPosition: null,
    lastCombatEndedAt: now(),
    lastCombatAbortReason: reason
  });
  return { ok: true, message: `Combat stopped: ${reason}.` };
}

export async function combatTick(bot, memory, options = {}) {
  const mode = memory.get?.().combatMode || 'off';
  if (mode === 'off') return { ok: true, message: 'Combat is off.' };
  if (mode === 'defend_owner') return defendOwner(bot, memory, options);
  if (mode === 'guard_base') return defendBase(bot, memory, options);
  if (mode === 'self_defense') return defendSelf(bot, memory, options);
  if (mode === 'flee') {
    const threats = threatAssessment.scanThreats(bot, memory);
    const hostiles = threats.filter((threat) => threat.kind === 'hostile');
    // Clear sticky flee when danger is gone so pathing/companion can resume.
    if (!hostiles.length && (bot.health || 20) > (config(bot).criticalHealthToFlee || 8)) {
      return stopCombatMode(bot, memory, 'no remaining threats');
    }
    return fleeFromDanger(
      bot,
      memory,
      threatAssessment.choosePrimaryThreat(bot, hostiles) || hostiles[0],
      { ...options, silent: options.silent !== false, reason: options.reason || 'danger nearby' }
    );
  }
  return { ok: true, message: `Combat mode ${mode} is waiting.` };
}

export async function defendSelf(bot, memory, options = {}) {
  const threats = threatAssessment.scanThreats(bot, memory, config(bot).hostileDetectionRadius || 24);
  const flee = shouldFlee(bot, threats);
  const primary = threatAssessment.choosePrimaryThreat(bot, threats.filter((threat) => threat.botThreat || threat.distance <= (config(bot).combatEngageRadius || 12)));
  if (flee.flee) return fleeFromDanger(bot, memory, primary || threats[0], { ...options, reason: flee.reason });
  if (!primary) return { ok: true, message: 'No immediate self-defense target.' };
  return engageTarget(bot, memory, primary.entity, { ...options, mode: 'self_defense' });
}

export async function defendOwner(bot, memory, options = {}) {
  const threats = threatAssessment.scanThreats(bot, memory, config(bot).defendOwnerRadius || 16).filter((threat) => threat.ownerThreat);
  const flee = shouldFlee(bot, threats);
  const primary = threatAssessment.choosePrimaryThreat(bot, threats);
  if (flee.flee) return fleeFromDanger(bot, memory, primary || threats[0], { ...options, reason: flee.reason });
  if (!primary) return { ok: true, message: 'No threats near ModVinny.' };
  return engageTarget(bot, memory, primary.entity, { ...options, mode: 'defend_owner' });
}

export async function defendBase(bot, memory, options = {}) {
  const threats = threatAssessment.scanThreats(bot, memory, config(bot).defendBaseRadius || 24).filter((threat) => threat.baseThreat);
  const flee = shouldFlee(bot, threats);
  const primary = threatAssessment.choosePrimaryThreat(bot, threats);
  if (primary) rememberMeaningfulDanger(bot, memory, primary, 'base defense threat');
  if (flee.flee) return fleeFromDanger(bot, memory, primary || threats[0], { ...options, reason: flee.reason });
  if (!primary) return { ok: true, message: 'No base threats nearby.' };
  return engageTarget(bot, memory, primary.entity, { ...options, mode: 'guard_base' });
}

export async function guardPosition(bot, memory, position, options = {}) {
  memory.update?.({ combatMode: 'guard_position', guardedPosition: point(position || bot.entity?.position), lastCombatStartedAt: now() });
  return { ok: true, message: 'Guarding this position.' };
}

export async function engageTarget(bot, memory, target, options = {}) {
  if (!target?.position) return { ok: false, message: 'No target to engage.' };
  const cfg = config(bot);
  const threats = threatAssessment.scanThreats(bot, memory, cfg.hostileDetectionRadius || 24);
  const threat = threats.find((item) => item.id === target.id) || {
    entity: target,
    id: target.id,
    name: threatAssessment.entityName(target),
    kind: threatAssessment.isHostileMob(target) ? 'hostile' : 'unknown',
    protected: threatAssessment.isProtectedEntity(target, cfg),
    distance: bot.entity?.position?.distanceTo(target.position) || 99,
    position: point(target.position)
  };
  if (threat.protected || threat.kind !== 'hostile') return { ok: false, message: `I will not attack ${threat.name}.` };
  if (threat.name === 'warden') return fleeFromDanger(bot, memory, threat, { ...options, reason: 'warden nearby' });
  if ((bot.health ?? 20) < (cfg.minHealthToFight || 14) && !options.emergency) return fleeFromDanger(bot, memory, threat, { ...options, reason: 'health too low' });
  if ((bot.food ?? 20) < (cfg.minFoodToFight || 10) && !options.emergency) return fleeFromDanger(bot, memory, threat, { ...options, reason: 'food too low' });

  const gear = await combatEquipment.prepareForCombat(bot, { emergency: Boolean(options.emergency) });
  if (!gear.ok && !options.emergency) return fleeFromDanger(bot, memory, threat, { ...options, reason: gear.message });

  memory.update?.({
    combatMode: options.mode || memory.get().combatMode || 'manual_attack',
    activeThreat: { name: threat.name, position: threat.position, startedAt: now() },
    activeThreatId: threat.id,
    activeThreatType: threat.name
  });
  console.log(`[combat] engaging ${threat.name} id=${threat.id}`);

  let hits = 0;
  const startedAt = now();
  while (target?.isValid !== false && target?.position && hits < 12 && now() - startedAt < 18000) {
    options.throwIfCancelled?.();
    const currentThreats = threatAssessment.scanThreats(bot, memory, cfg.hostileDetectionRadius || 24);
    const flee = shouldFlee(bot, currentThreats);
    if (flee.flee) return fleeFromDanger(bot, memory, threat, { ...options, reason: flee.reason });
    const distance = bot.entity.position.distanceTo(target.position);
    if (distance > (cfg.combatDisengageRadius || 20)) return disengageCombat(bot, memory, 'target got too far');
    if (threat.name === 'creeper' && distance <= 3.5) return fleeFromDanger(bot, memory, threat, { ...options, reason: 'creeper too close' });
    const hazard = combatMovement.avoidHazardsDuringCombat(bot);
    if (!hazard.ok) return fleeFromDanger(bot, memory, threat, { ...options, reason: hazard.reason });
    if (distance > 3.2) await combatMovement.moveToCombatRange(bot, target, { ...options, range: 2.6 });
    options.throwIfCancelled?.();
    bot.lookAt(target.position.offset(0, target.height || 1, 0), true).catch(() => null);
    bot.attack(target);
    hits += 1;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  memory.update?.({
    combatMode: options.keepMode ? memory.get().combatMode : 'off',
    activeThreat: null,
    activeThreatId: null,
    activeThreatType: null,
    lastCombatEndedAt: now(),
    lastCombatResult: `Engaged ${threat.name}`,
    combatKills: (memory.get().combatKills || 0) + (target?.isValid === false ? 1 : 0)
  });
  await combatMovement.returnAfterCombat(bot, memory, options).catch(() => null);
  return { ok: true, message: `Combat ended against ${threat.name}.`, hits };
}

export function disengageCombat(bot, memory, reason = 'disengaged') {
  return stopCombatMode(bot, memory, reason);
}

export async function fleeFromDanger(bot, memory, threat, options = {}) {
  const cfg = config(bot);
  const reason = options.reason || 'danger nearby';
  const actualThreat = threat?.entity || threat;
  const lastFleeAt = Number(memory.get?.().lastFleeAt || 0);
  const cooldownMs = Number(options.fleeCooldownMs || cfg.fleeCooldownMs || 12000);
  if (!options.force && now() - lastFleeAt < cooldownMs && memory.get?.().combatMode === 'flee') {
    return { ok: true, skipped: true, message: '' };
  }

  memory.update?.({ combatMode: 'flee', lastFleeAt: now(), lastCombatAbortReason: reason });
  if (threat) {
    rememberMeaningfulDanger(
      bot,
      memory,
      threat.entity ? threat : { name: threatAssessment.entityName(threat), position: point(threat.position) },
      options.reason || 'combat flee'
    );
  }

  if (actualThreat?.position) {
    const retreated = await combatMovement.retreatFromTarget(bot, actualThreat, cfg.combatRetreatDistance || 18, options);
    if (retreated.ok) {
      // Stay in flee only briefly; clear if we put distance on the threat.
      const threats = threatAssessment.scanThreats(bot, memory, cfg.hostileDetectionRadius || 24)
        .filter((item) => item.kind === 'hostile');
      if (!threats.length) stopCombatMode(bot, memory, 'safe after retreat');
      return { ...retreated, message: options.silent ? '' : `Fleeing: ${reason}.` };
    }
  }

  const owner = bot.players?.[cfg.ownerUsername]?.entity;
  if (owner) {
    try {
      await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, cfg.followDistance || 3));
    } catch (error) {
      if (isPathInterrupted(error)) return { ok: false, cancelled: true, message: options.silent ? '' : 'Fleeing was interrupted.' };
      throw error;
    }
    // Reached owner — leave flee mode so companion/collect can resume.
    const nearbyHostiles = threatAssessment.scanThreats(bot, memory, 10).filter((item) => item.kind === 'hostile');
    if (!nearbyHostiles.length || (bot.health || 20) > (cfg.criticalHealthToFlee || 8)) {
      stopCombatMode(bot, memory, 'reached owner');
    }
    return { ok: true, message: options.silent ? '' : `Fleeing to ${cfg.ownerUsername || 'owner'}: ${reason}.` };
  }
  return { ok: false, message: options.silent ? '' : `I need to flee, but I do not have a safe retreat target: ${reason}.` };
}

export function reportCombatResult(bot, memory) {
  const status = combatStatus(bot, memory);
  return {
    ok: true,
    status,
    message: `Combat: ${status.combatMode}, threats ${status.threatCount}, weapon ${status.gear.bestWeapon || 'none'}, armour ${status.gear.armorScore}, health ${status.health}/20, food ${status.food}/20.`
  };
}
