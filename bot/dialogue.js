import * as mapMemoryStore from './mapMemory.js';
import {
  addConversationTurn,
  addMemoryFact,
  extractMemoryCandidate,
  loadConversationMemory,
  saveConversationMemory,
  searchMemoryFacts,
  shouldSaveMemory
} from './conversationMemory.js';
import { generateDialogueReply, generateClarifyingQuestion, fallbackDialogueReply } from './responseGenerator.js';
import { checkDialogueSafety, createSafeRefusal, sanitizeDialogueOutput } from './dialogueSafety.js';

function trimForChat(text, config) {
  const max = config.maxChatResponseLength || 280;
  const clean = sanitizeDialogueOutput(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3)).trim()}...`;
}

export function sendDialogue(bot, memory, text, options = {}) {
  const config = bot.mcaiConfig || {};
  const mem = memory.get();
  const now = Date.now();
  if (!options.allowAfterStop && options.startedAt && Number(mem.lastManualStopAt || 0) >= Number(options.startedAt)) return false;
  if (!options.force && now - (mem.lastDialogueAt || 0) < (config.dialogueCooldownMs || 1800)) return false;
  const message = trimForChat(text, config);
  if (!message) return false;
  memory.update({
    lastDialogueAt: now,
    lastDialogueSender: options.sender || null,
    lastDialogueTopic: options.topic || null
  });
  bot.chat(message);
  return true;
}

export function shouldRespondToMessage(bot, memory, messageContext) {
  const config = bot.mcaiConfig || {};
  const mem = memory.get();
  if (!config.dialogueEnabled && !config.lifelikeDialogueEnabled) return false;
  if (mem.talkModeEnabled === false) return false;
  if (messageContext.isOwner && messageContext.addressedToBot) return true;
  if (messageContext.isFriendly && config.chatWithFriendlyPlayers && messageContext.addressedToBot) return true;
  return Boolean(config.respondToAllPlayers && messageContext.addressedToBot);
}

export function handleGreeting(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'Hey ModVinny. I am here.', { sender: messageContext.sender, topic: 'greeting' });
}

export function handleThanks(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'Anytime. I am still watching the situation.', { sender: messageContext.sender, topic: 'thanks' });
}

export function handlePraise(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'Thanks. I like when a plan survives contact with Minecraft.', { sender: messageContext.sender, topic: 'praise' });
}

export function handleApology(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'You are good. I am still with you.', { sender: messageContext.sender, topic: 'apology' });
}

export function handleCorrection(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'Got it. I will adjust.', { sender: messageContext.sender, topic: 'correction' });
}

export function handleConfusion(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'I might need that said another way before I do anything risky.', { sender: messageContext.sender, topic: 'confusion' });
}

export function handleJokeOrBanter(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'I am pro-torch, anti-lava, and cautiously optimistic.', { sender: messageContext.sender, topic: 'banter' });
}

export function handleOwnerEmotion(bot, memory, messageContext) {
  return sendDialogue(bot, memory, 'That was close. I am staying cautious.', { sender: messageContext.sender, topic: 'emotion' });
}

export function handleUnknownMessage(bot, memory, messageContext) {
  const fallback = fallbackDialogueReply(messageContext);
  return sendDialogue(bot, memory, fallback.speak, { sender: messageContext.sender, topic: 'unknown' });
}

export async function handleQuestion(bot, memory, mapMemory, messageContext) {
  return handleCasualDialogue(bot, memory, mapMemory, messageContext);
}

export async function handleCasualDialogue(bot, memory, mapMemory, messageContext) {
  const startedAt = Date.now();
  const conversationMemory = loadConversationMemory();
  const result = await generateDialogueReply(bot, memory, mapMemory, messageContext, { conversationMemory });
  const spoken = result.needsClarification && result.clarificationQuestion ? result.clarificationQuestion : result.speak;
  const sent = sendDialogue(bot, memory, spoken, { sender: messageContext.sender, topic: result.intent || 'dialogue', startedAt });
  if (!sent) return { ...result, suppressed: true, suppressReason: 'manual_stop_or_cooldown' };
  addConversationTurn(messageContext.sender, messageContext.rawText, spoken, { intent: result.intent, mood: result.mood });
  if (shouldSaveMemory(messageContext.rawText, result) && result.memoryCandidate) {
    addMemoryFact({
      text: result.memoryCandidate,
      type: 'custom',
      createdBy: messageContext.sender,
      source: 'chat'
    });
  }
  return result;
}

export async function handleDialogue(bot, memory, mapMemory = null, messageContext) {
  if (!shouldRespondToMessage(bot, memory, messageContext)) return null;

  const safety = checkDialogueSafety(messageContext);
  if (safety.refuse) {
    const refusal = createSafeRefusal(safety.reason);
    sendDialogue(bot, memory, refusal, { sender: messageContext.sender, topic: 'refusal', force: true });
    addConversationTurn(messageContext.sender, messageContext.rawText, refusal, { intent: 'decline', reason: safety.reason });
    if (safety.reason === 'prompt_injection') memory.update({ lastPromptInjectionAttemptAt: Date.now() });
    return { intent: 'decline', speak: refusal };
  }

  const text = String(messageContext.cleanedText || messageContext.rawText || '').toLowerCase();
  if (/^(hello|hi|hey|you there)\b/.test(text)) return handleGreeting(bot, memory, messageContext);
  if (/thank|thanks|thx|ty\b/.test(text)) return handleThanks(bot, memory, messageContext);
  if (/good job|nice|well done/.test(text)) return handlePraise(bot, memory, messageContext);
  if (/sorry|my bad/.test(text)) return handleApology(bot, memory, messageContext);
  if (/that was close|that was scary|i am scared|im scared/.test(text)) return handleOwnerEmotion(bot, memory, messageContext);

  const loadedMapMemory = mapMemory || (bot.mcaiConfig?.mapMemoryEnabled ? mapMemoryStore.loadMapMemory() : null);
  return handleCasualDialogue(bot, memory, loadedMapMemory, messageContext);
}

export function rememberConversationFact(bot, memory, text, sender = 'ModVinny') {
  const entry = addMemoryFact({
    text: extractMemoryCandidate(text),
    type: 'owner_preference',
    createdBy: sender,
    source: 'chat',
    importance: 'normal'
  });
  return entry;
}

export function listConversationMemories(query = '') {
  return searchMemoryFacts(query);
}

export function clearConversationMemory() {
  const fresh = {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    recentTurns: [],
    memoryFacts: [],
    playerProfiles: {},
    botSelfNotes: [],
    relationshipNotes: [],
    conversationStats: {}
  };
  return saveConversationMemory(fresh);
}

export function createClarification(bot, memory, parseResult) {
  return generateClarifyingQuestion(bot, memory, parseResult);
}
