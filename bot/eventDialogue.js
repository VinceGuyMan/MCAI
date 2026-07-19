export function onTaskStarted(event) {
  return { ...event, type: 'task_started', speak: 'On it.' };
}

export function onTaskCompleted(event) {
  return { ...event, type: 'task_completed', speak: 'Done. That worked.' };
}

export function onTaskFailed(event) {
  return { ...event, type: 'task_failed', speak: `I could not finish that. Reason: ${event.reason || 'unknown'}.` };
}

export function onDangerDetected(event) {
  const summary = String(event?.summary || event?.threatSummary || '').trim();
  return {
    ...event,
    type: 'danger',
    speak: summary ? `Danger nearby: ${summary}.` : 'Careful. I see danger nearby.'
  };
}

export function onLowHealth(event) {
  const health = Number.isFinite(Number(event?.health)) ? Number(event.health) : null;
  const food = Number.isFinite(Number(event?.food)) ? Number(event.food) : null;
  const danger = String(event?.dangerSummary || '').trim();
  let recovery = 'I am backing off and checking what I need to recover.';
  if (food !== null && food >= 18) recovery = `Hunger is ${food}/20, so I am staying safe to regenerate.`;
  else if (event?.hasFood) recovery = `Hunger is ${food ?? '?'}/20; I am eating and backing off.`;
  else if (food !== null) recovery = `Hunger is ${food}/20 and I have no safe food; please bring food or help clear the area.`;
  const healthText = health === null ? 'My health is low.' : `My health is ${health}/20.`;
  const dangerText = danger ? ` Nearby: ${danger}.` : '';
  return { ...event, type: 'low_health', speak: `${healthText}${dangerText} ${recovery}` };
}

export function onLowFood(event) {
  return { ...event, type: 'low_food', speak: 'I am getting hungry. Looking for food.' };
}

export function onFoundResource(event) {
  return { ...event, type: 'found_resource', speak: `I see ${event.resource || 'a useful resource'} nearby.` };
}

export function onFoundStructure(event) {
  return { ...event, type: 'found_structure', speak: `I found a possible ${event.structure || 'structure'}.` };
}

export function onCombatStarted(event) {
  return { ...event, type: 'combat_started', speak: 'Hostile nearby. I am being careful.' };
}

export function onCombatEnded(event) {
  return { ...event, type: 'combat_ended', speak: 'Combat is over.' };
}

export function onDeath(event) {
  return { ...event, type: 'death', speak: 'I died. I saved the location.' };
}

export function onRespawn(event) {
  return { ...event, type: 'respawn', speak: 'I respawned. Last death location saved.' };
}

export function onGoalStarted(event) {
  return { ...event, type: 'goal_started', speak: `Starting goal: ${event.goalName || 'current goal'}.` };
}

export function onGoalCompleted(event) {
  return { ...event, type: 'goal_completed', speak: `Goal complete: ${event.goalName || 'current goal'}.` };
}

export function onGoalBlocked(event) {
  return { ...event, type: 'goal_blocked', speak: `I am blocked on that goal because ${event.reason || 'something is missing'}.` };
}

export function maybeSayEventComment(bot, memory, event) {
  const config = bot.mcaiConfig || {};
  if (!config.allowTaskCommentary && !config.allowAmbientComments) return false;
  const now = Date.now();
  const mem = memory.get();
  const urgent = ['danger', 'low_health', 'death', 'respawn'].includes(event?.type);
  if (event?.type === 'danger') {
    const cooldown = Number(config.dangerWarningCooldownMs || 60000);
    const signature = String(event?.signature || event?.summary || event?.threatSummary || event?.speak || 'danger');
    const sameDanger = signature === String(mem.lastThreatWarningSignature || '');
    const minChangedDangerDelay = Number(config.changedDangerWarningMinDelayMs || 15000);
    const elapsed = now - Number(mem.lastThreatWarningAt || 0);
    if ((sameDanger && elapsed < cooldown) || (!sameDanger && elapsed < minChangedDangerDelay)) return false;
  }
  if (event?.type === 'low_health') {
    const cooldown = Number(config.lowHealthWarningCooldownMs || 60000);
    const health = Number.isFinite(Number(event?.health)) ? Number(event.health) : 20;
    const previousHealth = Number.isFinite(Number(mem.lastLowHealthWarningHealth)) ? Number(mem.lastLowHealthWarningHealth) : 20;
    const elapsed = now - Number(mem.lastLowHealthWarningAt || 0);
    const criticalEscalation = health <= 4 && previousHealth > 4;
    const sharpDrop = previousHealth - health >= 4;
    if (elapsed < cooldown && !criticalEscalation && !sharpDrop) return false;
  }
  // Hunger/status nags are frequent in companion play — keep them quiet.
  const hungerLike = event?.type === 'low_food'
    || (event?.type !== 'low_health' && /hungry|food/i.test(String(event?.speak || '')));
  const hungerCooldown = Number(config.companionHungerCommentCooldownMs || config.ambientCommentCooldownMs || 90000);
  if (hungerLike && now - (mem.lastHungerCommentAt || 0) < hungerCooldown) return false;
  const eventCooldown = hungerLike
    ? hungerCooldown
    : (config.eventCommentCooldownMs || 10000);
  if (!urgent && now - (mem.lastEventCommentAt || 0) < eventCooldown) return false;
  const speak = event?.speak;
  if (!speak) return false;
  memory.update({
    lastEventCommentAt: now,
    ...(['danger', 'low_health'].includes(event?.type) ? { lastSafetyWarningAt: now } : {}),
    ...(event?.type === 'danger' ? {
      lastThreatWarningAt: now,
      lastThreatWarningSignature: String(event?.signature || event?.summary || event?.threatSummary || event?.speak || 'danger')
    } : {}),
    ...(event?.type === 'low_health' ? {
      lastLowHealthWarningAt: now,
      lastLowHealthWarningHealth: Number.isFinite(Number(event?.health)) ? Number(event.health) : null
    } : {}),
    ...(hungerLike ? { lastHungerCommentAt: now } : {})
  });
  bot.chat(String(speak).slice(0, config.maxChatResponseLength || 280));
  return true;
}
