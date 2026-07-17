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
  return { ...event, type: 'danger', speak: 'Careful. I see danger nearby.' };
}

export function onLowHealth(event) {
  return { ...event, type: 'low_health', speak: 'I am hurt. Backing off.' };
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
  if (event?.type === 'danger' && now - (mem.lastThreatWarningAt || 0) < (config.dangerWarningCooldownMs || 45000)) return false;
  // Hunger/status nags are frequent in companion play — keep them quiet.
  const hungerLike = event?.type === 'low_food' || /hungry|food/i.test(String(event?.speak || ''));
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
    ...(event?.type === 'danger' ? { lastThreatWarningAt: now } : {}),
    ...(hungerLike ? { lastHungerCommentAt: now } : {})
  });
  bot.chat(String(speak).slice(0, config.maxChatResponseLength || 280));
  return true;
}
