import { classifyIntent } from './intentClassifier.js';
import {
  fuzzyMatchCommand,
  normalizeBotAliases,
  normalizeCommonTypos,
  normalizeMinecraftTerms,
  normalizePhonetic,
  normalizeSlang
} from './typoNormalizer.js';

const emergencyCommands = new Set([
  'stop',
  'stp',
  'stoop',
  'stap',
  'halt',
  'cancel',
  'cnacel',
  'freeze',
  'frze',
  'quit that',
  'stop doing that',
  'nvm',
  'nevermind',
  'never mind'
]);

const commandAliases = new Map([
  ['com here', 'come here'],
  ['come hear', 'come here'],
  ['cme here', 'come here'],
  ['folow me', 'follow me'],
  ['folo me', 'follow me'],
  ['stay neer me', 'follow me'],
  ['wher are you', 'where are you?'],
  ['where are you', 'where are you?'],
  ['wat are you doing', 'what are you doing?'],
  ['what are you doing', 'what are you doing?'],
  ['wat should we do next', 'what should we do next?'],
  ['what should we do next', 'what should we do next?'],
  ['wat shud we do next', 'what should we do next?'],
  ['what skills do you have', 'skills'],
  ['skill audit', 'skill audit'],
  ['unimplemented skills', 'unimplemented skills'],
  ['risky skills', 'risky skills'],
  ['active skill', 'active skill'],
  ['skill runner status', 'skill runner status'],
  ['cancel skill', 'cancel skill'],
  ['stop skill', 'stop skill'],
  ['skill stats', 'skill stats'],
  ['recent skills', 'recent skills'],
  ['evidence status', 'evidence status'],
  ['skill evidence', 'skill evidence'],
  ['recent evidence', 'recent evidence'],
  ['evidence audit', 'evidence audit'],
  ['evidence definitions', 'evidence definitions'],
  ['natural router status', 'natural router status'],
  ['intent status', 'intent status'],
  ['what did you think i meant', 'what did you think i meant'],
  ['explain last intent', 'explain last intent'],
  ['explain last route', 'explain last intent'],
  ['clear pending intent', 'clear pending intent'],
  ['natural examples', 'natural examples'],
  ['learned commands', 'learned commands'],
  ['command learning', 'command learning'],
  ['natural learning', 'natural learning'],
  ['competency', 'competency'],
  ['what are you good at', 'what are you good at'],
  ['what needs testing', 'what needs testing'],
  ['shaky skills', 'shaky skills'],
  ['reliable skills', 'reliable skills'],
  ['untested skills', 'untested skills'],
  ['session events', 'session events'],
  ['session log', 'session log'],
  ['mode', 'mode'],
  ['careful mode', 'careful mode'],
  ['helper mode', 'helper mode'],
  ['quiet mode', 'quiet mode'],
  ['explain mode', 'explain mode'],
  ['test mode', 'test mode'],
  ['learn commands on', 'learn commands on'],
  ['learn commands off', 'learn commands off'],
  ['test plan', 'test plan'],
  ['test natural commands', 'test natural commands'],
  ['test core helper', 'test core helper'],
  ['test survival basics', 'test survival basics'],
  ['test report', 'test report'],
  ['idle status', 'idle status'],
  ['idle autonomy status', 'idle status'],
  ['idle on', 'idle on'],
  ['idle off', 'idle off'],
  ['quiet idle', 'quiet idle'],
  ['chatty idle', 'chatty idle'],
  ['what were you about to do', 'what were you about to do'],
  ['why did you say that', 'why did you say that'],
  ["don't suggest that again", "don't suggest that again"],
  ['dont suggest that again', 'dont suggest that again'],
  ['suggest that less', 'suggest that less'],
  ['reset idle memory', 'reset idle memory'],
  ['confirm reset idle memory', 'confirm reset idle memory'],
  ['gear', 'gear status'],
  ['gear status', 'gear status'],
  ['best gear', 'best gear'],
  ['gear score', 'gear score'],
  ['upgrade status', 'upgrade status'],
  ['suggest gear upgrades', 'suggest gear upgrades'],
  ['next gear upgrade', 'next gear upgrade'],
  ['nether gear readiness', 'nether gear readiness'],
  ['enchanting status', 'enchanting status'],
  ['enchant status', 'enchanting status'],
  ['enchant options', 'enchant options'],
  ['enchant held item', 'enchant held item'],
  ['anvil status', 'anvil status'],
  ['repair status', 'anvil status'],
  ['potion status', 'potion status'],
  ['potions', 'potion status'],
  ['brewing status', 'brewing status'],
  ['brew fire resistance', 'brew fire resistance'],
  ['get fud', 'get food'],
  ['can you get food', 'get food'],
  ['make fud', 'make food'],
  ['get wud', 'get wood'],
  ['get irn', 'get iron'],
  ['mine irn', 'mine iron'],
  ['prepair for mining', 'prepare for mining'],
  ['prep for mining', 'prepare for mining'],
  ['prepair nether', 'prepare for nether'],
  ['prepare nether', 'prepare for nether'],
  ['plan nether', 'prepare for nether'],
  ['lite home', 'light home'],
  ['gard base', 'guard base'],
  ['armr', 'armor'],
  ['armer', 'armor'],
  ['mine cole', 'mine coal'],
  ['mine ston', 'mine stone'],
  ['gols', 'goals'],
  ['gole status', 'goal status'],
  ['improove base', 'improve base'],
  ['wat are you doin', 'what are you doing?'],
  ['wat r you doing', 'what are you doing?'],
  ['wat r u doing', 'what are you doing?'],
  ['what r u doing', 'what are you doing?'],
  ['wat shud we do nxt', 'what should we do next?']
]);

const fuzzyCommands = [
  'come here',
  'follow me',
  'stay',
  'where are you?',
  'what are you doing?',
  'what should we do next?',
  'skills',
  'skill status',
  'skill audit',
  'unimplemented skills',
  'risky skills',
  'active skill',
  'skill runner status',
  'cancel skill',
  'stop skill',
  'skill stats',
  'recent skills',
  'evidence status',
  'skill evidence',
  'recent evidence',
  'evidence audit',
  'evidence definitions',
  'natural router status',
  'intent status',
  'what did you think i meant',
  'explain last intent',
  'explain last route',
  'clear pending intent',
  'natural examples',
  'learned commands',
  'command learning',
  'natural learning',
  'competency',
  'what are you good at',
  'what needs testing',
  'shaky skills',
  'reliable skills',
  'untested skills',
  'session events',
  'session log',
  'mode',
  'careful mode',
  'helper mode',
  'quiet mode',
  'explain mode',
  'test mode',
  'learn commands on',
  'learn commands off',
  'test plan',
  'test natural commands',
  'test core helper',
  'test survival basics',
  'test report',
  'idle status',
  'idle autonomy status',
  'idle on',
  'idle off',
  'quiet idle',
  'chatty idle',
  'what were you about to do',
  'why did you say that',
  "don't suggest that again",
  'dont suggest that again',
  'suggest that less',
  'reset idle memory',
  'confirm reset idle memory',
  'gear status',
  'best gear',
  'gear score',
  'upgrade status',
  'suggest gear upgrades',
  'next gear upgrade',
  'nether gear readiness',
  'enchanting status',
  'enchant status',
  'enchant options',
  'enchant held item',
  'anvil status',
  'repair status',
  'potion status',
  'potions',
  'brewing status',
  'brew fire resistance',
  'what skills do you have',
  'get food',
  'make food',
  'get wood',
  'get iron',
  'prepare for mining',
  'prepare for nether',
  'light home',
  'guard base',
  'inventory',
  'armor',
  'mine coal',
  'mine stone',
  'goals',
  'goal status',
  'improve base',
  'nether checklist',
  'combat status',
  'map status',
  'farming status',
  'crafting status',
  'dialogue status',
  'talk mode on',
  'talk mode off',
  'banter on',
  'banter off',
  'personality',
  'who are you?',
  'who are you',
  'are you real?',
  'are you real',
  'are you alive?',
  'are you alive',
  'memories',
  'what do you remember',
  'what do you know about me'
];

const actionStart = /^(come|follow|stay|stop|cancel|halt|freeze|get|gather|mine|find|craft|make|build|place|return|scan|remember|forget|go|take|bring|drop|give|guard|defend|attack|fight|kill|slay|slaughter|flee|prepare|light|cook|eat|fish|hunt|plant|harvest|breed|lure|nether|portal|confirm|approve|reject|pause|resume|start|run|active|verify|evidence|natural|intent|suggest|complete|archive|delete|count|collect|equip|sleep|set|clear|gear|upgrade|enchant|enchanting|anvil|repair|combine|apply|rename|potion|potions|brew|brewing|mode|learn|competency|shaky|reliable|untested|test|companion|help)\b/;

function punctuationTrim(text) {
  return String(text || '').trim().replace(/[.!?;:\]\)\}]+$/g, '').trim();
}

export function normalizeMessage(text) {
  return punctuationTrim(String(text || '').replace(/\s+/g, ' '));
}

export function stripBotMention(text, aliases = ['tj']) {
  let output = normalizeMessage(text);
  const sorted = [...aliases, 'tj', '@tj', '!tj', 'teejay', 'tee jay', 't j']
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const alias of sorted) {
    const safe = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${safe}[,;:!\\s-]*`, 'i');
    if (pattern.test(output)) return normalizeMessage(output.replace(pattern, ''));
  }
  output = output.replace(/^!ai[,;:!\s-]*/i, '');
  return normalizeMessage(output);
}

export function detectBotAddressed(text, aliases = ['tj']) {
  const normalized = normalizeBotAliases(String(text || '').toLowerCase());
  const sorted = [...aliases, 'tj', '@tj', '!tj', 'teejay', 'tee jay', 't j', 'ai', 'bot']
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (/\btj\b/.test(normalized) && /[?]|what|where|why|how|are you|can you|do you/.test(normalized)) return true;
  return sorted.some((alias) => {
    const safe = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${safe}\\b|^${safe}[^a-z0-9]`, 'i').test(normalized);
  });
}

export function detectOwner(messageContext) {
  const config = messageContext.config || {};
  return messageContext.sender === config.ownerUsername;
}

export function typoNormalize(text) {
  return normalizeCommonTypos(normalizeMinecraftTerms(normalizeSlang(normalizePhonetic(text))));
}

export function exactCommandMatch(text) {
  const cleaned = punctuationTrim(text.toLowerCase());
  const normalized = typoNormalize(cleaned);
  if (commandAliases.has(cleaned)) return { command: commandAliases.get(cleaned), confidence: 1, source: 'alias' };
  if (commandAliases.has(normalized)) return { command: commandAliases.get(normalized), confidence: 1, source: 'alias' };
  if (fuzzyCommands.includes(cleaned)) return { command: cleaned, confidence: 1, source: 'exact' };
  if (fuzzyCommands.includes(normalized)) return { command: normalized, confidence: 1, source: 'exact' };
  return null;
}

export function fuzzyCommandMatch(text, threshold = 0.72) {
  const normalized = typoNormalize(text);
  if (commandAliases.has(normalized)) return { command: commandAliases.get(normalized), confidence: 1, source: 'alias' };
  const match = fuzzyMatchCommand(normalized, fuzzyCommands, threshold);
  return match ? { command: match.command, confidence: match.score, source: 'fuzzy' } : null;
}

export function classifyMessageType(text) {
  const normalized = typoNormalize(text);
  if (actionStart.test(normalized)) return 'action_intent';
  if (/^(what|where|why|how|who|are|do|can|should)\b/.test(normalized)) return 'question';
  if (/hello|hey|hi|thanks|thank you|sorry|good job|nice|joke|scary|close/.test(normalized)) return 'dialogue';
  return 'unknown';
}

export function extractQuantity(text) {
  const match = String(text || '').match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : null;
}

export function extractItemName(text) {
  const cleaned = typoNormalize(text).replace(/^(get|craft|make|mine|gather|bring me|give me|drop)\s+/, '');
  return cleaned.replace(/\b\d+\b/g, '').trim();
}

export function extractTargetName(text) {
  return typoNormalize(text).replace(/^(attack|fight|guard|defend|go to|take me to)\s+/, '').trim();
}

export function extractWaypointName(text) {
  const match = String(text || '').match(/(?:remember this(?: place)? as|mark this as|where is|go to|take me to)\s+(.+)$/i);
  return match ? punctuationTrim(match[1]) : '';
}

export function shouldAskClarification(result) {
  return result?.type === 'clarify' || (result?.confidence ?? 1) < 0.45;
}

export function createClarification(result) {
  if (result?.candidate) return `Did you mean "${result.candidate}"?`;
  return 'I am not sure which command you meant. Can you say it another way?';
}

export function routeParsedMessage(result) {
  return result;
}

function detectEmergency(cleaned, addressedToBot) {
  const normalized = typoNormalize(cleaned);
  if (addressedToBot && emergencyCommands.has(normalized)) return true;
  if (/^stop tj\b/i.test(cleaned)) return true;
  if (addressedToBot && /^stop( doing)? that/.test(normalized)) return true;
  return false;
}

function isPraiseOrThanks(cleaned) {
  return /^(good job|nice job|well done|great job|thanks|thank you|thx|ty|nice|good work)$/i.test(cleaned);
}

function isMiningPrepPhrase(normalized) {
  return /^(ready to mine|get ready to mine|get ready for mining|lets get ready for mining|let's get ready for mining|mining prep)$/.test(normalized);
}

export async function parseChatMessage(bot, memory, messageContext) {
  const config = bot.mcaiConfig || messageContext.config || {};
  const rawText = normalizeMessage(messageContext.rawText || '');
  if (!rawText || messageContext.sender === bot.username) return { type: 'ignore', reason: 'own_or_empty' };
  if (rawText.length > (config.ignoreChatLongerThan || 350)) return { type: 'ignore', reason: 'too_long' };

  const aliases = config.botAliases || ['tj'];
  const addressedToBot = messageContext.addressedToBot ?? detectBotAddressed(rawText, aliases);
  const stripped = addressedToBot ? stripBotMention(rawText, aliases) : rawText;
  const cleaned = punctuationTrim(stripped);
  const normalized = typoNormalize(cleaned);
  const isOwner = messageContext.isOwner ?? (messageContext.sender === config.ownerUsername);
  const hasPendingNaturalIntent = Boolean(isOwner && memory?.get?.().pendingNaturalCommandIntent);

  if (detectEmergency(cleaned, addressedToBot)) {
    return { type: 'command', command: 'stop', confidence: 1, emergency: true, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  if (!addressedToBot && !messageContext.important && !hasPendingNaturalIntent) {
    return { type: 'ignore', reason: 'not_addressed', addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  if (normalized.startsWith('remember this as ')) {
    return { type: 'command', command: `remember this as ${normalized.replace(/^remember this as\s+/, '')}`, confidence: 1, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  if (/^skill status(?:\s+.+)?$/.test(normalized)) {
    return { type: 'command', command: normalized, confidence: 1, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  if (/^(run skill|active skill|skill runner status|cancel skill|stop skill|skill stats|recent skills|skill history|evidence|skill evidence|recent evidence|recent skill evidence|last skill evidence|verify skill)(?:\s+.*)?$/.test(normalized)) {
    return { type: 'command', command: normalized, confidence: 1, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  // Retired curriculum/progression phrases still parse as commands so chat can give a friendly redirect.
  if (/\b(curriculum|milestone|milestones|progression|next milestone|what should we unlock|what are we missing|what have we accomplished|suggest next skill|what can you practice)\b/.test(normalized)) {
    return { type: 'command', command: normalized, confidence: 1, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  if (isMiningPrepPhrase(normalized)) {
    return { type: 'command', command: normalized, confidence: 1, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  if (isPraiseOrThanks(cleaned)) {
    return { type: 'dialogue', intent: { intent: 'social_acknowledgement', confidence: 1 }, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  const exact = exactCommandMatch(cleaned);
  if (exact) return { type: 'command', ...exact, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };

  if (/\b\d{1,3}\b/.test(normalized) && actionStart.test(normalized)) {
    return { type: 'command', command: normalized, confidence: 0.95, source: 'quantity_action', isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  const fuzzy = fuzzyCommandMatch(cleaned, config.fuzzyCommandThreshold || 0.72);
  if (fuzzy) return { type: 'command', ...fuzzy, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };

  const messageType = classifyMessageType(cleaned);
  if (messageType === 'action_intent') {
    return { type: 'command', command: normalized, confidence: 0.8, source: 'action_intent', isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  const intent = await classifyIntent(bot, memory, { ...messageContext, cleanedText: cleaned, normalizedText: normalized, isOwner, addressedToBot });
  if (intent.shouldExecuteAction && isOwner && intent.confidence >= (config.askClarificationThreshold || 0.45)) {
    return { type: 'command', command: intent.possibleCommand || normalized, confidence: intent.confidence, source: 'intent', isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  if (intent.needsClarification && intent.confidence < (config.askClarificationThreshold || 0.45) && actionStart.test(normalized)) {
    return { type: 'clarify', candidate: intent.possibleCommand, confidence: intent.confidence, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
  }

  return { type: 'dialogue', intent, isOwner, addressedToBot, cleanedText: cleaned, normalizedText: normalized };
}
