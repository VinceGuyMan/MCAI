/**
 * Combat / defense handlers.
 */
export function createCombatHandlers(ctx) {
  const {
    bot, config, memory, say,
    setupMovements, throwIfCancelled, stop, perception, safety, resourceOptions,
    combat, combatEquipment, threatAssessment, baseDefense, ownerDefense,
    eatIfHungry, collectNearbyDrops
  } = ctx;

  async function combatStatusAction() {
    const status = combat.combatStatus(bot, memory);
    const threatText = threatAssessment.summarizeThreats(status.threats);
    say(`Combat: ${status.combatMode}, threats ${status.threatCount}, weapon ${status.gear.bestWeapon || 'none'}, shield ${status.gear.hasShield ? 'yes' : 'no'}, armour ${status.gear.armorScore}, health ${status.health}/20, food ${status.food}/20. ${threatText}`, true);
    return status;
  }

  async function combatEquipmentStatusAction() {
    const gear = combatEquipment.combatEquipmentStatus(bot);
    say(`Combat gear: weapon ${gear.bestWeapon || 'none'}, ranged ${gear.bestRangedWeapon || 'none'}, arrows ${gear.hasArrows ? 'yes' : 'no'}, shield ${gear.hasShield ? 'yes' : 'no'}, armour ${gear.armorScore}.`, true);
    return gear;
  }

  async function threatScanAction() {
    const threats = threatAssessment.scanThreats(bot, memory, config.hostileDetectionRadius || 24);
    const world = perception();
    const details = [threatAssessment.summarizeThreats(threats)];
    if (world?.dangerFlags?.lavaNearby) details.push('lava is nearby');
    if (world?.dangerFlags?.fireNearby) details.push('fire is nearby');
    if (Number(world?.health) <= Number(config.lowHealthRecoveryThreshold || 8)) {
      details.push(`my health is ${world.health}/20`);
    }
    memory.update({ lastThreatScanAt: Date.now() });
    say(`Threat scan: ${details.join('; ')}.`, true);
    return threats;
  }

  async function equipCombatGearAction() {
    throwIfCancelled();
    const result = await combatEquipment.prepareForCombat(bot, { emergency: false });
    say(result.message, true);
    return result;
  }

  async function startSelfDefenseAction(enabled = true) {
    const result = enabled
      ? combat.startCombatMode(bot, memory, { mode: 'self_defense' })
      : combat.stopCombatMode(bot, memory, 'self defense off');
    say(enabled ? 'Self-defense on.' : 'Self-defense off.', true);
    return result;
  }

  async function defendOwnerAction(enabled = true) {
    const result = enabled
      ? combat.startCombatMode(bot, memory, { mode: 'defend_owner' })
      : combat.stopCombatMode(bot, memory, 'owner defense off');
    say(enabled ? 'Protecting ModVinny.' : 'Stopped protecting ModVinny.', true);
    return result;
  }

  async function guardBaseAction(enabled = true) {
    if (enabled && !memory.get().homeBasePosition) {
      say('Set home first before I guard the base.', true);
      return { ok: false, message: 'no home' };
    }
    const result = enabled
      ? combat.startCombatMode(bot, memory, { mode: 'guard_base', position: memory.get().homeBasePosition })
      : combat.stopCombatMode(bot, memory, 'base guard off');
    say(enabled ? 'Guarding base.' : 'Stopped guarding base.', true);
    return result;
  }

  async function guardPositionAction(position = bot.entity?.position) {
    const result = await combat.guardPosition(bot, memory, position, resourceOptions());
    say(result.message, true);
    return result;
  }

  async function stopCombatAction() {
    combat.stopCombatMode(bot, memory, 'stopped by owner');
    return stop();
  }

  async function fleeThreatAction(threat = null, options = {}) {
    throwIfCancelled();
    setupMovements();
    const threats = threatAssessment.scanThreats(bot, memory, config.hostileDetectionRadius || 24);
    const hostiles = threats.filter((item) => item.kind === 'hostile');
    const target = threat
      || threatAssessment.choosePrimaryThreat(bot, hostiles)
      || hostiles[0]?.entity
      || null;
    const ownerCommand = options.ownerCommand === true || options.reason === 'owner requested retreat';
    // Automatic brain flee requires an actual hostile (or explicit owner command).
    if (!ownerCommand && !target && (bot.health || 20) > (config.criticalHealthToFlee || 8)) {
      combat.stopCombatMode(bot, memory, 'no threat to flee');
      return { ok: true, skipped: true, message: '' };
    }
    const result = await combat.fleeFromDanger(bot, memory, target, resourceOptions({
      reason: options.reason || (ownerCommand ? 'owner requested retreat' : 'danger nearby'),
      silent: options.silent === true,
      force: ownerCommand === true
    }));
    if (result?.message && options.silent !== true) say(result.message, true);
    return result;
  }

  async function engageHostileAction(targetName = 'hostile', options = {}) {
    throwIfCancelled();
    setupMovements();
    const normalized = String(targetName || 'hostile').toLowerCase().replace(/^the\s+|^nearest\s+/, '').trim();
    const threats = threatAssessment.scanThreats(bot, memory, config.hostileDetectionRadius || 24);
    let target = null;
    if (normalized === 'hostile' || normalized === 'mob' || normalized === 'that mob') {
      target = threatAssessment.choosePrimaryThreat(bot, threats);
    } else {
      target = threats
        .filter((threat) => threat.name === normalized || threat.name.includes(normalized))
        .filter((threat) => threat.kind === 'hostile' && !threat.protected)
        .sort((a, b) => b.score - a.score || a.distance - b.distance)[0] || null;
    }
    if (!target) {
      say(`I do not see a safe hostile target named ${normalized}.`, true);
      return { ok: false, message: 'no safe target' };
    }
    const safe = safety.safeCombatTarget?.(target.entity, perception(), { direct: true, confirmed: options.confirmed }) || { ok: true };
    if (!safe.ok) {
      say(safe.reason || safe.message, true);
      return safe;
    }
    const result = await combat.engageTarget(bot, memory, target.entity, resourceOptions({ mode: 'manual_attack', emergency: Boolean(options.emergency) }));
    say(result.message, true);
    return result;
  }

  async function combatRecoverAction() {
    await eatIfHungry().catch(() => null);
    await collectNearbyDrops().catch(() => null);
    const result = combat.disengageCombat(bot, memory, 'recovered');
    say('Combat recovery complete.', true);
    return result;
  }

  async function baseDefenseStatusAction() {
    const status = baseDefense.baseDefenseStatus(bot, memory);
    say(status.message, true);
    return status;
  }

  async function ownerDefenseStatusAction() {
    const status = ownerDefense.ownerDefenseStatus(bot, memory);
    say(status.message, true);
    return status;
  }

  async function combatTickAction(options = {}) {
    const result = await combat.combatTick(bot, memory, resourceOptions(options));
    if (!options.silent && result?.message) say(result.message, true);
    return result;
  }


  return {
    combatStatusAction,
    combatEquipmentStatusAction,
    threatScanAction,
    equipCombatGearAction,
    startSelfDefenseAction,
    defendOwnerAction,
    guardBaseAction,
    guardPositionAction,
    stopCombatAction,
    fleeThreatAction,
    engageHostileAction,
    combatRecoverAction,
    baseDefenseStatusAction,
    ownerDefenseStatusAction,
    combatTickAction
  };
}
