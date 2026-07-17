import { getSkill } from './skillRegistry.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

function now() {
  return Date.now();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function memState(memory) {
  if (!memory) return {};
  if (typeof memory.get === 'function') return memory.get() || {};
  return memory;
}

function configFrom(context = {}) {
  return context.config || {};
}

function hasDanger(state = {}) {
  return Boolean(
    state.dangerFlags?.hostileNearby ||
    state.dangerFlags?.lavaNearby ||
    state.dangerFlags?.fireNearby ||
    state.activeThreat ||
    state.primaryThreat
  );
}

function suggestionRecent(idleMemory, key, windowMs) {
  const cutoff = now() - Math.max(0, Number(windowMs || 0));
  return (idleMemory?.recentSuggestions || []).some((item) => item.key === key && Number(item.at || 0) >= cutoff);
}

function suggestionCount(idleMemory, key, windowMs) {
  const cutoff = now() - Math.max(0, Number(windowMs || 0));
  return (idleMemory?.recentSuggestions || []).filter((item) => item.key === key && Number(item.at || 0) >= cutoff).length;
}

function isSuppressed(idleMemory, key) {
  const record = idleMemory?.suppressedSuggestions?.[key];
  return Boolean(record && Number(record.until || 0) > now());
}

function behavior(type, fields = {}) {
  return {
    type,
    key: fields.key || type,
    priority: fields.priority ?? 0,
    riskLevel: fields.riskLevel || 'low',
    mutatesWorld: Boolean(fields.mutatesWorld),
    mutatesInventory: Boolean(fields.mutatesInventory),
    shouldSpeak: fields.shouldSpeak !== false,
    mode: fields.mode || 'suggest',
    ...fields
  };
}

export function getCandidateIdleBehaviors(bot, memory, context = {}) {
  const state = context.state || {};
  const mem = memState(memory);
  const config = { ...configFrom(context) };
  if (mem.idleAmbientCommentsEnabled === false) config.idleAutonomyAllowAmbientComments = false;
  if (mem.idleAmbientCommentsEnabled === true) config.idleAutonomyAllowAmbientComments = true;
  const candidates = [];

  if (hasDanger(state)) {
    candidates.push(behavior('safety_scan', {
      key: 'danger_nearby',
      priority: 100,
      mode: 'warn',
      reason: 'Danger appears to be nearby.',
      danger: 'nearby'
    }));
  }

  if (asNumber(state.health, 20) <= 8) {
    candidates.push(behavior('safety_scan', {
      key: 'low_health',
      priority: 95,
      mode: 'warn',
      reason: 'Health is low.',
      danger: 'low_health'
    }));
  }

  if (asNumber(state.food, 20) <= 8) {
    candidates.push(behavior('food_check', {
      key: 'low_food',
      priority: 90,
      reason: 'Food is low.',
      suggestedCommand: 'tj get food',
      danger: 'low_food'
    }));
  }

  const ownerDistance = Number(state.ownerDistance);
  if (Number.isFinite(ownerDistance) && ownerDistance > asNumber(config.idleAutonomyMaxOwnerDistance, 24)) {
    candidates.push(behavior('owner_distance_check', {
      key: 'owner_too_far',
      priority: 80,
      reason: 'Owner is farther away than the idle safety distance.',
      suggestedCommand: 'tj come here'
    }));
  }

  if (state.homeExists && state.nearHome) {
    candidates.push(behavior('base_check', {
      key: 'base_safety_check',
      priority: 50,
      reason: 'Near home and idle.',
      skillName: 'home_status',
      suggestedCommand: 'tj home status'
    }));
  }

  if (config.idleAutonomyAllowSafeChecks !== false) {
    candidates.push(behavior('status_check', {
      key: 'quiet_status_check',
      priority: 38,
      reason: 'A safe status skill can update readiness without world mutation.',
      skillName: 'status',
      runSkill: true,
      shouldSpeak: false
    }));
  }

  if (config.idleAutonomyAllowHelpfulSuggestions !== false) {
    candidates.push(behavior('progression_suggestion', {
      key: 'next_safe_milestone',
      priority: 42,
      reason: 'Progression suggestions are safe and non-mutating.',
      skillName: 'progression_status',
      suggestedCommand: 'tj next milestone'
    }));
    candidates.push(behavior('gear_suggestion', {
      key: 'gear_status_check',
      priority: 36,
      reason: 'Gear checks are useful before risk.',
      skillName: 'gear_status',
      suggestedCommand: 'tj gear status'
    }));
    candidates.push(behavior('curriculum_suggestion', {
      key: 'safe_readiness_practice',
      priority: 32,
      reason: 'Safe readiness checks can reveal blockers.',
      skillName: 'skills_status',
      suggestedCommand: 'tj suggest next skill'
    }));
  }

  if (mem.lastPlannerFailure?.reason || mem.lastMiningAbortReason || mem.lastCombatAbortReason) {
    const reason = mem.lastPlannerFailure?.reason || mem.lastMiningAbortReason || mem.lastCombatAbortReason;
    candidates.push(behavior('pending_followup', {
      key: `followup_${String(reason).slice(0, 30).replace(/[^\w]+/g, '_')}`,
      priority: 58,
      reason: 'A recent task had a blocker.',
      text: `Earlier I hit a blocker: ${String(reason).slice(0, 90)}.`
    }));
  }

  if (config.idleAutonomyAllowAmbientComments !== false) {
    candidates.push(behavior('memory_reflection', {
      key: state.homeExists ? 'home_memory_reflection' : 'safe_watch_reflection',
      priority: 12,
      reason: 'Idle ambient reflection.',
      shouldSpeak: true
    }));
    candidates.push(behavior('ambient_comment', {
      key: 'ambient_watch',
      priority: 8,
      reason: 'Lowest-priority idle comment.',
      shouldSpeak: true,
      allowDialogueFlavor: true
    }));
  }

  return candidates;
}

export function scoreIdleBehavior(candidate, context = {}) {
  const state = context.state || {};
  let score = Number(candidate?.priority || 0);
  if (candidate?.type === 'safety_scan' && hasDanger(state)) score += 25;
  if (candidate?.type === 'ambient_comment') score -= 5;
  if (candidate?.riskLevel !== 'low') score -= 100;
  if (candidate?.mutatesWorld || candidate?.mutatesInventory) score -= 100;
  return score;
}

export function filterUnsafeIdleBehaviors(candidates, context = {}) {
  const config = configFrom(context);
  const blocked = new Set(config.idleAutonomyBlockedActions || []);
  const allowedSkills = new Set(config.idleAutonomyAllowedSkills || []);
  return (candidates || []).filter((candidate) => {
    if (!candidate || candidate.riskLevel !== 'low') return false;
    if (candidate.mutatesWorld && config.idleAutonomyAllowWorldMutation !== true) return false;
    if (candidate.mutatesInventory && config.idleAutonomyAllowInventoryMutation !== true) return false;
    if (candidate.actionName && blocked.has(candidate.actionName)) return false;
    if (candidate.skillName) {
      const skill = getSkill(candidate.skillName);
      if (!skill || skill.implemented === false) return false;
      if (skill.riskLevel !== 'low' || skill.requiresConfirmation) return false;
      if (allowedSkills.size && !allowedSkills.has(candidate.skillName)) return false;
    }
    return true;
  });
}

export function filterRecentlyRepeatedBehaviors(candidates, idleMemory = {}, context = {}) {
  const config = configFrom(context);
  const repeatWindow = asNumber(config.idleAutonomyRepeatSuppressionMs, 900000);
  const samePerHour = asNumber(config.idleAutonomyMaxSameSuggestionPerHour, 1);
  const suggestionCooldown = asNumber(config.idleAutonomySuggestionCooldownMs, 180000);
  const ambientCooldown = asNumber(config.idleAutonomyChatCooldownMs, 120000);

  return (candidates || []).filter((candidate) => {
    if (!candidate?.key) return false;
    if (isSuppressed(idleMemory, candidate.key)) return false;
    if (candidate.type === 'safety_scan' && config.idleAutonomyDangerOverridesCooldown !== false) {
      const dangerCooldown = asNumber(config.idleAutonomyDangerWarningCooldownMs, asNumber(config.idleAutonomyChatCooldownMs, 120000));
      return now() - Number(idleMemory.lastSafetyWarningAt || 0) >= dangerCooldown;
    }
    if (candidate.type === 'ambient_comment' || candidate.type === 'memory_reflection') {
      return now() - Number(idleMemory.lastAmbientCommentAt || 0) >= ambientCooldown;
    }
    if (suggestionRecent(idleMemory, candidate.key, repeatWindow)) return false;
    if (suggestionCount(idleMemory, candidate.key, ONE_HOUR_MS) >= samePerHour) return false;
    return now() - Number(idleMemory.lastHelpfulSuggestionAt || 0) >= suggestionCooldown;
  });
}

export function chooseIdleBehavior(bot, memory, context = {}) {
  const idleMemory = context.idleMemory || {};
  const candidates = getCandidateIdleBehaviors(bot, memory, context);
  const safe = filterUnsafeIdleBehaviors(candidates, context);
  const varied = filterRecentlyRepeatedBehaviors(safe, idleMemory, context);
  const selected = [...varied].sort((a, b) => scoreIdleBehavior(b, context) - scoreIdleBehavior(a, context))[0];
  if (!selected) {
    return { ok: false, mode: 'ignore', reason: 'No safe non-repeated idle behavior is available.' };
  }
  return { ok: true, mode: selected.mode || 'suggest', behavior: selected, ...selected };
}

export function explainIdleDecision(decision) {
  if (!decision?.ok) return decision?.reason || 'No idle behavior selected.';
  return `${decision.type}: ${decision.reason || 'selected as safe idle behavior'}`;
}

export function shouldSpeakForIdleDecision(decision, context = {}) {
  if (!decision?.ok) return false;
  if (context.config?.interactionMode === 'quiet' && context.config?.idleAutonomyQuietModeSuppressesAmbient !== false) {
    return decision.type !== 'ambient_comment' && decision.type !== 'memory_reflection';
  }
  return decision.shouldSpeak !== false;
}
