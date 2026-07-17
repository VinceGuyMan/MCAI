/**
 * Companion play mode — presence, soft follow, task narration, stuck recovery, grounded ambient talk.
 * Keeps thin-core reliability; does not enable parked Tier-2 systems.
 */

import pathfinderPkg from 'mineflayer-pathfinder';
import { applyDryPathMovements } from './pluginWrappers.js';

const { goals } = pathfinderPkg;
const { GoalFollow, GoalNear } = goals || {};

export const PLAY_MODE_NAMES = ['companion', 'helper', 'careful', 'quiet', 'explain', 'test'];

const MODE_PATCHES = {
  companion: {
    interactionMode: 'companion',
    playMode: 'companion',
    companionSoftFollow: true,
    companionTaskNarration: true,
    companionStuckRecovery: true,
    companionAmbientGrounded: true,
    companionLookAtOwner: true,
    askBeforeMediumRisk: true,
    autoRunLowRiskNaturalCommands: true,
    chatVerbosity: 'normal',
    allowAmbientComments: true,
    allowTaskCommentary: true,
    lifelikeDialogueEnabled: true
  },
  helper: {
    interactionMode: 'helper',
    playMode: 'helper',
    companionSoftFollow: false,
    companionTaskNarration: true,
    companionStuckRecovery: true,
    companionAmbientGrounded: true,
    companionLookAtOwner: false,
    askBeforeMediumRisk: true,
    autoRunLowRiskNaturalCommands: true,
    chatVerbosity: 'normal'
  },
  careful: {
    interactionMode: 'careful',
    playMode: 'careful',
    companionSoftFollow: false,
    companionTaskNarration: true,
    companionStuckRecovery: true,
    askBeforeMediumRisk: true,
    autoRunLowRiskNaturalCommands: false,
    chatVerbosity: 'normal'
  },
  quiet: {
    interactionMode: 'quiet',
    playMode: 'quiet',
    companionSoftFollow: true,
    companionTaskNarration: false,
    companionStuckRecovery: true,
    companionAmbientGrounded: false,
    allowAmbientComments: false,
    askBeforeMediumRisk: true,
    autoRunLowRiskNaturalCommands: true,
    chatVerbosity: 'quiet'
  },
  explain: {
    interactionMode: 'explain',
    playMode: 'explain',
    companionSoftFollow: false,
    companionTaskNarration: true,
    companionStuckRecovery: true,
    askBeforeMediumRisk: true,
    autoRunLowRiskNaturalCommands: true,
    explainFailures: true,
    chatVerbosity: 'explain'
  },
  test: {
    interactionMode: 'test',
    playMode: 'test',
    companionSoftFollow: false,
    companionTaskNarration: true,
    companionStuckRecovery: true,
    askBeforeMediumRisk: true,
    autoRunLowRiskNaturalCommands: false,
    explainFailures: true,
    sessionRecorderEnabled: true,
    chatVerbosity: 'explain'
  }
};

function now() {
  return Date.now();
}

function memGet(memory) {
  return typeof memory?.get === 'function' ? (memory.get() || {}) : (memory || {});
}

function memUpdate(memory, patch) {
  if (typeof memory?.update === 'function') return memory.update(patch);
  if (memory && typeof memory === 'object') Object.assign(memory, patch);
  return memory;
}

export function getPlayModePatch(mode = 'companion') {
  const key = String(mode || 'companion').toLowerCase().replace(/\s+/g, '_');
  return MODE_PATCHES[key] ? { ...MODE_PATCHES[key] } : null;
}

export function listPlayModes() {
  return [...PLAY_MODE_NAMES];
}

export function getPlayMode(config = {}, memory = null) {
  const mem = memGet(memory);
  const mode = String(mem.interactionMode || mem.playMode || config.interactionMode || config.playMode || 'companion')
    .toLowerCase()
    .replace(/\s+/g, '_');
  return PLAY_MODE_NAMES.includes(mode) ? mode : 'companion';
}

export function isCompanionMode(config = {}, memory = null) {
  return getPlayMode(config, memory) === 'companion';
}

function featureOn(name, config, memory) {
  const mem = memGet(memory);
  if (mem[name] !== undefined) return Boolean(mem[name]);
  if (config[name] !== undefined) return Boolean(config[name]);
  const mode = getPlayMode(config, memory);
  if (MODE_PATCHES[mode] && MODE_PATCHES[mode][name] !== undefined) return Boolean(MODE_PATCHES[mode][name]);
  return mode === 'companion' && [
    'companionSoftFollow',
    'companionTaskNarration',
    'companionStuckRecovery',
    'companionAmbientGrounded',
    'companionLookAtOwner'
  ].includes(name);
}

export function companionFeatureEnabled(name, config = {}, memory = null) {
  return featureOn(name, config, memory);
}

export function describePlayMode(mode = 'companion') {
  const descriptions = {
    companion: 'Stay near you, auto micro-survival, narrate tasks, soft follow, grounded chat. Thin-core still on.',
    helper: 'Respond to commands; less clinging; still narrates and recovers from stuck paths.',
    careful: 'Ask before medium-risk natural commands; no soft follow.',
    quiet: 'Soft follow but almost no chat.',
    explain: 'Talk more about what I map and why.',
    test: 'Session recording on; careful natural commands.'
  };
  return descriptions[mode] || descriptions.companion;
}

export function shouldNarrateTasks(config = {}, memory = null) {
  const mem = memGet(memory);
  if (mem.chatVerbosity === 'quiet' || config.chatVerbosity === 'quiet') return false;
  if (config.allowTaskCommentary === false && mem.allowTaskCommentary === false) return false;
  return featureOn('companionTaskNarration', config, memory) || config.allowTaskCommentary !== false;
}

export function narrate(bot, memory, text, options = {}) {
  const config = bot?.mcaiConfig || options.config || {};
  if (!text || !bot?.chat) return false;
  if (!shouldNarrateTasks(config, memory) && !options.force) return false;
  const mem = memGet(memory);
  const cooldown = Number(options.cooldownMs ?? config.companionNarrationCooldownMs ?? 8000);
  if (!options.force && now() - Number(mem.lastCompanionNarrationAt || 0) < cooldown) return false;
  const max = config.maxChatResponseLength || 280;
  const line = String(text).replace(/\s+/g, ' ').trim().slice(0, max);
  if (!line) return false;
  memUpdate(memory, {
    lastCompanionNarrationAt: now(),
    lastDialogueAt: now(),
    lastDialogueTopic: options.topic || 'task_narration'
  });
  bot.chat(line);
  return true;
}

export function startTaskNarration(bot, memory, actionName, args = {}) {
  const config = bot?.mcaiConfig || {};
  if (!shouldNarrateTasks(config, memory)) return;
  // Suppress per-step spam during progress_to_iron / core macros.
  if (args.quiet || args.quietMacro || memory?.get?.().activeCoreMacro) return;
  const resource = args.resource || args.item || '';
  const count = args.count || args.targetCount;
  const lines = {
    come_to_owner: 'Coming to you.',
    follow_owner: 'Sticking with you.',
    stay: 'Holding here.',
    collect_resource: count ? `On it — collecting ${count} ${resource}.` : `On it — collecting ${resource || 'resources'}.`,
    return_home: 'Heading home.',
    remember_home: 'Marking this as home.',
    eat_if_hungry: 'Checking food.',
    store_items: 'Putting extras away.',
    craft_item: args.item ? `Crafting ${args.item}.` : 'Crafting.'
  };
  narrate(bot, memory, lines[actionName] || `Starting ${String(actionName || 'task').replace(/_/g, ' ')}.`, {
    topic: 'task_start',
    cooldownMs: 4000
  });
}

export function progressTaskNarration(bot, memory, { resource, collected, target }) {
  if (!resource || !target || collected <= 0 || collected >= target) return false;
  // Announce at ~50% and when we have something useful.
  const half = Math.max(1, Math.floor(target / 2));
  if (collected !== half && collected < target - 1 && collected % Math.max(4, half) !== 0) return false;
  return narrate(bot, memory, `Got ${collected}/${target} ${resource} so far.`, {
    topic: 'task_progress',
    cooldownMs: 12000
  });
}

export function finishTaskNarration(bot, memory, actionName, result = {}) {
  const config = bot?.mcaiConfig || {};
  if (!shouldNarrateTasks(config, memory)) return;
  if (result?.data?.softSuccess) return; // come-here already messaged
  if (result?.ok) {
    // thin-core already says success message via say(); avoid double-chat for collect.
    if (actionName === 'collect_resource' || actionName === 'come_to_owner' || actionName === 'status') return;
    return;
  }
  if (result?.reason === 'timeout' || /timeout/i.test(String(result?.message || ''))) {
    narrate(bot, memory, result.message || 'Pathing timed out. Say come here again if you want me closer.', {
      topic: 'task_fail',
      force: true,
      cooldownMs: 0
    });
  }
}

function ownerEntity(bot, config = {}) {
  const name = config.ownerUsername || bot?.mcaiConfig?.ownerUsername || 'ModVinny';
  return bot?.players?.[name]?.entity || null;
}

function ownerDistance(bot, config = {}) {
  const owner = ownerEntity(bot, config);
  if (!owner || !bot?.entity?.position) return null;
  return bot.entity.position.distanceTo(owner.position);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tryStuckRecovery(bot, options = {}) {
  if (!bot?.entity) return { ok: false, reason: 'not spawned' };
  try {
    bot.clearControlStates?.();
  } catch {
    // best effort
  }
  try {
    bot.pathfinder?.setGoal?.(null);
  } catch {
    try {
      bot.pathfinder?.stop?.();
    } catch {
      // best effort
    }
  }
  try {
    bot.setControlState?.('jump', true);
    await sleep(options.jumpMs || 400);
    bot.setControlState?.('jump', false);
    bot.setControlState?.('back', true);
    await sleep(options.backMs || 550);
    bot.setControlState?.('back', false);
    bot.setControlState?.('jump', true);
    await sleep(options.jumpMs || 300);
    bot.setControlState?.('jump', false);
    bot.clearControlStates?.();
    return { ok: true, message: 'unstuck wiggle done' };
  } catch (error) {
    try {
      bot.clearControlStates?.();
    } catch {
      // ignore
    }
    return { ok: false, reason: error.message || String(error) };
  }
}

export function buildGroundedAmbientLine(state = {}, config = {}, memory = null) {
  const mem = memGet(memory);
  const ownerDist = state.ownerDistance;
  const lines = [];

  if (state.dangerFlags?.hostileNearby || (typeof state.primaryThreatDistance === 'number' && state.primaryThreatDistance <= 10)) {
    lines.push('Something hostile is nearby — I am staying alert.');
  }
  if (state.dangerFlags?.nightTime || (typeof state.timeOfDay === 'number' && state.timeOfDay >= 12500 && state.timeOfDay <= 23000)) {
    lines.push('Night is settling in. I prefer light and sticking close.');
  }
  if (typeof state.food === 'number' && state.food <= 12) {
    lines.push('I am getting a bit hungry. Food would be smart soon.');
  }
  if (typeof state.health === 'number' && state.health <= 12) {
    lines.push('I am a little beat up. Taking it careful.');
  }
  if (typeof ownerDist === 'number' && ownerDist > 12) {
    lines.push('You wandered a bit — I will try to keep up.');
  }
  if (state.homeExists && state.nearHome) {
    lines.push('Base feels quiet. I like quiet.');
  }
  if (typeof state.logCount === 'number' && state.logCount < 4 && !state.dangerFlags?.hostileNearby) {
    lines.push('We are low on wood if we need builds or sticks later.');
  }
  if (mem.lastAction && /collect|coal|iron|wood|stone/i.test(String(mem.lastAction))) {
    lines.push('Ready for the next job whenever you are.');
  }

  if (!lines.length) {
    lines.push(
      'Still here with you.',
      'Watching the area.',
      'Say the word if you need wood, coal, iron, or a camp.'
    );
  }

  // Stable-ish pick without pure random for tests: rotate by minute.
  const idx = Math.floor(now() / 60000) % lines.length;
  return lines[idx];
}

function taskBusy(mem = {}) {
  return Boolean(
    mem.thinCoreTaskActive ||
    mem.activeThinCoreAction ||
    mem.activeCoreMacro ||
    mem.currentTask ||
    mem.activeResourceRun ||
    mem.foodTaskActive ||
    mem.farmTaskActive ||
    mem.animalTaskActive ||
    mem.activeMiningExpedition ||
    mem.activeExploration ||
    // Explicit follow command holds path; soft-follow does not block soft-follow itself.
    (mem.followOwnerActive && mem.movementMode === 'follow_owner')
  );
}

/**
 * Soft companion presence tick. Safe to call from brain; no Tier-2 systems.
 */
export async function companionTick(bot, memory, context = {}) {
  const config = { ...(bot?.mcaiConfig || {}), ...(context.config || {}) };
  const state = context.state || {};
  const mem = memGet(memory);
  const mode = getPlayMode(config, memory);

  if (mode !== 'companion' && mode !== 'quiet') {
    return { ok: true, ran: false, reason: 'not companion mode' };
  }
  if (taskBusy(mem) || String(mem.movementMode || '').startsWith('thin_')) {
    return { ok: true, ran: false, reason: 'busy' };
  }
  if (context.cancellation?.isCancelled?.()) {
    return { ok: true, ran: false, reason: 'cancelled' };
  }

  const owner = ownerEntity(bot, config);
  const distance = ownerDistance(bot, config);
  const softFollow = featureOn('companionSoftFollow', config, memory);
  const lookAt = featureOn('companionLookAtOwner', config, memory);
  const stuckRecovery = featureOn('companionStuckRecovery', config, memory);
  const softDist = Number(config.companionSoftFollowDistance || 5);
  const maxDist = Number(config.companionSoftFollowMaxDistance || config.maxAutonomyDistanceFromOwner || 20);
  const tickCooldown = Number(config.companionSoftFollowCooldownMs || 4000);

  // Stuck while soft-following.
  if (
    stuckRecovery &&
    mem.movementMode === 'companion_soft_follow' &&
    (mem.stuckCounter || 0) >= 3 &&
    now() - Number(mem.lastUnstuckAt || 0) > 12000
  ) {
    const recovery = await tryStuckRecovery(bot);
    memUpdate(memory, { lastUnstuckAt: now(), stuckCounter: 0 });
    if (recovery.ok) {
      narrate(bot, memory, 'I was snagged. Wiggled free.', { topic: 'stuck', cooldownMs: 15000 });
    }
    return { ok: true, ran: true, reason: 'stuck_recovery', data: recovery };
  }

  if (!owner) {
    if (now() - Number(mem.lastCompanionOwnerMissingAt || 0) > 90000 && shouldNarrateTasks(config, memory)) {
      memUpdate(memory, { lastCompanionOwnerMissingAt: now() });
      narrate(bot, memory, 'I cannot see you right now. Come closer or call me.', {
        topic: 'owner_missing',
        cooldownMs: 90000
      });
    }
    return { ok: true, ran: false, reason: 'owner_not_visible' };
  }

  if (lookAt && bot.entity && now() - Number(mem.lastCompanionLookAt || 0) > 8000) {
    try {
      await bot.lookAt(owner.position.offset(0, 1.6, 0), true);
      memUpdate(memory, { lastCompanionLookAt: now() });
    } catch {
      // look is best-effort
    }
  }

  if (softFollow && typeof distance === 'number' && distance > softDist + 1.5) {
    if (now() - Number(mem.lastCompanionSoftFollowAt || 0) < tickCooldown) {
      return { ok: true, ran: false, reason: 'soft_follow_cooldown' };
    }
    if (!bot.pathfinder || !GoalFollow) {
      return { ok: false, ran: false, reason: 'pathfinder unavailable' };
    }

    // Too far: one-shot near goal is more reliable than permanent follow for brain coexistence.
    try {
      memUpdate(memory, {
        lastCompanionSoftFollowAt: now(),
        movementMode: 'companion_soft_follow',
        lastAction: 'companion soft follow',
        lastActionAt: now()
      });
      // Prefer land paths while soft-following (avoid swimming after the owner through water).
      applyDryPathMovements(bot);
      if (distance > maxDist && GoalNear) {
        await bot.pathfinder.goto(new GoalNear(owner.position.x, owner.position.y, owner.position.z, softDist));
      } else {
        bot.pathfinder.setGoal(new GoalFollow(owner, softDist), true);
      }
      return { ok: true, ran: true, reason: 'soft_follow', data: { distance } };
    } catch (error) {
      if (stuckRecovery) await tryStuckRecovery(bot);
      memUpdate(memory, { movementMode: null, lastUnstuckAt: now() });
      return { ok: false, ran: true, reason: error.message || 'soft follow failed' };
    }
  }

  // Close enough — clear sticky soft-follow mode so ambient can run.
  if (mem.movementMode === 'companion_soft_follow' && typeof distance === 'number' && distance <= softDist + 1) {
    memUpdate(memory, { movementMode: null });
  }

  return { ok: true, ran: false, reason: 'present' };
}

export function maybeCompanionAmbient(bot, memory, state = {}, mapMemory = null) {
  const config = bot?.mcaiConfig || {};
  if (!featureOn('companionAmbientGrounded', config, memory)) return null;
  if (getPlayMode(config, memory) === 'quiet') return null;
  if (!config.lifelikeDialogueEnabled || config.allowAmbientComments === false) return null;
  const mem = memGet(memory);
  if (taskBusy(mem)) return null;
  if (mem.ambientDialogueEnabled === false || mem.banterEnabled === false) return null;
  // Companion mode uses a longer default cooldown so hunger/status lines do not flood chat.
  const cooldown = Number(
    config.companionAmbientCooldownMs
    || (getPlayMode(config, memory) === 'companion' ? 150000 : null)
    || config.ambientCommentCooldownMs
    || 120000
  );
  if (now() - Number(mem.lastAmbientCommentAt || 0) < cooldown) return null;
  if (now() - Number(mem.lastOwnerActivityAt || 0) < Number(config.ambientAfterOwnerActivityCooldownMs || 45000)) return null;
  if (now() - Number(mem.lastHungerCommentAt || 0) < Number(config.companionHungerCommentCooldownMs || 90000)
    && typeof state.food === 'number' && state.food <= 12) {
    // Skip another hunger ambient if we just nagged about food.
    return null;
  }

  const line = buildGroundedAmbientLine(state, config, memory);
  if (!line) return null;
  const hungerLine = /hungry|food/i.test(line);
  memUpdate(memory, {
    lastAmbientCommentAt: now(),
    lastDialogueAt: now(),
    lastDialogueTopic: 'companion_ambient',
    ...(hungerLine ? { lastHungerCommentAt: now() } : {})
  });
  bot.chat(String(line).slice(0, config.maxChatResponseLength || 280));
  return line;
}

export function applyPlayModeToMemory(memory, mode = 'companion') {
  const patch = getPlayModePatch(mode);
  if (!patch) return { ok: false, reason: `Unknown mode. Try: ${PLAY_MODE_NAMES.join(', ')}.` };
  memUpdate(memory, patch);
  return { ok: true, mode: patch.interactionMode, patch };
}
