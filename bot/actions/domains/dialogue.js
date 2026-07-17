/**
 * Dialogue / personality / conversation memory handlers.
 */
import * as conversationMemory from '../../conversationMemory.js';
import * as personality from '../../personality.js';

export function createDialogueHandlers(ctx) {
  const {
    bot,
    config,
    memory,
    say
  } = ctx;

  async function answerChat(text) {
    const message = text || 'Yep.';
    say(message, true);
    return { ok: true, message, evidence: ['dialogue_reply_sent'], data: {} };
  }

  async function dialogueStatus() {
    const mem = memory.get();
    const facts = conversationMemory.searchMemoryFacts('');
    say(`Dialogue: ${config.lifelikeDialogueEnabled ? 'on' : 'off'}, talk ${mem.talkModeEnabled !== false ? 'on' : 'off'}, banter ${mem.banterEnabled !== false ? 'on' : 'off'}, mood ${mem.currentMood || 'calm'}, memories ${facts.length}.`, true);
  }

  async function setTalkMode(enabled, options = {}) {
    memory.update({
      talkModeEnabled: Boolean(enabled),
      ambientDialogueEnabled: Boolean(enabled),
      ...(options.chattyLevel ? { chattyLevel: options.chattyLevel } : {}),
      ...(options.responseLengthPreference ? { responseLengthPreference: options.responseLengthPreference } : {})
    });
    const parts = [`talk mode ${enabled ? 'on' : 'off'}`];
    if (options.chattyLevel) parts.push(`chatty level ${options.chattyLevel}`);
    if (options.responseLengthPreference) parts.push(`answers ${options.responseLengthPreference}`);
    say(`Okay. ${parts.join(', ')}.`, true);
  }

  async function setBanterMode(enabled) {
    memory.update({ banterEnabled: Boolean(enabled) });
    say(`Banter ${enabled ? 'on' : 'off'}.`, true);
  }

  async function personalityStatus(prompt = '') {
    const profile = personality.getPersonalityProfile(config);
    const lower = String(prompt || '').toLowerCase();
    if (/are you (real|alive|conscious)|feelings/.test(lower)) {
      say("I'm a local Minecraft AI companion, not a human or conscious, but I can help and keep track of what we are doing.", true);
      return;
    }
    say(`${profile.name}: ${profile.role}. Tone: ${profile.tone}. Priorities: safety, survival, useful plans, and not wasting diamonds.`, true);
  }

  async function conversationMemoryStatus(query = '') {
    const facts = conversationMemory.searchMemoryFacts(query);
    if (facts.length === 0) {
      say('I do not have any conversation memories saved yet.', true);
      return;
    }
    say(`I remember: ${facts.slice(0, 5).map((fact) => `${fact.id}: ${fact.text}`).join(' | ')}`, true);
  }

  async function rememberConversationFactAction(text) {
    const entry = conversationMemory.addMemoryFact({
      text,
      type: 'owner_preference',
      createdBy: config.ownerUsername,
      source: 'chat',
      importance: 'normal'
    });
    say(entry ? `Remembered: ${entry.text}` : 'I could not save that memory.', true);
  }

  async function forgetConversationFactAction(query) {
    if (!query) {
      say('Tell me which memory to forget.', true);
      return;
    }
    const removed = conversationMemory.forgetMemoryFact(query);
    say(removed > 0 ? `Forgot ${removed} matching memory item${removed === 1 ? '' : 's'}.` : 'I did not find a matching memory.', true);
  }

  async function clearConversationMemoryConfirmed() {
    const pending = memory.get().pendingClearConversationMemoryConfirmation;
    if (!pending || Date.now() > (pending.expiresAt || 0)) {
      memory.update({ pendingClearConversationMemoryConfirmation: null });
      say('No active clear-memory confirmation.', true);
      return;
    }
    conversationMemory.saveConversationMemory({
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      recentTurns: [],
      memoryFacts: [],
      playerProfiles: {},
      botSelfNotes: [],
      relationshipNotes: [],
      conversationStats: {}
    });
    memory.update({ pendingClearConversationMemoryConfirmation: null });
    say('Conversation memory cleared.', true);
  }

  async function answerDialogue(text) {
    say(text || 'I heard you.', true);
  }

  async function askClarification(text) {
    say(text || 'Can you say that another way?', true);
  }


  return {
    answerChat,
    dialogueStatus,
    setTalkMode,
    setBanterMode,
    personalityStatus,
    conversationMemoryStatus,
    rememberConversationFactAction,
    forgetConversationFactAction,
    clearConversationMemoryConfirmed,
    answerDialogue,
    askClarification
  };
}
