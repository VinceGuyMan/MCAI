import { buildDialogueContext } from './dialogueContext.js';
import { postProcessPersonality, applyPersonalityToPrompt, getSpeechRules, getToneRules } from './personality.js';
import { enforceNoActionExecution, sanitizeDialogueOutput } from './dialogueSafety.js';
import { llm } from './logger.js';
import { callOllama } from './ollama.js';
import { isLlmDialogueAllowed } from './llmMode.js';

export const DIALOGUE_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['reply', 'answer_question', 'clarify', 'acknowledge', 'decline', 'joke', 'status', 'memory', 'none']
    },
    speak: { type: 'string' },
    mood: {
      type: 'string',
      enum: ['neutral', 'friendly', 'focused', 'cautious', 'excited', 'concerned', 'playful', 'tired', 'confused']
    },
    shouldSaveMemory: { type: 'boolean' },
    memoryCandidate: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarificationQuestion: { type: 'string' }
  },
  required: ['intent', 'speak', 'mood', 'shouldSaveMemory', 'memoryCandidate', 'needsClarification', 'clarificationQuestion'],
  additionalProperties: false
};

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractJsonObject(text) {
  const clean = stripThinking(text);
  const first = clean.indexOf('{');
  if (first === -1) throw new Error('no JSON object found');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = first; i < clean.length; i++) {
    const ch = clean[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return clean.slice(first, i + 1);
  }
  throw new Error('unterminated JSON object');
}

function trimReply(text, maxLength) {
  const clean = sanitizeDialogueOutput(text);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function buildDialoguePrompt(context) {
  const rules = [...getToneRules(), ...getSpeechRules()].join(' ');
  const prompt = [
    `You are ${context.botName}, a local Minecraft companion bot for ${context.ownerName}.`,
    rules,
    `Sender: ${context.sender}. Owner: ${context.isOwner ? 'yes' : 'no'}.`,
    `World: ${context.world}.`,
    `Task: ${context.task}. Goal: ${context.goal}.`,
    `Safety: ${context.safety}. Nearby: ${context.nearby}. Inventory: ${context.inventory}. Location: ${context.location}.`,
    `Relevant memory: ${context.relevantMemories}. Relationship: ${context.relationship}.`,
    `Restrictions: ${context.restrictions}`,
    'You understand casual chat and simple task talk. Reliable actions include: come here, follow me, stay, status, get wood/stone/coal/iron, dig dirt/sand/gravel/clay, get food, craft basic/stone/iron tools, smelt iron, smelt charcoal, craft furnace/table/torches, eat, set/return home, place chest, make camp, light home, finish last job, help.',
    'You ARE a mining and food companion for iron-tier-and-below blocks and edible foods — never say you are not a mining bot or cannot get food.',
    'Iron-age path: wood → craft table + basic tools → stone → furnace → charcoal or coal → torches → mine iron → smelt iron → craft iron tools. Or say "progress to iron" / "iron age" for the full macro. Charcoal is smelted from logs (not mined). You do not dig custom tunnels/holes or auto-mine diamonds/netherite.',
    'Return only schema JSON. The speak field must be safe Minecraft chat text (1–2 short sentences, max ~280 chars).'
  ].join('\n');
  return applyPersonalityToPrompt(prompt, context.personality);
}

export function parseDialogueModelOutput(output) {
  const parsed = JSON.parse(extractJsonObject(output));
  return enforceNoActionExecution({
    intent: typeof parsed.intent === 'string' ? parsed.intent : 'none',
    speak: typeof parsed.speak === 'string' ? parsed.speak : '',
    mood: typeof parsed.mood === 'string' ? parsed.mood : 'neutral',
    shouldSaveMemory: Boolean(parsed.shouldSaveMemory),
    memoryCandidate: typeof parsed.memoryCandidate === 'string' ? parsed.memoryCandidate : '',
    needsClarification: Boolean(parsed.needsClarification),
    clarificationQuestion: typeof parsed.clarificationQuestion === 'string' ? parsed.clarificationQuestion : ''
  });
}

export function fallbackDialogueReply(messageContext = {}) {
  const text = String(messageContext.rawText || messageContext.text || '').toLowerCase();
  if (/hello|hi|hey|you there/.test(text)) return { intent: 'reply', speak: 'Hey ModVinny. I am here and ready.', mood: 'friendly', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  if (/thank|thx|ty/.test(text)) return { intent: 'acknowledge', speak: 'Anytime. I am still watching the situation.', mood: 'friendly', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  if (/good job|nice|well done|great job/.test(text)) return { intent: 'acknowledge', speak: 'Thanks. I like when a plan survives contact with Minecraft.', mood: 'playful', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  if (/are you (real|alive|conscious)|do you have feelings/.test(text)) return { intent: 'answer_question', speak: "I'm a local Minecraft AI companion, not a human or conscious, but I can help and keep track of what we are doing.", mood: 'friendly', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  if (/creeper/.test(text)) return { intent: 'reply', speak: "Creepers make me cautious. I prefer distance, shields, and not becoming a crater.", mood: 'cautious', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  if (/what are you doing|why are you doing/.test(text)) return { intent: 'status', speak: 'I am checking my current task and keeping safety first.', mood: 'focused', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  if (/what can you (do|help)|show commands|help me|capabilities/.test(text)) {
    return { intent: 'answer_question', speak: 'I can come here, follow, dig dirt/sand/gravel/clay, get food/bread/steak, gather wood/stone/coal/iron, set home, place a chest, make camp, light home, and chat. Say "tj help" for command groups.', mood: 'friendly', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  }
  if (/\bwhat (blocks|materials|resources) (do you|can you)\b/.test(text) || /known blocks|block list|what can you (mine|dig)/.test(text)) {
    return { intent: 'answer_question', speak: 'I know iron-down blocks: dirt, sand, gravel, clay, wood, stone, coal, and iron. Say "get 16 dirt" or "dig sand" and I will collect them.', mood: 'friendly', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  }
  if (/\bwhat (food|foods|meals?) (do you|can you)\b/.test(text) || /known foods?|food list|what can you (eat|hunt|cook)/.test(text)) {
    return { intent: 'answer_question', speak: 'I know bread, steak, pork, chicken, mutton, fish, apples, carrots, potatoes, berries, cookies, pie, stew, honey, and more. Say "get food", "get bread", or "need steak".', mood: 'friendly', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  }
  if (/\bdiamonds?\b/.test(text)) {
    return { intent: 'answer_question', speak: 'I do not auto-mine diamonds yet — too risky deep underground. Coal or iron first, or say come here and I will stick with you.', mood: 'cautious', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  }
  if (/\b(custom\s+)?(hole|tunnel|shaft)\b/.test(text) && /\b(dig|mine|make|carve)\b/.test(text)) {
    return { intent: 'answer_question', speak: 'I do not dig custom tunnels or holes yet. I can dig dirt, sand, gravel, or clay as blocks, or mine wood/stone/coal/iron.', mood: 'friendly', shouldSaveMemory: false, memoryCandidate: '', needsClarification: false, clarificationQuestion: '' };
  }
  return { intent: 'reply', speak: 'I heard you. Try "come here", "get food", "dig dirt", "get wood", "mine coal", "status", "finish last job", or "help" if you want me to act.', mood: 'confused', shouldSaveMemory: false, memoryCandidate: '', needsClarification: true, clarificationQuestion: 'Want chat, status, or a task like food/dirt/wood?' };
}

async function callDialogueModel(config, messages, temperature, timeoutMs) {
  const result = await callOllama({
    config,
    role: 'dialogue',
    messages,
    schema: DIALOGUE_SCHEMA,
    json: true,
    options: { temperature, numPredict: 180, timeoutMs }
  });
  if (!result.ok) throw result.error || new Error(result.reason || 'Dialogue model failed');
  return result.content;
}

export async function generateDialogueReply(bot, memory, mapMemory, messageContext, options = {}) {
  const config = bot.mcaiConfig || {};
  const maxLength = config.maxChatResponseLength || 280;
  const conversationMemory = options.conversationMemory || { recentTurns: [], memoryFacts: [], playerProfiles: {} };
  // Code-first: when LLM is off or dialogue not allowed, use canned replies only.
  if (!isLlmDialogueAllowed(config)) {
    const fallback = fallbackDialogueReply(messageContext);
    return { ...fallback, speak: trimReply(fallback.speak, maxLength) };
  }
  const context = buildDialogueContext(bot, memory, mapMemory, conversationMemory, messageContext);
  const prompt = buildDialoguePrompt(context);

  try {
    const raw = await callDialogueModel(
      config,
      [
        { role: 'system', content: prompt },
        { role: 'user', content: String(messageContext.rawText || '').slice(0, config.ignoreChatLongerThan || 350) }
      ],
      options.temperature ?? 0.7,
      options.timeoutMs || config.llmDialogueTimeoutMs || 120000
    );
    const parsed = parseDialogueModelOutput(raw);
    const spoken = parsed.needsClarification && parsed.clarificationQuestion
      ? parsed.clarificationQuestion
      : parsed.speak;
    return {
      ...parsed,
      speak: postProcessPersonality(trimReply(spoken, maxLength), { maxLength })
    };
  } catch (error) {
    llm(`[dialogue] model fallback: ${String(error.message).slice(0, 200)}`);
    const fallback = fallbackDialogueReply(messageContext);
    return { ...fallback, speak: trimReply(fallback.speak, maxLength) };
  }
}

export async function generateStatusAwareReply(bot, memory, mapMemory, messageContext) {
  return generateDialogueReply(bot, memory, mapMemory, messageContext, { temperature: 0.2 });
}

export async function generateShortAnswer(bot, memory, messageContext) {
  return generateDialogueReply(bot, memory, null, messageContext, { temperature: 0.2 });
}

export function generateClarifyingQuestion(bot, memory, parseResult) {
  const command = parseResult?.candidate || parseResult?.command;
  return command
    ? `Did you mean "${command}"?`
    : 'I am not sure which command you meant. Can you say it another way?';
}

export function generateTaskComment(bot, memory, event) {
  if (event?.type === 'completed') return 'Done. That worked.';
  if (event?.type === 'failed') return `I could not finish that. Reason: ${event.reason || 'unknown'}.`;
  return 'On it.';
}

export function generateEventReaction(bot, memory, event) {
  if (event?.type === 'danger') return 'Careful. I see danger nearby.';
  if (event?.type === 'low_health') return 'I am hurt. Backing off.';
  if (event?.type === 'low_food') return 'I am getting hungry. Looking for food.';
  return '';
}

export async function generateIdleBanter(bot, memory, context) {
  const lines = [
    'Base is quiet right now. I like quiet.',
    'Torches make everything feel less doomed.',
    'I am still here, ModVinny.',
    'If we mine later, I would like more food first.',
    'I am watching the tree line.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}
