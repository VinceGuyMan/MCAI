import { detectBotAddressed, parseChatMessage } from './commandParser.js';
import { findCommandAlias } from './commandRegistry.js';
import { handleDialogue, createClarification as createDialogueClarification } from './dialogue.js';
import { rememberNaturalCommandFailure, rememberNaturalCommandSuccess, routeNaturalCommand } from './naturalCommandRouter.js';
import { handleNonOwnerCommand, canRespondToPlayer } from './socialRules.js';
import { createRecoveryQuestion, rememberFailurePattern, suggestRecoveryOptions } from './selfCorrection.js';
import { recordSessionEvent } from './sessionRecorder.js';
import { resetIdleTimer } from './idleAutonomy.js';
import { normalizeFoodName } from './food.js';

const prefixes = ['tj ', '@tj ', '!tj ', '!ai '];

function isQuestionForBot(message) {
  const lower = message.toLowerCase();
  return lower.includes('tj') && /[?]|what|where|why|how|are you|can you|do you/.test(lower);
}

function addressed(message) {
  const lower = message.toLowerCase();
  return prefixes.some((prefix) => lower.startsWith(prefix)) || isQuestionForBot(message);
}

function stripAddress(message) {
  let text = message.trim();
  text = text.replace(/^@?tj[:,]?\s*/i, '');
  text = text.replace(/^!tj[:,]?\s*/i, '');
  text = text.replace(/^!ai[:,]?\s*/i, '');
  return text.trim();
}

export function setupChat(bot, config, deps) {
  const { actions, planner, perception, memory } = deps;

  function parseCraftRequest(command) {
    const raw = command.replace(/^craft\s+/, '').trim();
    const match = raw.match(/^(\d+)\s+(.+)$/);
    if (match) return { count: Number(match[1]), itemName: match[2].trim() };
    return { count: 1, itemName: raw };
  }

  function cleanItemName(rawName) {
    return String(rawName || '')
      .toLowerCase()
      .replace(/[?!.,;:]/g, ' ')
      // Possessives / fillers from natural speech: "all your coal", "my dirt"
      .replace(/\b(your|my|our|his|her|their|the|some|of|please)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+/g, '_');
  }

  function parseItemCount(command, prefix) {
    const raw = command.replace(prefix, '').trim();
    const allMatch = raw.match(/^(?:all(?:\s+of)?\s+)?(?:your\s+|my\s+|the\s+)?(.+)$/i);
    if (/^all\b/i.test(raw) && allMatch) {
      const namePart = raw.replace(/^all(?:\s+of)?\s+/i, '').trim();
      return { itemName: cleanItemName(namePart), count: 'all' };
    }
    const parts = raw.split(/\s+/).filter(Boolean);
    const last = Number(parts.at(-1));
    if (Number.isFinite(last) && last > 0) {
      return { itemName: cleanItemName(parts.slice(0, -1).join(' ')), count: last };
    }
    const first = Number(parts[0]);
    if (Number.isFinite(first) && first > 0) {
      return { itemName: cleanItemName(parts.slice(1).join(' ')), count: first };
    }
    return { itemName: cleanItemName(parts.join(' ')), count: 1 };
  }

  function isPraiseOrThanksCommand(command) {
    return /^(good job|nice job|well done|great job|thanks|thank you|thx|ty|nice|good work)$/.test(command);
  }

  function isMiningPrepCommand(command) {
    return /^(ready to mine|get ready to mine|get ready for mining|lets get ready for mining|let's get ready for mining|prepare for mining|mining prep)$/.test(command);
  }

  function handleBareApproval() {
    if (memory.get().pendingGoalConfirmation) return actions.approveGoal();
    if (memory.get().pendingNaturalCommandIntent) return actions.answerChat('I have a pending natural command. Say yes to run it, or no to cancel it.');
    return actions.answerChat('I do not have anything waiting for approval right now.');
  }

  function normalizeResourceTarget(raw) {
    const cleaned = String(raw || '')
      .toLowerCase()
      .replace(/[?!.,;:]/g, ' ')
      .replace(/\b(?:please|us|me|some|more|the|a|an|of|about|around|exactly|at\s+least)\b/g, ' ')
      .replace(/\b(?:blocks?|pieces?|items?|ores?)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return null;

    const parts = cleaned.split(/\s+/);
    const last = parts.at(-1);
    if (['wood', 'log', 'logs', 'tree', 'trees'].includes(cleaned) || last === 'log' || last === 'logs') return 'wood';
    if (['stone', 'cobble', 'cobblestone', 'cobbled deepslate', 'deepslate'].includes(cleaned)) return 'stone';
    if (['coal', 'coal ore'].includes(cleaned)) return 'coal';
    // charcoal is a smelt product, not a mine target
    if (['iron', 'raw iron', 'iron ore'].includes(cleaned)) return 'iron';
    // Iron-down building / surface blocks TJ knows how to dig and collect.
    if (['dirt', 'grass', 'grass block', 'soil', 'mud', 'coarse dirt'].includes(cleaned)) return 'dirt';
    if (['sand', 'red sand', 'redsand'].includes(cleaned)) return 'sand';
    if (cleaned === 'gravel') return 'gravel';
    if (['clay', 'clay ball'].includes(cleaned)) return 'clay';
    // Any known food item (bread, steak, apples, meat, …) → food run.
    if (normalizeFoodName(cleaned)) return 'food';
    return null;
  }

  function preferredFoodFromRequest(raw) {
    const name = normalizeFoodName(raw);
    if (!name || name === 'food') return null;
    return name;
  }

  function parseResourceAmountCommand(command) {
    const match = command.match(/^(get|gather|collect|find|mine|dig)\s+(.+)$/);
    if (!match) return null;
    const verb = match[1];
    let rest = match[2]
      .replace(/\b(?:for\s+us|for\s+me)\b/g, ' ')
      .replace(/^(?:us|me)\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    let count = null;
    let countMatch = rest.match(/^(\d{1,3})\s+(?:of\s+)?(.+)$/);
    if (countMatch) {
      count = Number(countMatch[1]);
      rest = countMatch[2].trim();
    } else {
      countMatch = rest.match(/^(.+?)\s+(\d{1,3})$/);
      if (countMatch) {
        count = Number(countMatch[2]);
        rest = countMatch[1].trim();
      }
    }

    const resource = normalizeResourceTarget(rest);
    if (!resource) return null;
    if (!count && verb === 'collect') return null;
    // find food without a count is handled as "find food" elsewhere
    if (!count && verb === 'find' && resource === 'food' && !preferredFoodFromRequest(rest)) return null;
    return {
      verb,
      resource,
      count: count || null,
      preferredFood: resource === 'food' ? preferredFoodFromRequest(rest) : null,
      rawResourceText: rest
    };
  }

  function runResourceAmountCommand(request, username, rawText) {
    const count = request.count;
    const thinDefaults = { wood: 16, stone: 24, coal: 8, iron: 8, dirt: 16, sand: 16, gravel: 16, clay: 8, food: 6 };
    if (config.thinCoreEnabled && Object.prototype.hasOwnProperty.call(thinDefaults, request.resource)) {
      return actions.executeAction('collect_resource', {
        resource: request.resource,
        preferredFood: request.preferredFood || undefined,
        count: count || thinDefaults[request.resource]
      }, { sender: username, rawText, source: 'chat_command' });
    }
    if (request.resource === 'wood') return actions.resourceRunWood(count || 16);
    if (request.resource === 'stone') {
      if (request.verb === 'mine' && !count) {
        if (typeof actions.mineStone === 'function') return actions.mineStone(1);
        if (typeof actions.mine_stone === 'function') return actions.mine_stone(1);
        return actions.resourceRunStone(1);
      }
      return actions.resourceRunStone(count || 32);
    }
    if (request.resource === 'coal') return request.verb === 'mine' ? actions.mineCoal(count || 8) : actions.resourceRunCoal(count || 8);
    if (request.resource === 'food') return actions.resourceRunFood(count || 6);
    if (request.resource === 'iron') return actions.mineIron(count || 8);
    return null;
  }

  const directionWords = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];

  function parseScoutCommand(command) {
    const parts = command.replace(/^scout\s+/, '').replace(/\s+blocks?$/, '').trim().split(/\s+/).filter(Boolean);
    const firstNumber = Number(parts[0]);
    const lastNumber = Number(parts.at(-1));
    const firstDirection = directionWords.includes(parts[0]) ? parts[0] : null;
    const lastDirection = directionWords.includes(parts.at(-1)) ? parts.at(-1) : null;

    if (Number.isFinite(firstNumber) && lastDirection) return { direction: lastDirection, distance: firstNumber };
    if (firstDirection && Number.isFinite(lastNumber)) return { direction: firstDirection, distance: lastNumber };
    if (firstDirection) return { direction: firstDirection, distance: null };
    return null;
  }

  function parseExploreRadius(command) {
    const match = command.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function normalizePlanningCommand(command) {
    const normalized = command
      .replace(/\s+/g, ' ')
      .replace(/\bu\b/g, 'you')
      .replace(/\br\b/g, 'are')
      .replace(/\bgols\b/g, 'goals')
      .replace(/\bgole\b/g, 'goal')
      .replace(/\bprepair\b/g, 'prepare')
      .replace(/\bprep for mining\b/g, 'prepare for mining')
      .replace(/\birn\b/g, 'iron')
      .replace(/\bimproove\b/g, 'improve')
      .replace(/\bwat\b/g, 'what')
      .replace(/\bshud\b/g, 'should')
      .replace(/\bplan nether\b/g, 'plan to prepare for the nether')
      .trim();

    const aliases = new Map([
      ['what are you doing', 'what are you doing?'],
      ['what are you doing?', 'what are you doing?'],
      ['what should we do next', 'what should we do next?'],
      ['what should we do next?', 'what should we do next?'],
      ['get iron gear', 'get iron gear'],
      ['build food secure', 'build food security']
    ]);
    return aliases.get(normalized) || normalized;
  }

  function parseRunSkillName(command) {
    const raw = command.replace(/^run skill\s+/, '').trim();
    const aliases = new Map([
      ['inventory', 'inventory_summary'],
      ['inventory summary', 'inventory_summary'],
      ['inventory status', 'inventory_summary'],
      ['home status', 'home_status'],
      ['mining status', 'mining_status'],
      ['mine status', 'mining_status'],
      ['farming status', 'farming_status'],
      ['farm status', 'farming_status'],
      ['nether checklist', 'nether_checklist'],
      ['skills status', 'skills_status'],
      ['skills', 'skills_status'],
      ['bridge status', 'server_bridge_status'],
      ['server bridge', 'server_bridge_status'],
      ['bridge health', 'bridge_health'],
      ['bridge events', 'bridge_recent_events'],
      ['bridge regions', 'bridge_regions']
    ]);
    return aliases.get(raw) || raw.replace(/\s+/g, '_');
  }

  function parseBlueprintName(command) {
    const raw = command
      .replace(/^(preview\s+blueprint|preview|materials\s+for|can\s+you\s+build|plan\s+build|plan\s+blueprint|build|import\s+schematic|preview\s+schematic|build\s+schematic)\s+/, '')
      .replace(/\?$/, '')
      .trim();
    const aliases = new Map([
      ['starter workstation', 'starter_workstation'],
      ['workstation', 'starter_workstation'],
      ['torch ring', 'torch_ring'],
      ['torches', 'torch_ring'],
      ['storage wall', 'storage_wall'],
      ['small shelter', 'small_shelter_5x5'],
      ['shelter', 'small_shelter_5x5'],
      ['farm corner', 'farm_corner'],
      ['mine entrance marker', 'mine_entrance_marker'],
      ['mine marker', 'mine_entrance_marker'],
      ['nether portal safety frame', 'nether_portal_safety_frame'],
      ['portal safety frame', 'nether_portal_safety_frame']
    ]);
    return aliases.get(raw) || raw.replace(/\s+/g, '_');
  }

  function parseBridgeRegionType(command) {
    const raw = command
      .replace(/^register\s+/, '')
      .replace(/\s+region$/, '')
      .replace(/^region\s+/, '')
      .trim();
    if (/farm/.test(raw)) return 'farm';
    if (/village/.test(raw)) return 'village';
    if (/portal/.test(raw)) return 'portal';
    return 'home';
  }

  function parseBridgeRegionId(command) {
    return command
      .replace(/^delete\s+bridge\s+region\s+/, '')
      .replace(/^delete\s+region\s+/, '')
      .trim()
      .replace(/\s+/g, '_');
  }

  async function reportCurrentWorkStatus(username, message) {
    const mem = memory.get() || {};
    const parts = [];
    const macro = mem.activeCoreMacro?.macroName || mem.activeCoreMacro?.name;
    if (macro) parts.push(`core macro: ${String(macro).replace(/_/g, ' ')}`);
    if (mem.thinCoreTaskActive || mem.activeThinCoreAction) {
      parts.push(`thin task: ${String(mem.activeThinCoreAction || 'active').replace(/_/g, ' ')}`);
    }
    if (mem.activeResourceRun?.resource) {
      parts.push(`resource run: ${mem.activeResourceRun.resource} (target ${mem.activeResourceRun.targetCount || '?'})`);
    }
    if (mem.lastIncompleteCollect?.resource) {
      const job = mem.lastIncompleteCollect;
      parts.push(`last incomplete: ${job.resource} ${job.collectedCount || 0}/${job.targetCount || '?'} remaining ${job.remaining || '?'}`);
    }
    if (mem.followOwnerActive) parts.push('following you');
    if (mem.movementMode) parts.push(`movement: ${String(mem.movementMode).replace(/_/g, ' ')}`);
    if (mem.currentTask?.type || mem.currentTask?.name) {
      parts.push(`task: ${mem.currentTask.name || mem.currentTask.type}`);
    }
    // Long-term goals system
    try {
      if (typeof actions.goalsStatus === 'function') {
        // Prefer a short line if goals API exists without double-chat
      }
    } catch {
      // ignore
    }
    if (!parts.length) {
      return actions.answerChat('No active job right now. Idle near you. Try: get wood, mine stone, progress to iron, or come here.');
    }
    return actions.answerChat(`Current work: ${parts.join(' · ')}.`);
  }

  async function dispatchNaturalRoute(username, message, route) {
    if (!route || route.mode === 'ignore') return null;
    // Knowledge / Q&A: speak only — never start collect/smelt jobs.
    if (route.mode === 'answer' || route.mode === 'dialogue') {
      const spoken = route.speak || route.reason || 'Ask me with a clear command when you want a job done.';
      recordSessionEvent('natural_command_answer', {
        ownerText: message,
        intent: route.intent || null,
        speak: spoken
      }, config);
      return actions.answerChat(spoken);
    }
    if (route.mode === 'execute' && (route.canonicalCommand || (route.source === 'thin_core' && route.action))) {
      if (route.speak) await actions.answerChat(route.speak);
      const result = route.source === 'thin_core' && route.action
        ? await actions.executeAction(route.action, route.args || {}, { sender: username, rawText: message, source: 'natural_router' })
        : await handleCommand(username, route.canonicalCommand);
      rememberNaturalCommandSuccess(message, route.canonicalCommand || route.action, result);
      recordSessionEvent('natural_command_executed', {
        ownerText: message,
        canonicalCommand: route.canonicalCommand || route.action,
        ok: result?.ok !== false,
        evidence: result?.evidence || []
      }, config);
      if (result?.ok === false && memory.get().explainFailures !== false) {
        const options = suggestRecoveryOptions(result, { command: route.canonicalCommand, originalText: message });
        rememberFailurePattern(route.canonicalCommand || route.action, result.reason || result.message || 'failed', { originalText: message });
        if (options.length) await actions.answerChat(createRecoveryQuestion(result, options));
      }
      return result || { ok: true, message: 'Natural command handled.', evidence: [], data: { canonicalCommand: route.canonicalCommand } };
    }
    if (route.mode === 'clarify' || route.mode === 'suggest' || route.mode === 'refuse') {
      const spoken = route.speak || route.reason || 'I need a clearer command before doing that.';
      rememberNaturalCommandFailure(message, route.reason || spoken);
      return actions.answerChat(spoken);
    }
    return null;
  }

  async function handlePendingCraftScavenge(command, username) {
    if (!/^(yes|yeah|yep|do it|go ahead|confirm|no|nope|cancel|never mind|nevermind)$/.test(command)) return null;
    const pending = memory.get().pendingCraftScavengeConfirmation;
    if (!pending) return null;
    if (Date.now() >= (pending.expiresAt || 0)) {
      memory.update({ pendingCraftScavengeConfirmation: null });
      return actions.answerChat('That craft-material scavenge choice expired. Ask me to make the tool again.');
    }
    if (/^(no|nope|cancel|never mind|nevermind)$/.test(command)) {
      memory.update({ pendingCraftScavengeConfirmation: null });
      return actions.answerChat('Okay, I will not scavenge those crafting materials.');
    }
    memory.update({ pendingCraftScavengeConfirmation: null });
    return handleCommand(username, pending.canonicalCommand || 'tj gather wood');
  }

  function parseMakeToolCommand(command) {
    const match = command.match(/^(?:make|craft)\s+(?:a\s+|an\s+)?(?:(wood|wooden|stone|iron|gold|golden|diamond)\s+)?(pickaxe|pick axe|pick|axe|ax|shovel|spade|hoe|sword)$/);
    if (!match) return null;
    const material = match[1]?.replace(/^wood$/, 'wooden').replace(/^gold$/, 'golden') || '';
    const toolType = match[2].replace(/\s+/g, '_').replace(/^pick$/, 'pickaxe').replace(/^pick_axe$/, 'pickaxe').replace(/^ax$/, 'axe').replace(/^spade$/, 'shovel');
    return { material, toolType };
  }

  async function handleCommand(username, message) {
    const commandStartedAt = Date.now();
    const text = stripAddress(message);
    const lower = text.toLowerCase();
    let command = lower.replace(/\barmour\b/g, 'armor');
    command = normalizePlanningCommand(command);
    memory.update({ lastCommand: { username, message, at: Date.now() } });
    const isGlobalStopCommand = ['stop', 'cancel', 'halt', 'freeze'].includes(command) || command.includes(' stop');
    if (!isGlobalStopCommand) actions.resetCancellation();

    const pendingScavenge = await handlePendingCraftScavenge(command, username);
    if (pendingScavenge) return pendingScavenge;

    if (command === 'dialogue status') return actions.dialogueStatus();
    if (command === 'talk mode on') return actions.setTalkMode(true);
    if (command === 'talk mode off') return actions.setTalkMode(false);
    if (command === 'banter on') return actions.setBanterMode(true);
    if (command === 'banter off') return actions.setBanterMode(false);
    if (command === 'personality') return actions.personalityStatus();
    if (command === 'who are you?' || command === 'who are you' || command === 'are you real?' || command === 'are you real' || command === 'are you alive?' || command === 'are you alive') return actions.personalityStatus(command);
    if (command === 'memories' || command === 'what do you remember?' || command === 'what do you remember' || command === 'what do you know about me?' || command === 'what do you know about me') return actions.conversationMemoryStatus();
    if (command.startsWith('remember that ')) return actions.rememberConversationFact(text.replace(/^remember that\s+/i, '').trim());
    if (command.startsWith('remember this:')) return actions.rememberConversationFact(text.replace(/^remember this:\s*/i, '').trim());
    if (command.startsWith('forget memory ')) return actions.forgetConversationFact(text.replace(/^forget memory\s+/i, '').trim());
    if (command === 'forget that') return actions.answerChat('Tell me which memory to forget, like "tj forget memory safe mining".');
    if (command === 'clear conversation memory') {
      memory.update({
        pendingClearConversationMemoryConfirmation: {
          requestedAt: Date.now(),
          expiresAt: Date.now() + 60000
        }
      });
      return actions.answerChat('That clears my conversation memory. Say "tj confirm clear conversation memory" to continue.');
    }
    if (command === 'confirm clear conversation memory') return actions.clearConversationMemoryConfirmed();
    if (command === 'be more quiet') return actions.setTalkMode(true, { chattyLevel: 'quiet', responseLengthPreference: 'short' });
    if (command === 'be more chatty') return actions.setTalkMode(true, { chattyLevel: 'chatty' });
    if (command === 'keep answers short') return actions.setTalkMode(true, { responseLengthPreference: 'short' });
    if (command === 'explain more') return actions.setTalkMode(true, { responseLengthPreference: 'detailed' });
    if (command === 'skills' || command === 'what skills do you have?' || command === 'what skills do you have') return actions.skillsStatus();
    if (command === 'skill status') return actions.skillStatus();
    if (command.startsWith('skill status ')) return actions.skillStatus(command.replace(/^skill status\s+/, '').trim());
    if (command === 'skill audit') return actions.skillAudit();
    if (command === 'unimplemented skills') return actions.unimplementedSkills();
    if (command === 'risky skills') return actions.riskySkills();
    if (command === 'active skill') return actions.activeSkill();
    if (command === 'skill runner status') return actions.skillRunnerStatus();
    if (command === 'cancel skill' || command === 'stop skill') return actions.cancelSkill('cancelled by owner');
    if (command === 'skill stats') return actions.skillStats();
    if (command.startsWith('skill stats ')) return actions.skillStats(command.replace(/^skill stats\s+/, '').trim());
    if (command === 'recent skills' || command === 'skill history') return actions.recentSkills();
    if (command === 'evidence status' || command === 'skill evidence' || command === 'evidence summary') return actions.evidenceStatus();
    if (command.startsWith('evidence ') && !['evidence status', 'evidence definitions', 'evidence types', 'evidence audit', 'evidence summary'].includes(command)) {
      return actions.skillEvidence(command.replace(/^evidence\s+/, '').trim());
    }
    if (command.startsWith('skill evidence ')) return actions.skillEvidence(command.replace(/^skill evidence\s+/, '').trim());
    if (command === 'recent evidence' || command === 'recent skill evidence' || command === 'last skill evidence') return actions.recentEvidence();
    if (command === 'evidence definitions' || command === 'evidence types') return actions.evidenceDefinitions();
    if (command === 'evidence audit') return actions.evidenceAudit();
    if (command.startsWith('verify skill ')) return actions.verifySkill(parseRunSkillName(command.replace(/^verify skill\s+/, 'run skill ')));
    // Friendly redirects for retired curriculum/progression phrases
    if (/\b(curriculum|milestone|progression status|next milestone|what should we unlock|what are we missing|what have we accomplished)\b/.test(command)
      || command === 'progress' || command === 'achievements' || command === 'suggest next skill' || command === 'suggest skills' || command === 'what needs work' || command === 'what can you practice' || command === 'what should you practice') {
      return actions.answerChat('Curriculum and milestones were removed. Try: come here, get wood/coal/iron, make camp, companion mode, or help.');
    }

    if (command === 'gear' || command === 'gear status' || command === 'what gear do you have?' || command === 'what gear do you have' || command === 'gear score' || command === 'best gear') return actions.gearStatus();
    if (command === 'upgrade status') return actions.gearUpgradeStatus();
    if (command === 'what gear should we upgrade?' || command === 'what gear should we upgrade' || command === 'suggest gear upgrades') return actions.suggestGearUpgrades();
    if (command === 'next gear upgrade') return actions.suggestNextGearUpgrade();
    if (command === 'nether gear readiness') return actions.netherGearReadiness();
    if (command === 'plan gear upgrades') return actions.createGearUpgradePlan('general');
    if (command === 'plan mining gear') return actions.createGearUpgradePlan('mining');
    if (command === 'plan combat gear') return actions.createGearUpgradePlan('combat');
    if (command === 'plan nether gear') return actions.createGearUpgradePlan('nether');
    if (command === 'create gear upgrade goal') return actions.createGoalFromTemplate('improve_combat_gear');

    if (command === 'enchanting status' || command === 'enchant status' || command === 'what can you enchant?') return actions.enchantStatus();
    if (command === 'enchant options') return actions.enchantOptions();
    if (command === 'enchant held item') return actions.enchantHeldItem();
    if (command === 'enchant best candidate') return actions.enchantBestCandidate();
    if (command === 'enchant pickaxe') return actions.enchantItem({ itemName: 'pickaxe' });
    if (command === 'enchant sword') return actions.enchantItem({ itemName: 'sword' });
    if (command === 'enchant armor') return actions.enchantItem({ itemName: 'helmet' });
    if (command === 'confirm enchant' || command === 'confirm high level enchant') return actions.confirmGearUpgrade('enchant');
    if (command === 'confirm enchant diamond gear') return actions.confirmGearUpgrade('diamond enchant');

    if (command === 'anvil status' || command === 'repair status' || command === 'what can you repair?' || command === 'what can you repair') return actions.anvilStatus();
    if (command === 'repair pickaxe') return actions.repairItem({ itemName: 'pickaxe' });
    if (command === 'repair sword') return actions.repairItem({ itemName: 'sword' });
    if (command === 'repair armor') return actions.repairItem({ itemName: 'helmet' });
    if (command === 'combine books') return actions.combineItems({ itemOneName: 'enchanted_book', itemTwoName: 'enchanted_book' });
    if (command === 'apply book to pickaxe') return actions.applyBookToItem({ itemName: 'pickaxe' });
    if (command === 'apply book to sword') return actions.applyBookToItem({ itemName: 'sword' });
    if (command === 'apply book to armor') return actions.applyBookToItem({ itemName: 'helmet' });
    if (command.startsWith('rename held item ')) return actions.renameItem({ itemName: bot.heldItem?.name || '', newName: text.replace(/^rename held item\s+/i, '').trim() });
    if (command === 'confirm anvil') return actions.confirmGearUpgrade('anvil');
    if (command === 'confirm use book' || command === 'confirm rare book use') return actions.confirmGearUpgrade('book');
    if (command === 'confirm repair') return actions.confirmGearUpgrade('repair');
    if (command === 'confirm combine books') return actions.confirmGearUpgrade('combine');
    if (command === 'confirm rename') return actions.confirmGearUpgrade('rename');

    if (command === 'potion status' || command === 'potions' || command === 'what potions do you have?' || command === 'what potions do you have') return actions.potionStatus();
    if (command === 'recommend potion') return actions.carryPotionLoadout();
    if (command === 'use fire resistance') return actions.usePotion({ potionName: 'fire_resistance' });
    if (command === 'use healing potion') return actions.usePotion({ potionName: 'healing' });
    if (command === 'carry nether potions') return actions.carryPotionLoadout({ nether: true });
    if (command === 'confirm use potion') return actions.confirmGearUpgrade('potion');

    if (command === 'brewing status' || command === 'can you brew fire resistance?' || command === 'can you brew fire resistance') return actions.brewingStatus();
    if (command === 'brew fire resistance') return actions.brewFireResistance();
    if (command === 'brew healing') return actions.brewPotion({ potionType: 'healing' });
    if (command === 'brew strength') return actions.brewPotion({ potionType: 'strength' });
    if (command === 'brew night vision') return actions.brewPotion({ potionType: 'night_vision' });
    if (command === 'brew slow falling') return actions.brewPotion({ potionType: 'slow_falling' });
    if (command === 'confirm brewing') return actions.confirmGearUpgrade('brew');
    if (command === 'cancel gear upgrade' || command === 'stop gear upgrade') {
      memory.update({ pendingGearUpgradeConfirmation: null });
      return actions.answerChat('Gear upgrade cancelled.');
    }

    if (command === 'villager status' || command === 'nearby villagers') return actions.villagerStatus();
    if (command === 'village status') return actions.villageStatus();
    if (command === 'scan villagers') return actions.scanVillagers();
    if (command === 'known villages') return actions.knownVillages();
    if (command === 'known villagers') return actions.knownVillagers();
    if (command === 'valuable villagers') return actions.valuableVillagers();
    if (command === 'remember village' || command === 'remember this village') return actions.rememberVillage();
    if (command === 'remember villager') return actions.rememberVillager();
    if (command === 'mark villager valuable') return actions.markVillagerValuable();
    if (command === 'confirm mark villager valuable' || command === 'confirm village protection') return actions.confirmVillagerMemory();

    if (command === 'trading status' || command === 'trade status') return actions.tradingStatus();
    if (command === 'inspect trades' || command === 'inspect villager trades' || command === 'what trades are nearby?' || command === 'what trades are nearby') return actions.inspectVillagerTrades();
    if (command === 'list known trades') return actions.listKnownTrades();
    if (command === 'best trades') return actions.bestKnownTrades();
    if (command === 'suggest trades' || command === 'what should we trade?' || command === 'what should we trade') return actions.suggestTrades();
    if (command === 'trade history') return actions.tradeHistory();
    if (command === 'economy status' || command === 'emerald status') return actions.economyStatus();
    if (command === 'find librarian') return actions.inspectVillagerTrades({ profession: 'librarian' });
    if (command === 'find farmer') return actions.inspectVillagerTrades({ profession: 'farmer' });
    if (command === 'find mending' || command === 'find mending trade' || command === 'find good books') return actions.bestKnownTrades({ offered: 'enchanted_book' });
    if (command === 'find emerald trades') return actions.suggestTrades({ type: 'emerald_earning' });
    if (command === 'find food trades') return actions.suggestTrades({ type: 'food' });
    if (command === 'find gear trades') return actions.suggestTrades({ type: 'gear' });
    if (/^buy trade \d+$/.test(command)) {
      const tradeIndex = Math.max(0, Number(command.match(/\d+$/)?.[0] || 1) - 1);
      return actions.executeApprovedTrade({ tradeIndex });
    }
    if (command === 'trade with villager' || command === 'execute trade') return actions.executeApprovedTrade({ tradeIndex: 0 });
    if (command === 'buy mending book' || command === 'buy best book') return actions.executeApprovedTrade({ tradeIndex: 0, confirmBookBuying: true });
    if (command === 'sell wheat') return actions.executeApprovedTrade({ tradeIndex: 0, offered: 'emerald', input: 'wheat' });
    if (command === 'sell sticks') return actions.executeApprovedTrade({ tradeIndex: 0, offered: 'emerald', input: 'stick' });
    if (command === 'confirm trade' || command === 'confirm buy book' || command === 'confirm spend emeralds' || command === 'confirm buy tool' || command === 'confirm buy armor' || command === 'confirm sell items' || command === 'confirm use rare trade input') return actions.confirmTrade(command.replace(/^confirm\s+/, ''));
    if (command === 'protect villagers' || command === 'village safety') return actions.villageProtectionStatus();
    if (command === 'light village') return actions.answerChat('Village lighting needs a normal safe torch-placement command for now. I will not alter village blocks automatically.');
    if (command === 'warn village danger') return actions.villageProtectionStatus();
    if (command === 'stop trading' || command === 'stop villager task') return actions.stop();

    if (command === 'blueprints' || command === 'list blueprints') return actions.listBlueprints();
    if (command === 'blueprint status') return actions.blueprintStatus();
    if (command === 'blueprint history') return actions.blueprintHistory();
    if (command === 'blueprint progress') return actions.blueprintProgress();
    if (command === 'schematic status' || command === 'list schematics') return actions.schematicStatus();
    if (command.startsWith('preview blueprint ') || command.startsWith('preview ')) return actions.blueprintPreview(parseBlueprintName(command));
    if (command.startsWith('materials for ') || command.startsWith('can you build ')) return actions.blueprintMaterials(parseBlueprintName(command));
    if (command.startsWith('plan build ') || command.startsWith('plan blueprint ')) return actions.blueprintPlan(parseBlueprintName(command), { sender: username });
    if (/^build\s+(starter workstation|workstation|torch ring|storage wall|small shelter|farm corner|mine entrance marker|mine marker|nether portal safety frame|portal safety frame)$/.test(command)) {
      return actions.blueprintBuildApproved(parseBlueprintName(command), { sender: username });
    }
    if (command === 'confirm build') return actions.blueprintStartBuild({}, { sender: username });
    if (command === 'continue build') return actions.blueprintContinueBuild();
    if (command === 'pause build') return actions.blueprintPauseBuild('paused by owner');
    if (command === 'resume build') return actions.blueprintResumeBuild();
    if (command === 'cancel build' || command === 'stop building') return actions.blueprintCancelBuild('cancelled by owner');
    if (command.startsWith('import schematic ') || command.startsWith('preview schematic ') || command.startsWith('build schematic ')) return actions.schematicStatus();

    if (command === 'server bridge' || command === 'bridge status') return actions.serverBridgeStatus();
    if (command === 'plugin status' || command === 'plugins' || command === 'mineflayer plugins' || command === 'plugin health' || command === 'plugin audit' || command === 'wrapper status' || command === 'movement plugin status' || command === 'collection plugin status' || command === 'tool plugin status') return actions.mineflayerPluginStatus();
    if (command === 'server status') return actions.serverStatus();
    if (command === 'bridge health') return actions.bridgeHealth();
    if (command === 'recent server events' || command === 'bridge events') return actions.bridgeRecentEvents();
    if (command === 'recent deaths') return actions.bridgeRecentDeaths();
    if (command === 'recent advancements') return actions.bridgeRecentAdvancements();
    if (command === 'bridge regions' || command === 'protected regions' || command === 'region status') return actions.bridgeRegions();
    if (/^register\s+(home|farm|village|portal)\s+region$/.test(command) || command.startsWith('register region ')) {
      const type = parseBridgeRegionType(command);
      memory.update({
        pendingBridgeRegionConfirmation: {
          operation: 'register',
          type,
          requestedBy: username,
          requestedAt: Date.now(),
          expiresAt: Date.now() + 60000
        }
      });
      return actions.answerChat(`Register ${type} region with the local bridge? Say "tj confirm bridge region" within 60 seconds.`);
    }
    if (command.startsWith('delete bridge region ') || command.startsWith('delete region ')) {
      const id = parseBridgeRegionId(command);
      memory.update({
        pendingBridgeRegionConfirmation: {
          operation: 'delete',
          id,
          requestedBy: username,
          requestedAt: Date.now(),
          expiresAt: Date.now() + 60000
        }
      });
      return actions.answerChat(`Delete bridge region ${id}? Say "tj confirm bridge region" within 60 seconds.`);
    }
    if (command === 'confirm bridge region' || command === 'confirm register region' || command === 'confirm delete bridge region') {
      const pending = memory.get().pendingBridgeRegionConfirmation;
      if (!pending || Date.now() > (pending.expiresAt || 0)) {
        memory.update({ pendingBridgeRegionConfirmation: null });
        return actions.answerChat('No active bridge region confirmation.');
      }
      memory.update({ pendingBridgeRegionConfirmation: null });
      if (pending.operation === 'delete') return actions.bridgeDeleteRegion({ id: pending.id });
      return actions.bridgeRegisterRegion({ type: pending.type || 'home' }, { sender: username });
    }
    if (command === 'bridge emergency stop' || command === 'stop from bridge') return actions.bridgeEmergencyStop('owner requested bridge emergency stop');

    if (command === 'stop recording route') {
      actions.resetCancellation();
      return actions.stopRouteRecording();
    }
    if (isGlobalStopCommand) return actions.stop();
    if (command.startsWith('run skill ')) return actions.runSkill(parseRunSkillName(command), {}, { sender: username });
    if (command === 'confirm long exploration') return actions.confirmExploration('long_exploration');
    if (command === 'confirm night exploration') return actions.confirmExploration('night_exploration');
    if (command === 'confirm cave exploration') return actions.confirmExploration('cave_exploration');
    if (command === 'confirm ocean exploration') return actions.confirmExploration('ocean_exploration');
    if (command === 'confirm leave home radius') return actions.confirmExploration('leave_home_radius');
    if (command === 'confirm pvp') return actions.answerChat('PVP is disabled in config. I will not attack players.');
    if (command === 'confirm dangerous combat') return actions.answerChat('Dangerous combat confirmed only for explicit defensive commands; I will still flee if unsafe.');
    if (command === 'confirm raid defense') return actions.answerChat('Raid defense confirmation noted, but I will still avoid suicidal fights.');
    if (command === 'confirm attack neutral') return actions.answerChat('Neutral mob attacks stay disabled unless they are actively hostile.');
    if (command === 'confirm attack iron golem') return actions.answerChat('I will not attack iron golems in this defensive build.');
    if (command === 'confirm leave base to fight') return actions.answerChat('I will not leave the base radius to chase mobs.');
    if (command === 'confirm nether prep') {
      if (memory.get().pendingNetherConfirmation) return actions.confirmNether('nether_prep');
      return actions.approveGoal();
    }
    if (command === 'confirm portal lighting') return actions.confirmNether('portal_lighting');
    if (command === 'confirm nether entry') return actions.confirmNether('nether_entry');
    if (command === 'confirm nether scout') return actions.confirmNether('nether_scout');
    if (command === 'confirm nether exploration') return actions.confirmNether('nether_exploration');
    if (command === 'confirm nether mining') return actions.confirmNether('nether_mining');
    if (command === 'confirm fortress search') return actions.confirmNether('fortress_search');
    if (command === 'confirm bastion search') return actions.confirmNether('bastion_search');
    if (command === 'confirm nether override') return actions.confirmNether('nether_override');
    if (/^approve$/.test(command)) return handleBareApproval();
    if (command === 'confirm goal' || command === 'confirm start goal' || command === 'approve goal' || command === 'approve plan') return actions.approveGoal();
    if (command === 'reject goal' || command === 'reject plan') return actions.rejectGoal();
    if (command === 'confirm step' || command === 'confirm risky step' || command === 'confirm deep mining' || command === 'confirm diamond use' || command === 'confirm major build') return actions.confirmStep();
    if (command === 'confirm long exploration' && memory.get().pendingGoalConfirmation) return actions.confirmStep();
    if (command === 'confirm delete goal') return actions.confirmDeleteGoal();
    if (command.startsWith('confirm forget ')) return actions.confirmForgetWaypoint(text.replace(/^confirm forget\s+/i, '').trim());
    if (command === 'confirm delete map memory') return actions.answerChat('I will not delete map memory from chat in this build.');
    if (command === 'nether status' || command === 'are you ready for the nether?' || command === 'are you ready for the nether') return actions.netherStatus();
    if (command === 'nether checklist' || command === 'what are we missing for nether?' || command === 'what are we missing for nether') return actions.netherChecklist();
    if (command === 'prepare for nether' || command === 'prepare for the nether' || command === 'get ready for nether' || command === 'get ready for the nether') return actions.prepareNether();
    if (command === 'nether gear') return actions.netherStatus();
    if (command === 'equip nether gear') return actions.equipNetherGear();
    if (command === 'nether supplies') return actions.netherChecklist();
    if (command === 'portal status' || command === 'where is the portal?' || command === 'where is the portal') return actions.portalStatus();
    if (command === 'find portal') return actions.findPortal();
    if (command === 'build portal') return actions.buildPortal();
    if (command === 'light portal') return actions.lightPortal();
    if (command === 'remember portal' || command === 'mark this portal') return actions.rememberPortal();
    if (command === 'enter nether') return actions.enterNether();
    if (command === 'safe nether entry' || command === 'scout nether') return actions.safeNetherEntry();
    if (command === 'scan nether') return actions.scanNether();
    if (command === 'return from nether' || command === 'go back through portal') return actions.returnFromNether();
    if (command === 'stop nether task') return actions.stopNetherTask();
    if (command === 'goals' || command === 'goal status' || command === 'plan status') return actions.goalsStatus();
    if (command === 'current goal' || command === 'what is your goal?' || command === 'what is your goal' || command === 'what are you working on?' || command === 'what are you working on' || command === 'what are you doing?' || command === 'what are you doing') return actions.explainGoal();
    if (command === 'next step') return actions.nextGoalStep();
    if (command === 'why are you doing that?' || command === 'why are you doing that' || command === 'explain goal' || command === 'explain plan') return actions.explainGoal();
    if (command === 'progress' || command === 'goal progress') return actions.explainGoal();
    if (command === 'prepare for night') return actions.createGoalFromTemplate('prepare_for_night');
    if (command === 'improve base') return actions.createGoalFromTemplate('improve_base');
    if (isMiningPrepCommand(command)) return actions.createGoalFromTemplate('prepare_for_mining');
    if (command === 'get iron gear') return actions.createGoalFromTemplate('get_iron_gear');
    if (
      command === 'progress to iron'
      || command === 'progress_to_iron'
      || command === 'iron age'
      || command === 'to iron'
      || command === 'run progress to iron'
    ) {
      if (typeof actions.runCoreMacro === 'function') {
        return actions.runCoreMacro({ name: 'progress_to_iron' }, { sender: username, rawText: message, source: 'chat_command' });
      }
      return actions.createGoalFromTemplate('progress_to_iron');
    }
    if (command === 'build food security' || command === 'make us food secure' || command === 'plan food security') return actions.createGoalFromTemplate('food_security');
    if (command === 'stockpile resources') return actions.createGoalFromTemplate('stockpile_resources');
    if (command === 'secure base') return actions.createGoalFromTemplate('secure_base');
    if (command === 'plan to prepare for the nether' || command === 'plan to prepare for nether') return actions.createGoalFromTemplate('prepare_for_nether');
    {
      const startGoal = text.match(/^start goal\s+(.+)$/i);
      if (startGoal) return actions.startGoal(startGoal[1].trim());
    }
    {
      const pauseGoal = text.match(/^pause goal(?:\s+(.+))?$/i);
      if (pauseGoal) return actions.pauseGoal(pauseGoal[1]?.trim() || null);
    }
    {
      const resumeGoal = text.match(/^resume goal(?:\s+(.+))?$/i);
      if (resumeGoal) return actions.resumeGoal(resumeGoal[1]?.trim() || null);
    }
    {
      const cancelGoal = text.match(/^cancel goal(?:\s+(.+))?$/i);
      if (cancelGoal) return actions.cancelGoal(cancelGoal[1]?.trim() || null);
    }
    if (command === 'complete goal') return actions.completeGoal();
    {
      const archiveGoal = text.match(/^archive goal\s+(.+)$/i);
      if (archiveGoal) return actions.archiveGoal(archiveGoal[1].trim());
    }
    {
      const deleteGoal = text.match(/^delete goal\s+(.+)$/i);
      if (deleteGoal) return actions.deleteGoal(deleteGoal[1].trim());
    }
    {
      const priority = text.match(/^set goal priority\s+(.+)\s+(high|normal|low)$/i);
      if (priority) return actions.setGoalPriority(priority[1].trim(), priority[2].toLowerCase());
    }
    {
      const makeGoal = text.match(/^make a goal to\s+(.+)$/i) || text.match(/^make a plan to\s+(.+)$/i) || text.match(/^create goal:\s*(.+)$/i);
      if (makeGoal) return actions.createGoal(makeGoal[1].trim());
    }
    if (command === 'plan a mining trip') return actions.createGoal('plan a mining trip');
    if (command === 'plan to stockpile coal') return actions.createGoal('stockpile coal');
    if (command === 'suggest goals' || command === 'what should we do next?' || command === 'what do we need?' || command === 'what do we need' || command === 'what is the smartest next move?' || command === 'what is the smartest next move' || command === 'what are we missing?' || command === 'what are we missing' || command === 'how can we improve the base?' || command === 'how can we improve the base' || command === 'what should you work on?' || command === 'what should you work on') return actions.plannerSuggestNext({ force: true });
    if (command === 'skip step') return actions.skipGoalStep();
    if (command === 'retry step') return actions.retryGoalStep();
    if (command === 'map' || command === 'map status') return actions.mapStatus();
    if (command === 'known places' || command === 'list places' || command === 'waypoints') return actions.listKnownPlaces();
    if (command === 'exploration status' || command === 'scout status') return actions.explorationStatus();
    if (command === 'where have you been?' || command === 'where have you been' || command === 'what have you found?' || command === 'what have you found') return actions.reportExplorationResults();
    if (command === 'scan area' || command === 'look around' || command === 'what do you see?' || command === 'what do you see' || command === 'what can you see') {
      try {
        const { describeSight } = await import('./sight.js');
        return actions.answerChat(describeSight(bot, { radius: 40 }));
      } catch {
        return actions.scanArea();
      }
    }
    if (command === 'nearby resources' || command === 'nearby dangers') return actions.scanArea();
    if (command === 'known resources') return actions.knownResources();
    if (command === 'known dangers') return actions.knownDangerZones();
    if (command === 'known biomes') return actions.knownBiomes();
    {
      const rememberMatch = text.match(/^remember this(?: place)? as\s+(.+)$/i) || text.match(/^mark this as\s+(.+)$/i);
      if (rememberMatch) return actions.rememberLocation(rememberMatch[1].trim());
    }
    if (command.startsWith('forget ')) return actions.forgetLocation(text.replace(/^forget\s+/i, '').trim());
    {
      const whereMatch = text.match(/^where is\s+(.+)\??$/i);
      if (whereMatch) return actions.waypointStatus(whereMatch[1].trim());
    }
    {
      const goMatch = text.match(/^(go to|take me to)\s+(.+)$/i);
      if (goMatch && goMatch[2].toLowerCase() !== 'death spot') return actions.goToWaypoint(goMatch[2].trim());
    }
    if (command === 'return to base') return actions.returnHome();
    if (command === `return to ${config.ownerUsername.toLowerCase()}` || command === 'return to owner') return actions.returnToOwner();
    if (command === 'return from exploration') return actions.returnFromExploration();
    if (command.startsWith('scout ')) {
      const parsed = parseScoutCommand(command);
      if (parsed) return actions.scoutDirection(parsed.direction, parsed.distance);
    }
    if (command === 'explore around home' || command === 'explore around base' || command.startsWith('explore around home ') || command.startsWith('explore around base ')) {
      return actions.exploreAroundHome(parseExploreRadius(command));
    }
    if (command === 'explore around me' || command.startsWith('explore around me ')) return actions.exploreAroundOwner(parseExploreRadius(command));
    if (command.startsWith('explore ') && command.includes('block')) return actions.exploreAroundOwner(parseExploreRadius(command));
    {
      const routeStart = text.match(/^start recording route\s+(.+)$/i);
      if (routeStart) return actions.recordRoute(routeStart[1].trim());
    }
    if (command === 'routes' || command === 'route status') return actions.routeStatus();
    {
      const followRoute = text.match(/^follow route\s+(.+)$/i);
      if (followRoute) return actions.followRoute(followRoute[1].trim());
    }
    {
      const rememberRoute = text.match(/^remember route to\s+(.+)$/i);
      if (rememberRoute) return actions.recordRoute(`route to ${rememberRoute[1].trim()}`);
    }
    if (command === 'combat status' || command === 'defense status') return actions.combatStatus();
    if (command === 'combat gear' || command === 'weapon status') return actions.combatEquipmentStatus();
    if (command === 'threat scan' || command === 'scan threats' || command === 'what mobs are nearby?' || command === 'are we safe?') return actions.threatScan();
    if (command === 'defend yourself' || command === 'self defense on') return actions.startSelfDefense(true);
    if (command === 'self defense off') return actions.startSelfDefense(false);
    if (command === 'protect me' || command === 'defend me' || command === 'watch my back') return actions.defendOwner(true);
    if (command === 'stop protecting me') return actions.defendOwner(false);
    if (command === 'guard base' || command === 'defend base') return actions.guardBase(true);
    if (command === 'stop guarding base' || command === 'stop guarding') return actions.guardBase(false);
    if (command === 'guard here') return actions.guardPosition();
    if (command === 'stop combat' || command === 'stop fighting') return actions.stopCombat();
    if (command === 'flee' || command === 'retreat' || command === 'run away') return actions.fleeThreat();
    if (command === 'equip weapon' || command === 'equip combat gear') return actions.equipCombatGear();
    if (command === 'base defense status') return actions.baseDefenseStatus();
    if (command === 'owner defense status') return actions.ownerDefenseStatus();
    if (command === 'fight hostile' || command === 'get that mob') return actions.engageHostile('hostile');
    {
      const attackMatch = command.match(/^attack\s+(?:the\s+|nearest\s+)?(.+)$/);
      if (attackMatch) return actions.engageHostile(attackMatch[1].trim());
    }
    if (
      command === 'goal'
      || command === 'goals'
      || command === 'goal status'
      || command === 'current goal'
      || command === 'whats your current goal'
      || command === "what's your current goal"
      || command === 'what is your current goal'
      || command === 'what are you doing'
      || command === 'what are you working on'
    ) {
      return reportCurrentWorkStatus(username, message);
    }
    if (command === 'status' && config.thinCoreEnabled) return actions.executeAction('thin_status', {}, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'status') return actions.status();
    if (command === 'brain') return actions.brainStatus();
    if (command === 'task') return actions.taskStatus();
    if (command === 'debug') {
      await actions.status();
      await actions.brainStatus();
      return actions.safetyStatus();
    }
    if (command === 'safety') return actions.safetyStatus();
    if (command === 'memory') return actions.memoryStatus();
    if (command === 'where are you?') return actions.whereBot();
    if (command === 'where am i?') return actions.whereOwner();
    if (command === 'who is nearby?') return actions.whoNearby();
    if ((command === 'come here' || command === 'come' || command.includes('come to me')) && config.thinCoreEnabled) return actions.executeAction('thin_come_to_owner', {}, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'come here' || command === 'come' || command.includes('come to me')) return actions.comeToOwner();
    if ((command === 'follow me' || command === 'follow') && config.thinCoreEnabled) return actions.executeAction('thin_follow_owner', {}, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'follow me' || command === 'follow') return actions.followOwner();
    if (command === 'stay' && config.thinCoreEnabled) return actions.executeAction('thin_stay', {}, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'stay') return actions.stay();
    if (command === 'set home' && config.thinCoreEnabled) return actions.executeAction('thin_remember_home', {}, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'set home') return actions.setHome();
    if (command === 'home' || command === 'home status') return actions.homeStatus();
    if (command === 'return home' && config.thinCoreEnabled) return actions.executeAction('thin_return_home', {}, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'return home') return actions.returnHome();
    if (command === 'clear home') return actions.clearHome();
    if (command === 'make camp' || command === 'build camp') return actions.buildCamp();
    if (command === 'build workstation') return actions.buildWorkstation();
    if (command === 'build shelter' || command === 'build small shelter') return actions.buildShelter();
    if (command === 'light home' || command === 'base lighting' || command === 'place torches around home') return actions.lightHome();
    if (command === 'base status') return actions.baseStatus();
    if (command === 'base brain') {
      await actions.brainStatus();
      return actions.baseStatus();
    }
    if (command === 'what does home need?' || command === 'what does home need') return actions.whatHomeNeeds();
    if (command === 'maintain base') return actions.baseMaintenance({ force: true });
    if (command === 'stop maintaining base') return actions.stop();
    if (command === 'farming status' || command === 'farm status' || command === 'what crops do we have?' || command === 'what does the farm need?') return actions.farmingStatus();
    if (command === 'confirm large farm') {
      const pending = memory.get().pendingFarmConfirmation;
      if (pending?.action === 'large_farm' && Date.now() < (pending.expiresAt || 0)) {
        memory.update({ pendingFarmConfirmation: null });
        return actions.createFarm(pending.cropType || 'wheat', { confirmed: true });
      }
      return actions.answerChat('No active large farm confirmation.');
    }
    if (command === 'confirm farm expansion' || command === 'confirm harvest this farm') {
      return actions.answerChat('No active farm expansion or unregistered harvest confirmation.');
    }
    if (command === 'confirm animal slaughter' || command === 'confirm large animal lure') {
      return actions.answerChat('No active animal confirmation.');
    }
    {
      const farmMatch = command.match(/^make(?:\s+(\d+)x(\d+))?\s+(wheat|carrot|potato|beetroot)?\s*farm$/);
      if (farmMatch || command === 'make farm' || command === 'make small farm') {
        const crop = ({ wheat: 'wheat', carrot: 'carrots', potato: 'potatoes', beetroot: 'beetroots' })[farmMatch?.[3]] || 'wheat';
        return actions.createFarm(crop, {
          width: farmMatch?.[1] ? Number(farmMatch[1]) : undefined,
          length: farmMatch?.[2] ? Number(farmMatch[2]) : undefined
        });
      }
    }
    if (command === 'plant wheat') return actions.plantCrop('wheat');
    if (command === 'plant carrots') return actions.plantCrop('carrots');
    if (command === 'plant potatoes') return actions.plantCrop('potatoes');
    if (command === 'plant beetroots') return actions.plantCrop('beetroots');
    if (command === 'harvest crops' || command === 'harvest farm' || command === 'harvest wheat') return actions.harvestCrops();
    if (command === 'replant crops') return actions.replantCrops();
    if (command === 'maintain farm' || command === 'farm maintenance') return actions.maintainFarm();
    if (command === 'store farm items') return actions.storeFarmItems();
    if (command === 'animal status' || command === 'pens status' || command === 'animal pen status' || command === 'what animals do we have?') return actions.animalPenStatus();
    if (command === 'make animal pen') return actions.createAnimalPen('cow');
    {
      const penMatch = command.match(/^make\s+(cow|sheep|pig|chicken|rabbit)\s+pen$/);
      if (penMatch) return actions.createAnimalPen(penMatch[1]);
    }
    {
      const lureMatch = command.match(/^lure\s+(\d+\s+)?(cow|sheep|pig|chicken|rabbit)s?$/);
      if (lureMatch) return actions.lureAnimalToPen(lureMatch[2]);
    }
    {
      const breedMatch = command.match(/^breed\s+(\d+\s+)?(cow|sheep|pig|chicken|rabbit)s?$/);
      if (breedMatch) return actions.breedAnimals(breedMatch[2]);
    }
    if (command === 'feed animals') return actions.feedAnimals('cow');
    if (command === 'collect eggs') return actions.collectEggs();
    if (command === 'shear sheep') return actions.shearSheep();
    if (command === 'milk cow') return actions.milkCow();
    if (/^(kill|slay|slaughter|attack)\s+(villagers?|iron golems?|players?|modvinny)\b/.test(command)) {
      return actions.answerChat('I will not attack villagers, iron golems, players, or ModVinny.');
    }
    {
      const huntMatch = command.match(/^(kill|slay|slaughter|hunt)\s+(?:some\s+)?(cows?|pigs?|sheep|chickens?|rabbits?|animals?)$/);
      if (huntMatch) {
        const rawAnimal = huntMatch[2].replace(/s$/, '');
        const animalType = rawAnimal === 'cow' || rawAnimal === 'pig' || rawAnimal === 'sheep' || rawAnimal === 'chicken' || rawAnimal === 'rabbit'
          ? rawAnimal
          : null;
        return actions.huntPassiveFood(animalType);
      }
    }
    if (command === 'stop farming') return actions.stopFarming();
    if (command === 'stop animals') return actions.stopAnimalTask();
    if (command === 'mining status' || command === 'mine status') return actions.miningStatus();
    if (command === 'storage' || command === 'storage status') return actions.storageStatus();
    if (command === 'register chest') return actions.registerStorageChest();
    if (
      command === 'store items'
      || command === 'deposit items'
      || command === 'deposit inventory'
      || command === 'store inventory'
      || command === 'put stuff away'
      || command === 'put items away'
      || /^store all(?:\s+\w+)?$/.test(command)
      || /^put away all(?:\s+\w+)?$/.test(command)
      || /^put all(?:\s+\w+)? away$/.test(command)
    ) {
      if (config.thinCoreEnabled) {
        return actions.executeAction('thin_store_items', { mode: 'safe_excess' }, { sender: username, rawText: message, source: 'chat_command' });
      }
      return actions.storeItems();
    }
    if (command.startsWith('bring me ')) {
      const { itemName, count } = parseItemCount(command, /^bring me\s+/);
      return actions.bringItemToOwner(itemName, count);
    }
    {
      const resourceRequest = parseResourceAmountCommand(command);
      if (resourceRequest) return runResourceAmountCommand(resourceRequest, username, message);
    }
    if (command.startsWith('get ') && !['get wood', 'get stone', 'get coal', 'get food'].includes(command)) {
      const { itemName, count } = parseItemCount(command, /^get\s+/);
      return actions.withdrawItem(itemName, count);
    }
    if (command === 'resource status') return actions.resourceStatus();
    if ((command === 'get wood' || command === 'resource run wood') && config.thinCoreEnabled) return actions.executeAction('collect_resource', { resource: 'wood', count: 8 }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'get wood' || command === 'resource run wood') return actions.resourceRunWood(16);
    if ((command === 'get stone' || command === 'resource run stone') && config.thinCoreEnabled) return actions.executeAction('collect_resource', { resource: 'stone', count: 16 }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'get stone' || command === 'resource run stone') return actions.resourceRunStone(32);
    if ((command === 'get coal' || command === 'resource run coal') && config.thinCoreEnabled) return actions.executeAction('collect_resource', { resource: 'coal', count: 8 }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'get coal' || command === 'resource run coal') return actions.resourceRunCoal(8);
    if (command === 'get food' || command === 'resource run food') return actions.resourceRunFood(6);
    if ((command === 'get iron' || command === 'mine iron') && config.thinCoreEnabled) return actions.executeAction('collect_resource', { resource: 'iron', count: 4 }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'get iron' || command === 'mine iron') return actions.mineIron(8);
    if (command === 'mine coal' && config.thinCoreEnabled) return actions.executeAction('collect_resource', { resource: 'coal', count: 8 }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'mine coal') return actions.mineCoal(8);
    if (command === 'resource run iron' || command === 'iron run') {
      return actions.resourceRunIron?.(8) || actions.mineIron(8);
    }
    if ((command === 'gather wood' || command.includes('find tree') || command.includes('gather logs')) && config.thinCoreEnabled) return actions.executeAction('collect_resource', { resource: 'wood', count: 8 }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'gather wood' || command.includes('find tree') || command.includes('gather logs')) return actions.gatherWood(8);
    if (command === 'find tree') return actions.gatherWood(8);
    if (command === 'mine stone' && config.thinCoreEnabled) return actions.executeAction('collect_resource', { resource: 'stone', count: 1 }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'mine stone') return actions.mineStone?.(1) || actions.mine_stone?.(1) || actions.resourceRunStone(1);
    if (
      command === 'finish last job'
      || command === 'finish current job'
      || command === 'finish job'
      || command === 'continue mining'
      || command === 'resume collection'
      || command === 'finish curretn job'
      || /\bfinish\b.{0,12}\b(job|task)\b/.test(command)
    ) {
      return actions.executeAction('resume_last_collect', {}, { sender: username, rawText: message, source: 'chat_command' });
    }
    if (command === 'inventory' || command === 'inv' || command === 'what do you have?') return actions.inventoryStatus();
    if (command === 'tools' || command === 'tool status') return actions.toolStatus();
    if (command.startsWith('count ')) return actions.countInventory(command.replace(/^count\s+/, '').trim());
    if (command === 'pick up items' || command === 'collect drops') return actions.collectDropsAction();
    if (command === 'collect wood') return actions.collectDropsAction('wood');
    if (command === 'collect food') return actions.collectDropsAction('food');
    if (command.startsWith('drop ')) {
      const { itemName, count } = parseItemCount(command, /^drop\s+/);
      return actions.dropItem(itemName, count);
    }
    if (/^give\s+(?:items?|something|stuff)\s+to\s+(?:me|player|owner|modvinny)$/.test(command)) {
      return actions.giveOwnerItem('', 1);
    }
    if (/^give\s+.+\s+to\s+(?:me|player|owner|modvinny)$/.test(command)) {
      const raw = command.replace(/^give\s+/, '').replace(/\s+to\s+(?:me|player|owner|modvinny)$/, '');
      const { itemName, count } = parseItemCount(raw, /^/);
      return actions.giveOwnerItem(itemName, count);
    }
    if (command.startsWith('give me ')) {
      const { itemName, count } = parseItemCount(command, /^give me\s+/);
      return actions.giveOwnerItem(itemName, count);
    }
    if (/^give\s+.+$/.test(command)) {
      const raw = command.replace(/^give\s+/, '').trim();
      const { itemName, count } = parseItemCount(raw, /^/);
      return actions.giveOwnerItem(itemName, count);
    }
    if (command === 'stuck') return actions.stuckStatus();
    if (command === 'unstuck') return actions.unstuck();
    if (command === 'death' || command === 'last death') return actions.deathStatus();
    if (command === 'go to death spot') return actions.goToDeathSpot();
    if (command === 'light' || command === 'place torch') return actions.placeTorch();
    if (command === 'lighting status') return actions.lightingStatus();
    if (command === 'sleep') return actions.sleep();
    if (command === 'bed status') return actions.bedStatus();
    if (command === 'night status') return actions.nightStatus();
    if (command === 'place crafting table') return actions.placeBlock('crafting_table');
    if (command === 'place furnace') return actions.placeBlock('furnace');
    if (command === 'place chest') return actions.placeStorageChest();
    if (command === 'place bed') {
      const bed = bot.inventory.items().find((item) => item.name.endsWith('_bed'))?.name || 'white_bed';
      return actions.placeBlock(bed);
    }
    if (command === 'crafting status' || command === 'what can you craft?') return actions.craftingStatus();
    if (command.startsWith('can you craft ') || command.startsWith('can you make ')) {
      const itemName = command.replace(/^can you (craft|make)\s+(a\s+|an\s+|some\s+)?/, '').replace(/\?$/, '');
      return actions.canCraftItem(itemName);
    }
    if (/^(?:equip|equipt)\s+/.test(command)) {
      const toolRequest = command.replace(/^(?:equip|equipt)\s+(?:a\s+|an\s+|the\s+)?/, '').trim();
      return actions.equipTool(toolRequest);
    }
    const makeTool = parseMakeToolCommand(command);
    if (makeTool) {
      if (makeTool.material) return actions.craftItem(`${makeTool.material}_${makeTool.toolType}`, 1, { direct: true });
      return actions.craftGenericTool(makeTool.toolType);
    }
    if (command.startsWith('confirm craft ')) {
      return actions.confirmCraftItem(command.replace(/^confirm craft\s+/, '').trim());
    }
    if (command === 'craft planks') return actions.craftPlanks();
    if (command === 'craft sticks') return actions.craftSticks();
    if (command === 'craft table' || command === 'craft crafting table') return actions.craftCraftingTable();
    if (command === 'craft wooden pickaxe') return actions.craftWoodenPickaxe();
    if (command === 'craft stone pickaxe') return actions.craftStonePickaxe();
    if (command === 'craft wooden axe') return actions.craftWoodenAxe();
    if (command === 'craft torches') return actions.craftTorches();
    if (command === 'craft basic tools' || command === 'craft wooden tools' || command === 'make wooden tools' || command === 'make basic tools') {
      return actions.craftBasicTools();
    }
    if (command === 'craft stone tools' || command === 'make stone tools') return actions.craftStoneTools();
    if (command === 'craft iron tools' || command === 'make iron tools') return actions.craftIronTools();
    // Smelt: iron, charcoal, generic
    if (/^smelt\s+/.test(command) || /^make\s+charcoal$/.test(command)) {
      const raw = command === 'make charcoal' ? 'charcoal' : command.replace(/^smelt\s+/, '').trim();
      const countMatch = raw.match(/^(\d{1,2})\s+(.+)$/) || raw.match(/^(.+?)\s+(\d{1,2})$/);
      let itemName = raw;
      let count = 8;
      if (countMatch) {
        if (/^\d/.test(countMatch[1])) {
          count = Number(countMatch[1]);
          itemName = countMatch[2].trim();
        } else {
          itemName = countMatch[1].trim();
          count = Number(countMatch[2]);
        }
      }
      if (/^charcoal|logs?|wood$/.test(itemName) || command === 'make charcoal') {
        return actions.smeltCharcoal(count || 4);
      }
      if (/^iron|raw iron|iron ore$/.test(itemName)) {
        return actions.smeltIron(count || 8);
      }
      return actions.smeltItem(itemName, count || 1);
    }
    if (command === 'craft storage' || command === 'make us some storage' || command === 'make storage') return actions.craftStorage();
    if (command === 'craft lighting' || command === 'make light' || command === 'make lights') return actions.craftLighting();
    if (command === 'craft shelter supplies' || command === 'make shelter stuff' || command === 'prepare supplies for the night') return actions.craftShelterSupplies();
    if (command === 'craft utility items') return actions.craftUtilityItems();
    if (command === 'craft travel items') return actions.craftTravelItems();
    if (command === 'craft survival kit') return actions.craftSurvivalKit({ direct: true });
    if (command === 'craft chest') return actions.craftItem('chest', 1, { direct: true });
    if (command === 'craft furnace') return actions.craftItem('furnace', 1, { direct: true });
    if (command === 'craft torch') return actions.craftTorches();
    if (command === 'craft bed') return actions.craftItem('bed', 1, { direct: true });
    if (command === 'craft boat' || command === 'make a boat') return actions.craftItem('boat', 1, { direct: true });
    if (command === 'craft shield') return actions.craftItem('shield', 1, { direct: true });
    if (command === 'craft bucket') return actions.craftItem('bucket', 1, { direct: true });
    if (command === 'craft campfire') return actions.craftItem('campfire', 1, { direct: true });
    if (command === 'craft ladder') return actions.craftItem('ladder', 1, { direct: true });
    if (command === 'craft doors') return actions.craftItem('door', 1, { direct: true });
    if (command === 'craft signs') return actions.craftItem('sign', 1, { direct: true });
    if (command === 'craft fences') return actions.craftItem('fence', 1, { direct: true });
    if (command === 'craft gate') return actions.craftItem('fence gate', 1, { direct: true });
    if (command === 'craft slabs') return actions.craftItem('slab', 1, { direct: true });
    if (command === 'craft stairs') return actions.craftItem('stairs', 1, { direct: true });
    if (command === 'craft trapdoor') return actions.craftItem('trapdoor', 1, { direct: true });
    if (command === 'craft bowl') return actions.craftItem('bowl', 1, { direct: true });
    if (command === 'food' || command === 'hunger') return actions.foodStatus();
    if ((command === 'eat' || command === 'eat food') && config.thinCoreEnabled) return actions.executeAction('thin_eat_if_hungry', { direct: true }, { sender: username, rawText: message, source: 'chat_command' });
    if (command === 'eat' || command === 'eat food') return actions.eatIfHungry({ direct: true });
    if (command === 'find food') return actions.findFood();
    if (command === 'make food') return actions.makeFood();
    if (command === 'cook food' || command === 'cook meat') return actions.cookFood();
    if (command === 'craft bread') return actions.craftFood('bread');
    if (command === 'hunt food') return actions.huntPassiveFood();
    if (command === 'fish') return actions.fishForFood();
    if (command === 'stop hunting') return actions.stop();
    if (command === 'armor' || command === 'armor status') return actions.armorStatus();
    if (command === 'equip armor') return actions.equipBestArmor();
    if (command === 'craft armor') return actions.craftBestAffordableArmor();
    if (command === 'craft iron armor') return actions.craftIronArmor();
    if (command === 'craft leather armor') return actions.craftLeatherArmor();
    if (command === 'craft diamond armor') {
      memory.update({
        pendingConfirmation: 'diamond_armor',
        pendingConfirmationExpiresAt: Date.now() + 60000
      });
      return actions.answerChat('I can craft diamond armour, but diamonds are valuable. Say "tj confirm diamond armor" to continue.');
    }
    if (command === 'confirm diamond armor') {
      const mem = memory.get();
      if (mem.pendingConfirmation === 'diamond_armor' && Date.now() < (mem.pendingConfirmationExpiresAt || 0)) {
        return actions.craftDiamondArmorConfirmed();
      }
      memory.update({ pendingConfirmation: null, pendingConfirmationExpiresAt: 0 });
      return actions.answerChat('No active diamond armour confirmation. Say "tj craft diamond armor" first.');
    }
    if (command.startsWith('craft ')) {
      const { itemName, count } = parseCraftRequest(command);
      return actions.craftItem(itemName, count, { direct: true });
    }
    if (command === 'survive') {
      await actions.answerChat('Survival mode is on. I will stay close and be careful.');
      return actions.surviveTick(perception());
    }
    if (command === 'what are you doing?' || command === 'what are you doing') return actions.status();
    if (command === 'help' || command === 'what can you do?' || command === 'what can you do' || command === 'show commands' || command === 'list commands' || command === 'commands') {
      return actions.help();
    }
    if (
      command === 'kit'
      || command === 'restock'
      || command === 'restock kit'
      || command === 'starter kit'
      || command === 'give kit'
      || command === 'outfit me'
      || command === 'gear me up'
    ) {
      return actions.applyStarterKit({ force: true });
    }

    if (isMiningPrepCommand(command)) return actions.createGoalFromTemplate('prepare_for_mining');
    if (command === 'prepare for night' || command === 'get ready for night') return actions.createGoalFromTemplate('prepare_for_night');
    if (command === 'build food security') return actions.createGoalFromTemplate('food_security');
    if (command === 'get iron gear') return actions.createGoalFromTemplate('get_iron_gear');
    if (
      command === 'progress to iron'
      || command === 'progress_to_iron'
      || command === 'iron age'
      || command === 'to iron'
      || command === 'run progress to iron'
    ) {
      if (typeof actions.runCoreMacro === 'function') {
        return actions.runCoreMacro({ name: 'progress_to_iron' }, { sender: username, rawText: message, source: 'chat_command' });
      }
      return actions.createGoalFromTemplate('progress_to_iron');
    }
    if (command === 'natural router status' || command === 'intent status') return actions.naturalRouterStatus();
    if (command === 'what did you think i meant' || command === 'explain last intent' || command === 'explain last route') return actions.explainLastIntent();
    if (command === 'clear pending intent') return actions.clearPendingIntent();
    if (command === 'natural examples') return actions.naturalExamples();
    if (command === 'learned commands' || command === 'command learning' || command === 'natural learning') return actions.naturalLearningStatus();
    if (command.startsWith('forget learned command ')) return actions.forgetLearnedMapping(command.replace(/^forget learned command\s+/, '').trim());
    if (command === 'competency' || command === 'what are you good at' || command === 'what needs testing') return actions.competencyStatus();
    if (command === 'shaky skills') return actions.shakySkills();
    if (command === 'reliable skills') return actions.reliableSkills();
    if (command === 'untested skills') return actions.untestedSkills();
    if (command === 'session events' || command === 'session log') return actions.sessionEvents();
    if (command === 'mode') return actions.interactionMode();
    if (command === 'careful mode') return actions.carefulMode();
    if (command === 'helper mode') return actions.helperMode();
    if (command === 'companion mode' || command === 'player 2 mode' || command === 'co op mode' || command === 'coop mode') return actions.companionMode();
    if (command === 'quiet mode') return actions.quietMode();
    if (command === 'explain mode') return actions.explainMode();
    if (command === 'test mode') return actions.testMode();
    if (command === 'learn commands on') return actions.learnCommandsOn();
    if (command === 'learn commands off') return actions.learnCommandsOff();
    if (command === 'test plan') return actions.testPlan('all');
    if (command === 'test natural commands') return actions.testPlan('natural_commands');
    if (command === 'test core helper') return actions.testPlan('core_helper');
    if (command === 'test survival basics') return actions.testPlan('survival_basics');
    if (command === 'test report') return actions.testReport();
    if (command === 'idle status' || command === 'idle autonomy status' || command === 'what were you about to do' || command === 'why did you say that') return actions.idleStatus();
    if (command === 'idle on') return actions.idleOn();
    if (command === 'idle off') return actions.idleOff();
    if (command === 'quiet idle') return actions.quietIdle();
    if (command === 'chatty idle') return actions.chattyIdle();
    if (command === "don't suggest that again" || command === 'dont suggest that again' || command === 'suggest that less') return actions.suppressIdleSuggestion();
    if (command === 'reset idle memory') return actions.resetIdleMemoryRequest();
    if (command === 'confirm reset idle memory') return actions.confirmResetIdleMemory();
    if (command.startsWith('natural test')) {
      const phrase = text.replace(/^natural test:?\s*/i, '').trim();
      return actions.naturalTest(phrase);
    }

    const registryCommand = findCommandAlias(`${config.botUsername || 'tj'} ${command}`);
    if (registryCommand && actions.hasAction(registryCommand.action)) {
      if (registryCommand.requiresConfirmation) {
        return actions.answerChat(`That command needs its normal confirmation flow first: ${registryCommand.aliases[0]}.`);
      }
      const result = await actions.executeAction(registryCommand.action, {}, { sender: username, rawText: message, command: registryCommand.name });
      if (result?.ok === false) return actions.answerChat(result.reason || result.message || 'That command failed.');
      return result;
    }

    if (isPraiseOrThanksCommand(command)) {
      return handleDialogue(bot, memory, null, {
        sender: username,
        rawText: message,
        cleanedText: text,
        isOwner: username === config.ownerUsername,
        addressedToBot: true,
        config
      });
    }

    const naturalRoute = await routeNaturalCommand(bot, memory, {
      sender: username,
      rawText: message,
      isOwner: username === config.ownerUsername,
      addressedToBot: true,
      config
    });
    const naturalResult = await dispatchNaturalRoute(username, message, naturalRoute);
    if (naturalResult) return naturalResult;

    const reply = await planner.answerChat(text, perception());
    if (Number(memory.get().lastManualStopAt || 0) >= commandStartedAt) {
      return { ok: false, reason: 'Suppressed stale planner reply after stop.', evidence: ['stop_requested'], data: {} };
    }
    return actions.answerChat(reply);
  }

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    const addressedToBot = detectBotAddressed(message, config.botAliases || ['tj']) || addressed(message);
    if (username === config.ownerUsername) {
      memory.update({ lastOwnerActivityAt: Date.now() });
      resetIdleTimer(memory, 'owner chat');
    }
    const messageContext = {
      sender: username,
      rawText: message,
      timestamp: Date.now(),
      isOwner: username === config.ownerUsername,
      isFriendly: (config.friendlyPlayers || []).includes(username),
      addressedToBot,
      botAliasUsed: addressedToBot ? 'tj' : null,
      currentTask: memory.get().currentTask || null,
      dangerState: null,
      config
    };

    (async () => {
      const parsed = await parseChatMessage(bot, memory, messageContext);
      if (parsed.type === 'ignore') return;

      if (parsed.type === 'command') {
        if (!messageContext.isOwner) {
          memory.update({ nonOwnerCommandAttempts: (memory.get().nonOwnerCommandAttempts || 0) + 1 });
          if (canRespondToPlayer(username, config) || addressedToBot) await actions.answerChat(handleNonOwnerCommand(username, message));
          return;
        }
        const routed = `${config.botUsername} ${parsed.command}`;
        return handleCommand(username, routed);
      }

      if (parsed.type === 'clarify') {
        if (messageContext.isOwner && addressedToBot) {
          const question = createDialogueClarification(bot, memory, parsed);
          await actions.answerChat(question);
        }
        return;
      }

      if (parsed.type === 'dialogue') {
        if (!messageContext.isOwner && !canRespondToPlayer(username, config)) return;
        if (messageContext.isOwner && addressedToBot) {
          const pendingScavenge = await handlePendingCraftScavenge(stripAddress(message).toLowerCase(), username);
          if (pendingScavenge) return pendingScavenge;
          const possibleCommand = stripAddress(message).toLowerCase();
          // Goal/work status must not fall into LLM chat.
          if (/^(what'?s?|what is)\s+(your\s+)?(current\s+)?goal|what are you (doing|working on)|current goal|goal status|^goals?$/.test(possibleCommand)) {
            return handleCommand(username, `${config.botUsername || 'tj'} ${possibleCommand}`);
          }
          if (findCommandAlias(`${config.botUsername || 'tj'} ${possibleCommand}`)) {
            return handleCommand(username, `${config.botUsername || 'tj'} ${possibleCommand}`);
          }
          if (isPraiseOrThanksCommand(possibleCommand)) {
            return handleDialogue(bot, memory, null, { ...messageContext, ...parsed });
          }
        }
        const naturalRoute = await routeNaturalCommand(bot, memory, { ...messageContext, ...parsed, rawText: message });
        const naturalResult = await dispatchNaturalRoute(username, message, naturalRoute);
        if (naturalResult) return naturalResult;
        return handleDialogue(bot, memory, null, { ...messageContext, ...parsed });
      }
    })().catch((error) => {
      if (error?.cancelled || error?.name === 'CancelledError') {
        actions.answerChat('Stopped.');
        return;
      }
      console.error(`[chat] ${error.stack || error.message}`);
      actions.answerChat(`I hit a chat error: ${error.message}`);
    });
  });
}
