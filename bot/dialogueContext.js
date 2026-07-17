import * as conversationMemoryStore from './conversationMemory.js';
import { getPersonalityProfile } from './personality.js';

function posText(pos) {
  if (!pos) return 'unknown';
  return `${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;
}

function itemCount(bot, names) {
  const wanted = new Set(Array.isArray(names) ? names : [names]);
  return bot.inventory.items()
    .filter((item) => wanted.has(item.name))
    .reduce((sum, item) => sum + item.count, 0);
}

export function getWorldContextSummary(bot, memory, mapMemory) {
  const mem = memory.get ? memory.get() : memory;
  const home = mem.homeBasePosition ? `home at ${posText(mem.homeBasePosition)}` : 'no home set';
  const dimension = bot.game?.dimension || 'unknown';
  const position = posText(bot.entity?.position);
  const knownPlaces = (mapMemory?.waypoints || []).slice(0, 5).map((wp) => `${wp.name}:${wp.type}`).join(', ') || 'none nearby';
  return `position ${position}, dimension ${dimension}, ${home}, known places ${knownPlaces}`;
}

export function getTaskContextSummary(memory) {
  const mem = memory.get ? memory.get() : memory;
  const task = mem.currentTask || mem.activeResourceRun || mem.activeMiningExpedition || mem.activeExploration || null;
  if (!task) return 'idle';
  if (typeof task === 'string') return task;
  return task.name || task.type || task.resourceType || task.mode || 'active task';
}

export function getGoalContextSummary(memory) {
  const mem = memory.get ? memory.get() : memory;
  if (!mem.activeGoalId) return 'no active goal';
  return `active goal ${mem.activeGoalId}${mem.activeGoalStepId ? ` step ${mem.activeGoalStepId}` : ''}`;
}

export function getSafetyContextSummary(bot, memory) {
  const health = bot.health ?? 20;
  const food = bot.food ?? 20;
  const mem = memory.get ? memory.get() : memory;
  const mood = mem.currentMood || 'calm';
  const danger = [];
  if (health <= 8) danger.push('low health');
  if (food <= 8) danger.push('low food');
  if ((mem.combatMode || 'off') !== 'off') danger.push('combat mode');
  if (mem.netherScoutActive) danger.push('nether task');
  return `health ${health}/20, food ${food}/20, mood ${mood}, dangers ${danger.join(', ') || 'none obvious'}`;
}

export function getRelationshipContextSummary(conversationMemory, sender) {
  const profile = conversationMemory.playerProfiles?.[sender] || {};
  const preferences = Array.isArray(profile.preferences) ? profile.preferences.slice(0, 3).join(', ') : '';
  return `${sender}: ${profile.trust || 'unknown'}${preferences ? `, preferences ${preferences}` : ''}`;
}

export function getRelevantMemorySummary(conversationMemory, messageContext) {
  return conversationMemoryStore.summarizeRelevantMemories({
    query: messageContext.rawText || messageContext.text || '',
    rawText: messageContext.rawText || messageContext.text || ''
  }) || 'none';
}

export function getNearbyContext(bot) {
  const hostiles = Object.values(bot.entities || {})
    .filter((entity) => entity.type === 'mob' && bot.entity?.position?.distanceTo(entity.position) <= 24)
    .slice(0, 5)
    .map((entity) => entity.name)
    .join(', ') || 'none seen';
  return `nearby mobs ${hostiles}`;
}

export function getInventoryContext(bot) {
  const food = itemCount(bot, ['cooked_beef', 'bread', 'apple', 'cooked_porkchop', 'cooked_chicken']);
  const torches = itemCount(bot, 'torch');
  const coal = itemCount(bot, ['coal', 'charcoal']);
  return `food items ${food}, torches ${torches}, coal/charcoal ${coal}`;
}

export function getLocationContext(bot, memory, mapMemory) {
  const mem = memory.get ? memory.get() : memory;
  const position = bot.entity?.position;
  const nearest = (mapMemory?.waypoints || [])
    .map((wp) => ({
      ...wp,
      distance: position ? Math.hypot(wp.position.x - position.x, wp.position.y - position.y, wp.position.z - position.z) : Infinity
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance < 32
    ? `near ${nearest.name} (${Math.round(nearest.distance)} blocks)`
    : `at ${posText(position)}${mem.homeBasePosition ? `, home ${posText(mem.homeBasePosition)}` : ''}`;
}

export function buildDialogueContext(bot, memory, mapMemory, conversationMemory, messageContext) {
  const config = bot.mcaiConfig || {};
  return {
    botName: config.botUsername || bot.username || 'tj',
    ownerName: config.ownerUsername || 'ModVinny',
    sender: messageContext.sender,
    isOwner: Boolean(messageContext.isOwner),
    addressedToBot: Boolean(messageContext.addressedToBot),
    personality: getPersonalityProfile(config),
    world: getWorldContextSummary(bot, memory, mapMemory),
    task: getTaskContextSummary(memory),
    goal: getGoalContextSummary(memory),
    safety: getSafetyContextSummary(bot, memory),
    relationship: getRelationshipContextSummary(conversationMemory, messageContext.sender),
    relevantMemories: getRelevantMemorySummary(conversationMemory, messageContext),
    nearby: getNearbyContext(bot),
    inventory: getInventoryContext(bot),
    location: getLocationContext(bot, memory, mapMemory),
    recentConversation: conversationMemory.recentTurns?.slice(0, config.maxDialogueContextMessages || 10) || [],
    restrictions: 'Only ModVinny can command actions. Dialogue never executes raw movement, dig, attack, place, chest, or portal actions.'
  };
}

