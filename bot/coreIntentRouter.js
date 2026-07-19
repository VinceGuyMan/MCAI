import { getCoreMacro, normalizeCoreMacroName } from './coreMacros.js';
import { isInformationalOwnerQuery } from './thinCore.js';

function stripBot(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[']/g, '')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/^@?tj\b\s*/i, '')
    .replace(/^!tj\b\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function route(intent, macroName, confidence, reason, extras = {}) {
  const macro = getCoreMacro(macroName);
  return {
    ok: Boolean(macro),
    mode: extras.mode || 'execute',
    confidence,
    intent,
    macroName: macro?.name || normalizeCoreMacroName(macroName),
    canonicalCommand: macro ? `tj run core ${macro.name.replace(/_/g, ' ')}` : null,
    riskLevel: macro?.riskLevel || 'unknown',
    requiresConfirmation: Boolean(macro?.requiresConfirmation),
    reason,
    alternatives: extras.alternatives || [],
    speak: extras.speak || '',
    source: 'competent_core'
  };
}

function clarify(intent, reason, alternatives, speak = '') {
  return {
    ok: false,
    mode: 'clarify',
    confidence: 0.62,
    intent,
    macroName: null,
    canonicalCommand: null,
    riskLevel: 'low',
    requiresConfirmation: false,
    reason,
    alternatives,
    speak: speak || `I can do that a few ways: ${alternatives.map((item) => item.label).join(', ')}. Which one?`,
    source: 'competent_core'
  };
}

const CORE_PATTERNS = [
  { intent: 'get_food', macro: 'get_food', confidence: 0.96, pattern: /\b(we need|need|get|find|gather|grab).{0,16}\b(food|something to eat|snack|eat)\b|\b(food run)\b/ },
  { intent: 'gather_wood', macro: 'gather_wood', confidence: 0.96, pattern: /\b(get|gather|collect|find|need).{0,16}\b(wood|logs?|tree)\b/ },
  { intent: 'mine_coal', macro: 'mine_coal', confidence: 0.95, pattern: /\b(get|mine|find|collect|need).{0,16}\b(coal)\b/ },
  { intent: 'smelt_charcoal', macro: 'smelt_charcoal', confidence: 0.95, pattern: /\b(make|smelt|need|get).{0,12}\bcharcoal\b/ },
  { intent: 'smelt_iron', macro: 'smelt_iron', confidence: 0.94, pattern: /\b(smelt).{0,16}\b(iron|raw iron|iron ore)\b|\b(make|need).{0,12}\biron ingots?\b/ },
  { intent: 'mine_iron', macro: 'mine_iron', confidence: 0.93, pattern: /\b(get|mine|find|collect|need).{0,16}\b(iron|raw iron)\b/ },
  { intent: 'mine_stone', macro: 'mine_stone', confidence: 0.93, pattern: /\b(get|mine|gather|collect|need).{0,16}\b(stone|cobble|cobblestone)\b/ },
  { intent: 'progress_to_iron', macro: 'progress_to_iron', confidence: 0.96, pattern: /\b(progress to iron|iron age|get to iron|path to iron|to iron tools|work toward iron)\b/ },
  { intent: 'prepare_for_mining', macro: 'prepare_for_mining', confidence: 0.96, pattern: /\b(ready|prepare|get ready|prep).{0,24}\b(mining|mine)\b|\blets get ready for mining\b/ },
  { intent: 'prepare_for_night', macro: 'prepare_for_night', confidence: 0.92, pattern: /\b(ready|prepare|get ready|prep).{0,24}\b(night|dark)\b/ },
  { intent: 'come_here', macro: 'come_here', confidence: 0.96, pattern: /\b(come here|come to me|come back|return to me)\b/ },
  { intent: 'follow_owner', macro: 'follow_owner', confidence: 0.96, pattern: /\b(follow me|follow owner|stay with me)\b/ },
  { intent: 'stay', macro: 'stay', confidence: 0.96, pattern: /\b(stay here|stay|hold position|stop following)\b/ },
  { intent: 'return_home', macro: 'return_home', confidence: 0.92, pattern: /\b(go home|return home|back to base|return to base)\b/ },
  { intent: 'store_items', macro: 'store_items', confidence: 0.92, pattern: /\b(put|store|deposit).{0,16}\b(stuff|items|inventory|things|all)\b|\b(store|put away|deposit)\s+all\b|\bdeposit inventory\b/ },
  { intent: 'craft_basic_tools', macro: 'craft_basic_tools', confidence: 0.9, pattern: /\b(craft|make).{0,16}\b(basic tools|wooden tools|wood tools|tools)\b/ },
  { intent: 'craft_stone_tools', macro: 'craft_stone_tools', confidence: 0.9, pattern: /\b(craft|make).{0,16}\bstone tools\b/ },
  { intent: 'craft_iron_tools', macro: 'craft_iron_tools', confidence: 0.9, pattern: /\b(craft|make).{0,16}\biron tools\b/ },
  { intent: 'recover', macro: 'recover', confidence: 0.95, pattern: /\b(recover|fix yourself|get unstuck|reset yourself)\b/ },
  { intent: 'status_check', macro: 'status_check', confidence: 0.9, pattern: /\b(status|check yourself|how are you|what can you do)\b/ }
];

export function classifyCoreIntent(text, context = {}) {
  const normalized = stripBot(text);
  if (!normalized) return null;

  // Questions go to thin-core knowledge / dialogue — never auto-run macros.
  if (isInformationalOwnerQuery(text)) return null;

  if (/\biron\s+(gear|armor|armour|tools?|sword|pickaxe|axe|shovel|hoe)\b/.test(normalized)) return null;
  if (/\b(plugin|plugins|mineflayer|wrapper|wrappers|pathfinder|collectblock|collect block|tool plugin)\b/.test(normalized)) return null;

  // Resolve specific multi-step/tool requests before the broader "get iron"
  // and "make tools" patterns below.
  if (/\b(progress to iron|iron age|get to iron|path to iron|to iron tools|work toward iron)\b/.test(normalized)) {
    return route('progress_to_iron', 'progress_to_iron', 0.96, 'Matched competent core pattern: progress_to_iron.');
  }
  if (/\b(craft|make).{0,16}\bstone tools\b/.test(normalized)) {
    return route('craft_stone_tools', 'craft_stone_tools', 0.9, 'Matched competent core pattern: craft_stone_tools.');
  }
  if (/\b(craft|make).{0,16}\biron tools\b/.test(normalized)) {
    return route('craft_iron_tools', 'craft_iron_tools', 0.9, 'Matched competent core pattern: craft_iron_tools.');
  }

  if (/\b(make|keep|make us|keep us).{0,12}\b(safe|safer|secure)\b/.test(normalized)) {
    return clarify('make_safe', 'Safety request is broad.', [
      { canonicalCommand: 'tj light home', label: 'light home', reason: 'Add safe lighting if the area is already valid.' },
      { canonicalCommand: 'tj run core prepare for night', label: 'prepare for night', reason: 'Check food, home, and lighting.' },
      { canonicalCommand: 'tj run core status check', label: 'status check', reason: 'Check current danger and readiness.' },
      { canonicalCommand: 'tj threat scan', label: 'threat scan', reason: 'Look for nearby danger.' }
    ]);
  }

  for (const entry of CORE_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return route(entry.intent, entry.macro, entry.confidence, `Matched competent core pattern: ${entry.intent}.`);
    }
  }

  return null;
}

export function mapCoreIntentToMacro(intent) {
  const result = typeof intent === 'string' ? classifyCoreIntent(intent) : intent;
  return result?.macroName ? getCoreMacro(result.macroName) : null;
}

export function getCoreIntentCandidates(text, context = {}) {
  const primary = classifyCoreIntent(text, context);
  if (!primary) return [];
  if (primary.mode === 'clarify') return primary.alternatives || [];
  return [{
    canonicalCommand: primary.canonicalCommand,
    label: primary.macroName?.replace(/_/g, ' ') || primary.intent,
    reason: primary.reason
  }];
}

export async function routeCoreIntent(bot, memory, text, context = {}) {
  if (context?.config?.competentCoreEnabled === false || bot?.mcaiConfig?.competentCoreEnabled === false) return null;
  const result = classifyCoreIntent(text, context);
  if (!result) return null;
  return result;
}
